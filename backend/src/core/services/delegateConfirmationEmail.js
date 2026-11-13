/**
 * Delegate Registration Confirmation email, sent by FestiPlus after staff update a delegate
 * (docs/adr/0006-festiplus-delegate-confirmation-email.md).
 *
 * The first confirmation is sent by Freecomers Laravel at registration
 * (resources/views/email/festival_delegate_registration.blade.php). This email reproduces that
 * design exactly: same markup, colours, fonts and sections. Where the Laravel template has
 * festival text written in, this one reads it from the festival's records:
 *   - festival name: events.name
 *   - venue card: audience_settings.registration_form_schema.venue_info
 *       venue, address, dates, show_timing, timing (badge collection)
 *       donation_url, donation_text          → "Support independent film festivals" block
 *       app_name, app_text, app_android_url, app_ios_url → "Download the app" block
 *       support_email, organizer_name        → footer
 *   - the delegate's own details (name, serial, pass type and days)
 * Blocks without data are left out. QR codes are made here and sent as inline images (no
 * external QR service), as is the venue pin.
 */
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { query } = require('../../config/database');
const env = require('../../config/environment');
const { getFilmFestivalId } = require('./festivalIds.service');
const { sendMail } = require('./mail.service');

const PIN_PNG = path.join(__dirname, '..', '..', 'assets', 'email', 'pin-filled.png');
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const isHttpUrl = (v) => typeof v === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(v.trim());
const isEmail = (v) => typeof v === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v.trim());
const slugify = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const oneLine = (v) => String(v || '').replace(/\s*,?\s*\n\s*/g, ', ').trim(); // line breaks become ", " (no doubled commas)

/** A Day Pass is any pass type containing "Day Pass" (e.g. "Day Pass (Choose Days)"); only it keeps chosen days. */
const isDayPass = (passType) => /\bday\s*pass/i.test(String(passType || ''));

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

/** Festival records the email needs. */
async function loadFestival(eventId) {
  const [events, settings, filmFestivalId] = await Promise.all([
    query('SELECT name FROM events WHERE event_id = ? LIMIT 1', [eventId]),
    query('SELECT settings_json FROM audience_settings WHERE event_id = ? LIMIT 1', [eventId]),
    getFilmFestivalId(eventId)
  ]);
  const name = events[0]?.name || 'Festival';
  const venue = parseJson(settings[0]?.settings_json)?.registration_form_schema?.venue_info || {};
  const festivalUrl = filmFestivalId ? `${env.freecomersSiteUrl}/festivals/${filmFestivalId}/${slugify(name)}` : '';
  return { name, venue, festivalUrl };
}

const qrPng = (text) => QRCode.toBuffer(text, { type: 'png', width: 240, margin: 2, errorCorrectionLevel: 'M' });

// ── Blocks (markup and styles copied from the Laravel template) ───────────────

function venueBlock(v, hasPin) {
  if (!v.venue && !v.address) return '';
  return `
                            <!-- Venue & Badge Collection Section -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 14px;">
                                <tr>
                                    <td width="32" style="vertical-align: top; padding-right: 10px;">
                                        <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="width: 26px; height: 26px; background-color: #f7ebe8; border-radius: 50%;">
                                            <tr>
                                                <td align="center" valign="middle" style="width: 26px; height: 26px; text-align: center; vertical-align: middle; line-height: 0;">
                                                    ${hasPin ? '<img src="cid:fc-venue-pin" width="14" height="14" alt="Venue" style="display: block; margin: 0 auto; border: 0;" />' : ''}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td style="vertical-align: top;">
                                        <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; margin-bottom: 3px;">VENUE &amp; BADGE COLLECTION</div>
                                        ${v.venue ? `<div style="font-family: ${SERIF}; font-size: 15px; font-weight: 700; color: #111827;">${esc(v.venue)}</div>` : ''}
                                        ${v.address ? `<div style="font-size: 12px; color: #6b7280; line-height: 1.45; margin-top: 2px;">${esc(oneLine(v.address))}</div>` : ''}
                                    </td>
                                </tr>
                            </table>`;
}

function scheduleBlock(v) {
  const cells = [];
  if (v.dates || v.show_timing) {
    cells.push(`
                                    <td width="50%" style="vertical-align: top; padding-right: 16px; padding-left: 16px; padding-top: 12px; padding-bottom: 12px;${v.timing ? ' border-right: 1px solid #ede8e1;' : ''}">
                                        <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; margin-bottom: 3px;">FESTIVAL DATES${v.show_timing ? ' &amp; SHOW TIMINGS' : ''}</div>
                                        ${v.dates ? `<div style="font-size: 12.5px; font-weight: 700; color: #111827;">${esc(v.dates)}</div>` : ''}
                                        ${v.show_timing ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">Shows: ${esc(v.show_timing)}</div>` : ''}
                                    </td>`);
  }
  if (v.timing) {
    cells.push(`
                                    <td width="50%" style="vertical-align: top; padding-right: 16px; padding-left: 16px; padding-top: 12px; padding-bottom: 12px;">
                                        <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; margin-bottom: 3px;">BADGE COLLECTION TIMING</div>
                                        <div style="font-size: 12.5px; font-weight: 700; color: #111827;">${esc(v.timing)} Daily</div>
                                    </td>`);
  }
  if (!cells.length) return '';
  return `
                            <!-- Schedule Info Box -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 12px; background-color: #faf9f6; border: 1px solid #ede8e1; border-radius: 8px;">
                                <tr>${cells.join('')}
                                </tr>
                            </table>`;
}

function donationBlock(v, donationUrl) {
  if (!donationUrl) return '';
  return `
                            <!-- Horizontal Divider -->
                            <div style="border-top: 1px solid #f0eae1; margin: 0 0 18px 0;"></div>

                            <!-- Community Contribution Block -->
                            <div style="margin-bottom: 0;">
                                <div style="font-family: ${SERIF}; font-size: 15.5px; font-weight: 700; color: #111827; margin-bottom: 4px;">SUPPORT INDEPENDENT FILM FESTIVALS</div>
                                <div style="font-size: 11.5px; color: #4b5563; line-height: 1.45; margin-bottom: 14px;">${esc(v.donation_text || 'Help us keep festival screenings accessible and sustainable.')}</div>

                                <!-- QR + Donation Button Box (Fluid Responsive Stacking on Mobile) -->
                                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #faf8f5; border: 1px solid #eee8df; border-radius: 12px;">
                                    <tr>
                                        <td style="padding: 16px 12px; text-align: center; font-size: 0;">
                                            <!--[if mso]><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td width="145" align="center" valign="middle"><![endif]-->
                                            <div class="mobile-full" style="display: inline-block; vertical-align: middle; width: 140px; max-width: 100%; text-align: center; padding: 4px; box-sizing: border-box;">
                                                <div class="mobile-qr-box" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; display: inline-block; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
                                                    <img src="cid:fc-donate-qr" width="104" height="104" alt="Scan QR" style="display: block; margin: 0 auto; border-radius: 4px;" />
                                                    <div style="font-size: 8.5px; font-weight: 800; font-family: monospace; color: #701a1e; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.6px;">SCAN TO DONATE</div>
                                                </div>
                                            </div>
                                            <!--[if mso]></td><td align="center" valign="middle"><![endif]-->
                                            <div class="mobile-full" style="display: inline-block; vertical-align: middle; min-width: 250px; max-width: 330px; width: 100%; text-align: center; padding: 8px 6px; box-sizing: border-box;">
                                                <div style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin-bottom: 8px; font-family: ${SANS};">SCAN OR CLICK TO DONATE</div>
                                                <a href="${esc(donationUrl)}" target="_blank" rel="noopener noreferrer" class="mobile-btn" style="background: #282828; background: linear-gradient(135deg, #282828, #951914); color: #ffffff; text-decoration: none; font-family: 'Roboto', 'roboto Fallback', sans-serif; font-size: 13px; font-weight: 500; padding: 11px 22px; border-radius: 22px; display: inline-block; letter-spacing: 0.2px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);">Make a Voluntary Donation &rarr;</a>
                                            </div>
                                            <!--[if mso]></td></tr></table><![endif]-->
                                        </td>
                                    </tr>
                                </table>
                            </div>`;
}

function appColumn(url, cid, label) {
  return `
                                                    <td width="50%" align="center" valign="top" style="padding: 4px 6px;">
                                                        <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
                                                            <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px; display: inline-block; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
                                                                <img src="cid:${cid}" width="104" height="104" alt="${esc(label)}" style="display: block; margin: 0 auto; border-radius: 4px;" />
                                                            </div>
                                                            <div style="font-family: ${SANS}; font-size: 11.5px; font-weight: 700; color: #951914; margin-top: 8px;">${esc(label)} &rarr;</div>
                                                        </a>
                                                    </td>`;
}

function appBlock(v, festivalTitle, androidUrl, iosUrl, afterDonation) {
  if (!androidUrl && !iosUrl) return '';
  return `
                            <!-- Horizontal Divider -->
                            <div style="border-top: 1px solid #f0eae1; margin: ${afterDonation ? '22px' : '0'} 0 18px 0;"></div>

                            <!-- App & Audience Voting Block -->
                            <div style="margin-bottom: 0;">
                                <div style="font-family: ${SERIF}; font-size: 15.5px; font-weight: 700; color: #111827; margin-bottom: 4px;">DOWNLOAD THE ${esc(String(v.app_name || festivalTitle).toUpperCase())} APP</div>
                                ${v.app_text ? `<div style="font-size: 11.5px; color: #4b5563; line-height: 1.5; margin-bottom: 14px;">${esc(v.app_text)}</div>` : ''}

                                <!-- App QR Codes Card -->
                                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #faf8f5; border: 1px solid #eee8df; border-radius: 12px; overflow: hidden;">
                                    <tr>
                                        <td style="padding: 18px 12px; text-align: center;">
                                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                                                <tr>${androidUrl ? appColumn(androidUrl, 'fc-android-qr', 'Download Android App') : ''}${iosUrl ? appColumn(iosUrl, 'fc-ios-qr', 'Download iOS App') : ''}
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </div>`;
}

/**
 * Build the email for one delegate.
 * @param {object} festival  from loadFestival()
 * @param {object} a         { name, email, custom_data }
 * @returns {Promise<{ subject, html, text, attachments }>}
 */
async function buildEmail(festival, a) {
  const cd = parseJson(a.custom_data);
  const v = festival.venue || {};
  const festivalTitle = festival.name;
  const attendeeName = a.name || 'Festival Delegate';
  const serialNo = cd.serial_no || '';
  const passType = cd.pass_type || 'Full-Festival Pass';
  const days = isDayPass(passType) && Array.isArray(cd.pass_days) ? cd.pass_days.filter(Boolean) : [];
  // The first email shows the pass type under "Category"; a Day Pass also names its days
  const passCategory = days.length ? `${passType} · ${days.join(', ')}` : passType;
  const festivalUrl = festival.festivalUrl;
  const donationUrl = isHttpUrl(v.donation_url) ? v.donation_url.trim() : '';
  const androidUrl = isHttpUrl(v.app_android_url) ? v.app_android_url.trim() : '';
  const iosUrl = isHttpUrl(v.app_ios_url) ? v.app_ios_url.trim() : '';
  const supportEmail = isEmail(v.support_email) ? v.support_email.trim() : (isEmail(env.mail.fromAddress) ? env.mail.fromAddress : '');
  const organizer = v.organizer_name ? String(v.organizer_name).trim() : festivalTitle;
  const subject = `Delegate Registration Confirmation (updated) — ${festivalTitle}${serialNo ? ` [${serialNo}]` : ''}`;

  // Inline images (cid:) instead of hosted ones
  const attachments = [];
  if (fs.existsSync(PIN_PNG)) attachments.push({ filename: 'venue.png', path: PIN_PNG, cid: 'fc-venue-pin' });
  if (donationUrl) attachments.push({ filename: 'donate-qr.png', content: await qrPng(donationUrl), cid: 'fc-donate-qr' });
  if (androidUrl) attachments.push({ filename: 'android-app-qr.png', content: await qrPng(androidUrl), cid: 'fc-android-qr' });
  if (iosUrl) attachments.push({ filename: 'ios-app-qr.png', content: await qrPng(iosUrl), cid: 'fc-ios-qr' });
  const hasPin = attachments.some((x) => x.cid === 'fc-venue-pin');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Delegate Registration Confirmation - ${esc(serialNo)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        @media only screen and (max-width: 500px) {
            .card-padding { padding: 22px 16px !important; }
            .meta-col { display: block !important; box-sizing: border-box !important; }
            .meta-col-1 { float: left !important; width: 52% !important; text-align: left !important; padding-bottom: 12px !important; padding-right: 4px !important; }
            .meta-col-3 { float: right !important; width: 48% !important; text-align: right !important; padding-bottom: 12px !important; padding-left: 4px !important; }
            .meta-col-2 { clear: both !important; width: 100% !important; text-align: left !important; padding-top: 4px !important; padding-left: 0 !important; padding-right: 0 !important; }
            .mobile-full { width: 100% !important; display: block !important; max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; text-align: center !important; box-sizing: border-box !important; }
            .mobile-qr-box { margin: 0 auto 12px auto !important; display: inline-block !important; }
            .mobile-btn { display: block !important; width: 100% !important; max-width: 280px !important; margin: 0 auto !important; padding: 12px 20px !important; font-size: 13.5px !important; white-space: nowrap !important; box-sizing: border-box !important; text-align: center !important; }
        }
    </style>
</head>

<body style="margin: 0; padding: 24px 10px; background-color: #f2eee9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
            <td align="center">

                <!-- Top Preheader Utility Bar -->
                <table role="presentation" width="100%" style="max-width: 640px; margin-bottom: 10px;" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td align="left" style="font-size: 11px; color: #78716c; font-family: ${SANS};">
                            ${esc(festivalTitle)}${serialNo ? ` &bull; Confirmation ID <span style="font-family: monospace; font-weight: 700;">#${esc(serialNo)}</span>` : ''}
                        </td>
                        ${festivalUrl ? `<td align="right" style="font-size: 11px;"><a href="${esc(festivalUrl)}" target="_blank" rel="noopener noreferrer" style="color: #78716c; text-decoration: underline;">View in web browser</a></td>` : ''}
                    </tr>
                </table>

                <!-- Main Email Card Container -->
                <table role="presentation" width="100%" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e7ded4;" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td class="card-padding" style="padding: 32px 32px 32px 32px;">

                            <!-- Status Pill: Delegate Registration Confirmation -->
                            <div style="text-align: center; margin-bottom: 8px;">
                                <div style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; font-size: 11px; font-weight: 700; padding: 4px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">&#9679; Delegate Registration Confirmation</div>
                            </div>

                            <p style="font-family: ${SERIF}; font-size: 13px; color: #6b7280; text-align: center; margin: 0 0 24px 0; line-height: 1.45;">
                                Present this digital pass or your Serial Number at the venue to collect your physical pass.
                            </p>

                            <!-- Festival Accreditation Header -->
                            <div style="text-align: center; padding-bottom: 20px;">
                                <h1 style="font-family: ${SERIF}; margin: 0 0 4px 0; font-size: 28px; font-weight: 700; color: #111827; letter-spacing: -0.3px; line-height: 1.2;">${esc(festivalTitle)}</h1>
                                <div style="font-family: ${SERIF}; font-style: italic; font-size: 15.5px; font-weight: 600; color: #701a1e;">Welcome, ${esc(attendeeName)}</div>
                            </div>

                            <!-- Horizontal Divider -->
                            <div style="border-top: 1px solid #f0eae1; margin: 0 0 16px 0;"></div>

                            <!-- Details Row (3 Columns on Desktop, 2 Lines on Mobile) -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 18px;">
                                <tr>
                                    <td class="meta-col meta-col-1" width="38%" style="vertical-align: top; padding-right: 10px;">
                                        <div style="font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px;">PASS HOLDER</div>
                                        <div style="font-size: 13.5px; font-weight: 700; color: #111827; line-height: 1.25;">${esc(attendeeName)}</div>
                                    </td>
                                    <td class="meta-col meta-col-2" width="32%" style="vertical-align: top; padding-right: 10px; padding-left: 4px;">
                                        <div style="font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px;">CATEGORY</div>
                                        <div style="font-size: 13.5px; font-weight: 700; color: #701a1e; line-height: 1.25;">${esc(passCategory)}</div>
                                    </td>
                                    <td class="meta-col meta-col-3" width="30%" align="right" style="vertical-align: top; padding-left: 4px; text-align: right;">
                                        <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; margin-bottom: 3px; white-space: nowrap;">CREDENTIAL CODE</div>
                                        <div style="font-family: monospace; font-size: 15.5px; font-weight: 800; color: #701a1e; letter-spacing: 0.5px; line-height: 1.25; white-space: nowrap;">${esc(serialNo)}</div>
                                    </td>
                                </tr>
                            </table>
                            <div style="clear: both;"></div>

                            <!-- Horizontal Divider -->
                            <div style="border-top: 1px solid #f0eae1; margin: 0 0 16px 0;"></div>
${venueBlock(v, hasPin)}
${scheduleBlock(v)}

                            <div style="font-size: 11px; font-style: italic; color: #6b7280; line-height: 1.45; margin-bottom: 18px;">
                                * Please present your Serial Number <strong style="color: #701a1e; font-family: monospace;">${esc(serialNo)}</strong> with a photo ID (18+) at the registration desk to receive your physical pass.
                            </div>
${donationBlock(v, donationUrl)}
${appBlock(v, festivalTitle, androidUrl, iosUrl, Boolean(donationUrl))}

                        </td>
                    </tr>
                </table>

                <!-- Outer Email Footer -->
                <table role="presentation" width="100%" style="max-width: 640px; margin-top: 20px; text-align: center; font-size: 11px; color: #78716c; line-height: 1.6;" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td style="padding: 0 16px;">
                            ${supportEmail ? `<div><a href="mailto:${esc(supportEmail)}" style="color: #701a1e; text-decoration: underline;">Help Desk &amp; Venue Support</a></div>` : ''}
                            <div style="margin-top: 6px; font-size: 10px; color: #a8a29e;">&copy; ${new Date().getFullYear()} ${esc(organizer)} &amp; Freecomers. All rights reserved.</div>
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>
</body>
</html>`;

  const text = [
    `Delegate Registration Confirmation — ${festivalTitle}`,
    '',
    `Welcome, ${attendeeName}`,
    `Category: ${passCategory}`,
    serialNo ? `Credential code: ${serialNo}` : '',
    v.venue ? `Venue & badge collection: ${v.venue}${v.address ? `, ${oneLine(v.address)}` : ''}` : '',
    v.dates ? `Festival dates: ${v.dates}${v.show_timing ? ` (shows ${v.show_timing})` : ''}` : '',
    v.timing ? `Badge collection timing: ${v.timing} daily` : '',
    '',
    `Please present your Serial Number${serialNo ? ` ${serialNo}` : ''} with a photo ID (18+) at the registration desk to receive your physical pass.`,
    donationUrl ? `\nMake a voluntary donation: ${donationUrl}` : '',
    androidUrl ? `Android app: ${androidUrl}` : '',
    iosUrl ? `iOS app: ${iosUrl}` : '',
    festivalUrl ? `\nFestival page: ${festivalUrl}` : ''
  ].filter((l) => l !== '').join('\n');

  return { subject, html, text, attachments };
}

/**
 * Email the updated confirmation to a delegate. Never throws.
 * @returns {Promise<{ sent: boolean, to: string, reason?: string }>}
 */
async function sendDelegateConfirmation(eventId, attendee) {
  if (!attendee?.email) return { sent: false, to: '', reason: 'This delegate has no email address.' };
  try {
    const festival = await loadFestival(eventId);
    const { subject, html, text, attachments } = await buildEmail(festival, attendee);
    return await sendMail({ to: attendee.email, subject, html, text, attachments });
  } catch (err) {
    console.error('[DelegateConfirmationEmail] Could not build or send:', err.message);
    return { sent: false, to: attendee.email, reason: 'The confirmation email could not be prepared.' };
  }
}

module.exports = { sendDelegateConfirmation, buildEmail, loadFestival, isDayPass };
