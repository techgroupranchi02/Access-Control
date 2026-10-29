/**
 * AudienceSettingsPage Component (/audience)
 * 
 * Audience Settings, Delegate Category Manager, Venue Directory &
 * Dynamic Delegate Registration Form Builder with Pre-Built Industry Templates.
 */

import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import {
  PaletteIcon,
  DescriptionIcon,
  ConfirmationNumberIcon,
  HelpIcon,
  PlaceIcon,
  SaveIcon,
  VisibilityIcon,
  AddIcon,
  EditIcon,
  DeleteIcon,
  PeopleIcon,
  HowToVoteIcon,
  MovieIcon,
  LockIcon,
  MailIcon,
  BadgeIcon,
  ExpandLessIcon,
  ExpandMoreIcon,
  ArrowDropUpIcon,
  ArrowDropDownIcon,
  InfoIcon,
  ScheduleIcon,
  ShieldIcon,
  CheckCircleIcon,
  TuneIcon,
  SettingsIcon,
  CalendarTodayIcon
} from '../components/common/Icons';

const DEFAULT_FAQS = [
  {
    question: 'Welcome to the KASHISH x BENGALURU 2026 film festival',
    answer: '<p>Celebrate diversity and storytelling with a vibrant community of filmmakers, artists, and allies.</p><p>Get ready to experience <strong>44 spellbinding LGBTQ+ films</strong> from <strong>15 countries</strong>, join engaging panel discussions, participate in interactive Q&amp;A sessions with filmmakers, and enjoy captivating performances at the Opening Ceremony.</p><p>KASHISH Pride Film Festival, South Asia’s biggest LGBTQ+ film festival, comes to Bengaluru for the first time for a 3-day festival from <strong>November 20th to November 22nd, 2026</strong> at the <strong>National Gallery of Modern Art (NGMA)</strong>, Bengaluru.</p>'
  },
  {
    question: 'Important Pass Policy',
    answer: '<p><strong>Only ONE Festival Pass can be booked per person.</strong></p><p>To book multiple passes, please repeat the process for each individual attendee with their respective identification details.</p>'
  },
  {
    question: 'Who Can Attend (Eligibility & Verification)',
    answer: '<ul><li><strong>18+ Only:</strong> Only individuals 18 years and above (as of November 19, 2026) are permitted to attend the festival.</li><li><strong>Mandatory Registration:</strong> Registration is compulsory to access any film screenings, ceremonies, or panel discussions.</li><li><strong>Badge Access:</strong> Admission into all NGMA festival halls is reserved exclusively for pre-registered delegates holding a verified Festival Pass.</li><li><strong>Photo ID:</strong> Please carry a valid government-issued photo ID / age proof document for physical verification at the reception counter.</li></ul>'
  },
  {
    question: 'How to Get Your Festival Pass: Online & Spot Registration',
    answer: '<p><strong>1. ONLINE REGISTRATION</strong><br/>Register conveniently online via <strong>Freecomers</strong> on this page before arriving at the venue.<br/>Please present your digital pass or Serial Number along with a valid age proof document at the counter when collecting your physical pass badge.</p><p><strong>2. SPOT REGISTRATION</strong><br/>For individuals unable to register online beforehand, on-site manual spot registration will be available at the NGMA venue desk:<br/>• NGMA Reception Desk: November 20 – 22 | 10:15 AM – 5:30 PM</p>'
  },
  {
    question: 'Collecting Your Festival Pass (Badge Pickup & Timing)',
    answer: '<p>Physical Festival Passes can be picked up exclusively from the registration desk at <strong>NGMA</strong> during the following operational hours:</p><p><strong>Badge Collection Hours:</strong> November 20 – 22 | 10:15 AM – 6:00 PM</p><p><em>* Please carry your government-issued age proof document to present at the counter.</em></p>'
  },
  {
    question: 'How Audience Choice Voting Works',
    answer: '<p>Every registered delegate can rate each film in competition on a scale of <strong>1 to 5 stars</strong> after watching.</p><ul><li><strong>One verified rating per film</strong> per registered delegate.</li><li><strong>Bayesian Weighted Tabulation:</strong> We use an IMDb-inspired weighted rating formula with an adjustment number of <strong>10</strong>.</li><li><strong>Equal Competition:</strong> No minimum vote quorum is required — all films in competition are eligible for the Audience Choice Award.</li><li>Every valid rating counts toward the official standings!</li></ul>'
  },
  {
    question: 'Registration Queries & Assistance',
    answer: '<p>For any registration-related questions, please write to <a href="mailto:info@freecomers.com"><strong>info@freecomers.com</strong></a> or approach the registration desk volunteers at the entrance.</p>'
  }
];

function FaqRichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const isInternalChangeRef = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isInternalChangeRef.current) {
      if (editorRef.current.innerHTML !== (value || '')) {
        editorRef.current.innerHTML = value || '';
      }
    }
    isInternalChangeRef.current = false;
  }, [value, isHtmlMode]);

  const exec = (command, val = null) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand(command, false, val);
      isInternalChangeRef.current = true;
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleLink = () => {
    const url = window.prompt('Enter link URL (e.g. https://... or mailto:info@example.com):');
    if (url) {
      exec('createLink', url);
    }
  };

  const handleInput = (e) => {
    isInternalChangeRef.current = true;
    onChange(e.currentTarget.innerHTML);
  };

  return (
    <div style={{ border: '1px solid var(--fc-border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--fc-surface)' }}>
      {/* Formatting Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '5px 8px',
        background: 'rgba(0,0,0,0.03)',
        borderBottom: '1px solid var(--fc-border)',
        flexWrap: 'wrap'
      }}>
        <button
          type="button"
          onClick={() => exec('bold')}
          title="Bold (Ctrl+B)"
          style={{ padding: '2px 8px', fontWeight: 800, fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', cursor: 'pointer' }}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => exec('italic')}
          title="Italic (Ctrl+I)"
          style={{ padding: '2px 8px', fontStyle: 'italic', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', cursor: 'pointer' }}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => exec('underline')}
          title="Underline (Ctrl+U)"
          style={{ padding: '2px 8px', textDecoration: 'underline', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', cursor: 'pointer' }}
        >
          U
        </button>

        <span style={{ height: '16px', width: '1px', background: 'var(--fc-border)', margin: '0 4px' }} />

        <button
          type="button"
          onClick={() => exec('insertUnorderedList')}
          title="Bullet List"
          style={{ padding: '2px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', cursor: 'pointer' }}
        >
          • Bullet List
        </button>
        <button
          type="button"
          onClick={() => exec('insertOrderedList')}
          title="Numbered List"
          style={{ padding: '2px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', cursor: 'pointer' }}
        >
          1. Numbered List
        </button>

        <span style={{ height: '16px', width: '1px', background: 'var(--fc-border)', margin: '0 4px' }} />

        <button
          type="button"
          onClick={handleLink}
          title="Insert Link"
          style={{ padding: '2px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', cursor: 'pointer' }}
        >
          🔗 Link
        </button>
        <button
          type="button"
          onClick={() => exec('removeFormat')}
          title="Clear Formatting"
          style={{ padding: '2px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', cursor: 'pointer' }}
        >
          🧹 Clear
        </button>

        <span style={{ marginLeft: 'auto' }} />

        <button
          type="button"
          onClick={() => setIsHtmlMode(!isHtmlMode)}
          title="Toggle HTML Source"
          style={{
            padding: '2px 8px',
            fontSize: '0.75rem',
            borderRadius: '4px',
            border: isHtmlMode ? '1px solid #e11d48' : '1px solid var(--fc-border)',
            background: isHtmlMode ? 'rgba(225,29,72,0.1)' : 'var(--fc-surface-card)',
            color: isHtmlMode ? '#e11d48' : 'var(--fc-text-muted)',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          {isHtmlMode ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <VisibilityIcon size={13} /> Rich Visual Mode
            </span>
          ) : '</> HTML Source'}
        </button>
      </div>

      {/* Editor Body */}
      {isHtmlMode ? (
        <textarea
          rows={4}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type or edit HTML code..."
          style={{
            width: '100%',
            padding: '8px 10px',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            border: 'none',
            outline: 'none',
            background: 'var(--fc-surface)',
            color: 'var(--fc-text-main)',
            boxSizing: 'border-box'
          }}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          style={{
            minHeight: '80px',
            maxHeight: '260px',
            padding: '8px 10px',
            fontSize: '0.85rem',
            lineHeight: 1.5,
            color: 'var(--fc-text-main)',
            outline: 'none',
            background: 'var(--fc-surface)',
            overflowY: 'auto'
          }}
        />
      )}
    </div>
  );
}

function DelegateFaqPreviewModal({ open, onClose, formSchema }) {
  if (!open) return null;

  const faqs = (formSchema?.policy_info?.faqs && formSchema.policy_info.faqs.length > 0)
    ? formSchema.policy_info.faqs
    : DEFAULT_FAQS;

  const venueInfo = formSchema?.venue_info || {};

  const matchedIndices = new Set();
  const findAndMark = (predicate) => {
    const idx = faqs.findIndex((f, i) => !matchedIndices.has(i) && predicate(f, i));
    if (idx !== -1) {
      matchedIndices.add(idx);
      return faqs[idx];
    }
    return null;
  };

  const welcomeItem = findAndMark((f, i) => /welcome/i.test(f.question) || i === 0);
  const policyItem = findAndMark((f) => /policy|important/i.test(f.question));
  const whoCanAttendItem = findAndMark((f) => /who can attend|eligib/i.test(f.question));
  const howToGetItem = findAndMark((f) => /how to get|spot registration|online registration/i.test(f.question));
  const collectingPassItem = findAndMark((f) => /collect|pickup|badge/i.test(f.question));
  const votingItem = findAndMark((f) => /voting|audience choice/i.test(f.question));
  const supportItem = findAndMark((f) => /quer|assist|contact|help|email/i.test(f.question));

  const additionalFaqs = faqs.filter((_, i) => !matchedIndices.has(i));

  const bannerUrl = 'https://api.autovertest.com/api/v1/non-auth-user/retrieve-media/images/film-festivals/film_festival_banner_F00015.webp';
  const logoUrl = 'https://api.autovertest.com/api/v1/non-auth-user/retrieve-media/images/film-festivals/film_festival_logo_6ad8a4b35295e31fda4b4e5.webp';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--fc-surface-card)',
        color: 'var(--fc-text-main)',
        borderRadius: '18px',
        width: '100%',
        maxWidth: '890px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.6)',
        overflow: 'hidden',
        border: '1px solid var(--fc-border)'
      }}>
        {/* Top Banner Header with Badge */}
        <div style={{
          position: 'relative',
          width: '100%',
          minHeight: '130px',
          backgroundImage: `url(${bannerUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          borderBottom: '3px solid #e11d48',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: '14px'
        }}>
          {/* Subtle gradient overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, var(--fc-surface-card) 100%)'
          }} />

          {/* Miniboxoffice watermark label top-center */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: 'var(--fc-text-muted)',
            textTransform: 'uppercase'
          }}>
            <span style={{ color: '#e11d48', fontSize: '1rem' }}>📊</span> MINIBOXOFFICE PRESENTS
          </div>

          {/* Close Button top-right */}
          <button
            type="button"
            onClick={onClose}
            title="Close FAQ"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 10,
              background: 'rgba(0, 0, 0, 0.5)',
              color: '#fff',
              border: 'none',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 700
            }}
          >
            ✕
          </button>

          {/* Circular Logo top-right */}
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '54px',
            zIndex: 5,
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: '#fff',
            padding: '3px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            border: '2px solid #fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}>
            <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          {/* Golden Central Badge */}
          <div style={{
            position: 'relative',
            zIndex: 2,
            padding: '6px 24px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #fef08a 0%, #fde047 40%, #eab308 100%)',
            border: '1.5px solid #ca8a04',
            boxShadow: '0 6px 18px rgba(202, 138, 4, 0.35)',
            textAlign: 'center'
          }}>
            <div style={{
              fontWeight: 900,
              color: '#1c1917',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              fontSize: '0.98rem',
              lineHeight: 1.2
            }}>
              KASHISH X BENGALURU 2026
            </div>
            <div style={{
              fontWeight: 800,
              color: '#78350f',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontSize: '0.72rem',
              marginTop: '1px'
            }}>
              REGISTRATION FAQS &amp; GUIDELINES
            </div>
          </div>
        </div>

        {/* 2-Column Scrollable Body Content */}
        <div style={{
          padding: '24px 28px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          gap: '24px',
          background: 'var(--fc-surface-card)'
        }}>
          {/* Left Column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Welcome Section */}
            {welcomeItem && (
              <div>
                <h4 style={{
                  fontWeight: 800,
                  fontSize: '1.15rem',
                  color: 'var(--fc-brand, #e11d48)',
                  lineHeight: 1.3,
                  margin: '0 0 10px 0'
                }}>
                  {welcomeItem.question}
                </h4>
                <div
                  style={{
                    fontSize: '0.84rem',
                    lineHeight: 1.55,
                    color: 'var(--fc-text-secondary)'
                  }}
                  dangerouslySetInnerHTML={{ __html: welcomeItem.answer }}
                />
              </div>
            )}

            {/* Important Pass Policy Card */}
            {policyItem && (
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                background: 'rgba(225, 29, 72, 0.1)',
                border: '1px solid rgba(225, 29, 72, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <InfoIcon size={16} style={{ color: '#f43f5e' }} />
                  <span style={{ fontWeight: 800, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: '0.78rem' }}>
                    {policyItem.question}
                  </span>
                </div>
                <div
                  style={{ fontSize: '0.84rem', color: 'var(--fc-text-main)', fontWeight: 600, lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: policyItem.answer }}
                />
              </div>
            )}

            {/* Dates & Show Timings */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <ScheduleIcon size={16} style={{ color: 'var(--fc-text-secondary)' }} />
                <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.8rem', color: 'var(--fc-text-main)' }}>
                  FESTIVAL DATES &amp; SHOW TIMINGS:
                </span>
              </div>
              <div style={{ paddingLeft: '22px' }}>
                <div style={{ fontWeight: 700, color: 'var(--fc-text-main)', fontSize: '0.85rem' }}>
                  {venueInfo.dates || 'Nov 20th to Nov 22nd, 2026'}
                </div>
                <div style={{ color: 'var(--fc-text-secondary)', fontSize: '0.82rem', marginTop: '2px' }}>
                  {venueInfo.timing || '10:15 AM to 6:00 PM'}
                </div>
              </div>
            </div>

            {/* Festival Venue */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <PlaceIcon size={16} style={{ color: 'var(--fc-text-secondary)' }} />
                <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.8rem', color: 'var(--fc-text-main)' }}>
                  FESTIVAL VENUE:
                </span>
              </div>
              <div style={{ paddingLeft: '22px' }}>
                <div style={{ fontWeight: 700, color: 'var(--fc-text-main)', fontSize: '0.85rem' }}>
                  {venueInfo.venue || 'National Gallery of Modern Art (NGMA), Bengaluru'}
                </div>
                {venueInfo.instructions && (
                  <div style={{ color: 'var(--fc-text-muted)', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '3px', lineHeight: 1.45 }}>
                    {venueInfo.instructions}
                  </div>
                )}
                <a
                  href="https://maps.google.com/?q=National+Gallery+of+Modern+Art+NGMA+Bengaluru"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#f43f5e',
                    marginTop: '4px',
                    textDecoration: 'none'
                  }}
                >
                  Open in Google Maps ↗
                </a>
              </div>
            </div>

            {/* Who Can Attend */}
            {whoCanAttendItem && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <ShieldIcon size={16} style={{ color: 'var(--fc-text-secondary)' }} />
                  <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.8rem', color: 'var(--fc-text-main)' }}>
                    {whoCanAttendItem.question}
                  </span>
                </div>
                <div
                  style={{
                    paddingLeft: '10px',
                    fontSize: '0.82rem',
                    lineHeight: 1.55,
                    color: 'var(--fc-text-secondary)'
                  }}
                  dangerouslySetInnerHTML={{ __html: whoCanAttendItem.answer }}
                />
              </div>
            )}
          </div>

          {/* Right Column */}
          <div style={{
            flex: 1,
            background: 'var(--fc-surface-subtle)',
            border: '1px solid var(--fc-border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            alignSelf: 'flex-start'
          }}>
            {/* How to Get Pass */}
            {howToGetItem && (
              <div>
                <div style={{
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontSize: '0.88rem',
                  color: 'var(--fc-brand, #e11d48)',
                  marginBottom: '10px',
                  borderBottom: '2px solid rgba(225, 29, 72, 0.3)',
                  paddingBottom: '4px'
                }}>
                  {howToGetItem.question}
                </div>
                <div
                  style={{ fontSize: '0.83rem', lineHeight: 1.55, color: 'var(--fc-text-secondary)' }}
                  dangerouslySetInnerHTML={{ __html: howToGetItem.answer }}
                />
              </div>
            )}

            {/* Collecting Your Festival Pass */}
            {collectingPassItem && (
              <div>
                <div style={{
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontSize: '0.88rem',
                  color: 'var(--fc-brand, #e11d48)',
                  marginBottom: '10px',
                  borderBottom: '2px solid rgba(225, 29, 72, 0.3)',
                  paddingBottom: '4px'
                }}>
                  {collectingPassItem.question}
                </div>
                <div
                  style={{ fontSize: '0.83rem', lineHeight: 1.55, color: 'var(--fc-text-secondary)' }}
                  dangerouslySetInnerHTML={{ __html: collectingPassItem.answer }}
                />
              </div>
            )}

            {/* How Audience Choice Voting Works */}
            {votingItem && (
              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '8px',
                padding: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <HowToVoteIcon size={16} style={{ color: '#eab308' }} />
                  <span style={{ fontWeight: 900, color: '#eab308', textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: '0.82rem' }}>
                    {votingItem.question}
                  </span>
                </div>
                <div
                  style={{ fontSize: '0.81rem', color: 'var(--fc-text-main)', lineHeight: 1.55 }}
                  dangerouslySetInnerHTML={{ __html: votingItem.answer }}
                />
              </div>
            )}

            {/* Support Email */}
            {supportItem && (
              <div style={{
                background: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                borderRadius: '8px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <MailIcon size={16} style={{ color: 'var(--fc-text-secondary)' }} />
                  <span style={{ fontWeight: 700, color: 'var(--fc-text-secondary)', textTransform: 'uppercase', fontSize: '0.74rem' }}>
                    {supportItem.question}
                  </span>
                </div>
                <div
                  style={{ fontSize: '0.82rem', color: 'var(--fc-text-main)', lineHeight: 1.45 }}
                  dangerouslySetInnerHTML={{ __html: supportItem.answer }}
                />
              </div>
            )}

            {/* Additional Custom Questions */}
            {additionalFaqs.length > 0 && (
              <div style={{ borderTop: '1px dashed var(--fc-border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontWeight: 800, color: 'var(--fc-brand, #e11d48)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ADDITIONAL QUESTIONS:
                </span>
                {additionalFaqs.map((af, aIdx) => (
                  <div key={aIdx} style={{ background: 'var(--fc-surface)', border: '1px solid var(--fc-border)', borderRadius: '6px', padding: '10px' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                      Q: {af.question}
                    </div>
                    <div
                      style={{ fontSize: '0.79rem', color: 'var(--fc-text-secondary)', lineHeight: 1.45 }}
                      dangerouslySetInnerHTML={{ __html: af.answer }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer with Close Button */}
        <div style={{
          padding: '12px 24px',
          background: 'var(--fc-surface-card)',
          borderTop: '1px solid var(--fc-border)',
          display: 'flex',
          justifyContent: 'flex-start'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 24px',
              border: '1.5px solid #e11d48',
              borderRadius: '20px',
              background: 'transparent',
              color: '#e11d48',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveFormPreviewContent({
  formSchema,
  previewGender,
  setPreviewGender,
  previewPassType,
  setPreviewPassType,
  previewDays,
  setPreviewDays,
  previewCommunity,
  setPreviewCommunity,
  previewMumbai,
  setPreviewMumbai,
  onOpenFaqModal,
  onClose,
  isCompact = false,
  previewDevice = 'desktop'
}) {
  if (!formSchema) return null;

  const isMobile = previewDevice === 'mobile';

  // Core fields
  const nameField = formSchema?.fields?.find(f => f.key === 'name' && f.enabled !== false);
  const emailField = formSchema?.fields?.find(f => f.key === 'email' && f.enabled !== false);
  const phoneField = formSchema?.fields?.find(f => f.key === 'phone' && f.enabled !== false);
  const dobField = formSchema?.fields?.find(f => f.key === 'dob' && f.enabled !== false);
  const genderField = formSchema?.fields?.find(f => f.key === 'gender_identity' && f.enabled !== false);
  const passTypeField = formSchema?.fields?.find(f => f.key === 'pass_type' && f.enabled !== false);
  const passOptions = passTypeField?.options && passTypeField.options.length > 0
    ? passTypeField.options
    : ['Full-Festival Pass', 'Day Pass (Choose Days)'];
  const passDaysField = formSchema?.fields?.find(f => f.key === 'pass_days' && f.enabled !== false);
  const isDayPassActive = previewPassType?.toLowerCase().includes('day') || previewPassType === passOptions[1];
  const delegateCatField = formSchema?.fields?.find(f => (f.key === 'delegate_category' || f.key === 'category') && f.enabled !== false);
  const commField = formSchema?.fields?.find(f => f.key === 'community_identity' && f.enabled !== false);
  const mumbaiField = formSchema?.fields?.find(f => f.key === 'attended_mumbai' && f.enabled !== false);

  const standardKeys = [
    'name', 'email', 'phone', 'dob', 'gender_identity', 
    'pass_type', 'pass_days', 'delegate_category', 'category', 'community_identity', 'attended_mumbai', 
    'signature_name', 'digital_signature', 'place', 'registration_date', 
    'receive_updates', 'appear_in_attendee_list', 'directory_consent', 
    'certified_18_plus', 'legal_certification'
  ];
  const customOrOtherFields = formSchema?.fields?.filter(f => !standardKeys.includes(f.key) && f.enabled !== false);

  const signField = formSchema?.fields?.find(f => (f.key === 'signature_name' || f.key === 'digital_signature') && f.enabled !== false);
  const placeField = formSchema?.fields?.find(f => f.key === 'place' && f.enabled !== false);
  const dateField = formSchema?.fields?.find(f => (f.key === 'registration_date' || f.key === 'date') && f.enabled !== false);
  const updatesField = formSchema?.fields?.find(f => f.key === 'receive_updates' && f.enabled !== false);
  const directoryField = formSchema?.fields?.find(f => (f.key === 'appear_in_attendee_list' || f.key === 'directory_consent') && f.enabled !== false);
  const certifyField = formSchema?.fields?.find(f => (f.key === 'certified_18_plus' || f.key === 'legal_certification') && f.enabled !== false);

  const activeInputCount = [signField, placeField, dateField].filter(Boolean).length;
  const hasInputs = activeInputCount > 0;
  const hasCheckboxes = updatesField || directoryField || certifyField;
  const todayStr = new Date().toLocaleDateString('en-GB');

  const policyAndVenueSection = (
    <div style={{
      width: isMobile ? '100%' : (isCompact ? '150px' : '270px'),
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: isCompact ? '10px' : '16px'
    }}>
      {/* Policy Card */}
      <div style={{
        background: 'var(--fc-surface-subtle)',
        border: '1px solid var(--fc-border)',
        borderRadius: isCompact ? '8px' : '12px',
        padding: isCompact ? '10px' : '18px',
        color: 'var(--fc-text-main)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: isCompact ? '6px' : '12px' }}>
          <ConfirmationNumberIcon size={isCompact ? 14 : 18} style={{ color: '#e11d48' }} />
          <span style={{
            fontWeight: 800,
            fontSize: isCompact ? '0.68rem' : '0.82rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#e11d48',
            lineHeight: 1.2
          }}>
            {formSchema?.policy_info?.title || 'DELEGATE PASS POLICY'}
          </span>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isCompact ? '6px' : '10px',
          fontSize: isCompact ? '0.7rem' : '0.82rem',
          lineHeight: 1.4,
          color: 'var(--fc-text-secondary)'
        }}>
          {((formSchema?.policy_info?.points && formSchema.policy_info.points.length > 0)
            ? formSchema.policy_info.points
            : [
                'Full-Festival Pass is valid for all screenings on all days.',
                'Day Passes are valid only for individual days selected.',
                'Delegate Pass does NOT guarantee seating, which is first come, first served.',
                'Entry without Delegate Pass will be denied.'
              ]
          ).map((pt, pIdx) => (
            <div key={pIdx} style={{ display: 'flex', gap: '5px' }}>
              <span style={{ color: '#e11d48', fontWeight: 800 }}>•</span>
              <span>{pt}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: isCompact ? '10px' : '16px' }}>
          <span
            onClick={onOpenFaqModal}
            style={{
              color: '#f43f5e',
              fontWeight: 700,
              fontSize: isCompact ? '0.7rem' : '0.82rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <HelpIcon size={isCompact ? 12 : 14} style={{ color: '#f43f5e' }} /> {formSchema?.policy_info?.faq_text || 'Read all FAQs →'}
          </span>
        </div>
      </div>

      {/* Venue Pickup Card */}
      <div style={{
        background: 'rgba(225, 29, 72, 0.08)',
        border: '1px dashed rgba(225, 29, 72, 0.35)',
        borderRadius: isCompact ? '8px' : '10px',
        padding: isCompact ? '10px' : '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <PlaceIcon size={isCompact ? 13 : 15} style={{ color: '#f43f5e' }} />
          <span style={{
            fontWeight: 800,
            fontSize: isCompact ? '0.66rem' : '0.78rem',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            color: '#f43f5e'
          }}>
            {formSchema?.venue_info?.card_title || 'PASS COLLECTION AT VENUE:'}
          </span>
        </div>
        <div style={{
          fontWeight: 700,
          fontSize: isCompact ? '0.72rem' : '0.82rem',
          color: 'var(--fc-text-main)',
          lineHeight: 1.3
        }}>
          {formSchema?.venue_info?.venue || 'Festival Accreditation Desk'}
        </div>
        <div style={{ fontSize: isCompact ? '0.68rem' : '0.78rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
          Between <strong>{formSchema?.venue_info?.dates || 'Festival Dates'}</strong>
        </div>
        <div style={{ fontSize: isCompact ? '0.68rem' : '0.78rem', color: '#f43f5e', fontWeight: 700, marginTop: '2px' }}>
          {formSchema?.venue_info?.timing || '10:00 AM to 6:00 PM'}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      background: 'var(--fc-surface-card)',
      color: 'var(--fc-text-main)',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--fc-surface-card)',
        padding: isCompact ? '12px 14px' : '16px 24px',
        borderBottom: '3px solid #e11d48',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '10px',
        flexWrap: 'wrap'
      }}>
        <div>
          <h3 style={{
            margin: 0,
            fontSize: isCompact ? '1rem' : '1.35rem',
            fontWeight: 800,
            color: 'var(--fc-text-main)',
            letterSpacing: '-0.01em'
          }}>
            {formSchema.form_title || 'Delegate Registration'}
          </h3>
          {formSchema.form_subtitle && (
            <p style={{
              margin: '2px 0 0 0',
              fontSize: isCompact ? '0.72rem' : '0.84rem',
              color: 'var(--fc-text-muted)'
            }}>
              {formSchema.form_subtitle}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            background: 'var(--fc-surface-subtle)',
            border: '1px solid var(--fc-border)',
            color: 'var(--fc-text-secondary)',
            fontSize: isCompact ? '0.68rem' : '0.78rem',
            fontWeight: 600,
            padding: isCompact ? '2px 8px' : '4px 12px',
            borderRadius: '16px',
            whiteSpace: 'nowrap'
          }}>
            Serial No. (Issued on Submit)
          </span>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Preview"
              style={{
                background: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                color: 'var(--fc-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--fc-text-main)';
                e.currentTarget.style.background = 'var(--fc-surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--fc-text-muted)';
                e.currentTarget.style.background = 'var(--fc-surface)';
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Body: 2-Column Desktop or Single Column Mobile */}
      <div style={{
        padding: isCompact ? '12px 14px' : '22px 24px',
        overflowY: 'auto',
        flex: 1,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isCompact ? '12px' : '24px',
        background: 'var(--fc-surface-card)'
      }}>
        {/* Policy & Venue Desk */}
        {policyAndVenueSection}

        {/* Right Column: Form Fields */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isCompact ? '10px' : '14px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: isCompact ? '0.7rem' : '0.82rem', color: 'var(--fc-text-muted)' }}>
            Already a member? <span style={{ color: '#f43f5e', fontWeight: 700, cursor: 'pointer', marginLeft: '4px' }}>Sign in →</span>
          </div>

          {/* Full Name */}
          {nameField && (
            <div>
              <label style={{ display: 'block', fontSize: isCompact ? '0.72rem' : '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '3px' }}>
                {nameField.label || 'Full Name'} {nameField.required && <span style={{ color: '#e11d48' }}>*</span>}
              </label>
              <input
                type="text"
                disabled
                placeholder={nameField.placeholder || 'Enter your full name as per Govt ID'}
                style={{ width: '100%', padding: isCompact ? '7px 10px' : '9px 16px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.78rem' : '0.88rem', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Email & Phone */}
          {(emailField || phoneField) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: (!isMobile && emailField && phoneField) ? '1fr 1fr' : '1fr',
              gap: isCompact ? '8px' : '12px'
            }}>
              {emailField && (
                <div>
                  <label style={{ display: 'block', fontSize: isCompact ? '0.72rem' : '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '3px' }}>
                    {emailField.label || 'Email Address'} {emailField.required && <span style={{ color: '#e11d48' }}>*</span>}
                  </label>
                  <input
                    type="email"
                    disabled
                    placeholder={emailField.placeholder || 'name@example.com'}
                    style={{ width: '100%', padding: isCompact ? '7px 10px' : '9px 16px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.78rem' : '0.88rem', boxSizing: 'border-box' }}
                  />
                </div>
              )}
              {phoneField && (
                <div>
                  <label style={{ display: 'block', fontSize: isCompact ? '0.72rem' : '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '3px' }}>
                    {phoneField.label || 'Mobile / WhatsApp Number'} {phoneField.required && <span style={{ color: '#e11d48' }}>*</span>}
                  </label>
                  <input
                    type="tel"
                    disabled
                    placeholder={phoneField.placeholder || '+91 98765 43210'}
                    style={{ width: '100%', padding: isCompact ? '7px 10px' : '9px 16px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.78rem' : '0.88rem', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* DOB & Gender */}
          {(dobField || genderField) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: (!isMobile && dobField && genderField) ? (isCompact ? '1fr 1fr' : '1fr 1.3fr') : '1fr',
              gap: isCompact ? '8px' : '12px',
              alignItems: 'flex-start'
            }}>
              {dobField && (
                <div>
                  <label style={{ display: 'block', fontSize: isCompact ? '0.72rem' : '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '3px' }}>
                    {dobField.label || 'Date of Birth'} {dobField.required && <span style={{ color: '#e11d48' }}>*</span>}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      disabled
                      placeholder={dobField.placeholder || 'DD/MM/YYYY'}
                      style={{ width: '100%', padding: isCompact ? '7px 10px' : '9px 16px', paddingRight: '32px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.78rem' : '0.88rem', boxSizing: 'border-box' }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                      <CalendarTodayIcon size={16} style={{ color: 'var(--fc-text-muted)' }} />
                    </span>
                  </div>
                  {dobField.helper_text && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--fc-text-muted)', marginTop: '2px', display: 'block' }}>
                      {dobField.helper_text}
                    </span>
                  )}
                </div>
              )}

              {genderField && (
                <div style={{ border: '1px solid var(--fc-border)', borderRadius: '8px', padding: isCompact ? '6px 8px' : '8px 14px', background: 'var(--fc-surface)' }}>
                  <div style={{ fontSize: isCompact ? '0.68rem' : '0.75rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '3px' }}>
                    {genderField.label || 'Gender Identity'}{genderField.required ? ' *' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: isCompact ? '5px' : '10px', flexWrap: 'wrap' }}>
                    {(genderField.options && genderField.options.length > 0 ? genderField.options : ['Male', 'Female', 'Trans*', 'Other']).map((g) => (
                      <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: isCompact ? '0.72rem' : '0.82rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="preview_gender"
                          checked={previewGender === g}
                          onChange={() => setPreviewGender(g)}
                          style={{ accentColor: '#e11d48', cursor: 'pointer' }}
                        />
                        <span>{g}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pass Type Selector */}
          {passTypeField && (
            <div style={{ border: '1px solid var(--fc-border)', borderRadius: isCompact ? '8px' : '12px', padding: isCompact ? '10px' : '14px', background: 'var(--fc-surface-subtle)' }}>
              <div style={{ fontSize: isCompact ? '0.7rem' : '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-main)', marginBottom: '8px' }}>
                {passTypeField.label || 'SELECT PASS CATEGORY'}{passTypeField.required ? ' *' : ''}
              </div>

              {passOptions.map((opt, oIdx) => {
                const isActive = previewPassType === opt || (!previewPassType && oIdx === 0);
                const isDayOption = opt.toLowerCase().includes('day');
                const desc = opt.toLowerCase().includes('full')
                  ? 'Valid for all screenings across all days'
                  : isDayOption
                    ? 'Valid only for individual selected dates'
                    : 'Accredited festival attendance access pass';

                return (
                  <div
                    key={opt}
                    onClick={() => setPreviewPassType(opt)}
                    style={{
                      border: isActive ? '1px solid #e11d48' : '1px solid var(--fc-border)',
                      background: isActive ? 'rgba(225, 29, 72, 0.12)' : 'var(--fc-surface)',
                      borderRadius: '8px',
                      padding: isCompact ? '7px 10px' : '10px 14px',
                      marginBottom: oIdx < passOptions.length - 1 ? '6px' : '0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: isCompact ? '8px' : '12px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      type="radio"
                      name="preview_pass_type"
                      checked={isActive}
                      onChange={() => setPreviewPassType(opt)}
                      style={{ accentColor: '#e11d48', width: '14px', height: '14px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: isCompact ? '0.76rem' : '0.88rem', color: 'var(--fc-text-main)' }}>{opt}</div>
                      <div style={{ fontSize: isCompact ? '0.68rem' : '0.78rem', color: 'var(--fc-text-muted)', marginTop: '1px' }}>
                        {desc}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Day Pass Selector */}
              {passDaysField && isDayPassActive && (
                <div style={{ marginTop: '8px', padding: isCompact ? '8px 10px' : '10px 14px', background: 'var(--fc-surface)', borderRadius: '8px', border: '1px dashed var(--fc-border)' }}>
                  <div style={{ fontSize: isCompact ? '0.68rem' : '0.75rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '5px' }}>
                    {passDaysField.label || 'Select Days Attending'}:
                  </div>
                  <div style={{ display: 'flex', gap: isCompact ? '8px' : '14px', flexWrap: 'wrap' }}>
                    {(passDaysField.options && passDaysField.options.length > 0 ? passDaysField.options : ['NOV 20th', 'NOV 21st', 'NOV 22nd', 'All Days']).map((d) => (
                      <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: isCompact ? '0.7rem' : '0.8rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={previewDays.includes(d)}
                          onChange={(e) => {
                            if (e.target.checked) setPreviewDays([...previewDays, d]);
                            else setPreviewDays(previewDays.filter(x => x !== d));
                          }}
                          style={{ accentColor: '#e11d48', cursor: 'pointer' }}
                        />
                        <span>{d}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Delegate Category */}
          {delegateCatField && (
            <div>
              <label style={{ display: 'block', fontSize: isCompact ? '0.72rem' : '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '3px' }}>
                {delegateCatField.label || 'Delegate Category'} {delegateCatField.required && <span style={{ color: '#e11d48' }}>*</span>}
              </label>
              <select
                disabled
                style={{ width: '100%', padding: isCompact ? '6px 10px' : '9px 14px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.78rem' : '0.88rem', boxSizing: 'border-box' }}
              >
                {(delegateCatField.options && delegateCatField.options.length > 0 ? delegateCatField.options : [
                  'Bangalore Attendee (AUDIENCE PASS)',
                  'Festival Delegate (DELEGATE)',
                  'VIP & Jury (VIP / JURY)',
                  'Student Pass (STUDENT)',
                  'Press & Media (PRESS)',
                  'Accredited Filmmaker (FILMMAKER)'
                ]).map(opt => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}

          {/* Community & Mumbai */}
          {(commField || mumbaiField) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: (!isMobile && commField && mumbaiField) ? (isCompact ? '1fr 1fr' : '1.2fr 1fr') : '1fr',
              gap: isCompact ? '10px' : '16px'
            }}>
              {commField && (
                <div>
                  <div style={{ fontSize: isCompact ? '0.72rem' : '0.8rem', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                    {commField.label || 'I Am:'}{commField.required ? ' *' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {(commField.options && commField.options.length > 0 ? commField.options : ['A Proud LGBTQ+ person', 'An Ally', 'Still figuring out']).map((item) => (
                      <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: isCompact ? '0.7rem' : '0.82rem', color: 'var(--fc-text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="preview_comm"
                          checked={previewCommunity === item}
                          onChange={() => setPreviewCommunity(item)}
                          style={{ accentColor: '#e11d48', cursor: 'pointer' }}
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {mumbaiField && (
                <div>
                  <div style={{ fontSize: isCompact ? '0.72rem' : '0.8rem', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                    {mumbaiField.label || 'Attended KASHISH in Mumbai?'}{mumbaiField.required ? ' *' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: isCompact ? '8px' : '14px' }}>
                    {(mumbaiField.options && mumbaiField.options.length > 0 ? mumbaiField.options : ['Yes', 'No']).map((ans) => (
                      <label key={ans} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: isCompact ? '0.7rem' : '0.82rem', color: 'var(--fc-text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="preview_mumbai"
                          checked={previewMumbai === ans}
                          onChange={() => setPreviewMumbai(ans)}
                          style={{ accentColor: '#e11d48', cursor: 'pointer' }}
                        />
                        <span>{ans}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional Dynamic / Custom Questions */}
          {customOrOtherFields && customOrOtherFields.length > 0 && (
            <div style={{ background: 'var(--fc-surface-subtle)', border: '1px solid var(--fc-border)', borderRadius: isCompact ? '8px' : '12px', padding: isCompact ? '10px' : '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: isCompact ? '0.7rem' : '0.8rem', fontWeight: 800, color: '#f43f5e', marginBottom: '8px' }}>
                <span>✨</span>
                <span>ADDITIONAL ACCREDITATION QUESTIONS:</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: (!isMobile && !isCompact) ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr', gap: isCompact ? '8px' : '12px' }}>
                {customOrOtherFields.map(field => (
                  <div key={field.key || field.id}>
                    <label style={{ display: 'block', fontSize: isCompact ? '0.68rem' : '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '3px' }}>
                      {field.label} {field.required && <span style={{ color: '#e11d48' }}>*</span>}
                    </label>

                    {field.type === 'select' ? (
                      <select
                        disabled
                        style={{ width: '100%', padding: isCompact ? '6px 10px' : '9px 14px', borderRadius: '24px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.72rem' : '0.82rem', boxSizing: 'border-box' }}
                      >
                        {(field.options || []).map(opt => (
                          <option key={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === 'radio' ? (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '2px' }}>
                        {(field.options || []).map(opt => (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: isCompact ? '0.7rem' : '0.8rem', color: 'var(--fc-text-main)' }}>
                            <input type="radio" disabled name={`preview_custom_${field.key}`} style={{ accentColor: '#e11d48' }} />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : field.type === 'multi_checkbox' ? (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '2px' }}>
                        {(field.options || []).map(opt => (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: isCompact ? '0.7rem' : '0.8rem', color: 'var(--fc-text-main)' }}>
                            <input type="checkbox" disabled style={{ accentColor: '#e11d48' }} />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        rows={2}
                        disabled
                        placeholder={field.placeholder || `Enter ${field.label}`}
                        style={{ width: '100%', padding: isCompact ? '6px 10px' : '8px 14px', borderRadius: '12px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.72rem' : '0.82rem', boxSizing: 'border-box' }}
                      />
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        disabled
                        placeholder={field.placeholder || `Enter ${field.label}`}
                        style={{ width: '100%', padding: isCompact ? '6px 12px' : '9px 16px', borderRadius: '24px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.72rem' : '0.82rem', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verification & Signature Box */}
          {(hasInputs || hasCheckboxes) && (
            <div style={{ background: 'var(--fc-surface-subtle)', border: '1px solid var(--fc-border)', borderRadius: isCompact ? '8px' : '12px', padding: isCompact ? '10px' : '16px', display: 'flex', flexDirection: 'column', gap: isCompact ? '8px' : '12px' }}>
              {hasInputs && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${activeInputCount}, 1fr)`, gap: isCompact ? '6px' : '10px' }}>
                  {signField && (
                    <div>
                      <input
                        type="text"
                        disabled
                        placeholder={signField.placeholder || `${signField.label || 'Digital Sign (Full Name)'}${signField.required ? ' *' : ''}`}
                        style={{ width: '100%', padding: isCompact ? '6px 10px' : '9px 14px', borderRadius: '24px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.7rem' : '0.82rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                  {placeField && (
                    <div>
                      <input
                        type="text"
                        disabled
                        value={placeField.default_value || 'Bengaluru'}
                        style={{ width: '100%', padding: isCompact ? '6px 10px' : '9px 14px', borderRadius: '24px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: isCompact ? '0.7rem' : '0.82rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                  {dateField && (
                    <div>
                      <input
                        type="text"
                        disabled
                        value={todayStr}
                        style={{ width: '100%', padding: isCompact ? '6px 10px' : '9px 14px', borderRadius: '24px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-muted)', fontSize: isCompact ? '0.7rem' : '0.82rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {hasCheckboxes && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: isCompact ? '5px' : '8px', fontSize: isCompact ? '0.7rem' : '0.82rem', color: 'var(--fc-text-secondary)' }}>
                  {updatesField && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" disabled style={{ marginTop: '2px', accentColor: '#e11d48' }} />
                      <span>{updatesField.label} {updatesField.required ? <span style={{ color: '#e11d48' }}>*</span> : '(Optional)'}</span>
                    </label>
                  )}

                  {directoryField && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" disabled style={{ marginTop: '2px', accentColor: '#e11d48' }} />
                      <span>{directoryField.label} {directoryField.required ? <span style={{ color: '#e11d48' }}>*</span> : '(Optional)'}</span>
                    </label>
                  )}

                  {certifyField && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', cursor: 'pointer', borderTop: (updatesField || directoryField) ? '1px dashed var(--fc-border)' : 'none', paddingTop: (updatesField || directoryField) ? (isCompact ? '5px' : '8px') : '0', fontWeight: 600 }}>
                      <input type="checkbox" disabled checked readOnly style={{ marginTop: '2px', accentColor: '#e11d48' }} />
                      <span>{certifyField.label} {certifyField.required && <span style={{ color: '#e11d48' }}>*</span>}</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{
        padding: isCompact ? '10px 14px' : '14px 24px',
        borderTop: '1px solid var(--fc-border)',
        background: 'var(--fc-surface-card)',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '8px'
      }}>
        <button
          type="button"
          disabled
          style={{
            padding: isCompact ? '6px 14px' : '9px 24px',
            borderRadius: '24px',
            border: '1px solid var(--fc-border)',
            background: 'var(--fc-surface)',
            color: 'var(--fc-text-secondary)',
            fontWeight: 600,
            fontSize: isCompact ? '0.72rem' : '0.88rem',
            cursor: 'default'
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled
          style={{
            padding: isCompact ? '7px 18px' : '10px 26px',
            borderRadius: '24px',
            border: 'none',
            background: '#a82f2f',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: isCompact ? '0.74rem' : '0.88rem',
            cursor: 'default',
            boxShadow: '0 4px 12px rgba(168, 47, 47, 0.35)'
          }}
        >
          Submit &amp; Register Pass
        </button>
      </div>
    </div>
  );
}

export default function AudienceSettingsPage() {
  const [activeTab, setActiveTab] = useState('form_builder'); // 'form_builder' | 'categories' | 'voting_rules' | 'venues'

  const [categories, setCategories] = useState([]);
  const [venues, setVenues] = useState([]);
  const [settings, setSettings] = useState({
    voting_window_minutes: 30,
    adjustment_number: 10,
    require_screening_checkin: true,
    enable_did_not_watch_skip: true,
    delegate_registration_enabled: true,
    festival_name: 'Kashish Pride Film Festival (Bangalore Edition)'
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Form Builder State
  const [formSchema, setFormSchema] = useState(null);
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [templatePresets, setTemplatePresets] = useState({});
  const [savingForm, setSavingForm] = useState(false);
  const [formSuccessMsg, setFormSuccessMsg] = useState('');
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPreviewFaqModal, setShowPreviewFaqModal] = useState(false);
  const [toggleConfirmModal, setToggleConfirmModal] = useState(null); // null | { nextValue: boolean }
  const [updatingToggle, setUpdatingToggle] = useState(false);

  // Collapsible Accordions State (Option 2: Compact Collapsible Accordions)
  const [accordionState, setAccordionState] = useState({
    templates: false,
    header: false,
    policy: false,
    venue: false,
    faqs: false,
    fields: true // Section 6 open by default
  });
  const [expandedFaqIndex, setExpandedFaqIndex] = useState(0);

  const toggleAccordion = (sectionKey) => {
    setAccordionState(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const areAllAccordionsExpanded = Object.values(accordionState).every(Boolean);

  const toggleAllAccordions = () => {
    const nextVal = !areAllAccordionsExpanded;
    setAccordionState({
      templates: nextVal,
      header: nextVal,
      policy: nextVal,
      venue: nextVal,
      faqs: nextVal,
      fields: nextVal
    });
  };

  // Live Preview Modal Interactive States (replicates real public form UX)
  const [previewPassType, setPreviewPassType] = useState('Full-Festival Pass');
  const [previewGender, setPreviewGender] = useState('Male');
  const [previewCommunity, setPreviewCommunity] = useState('A Proud LGBTQ+ person');
  const [previewMumbai, setPreviewMumbai] = useState('No');
  const [previewDays, setPreviewDays] = useState(['NOV 20th', 'NOV 21st']);

  // New Custom Question Modal State
  const [newField, setNewField] = useState({
    label: '',
    key: '',
    type: 'text',
    required: false,
    placeholder: '',
    helper_text: '',
    options: ''
  });

  // New Category Modal State
  const [showCatModal, setShowCatModal] = useState(false);
  const [catForm, setCatForm] = useState({
    name: '',
    code: '',
    badge_color: '#a82f2f',
    badge_ribbon_text: '',
    can_vote: true,
    voting_weight: 1.00,
    quota: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, venueRes, setRes, formRes] = await Promise.all([
        api.get('/audience/categories').catch(() => ({ data: { categories: [] } })),
        api.get('/audience/venues').catch(() => ({ data: { venues: [] } })),
        api.get('/audience/settings').catch(() => ({ data: { settings: null } })),
        api.get('/audience/registration-form').catch(() => ({ data: { schema: null } }))
      ]);

      setCategories(catRes.data.categories || []);
      setVenues(venueRes.data.venues || []);
      if (setRes.data?.settings) setSettings(setRes.data.settings);

      if (formRes.data?.schema) {
        const schema = formRes.data.schema;
        if (!schema.policy_info?.faqs || !Array.isArray(schema.policy_info.faqs) || schema.policy_info.faqs.length === 0) {
          schema.policy_info = {
            ...(schema.policy_info || {}),
            faqs: JSON.parse(JSON.stringify(DEFAULT_FAQS))
          };
        }
        if (schema.fields && !schema.fields.some(f => f.key === 'delegate_category')) {
          const passIdx = schema.fields.findIndex(f => f.key === 'pass_days' || f.key === 'pass_type');
          const insertIdx = passIdx !== -1 ? passIdx + 1 : 7;
          schema.fields.splice(insertIdx, 0, {
            id: 'delegate_category',
            key: 'delegate_category',
            label: 'Delegate Category',
            type: 'select',
            required: false,
            enabled: true,
            options: [
              'Bangalore Attendee (AUDIENCE PASS)',
              'Festival Delegate (DELEGATE)',
              'VIP & Jury (VIP / JURY)',
              'Student Pass (STUDENT)',
              'Press & Media (PRESS)',
              'Accredited Filmmaker (FILMMAKER)'
            ]
          });
        }
        setFormSchema(schema);
      }
      if (formRes.data?.available_templates) {
        setAvailableTemplates(formRes.data.available_templates);
      }
      if (formRes.data?.template_presets) {
        setTemplatePresets(formRes.data.template_presets);
      }
    } catch (err) {
      console.error('Failed to load audience settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Category Handlers ---
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      await api.post('/audience/categories', catForm);
      setShowCatModal(false);
      setCatForm({
        name: '',
        code: '',
        badge_color: '#a82f2f',
        badge_ribbon_text: '',
        can_vote: true,
        voting_weight: 1.00,
        quota: ''
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create category.');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Are you sure you want to remove this category?')) return;
    try {
      await api.delete(`/audience/categories/${id}`);
      setCategories(categories.filter(c => c.id !== id));
    } catch (err) {
      alert('Failed to delete category.');
    }
  };

  // --- Voting & Global Settings Handlers ---
  const handleSaveSettings = async (e) => {
    e?.preventDefault();
    try {
      setSavingSettings(true);
      await api.put('/audience/settings', settings);
      alert('Audience settings saved successfully!');
    } catch (err) {
      alert('Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleConfirmToggleRegistration = async () => {
    if (!toggleConfirmModal) return;
    const newVal = toggleConfirmModal.nextValue;
    try {
      setUpdatingToggle(true);
      const updated = { ...settings, delegate_registration_enabled: newVal };
      await api.put('/audience/settings', updated);
      setSettings(updated);
      setToggleConfirmModal(null);
      setFormSuccessMsg(`Public Delegate Self-Registration is now ${newVal ? 'LIVE (Open to public on website)' : 'PAUSED (Staff onsite only)'}`);
      setTimeout(() => setFormSuccessMsg(''), 4500);
    } catch (err) {
      alert('Failed to update public registration status.');
    } finally {
      setUpdatingToggle(false);
    }
  };

  // --- Form Builder Handlers ---
  const handleSelectTemplate = (templateKey) => {
    const key = templateKey;
    const preset = templatePresets[key];
    if (!preset) {
      console.warn('Preset not found for key:', key, 'Available presets:', Object.keys(templatePresets));
      return;
    }
    const isAlreadyActive = formSchema?.template_key === key;
    if (isAlreadyActive) {
      if (!window.confirm(`"${preset.name}" is already your active template. Do you want to reload all form fields and policy settings back to its original template presets?`)) {
        return;
      }
    } else {
      if (formSchema && !window.confirm(`Switch to "${preset.name}"? This will update the form fields with the selected template presets.`)) {
        return;
      }
    }
    setFormSchema(JSON.parse(JSON.stringify(preset)));
    setFormSuccessMsg(`Template loaded: "${preset.name}". Click "Save & Publish Form Schema" below to save changes.`);
    setTimeout(() => setFormSuccessMsg(''), 5000);
  };

  const handleToggleFieldEnabled = (index) => {
    if (!formSchema?.fields) return;
    const field = formSchema.fields[index];
    if (field.key === 'name') {
      alert('Full Name is the primary identifier and cannot be disabled.');
      return;
    }
    const updatedFields = formSchema.fields.map((f, i) => {
      if (i === index) {
        return { ...f, enabled: !f.enabled };
      }
      return f;
    });
    setFormSchema({
      ...formSchema,
      fields: updatedFields
    });
  };

  const handleToggleFieldRequired = (index) => {
    if (!formSchema?.fields) return;
    const field = formSchema.fields[index];
    if (field.key === 'name') {
      alert('Full Name is the primary identifier and must remain required.');
      return;
    }
    const updatedFields = formSchema.fields.map((f, i) => {
      if (i === index) {
        return { ...f, required: !f.required };
      }
      return f;
    });
    setFormSchema({
      ...formSchema,
      fields: updatedFields
    });
  };

  const handleFieldLabelChange = (index, newLabel) => {
    if (!formSchema?.fields) return;
    const updatedFields = formSchema.fields.map((f, i) => {
      if (i === index) {
        return { ...f, label: newLabel };
      }
      return f;
    });
    setFormSchema({
      ...formSchema,
      fields: updatedFields
    });
  };

  const handleMoveField = (fromIndex, toIndex) => {
    if (!formSchema?.fields) return;
    if (toIndex < 0 || toIndex >= formSchema.fields.length) return;
    const updatedFields = [...formSchema.fields];
    const [moved] = updatedFields.splice(fromIndex, 1);
    updatedFields.splice(toIndex, 0, moved);
    setFormSchema({
      ...formSchema,
      fields: updatedFields
    });
  };

  const handleDeleteField = (index) => {
    if (!formSchema?.fields) return;
    const field = formSchema.fields[index];
    if (field.is_core || ['name', 'email', 'phone'].includes(field.key)) {
      alert('Core identity fields cannot be removed.');
      return;
    }
    if (!window.confirm(`Remove field "${field.label}"?`)) return;
    const updatedFields = formSchema.fields.filter((_, i) => i !== index);
    setFormSchema({
      ...formSchema,
      fields: updatedFields
    });
  };

  const handleOpenAddFieldModal = () => {
    setEditingFieldIndex(null);
    setNewField({
      label: '',
      key: '',
      type: 'text',
      required: false,
      placeholder: '',
      helper_text: '',
      options: ''
    });
    setShowAddFieldModal(true);
  };

  const handleOpenEditFieldModal = (index) => {
    const field = formSchema?.fields?.[index];
    if (!field) return;
    setEditingFieldIndex(index);
    setNewField({
      label: field.label || '',
      key: field.key || field.id || '',
      type: field.type || 'text',
      required: Boolean(field.required),
      placeholder: field.placeholder || '',
      helper_text: field.helper_text || '',
      options: Array.isArray(field.options) ? field.options.join(', ') : (field.options || '')
    });
    setShowAddFieldModal(true);
  };

  const handleSaveField = (e) => {
    e.preventDefault();
    if (!newField.label.trim()) return;

    let parsedOptions = [];
    if (['select', 'radio', 'multi_checkbox'].includes(newField.type) && newField.options) {
      parsedOptions = typeof newField.options === 'string'
        ? newField.options.split(',').map(s => s.trim()).filter(Boolean)
        : (Array.isArray(newField.options) ? newField.options : []);
      if (parsedOptions.length === 0) {
        alert('Please provide at least one option (separated by commas).');
        return;
      }
    }

    if (editingFieldIndex !== null && editingFieldIndex >= 0) {
      const updatedFields = [...(formSchema.fields || [])];
      const existingField = updatedFields[editingFieldIndex];
      const isName = existingField.key === 'name';
      const isCore = isName || ['email', 'phone'].includes(existingField.key);
      const baseKey = isCore ? existingField.key : (newField.key.trim() || existingField.key);

      updatedFields[editingFieldIndex] = {
        ...existingField,
        label: newField.label.trim(),
        type: newField.type,
        key: baseKey,
        required: isName ? true : Boolean(newField.required),
        placeholder: newField.placeholder?.trim() || undefined,
        helper_text: newField.helper_text?.trim() || undefined,
        options: parsedOptions.length > 0 ? parsedOptions : undefined,
        default_value: parsedOptions.length > 0
          ? (existingField.default_value && parsedOptions.includes(existingField.default_value) ? existingField.default_value : parsedOptions[0])
          : (['select', 'radio'].includes(newField.type) ? undefined : existingField.default_value)
      };

      setFormSchema({ ...formSchema, fields: updatedFields });
    } else {
      const baseKey = newField.key.trim() || newField.label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
      const safeKey = baseKey.startsWith('custom_') ? baseKey : `custom_${baseKey}`;

      const fieldObj = {
        id: safeKey,
        key: safeKey,
        label: newField.label.trim(),
        type: newField.type,
        required: Boolean(newField.required),
        enabled: true,
        placeholder: newField.placeholder.trim() || undefined,
        helper_text: newField.helper_text.trim() || undefined,
        options: parsedOptions.length > 0 ? parsedOptions : undefined,
        default_value: parsedOptions.length > 0 ? parsedOptions[0] : undefined,
      };

      const updated = { ...formSchema };
      updated.fields = [...(updated.fields || []), fieldObj];
      setFormSchema(updated);
    }

    setShowAddFieldModal(false);
    setEditingFieldIndex(null);
    setNewField({
      label: '',
      key: '',
      type: 'text',
      required: false,
      placeholder: '',
      helper_text: '',
      options: ''
    });
  };

  const handleUpdateVenueInfo = (fieldKey, value) => {
    setFormSchema(prev => ({
      ...prev,
      venue_info: {
        ...(prev?.venue_info || {}),
        [fieldKey]: value
      }
    }));
  };

  const handleUpdatePolicyInfo = (fieldKey, value) => {
    setFormSchema(prev => ({
      ...prev,
      policy_info: {
        ...(prev?.policy_info || {}),
        [fieldKey]: value
      }
    }));
  };

  const handleUpdatePolicyPoint = (index, value) => {
    setFormSchema(prev => {
      const currentPoints = Array.isArray(prev?.policy_info?.points)
        ? [...prev.policy_info.points]
        : [];
      currentPoints[index] = value;
      return {
        ...prev,
        policy_info: {
          ...(prev?.policy_info || {}),
          points: currentPoints
        }
      };
    });
  };

  const handleAddPolicyPoint = () => {
    setFormSchema(prev => {
      const currentPoints = Array.isArray(prev?.policy_info?.points)
        ? [...prev.policy_info.points]
        : [
            'Full-Festival Pass is valid for all screenings on all days.',
            'Day Passes are valid only for individual days selected.',
            'Delegate Pass does NOT guarantee seating, which is first come, first served.',
            'Entry without Delegate Pass will be denied.'
          ];
      return {
        ...prev,
        policy_info: {
          ...(prev?.policy_info || {}),
          points: [...currentPoints, '']
        }
      };
    });
  };

  const handleRemovePolicyPoint = (index) => {
    setFormSchema(prev => {
      const currentPoints = Array.isArray(prev?.policy_info?.points)
        ? [...prev.policy_info.points]
        : [];
      const updated = currentPoints.filter((_, i) => i !== index);
      return {
        ...prev,
        policy_info: {
          ...(prev?.policy_info || {}),
          points: updated
        }
      };
    });
  };

  const handleUpdateFaqItem = (index, key, value) => {
    setFormSchema(prev => {
      const currentFaqs = Array.isArray(prev?.policy_info?.faqs)
        ? [...prev.policy_info.faqs]
        : [];
      currentFaqs[index] = {
        ...(currentFaqs[index] || {}),
        [key]: value
      };
      return {
        ...prev,
        policy_info: {
          ...(prev?.policy_info || {}),
          faqs: currentFaqs
        }
      };
    });
  };

  const handleAddFaqItem = () => {
    setFormSchema(prev => {
      const currentFaqs = Array.isArray(prev?.policy_info?.faqs)
        ? [...prev.policy_info.faqs]
        : [];
      return {
        ...prev,
        policy_info: {
          ...(prev?.policy_info || {}),
          faqs: [...currentFaqs, { question: '', answer: '' }]
        }
      };
    });
  };

  const handleResetDefaultFaqs = () => {
    if (window.confirm('Reset FAQ list to full festival defaults with rich-text formatting?')) {
      setFormSchema(prev => ({
        ...prev,
        policy_info: {
          ...(prev?.policy_info || {}),
          faqs: JSON.parse(JSON.stringify(DEFAULT_FAQS))
        }
      }));
    }
  };

  const handleRemoveFaqItem = (index) => {
    setFormSchema(prev => {
      const currentFaqs = Array.isArray(prev?.policy_info?.faqs)
        ? [...prev.policy_info.faqs]
        : [];
      const updated = currentFaqs.filter((_, i) => i !== index);
      return {
        ...prev,
        policy_info: {
          ...(prev?.policy_info || {}),
          faqs: updated
        }
      };
    });
  };

  const handleMoveFaqItem = (index, direction) => {
    setFormSchema(prev => {
      const currentFaqs = Array.isArray(prev?.policy_info?.faqs)
        ? [...prev.policy_info.faqs]
        : [...DEFAULT_FAQS];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= currentFaqs.length) return prev;
      const copy = [...currentFaqs];
      const [item] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, item);
      return {
        ...prev,
        policy_info: {
          ...(prev?.policy_info || {}),
          faqs: copy
        }
      };
    });
  };

  const handleSaveFormSchema = async () => {
    if (!formSchema || !formSchema.fields) return;
    try {
      setSavingForm(true);
      await api.put('/audience/registration-form', { schema: formSchema });
      setFormSuccessMsg('Registration form configuration saved and published successfully!');
      setTimeout(() => setFormSuccessMsg(''), 5000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save form schema.');
    } finally {
      setSavingForm(false);
    }
  };

  return (
    <div className="fc-audience-page">
      {/* Page Header */}
      <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="fc-page-title" style={{ fontSize: '1.85rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)' }}>
            Audience & Delegate Operations
          </h1>
          <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted)', marginTop: '6px', fontSize: '0.9rem' }}>
            Delegate accreditation builder, pre-built industry templates, categories, quotas, and voting parameters
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {activeTab === 'categories' && (
            <button 
              className="fc-btn fc-btn-primary" 
              onClick={() => setShowCatModal(true)}
              style={{
                background: '#a82f2f',
                color: '#fff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(168, 47, 47, 0.25)',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#922828')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#a82f2f')}
            >
              <span>+ Add Delegate Category</span>
            </button>
          )}

          {activeTab === 'form_builder' && (
            <>
              <button
                onClick={() => setShowPreviewModal(true)}
                style={{
                  background: 'var(--fc-surface-card)',
                  color: 'var(--fc-text-main)',
                  border: '1px solid var(--fc-border)',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <VisibilityIcon size={16} /> Live Form Preview
              </button>
              <button
                onClick={handleSaveFormSchema}
                disabled={savingForm}
                style={{
                  background: '#a82f2f',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(168, 47, 47, 0.35)',
                  transition: 'background 0.15s ease',
                  opacity: savingForm ? 0.7 : 1
                }}
                onMouseEnter={(e) => !savingForm && (e.currentTarget.style.background = '#922828')}
                onMouseLeave={(e) => !savingForm && (e.currentTarget.style.background = '#a82f2f')}
              >
                <SaveIcon size={16} /> {savingForm ? 'Saving Schema...' : 'Save & Publish Schema'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--fc-border)', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('form_builder')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'form_builder' ? '3px solid #a82f2f' : '3px solid transparent',
            color: activeTab === 'form_builder' ? '#a82f2f' : 'var(--fc-text-secondary)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px'
          }}
        >
          <DescriptionIcon size={17} />
          Registration Form Builder
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'categories' ? '3px solid #a82f2f' : '3px solid transparent',
            color: activeTab === 'categories' ? '#a82f2f' : 'var(--fc-text-secondary)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px'
          }}
        >
          <PeopleIcon size={17} />
          Categories &amp; Badges
        </button>

        <button
          onClick={() => setActiveTab('voting_rules')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'voting_rules' ? '3px solid #a82f2f' : '3px solid transparent',
            color: activeTab === 'voting_rules' ? '#a82f2f' : 'var(--fc-text-secondary)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px'
          }}
        >
          <HowToVoteIcon size={17} />
          Audience Voting Rules
        </button>

        <button
          onClick={() => setActiveTab('venues')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'venues' ? '3px solid #a82f2f' : '3px solid transparent',
            color: activeTab === 'venues' ? '#a82f2f' : 'var(--fc-text-secondary)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px'
          }}
        >
          <MovieIcon size={17} />
          Screening Venues
        </button>
      </div>

      {formSuccessMsg && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CheckCircleIcon size={16} /> {formSuccessMsg}</span>
          <button onClick={() => setFormSuccessMsg('')} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: REGISTRATION FORM BUILDER (COMPACT COLLAPSIBLE ACCORDIONS)         */}
      {/* ========================================================================= */}
      {activeTab === 'form_builder' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Top Status & Utility Toolbar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
            background: 'var(--fc-surface-card)',
            padding: '12px 18px',
            borderRadius: '12px',
            border: '1px solid var(--fc-border)',
            boxShadow: 'var(--shadow-sm)',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <PaletteIcon size={20} style={{ color: '#a82f2f' }} />
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)', fontWeight: 600 }}>Active Preset: </span>
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#a82f2f' }}>
                  {formSchema?.name || formSchema?.template_key || 'KASHISH / LGBTQ+ Festival Template'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{
                  background: 'rgba(168, 47, 47, 0.1)',
                  color: '#a82f2f',
                  border: '1px solid rgba(168, 47, 47, 0.25)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <TuneIcon size={12} /> {formSchema?.fields?.filter(f => f.enabled !== false).length || 0} Questions Active
                </span>
                <span style={{
                  background: 'var(--fc-surface-subtle)',
                  color: 'var(--fc-text-secondary)',
                  border: '1px solid var(--fc-border)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <ConfirmationNumberIcon size={12} /> {formSchema?.policy_info?.points?.length || 4} Policy Rules
                </span>
                <span style={{
                  background: 'var(--fc-surface-subtle)',
                  color: 'var(--fc-text-secondary)',
                  border: '1px solid var(--fc-border)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <HelpIcon size={12} /> {formSchema?.policy_info?.faqs?.length || 0} FAQs
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={toggleAllAccordions}
                style={{
                  background: 'var(--fc-surface)',
                  border: '1px solid var(--fc-border)',
                  color: 'var(--fc-text-main)',
                  padding: '7px 14px',
                  borderRadius: '7px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {areAllAccordionsExpanded ? (
                  <><ExpandLessIcon size={14} /> Collapse All Sections</>
                ) : (
                  <><ExpandMoreIcon size={14} /> Expand All Sections</>
                )}
              </button>
            </div>
          </div>

          {/* Public Self-Registration Master Control Card */}
          <div style={{
            background: settings.delegate_registration_enabled ? 'rgba(16, 185, 129, 0.05)' : 'var(--fc-surface-card)',
            border: settings.delegate_registration_enabled ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--fc-border)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: 'var(--shadow-sm)',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '4px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: settings.delegate_registration_enabled ? '#10b981' : 'var(--fc-surface-hover)',
                color: settings.delegate_registration_enabled ? '#fff' : 'var(--fc-text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <HowToVoteIcon size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                    Public Delegate Self-Registration
                  </span>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    background: settings.delegate_registration_enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                    color: settings.delegate_registration_enabled ? '#10b981' : 'var(--fc-text-muted)'
                  }}>
                    {settings.delegate_registration_enabled ? '● Live on Website' : '○ Registration Closed'}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--fc-text-muted)' }}>
                  {settings.delegate_registration_enabled
                    ? 'Public delegate registration is currently active. Visitors can register online and receive accreditation passes on the festival website.'
                    : 'Public registration is turned off. Only festival staff and administrators can register delegates onsite.'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label 
                htmlFor="delegateRegMasterSwitch"
                style={{ 
                  position: 'relative', 
                  display: 'inline-block', 
                  width: '52px', 
                  height: '28px', 
                  cursor: 'pointer',
                  margin: 0
                }}
              >
                <input
                  id="delegateRegMasterSwitch"
                  type="checkbox"
                  checked={Boolean(settings.delegate_registration_enabled)}
                  onChange={(e) => {
                    const nextVal = e.target.checked;
                    setToggleConfirmModal({ nextValue: nextVal });
                  }}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: settings.delegate_registration_enabled ? '#10b981' : 'var(--fc-border-strong, #cbd5e1)',
                  borderRadius: '34px',
                  transition: 'background-color 0.25s ease'
                }}>
                  <span style={{
                    position: 'absolute',
                    height: '22px',
                    width: '22px',
                    left: settings.delegate_registration_enabled ? '27px' : '3px',
                    bottom: '3px',
                    backgroundColor: '#fff',
                    borderRadius: '50%',
                    transition: 'left 0.25s ease',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.25)'
                  }} />
                </span>
              </label>
            </div>
          </div>

          {/* ACCORDION 1: Pre-Built Industry Templates */}
          <div className="fc-card" style={{
            background: 'var(--fc-surface-card)',
            borderRadius: '12px',
            border: accordionState.templates ? '1px solid #e11d48' : '1px solid var(--fc-border)',
            boxShadow: accordionState.templates ? '0 4px 16px rgba(225, 29, 72, 0.08)' : 'var(--shadow-sm)',
            overflow: 'hidden',
            transition: 'all 0.15s ease'
          }}>
            <div
              onClick={() => toggleAccordion('templates')}
              style={{
                padding: '14px 18px',
                background: accordionState.templates ? 'rgba(225, 29, 72, 0.04)' : 'var(--fc-surface-card)',
                borderBottom: accordionState.templates ? '1px solid var(--fc-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: accordionState.templates ? 'rgba(225, 29, 72, 0.12)' : 'var(--fc-surface)',
                  border: '1px solid var(--fc-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem'
                }}>
                  <PaletteIcon size={20} style={{ color: accordionState.templates ? '#e11d48' : 'var(--fc-text-secondary)' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                      Step 1: Choose Pre-Built Industry Template
                    </h3>
                    <span style={{
                      background: 'rgba(225, 29, 72, 0.1)',
                      color: '#e11d48',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      Active: {formSchema?.name || formSchema?.template_key || 'LGBTQ+ Pride'}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>
                    Select an industry preset matching your festival type. You can fully customize questions and policy rules below.
                  </p>
                </div>
              </div>

              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: accordionState.templates ? '#e11d48' : 'var(--fc-text-muted)',
                background: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                padding: '4px 10px',
                borderRadius: '6px'
              }}>
                {accordionState.templates ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandLessIcon size={14} /> Collapse</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandMoreIcon size={14} /> Expand</span>
                )}
              </span>
            </div>

            {accordionState.templates && (
              <div style={{ padding: '20px', background: 'var(--fc-surface-card)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                  {availableTemplates.map((tpl) => {
                    const tplKey = tpl.template_key || tpl.key;
                    const isSelected = formSchema?.template_key === tplKey;
                    return (
                      <div
                        key={tplKey}
                        onClick={() => handleSelectTemplate(tplKey)}
                        style={{
                          border: isSelected ? '2px solid #e11d48' : '1px solid var(--fc-border)',
                          borderRadius: '10px',
                          padding: '16px',
                          background: isSelected ? 'rgba(225, 29, 72, 0.05)' : 'var(--fc-surface)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ background: isSelected ? '#e11d48' : 'var(--fc-border)', color: isSelected ? '#fff' : 'var(--fc-text-secondary)', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                              {tpl.badge_label}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>
                              {tpl.fields_count} Fields
                            </span>
                          </div>
                          <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                            {tpl.name}
                          </div>
                          <p style={{ fontSize: '0.78rem', color: 'var(--fc-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                            {tpl.description}
                          </p>
                        </div>

                        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--fc-border)' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectTemplate(tplKey);
                            }}
                            style={{
                              background: isSelected ? '#059669' : '#a82f2f',
                              color: '#ffffff',
                              border: 'none',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = '#922828')}
                            onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = '#a82f2f')}
                          >
                            {isSelected ? '✓ Active' : 'Load Preset →'}
                          </button>
                          <span style={{ fontSize: '0.72rem', color: isSelected ? '#059669' : 'var(--fc-text-muted)', fontWeight: isSelected ? 700 : 400 }}>
                            {isSelected ? 'Currently Active' : 'Click to apply'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 2: Public Form Header & Tagline */}
          <div className="fc-card" style={{
            background: 'var(--fc-surface-card)',
            borderRadius: '12px',
            border: accordionState.header ? '1px solid #e11d48' : '1px solid var(--fc-border)',
            boxShadow: accordionState.header ? '0 4px 16px rgba(225, 29, 72, 0.08)' : 'var(--shadow-sm)',
            overflow: 'hidden',
            transition: 'all 0.15s ease'
          }}>
            <div
              onClick={() => toggleAccordion('header')}
              style={{
                padding: '14px 18px',
                background: accordionState.header ? 'rgba(225, 29, 72, 0.04)' : 'var(--fc-surface-card)',
                borderBottom: accordionState.header ? '1px solid var(--fc-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: accordionState.header ? 'rgba(225, 29, 72, 0.12)' : 'var(--fc-surface)',
                  border: '1px solid var(--fc-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem'
                }}>
                  <DescriptionIcon size={20} style={{ color: accordionState.header ? '#e11d48' : 'var(--fc-text-secondary)' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                      Step 2: Public Form Header &amp; Branding
                    </h3>
                    <span style={{
                      background: 'var(--fc-surface-subtle)',
                      color: 'var(--fc-text-secondary)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      {formSchema?.form_title || 'Delegate Registration'}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>
                    Title and tagline displayed at the header of the public delegate registration modal.
                  </p>
                </div>
              </div>

              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: accordionState.header ? '#e11d48' : 'var(--fc-text-muted)',
                background: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                padding: '4px 10px',
                borderRadius: '6px'
              }}>
                {accordionState.header ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandLessIcon size={14} /> Collapse</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandMoreIcon size={14} /> Expand</span>
                )}
              </span>
            </div>

            {accordionState.header && (
              <div style={{ padding: '20px', background: 'var(--fc-surface-card)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--fc-text-main)' }}>
                      Form Title (shown to public)
                    </label>
                    <input
                      type="text"
                      value={formSchema?.form_title || ''}
                      onChange={(e) => setFormSchema({ ...formSchema, form_title: e.target.value })}
                      placeholder="e.g. KASHISH Delegate Registration"
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.88rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--fc-text-main)' }}>
                      Form Subtitle / Tagline
                    </label>
                    <input
                      type="text"
                      value={formSchema?.form_subtitle || ''}
                      onChange={(e) => setFormSchema({ ...formSchema, form_subtitle: e.target.value })}
                      placeholder="e.g. Full-Festival & Day Pass Accreditation"
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.88rem' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 3: Delegate Pass Policy & FAQ Configuration */}
          <div className="fc-card" style={{
            background: 'var(--fc-surface-card)',
            borderRadius: '12px',
            border: accordionState.policy ? '1px solid #e11d48' : '1px solid var(--fc-border)',
            boxShadow: accordionState.policy ? '0 4px 16px rgba(225, 29, 72, 0.08)' : 'var(--shadow-sm)',
            overflow: 'hidden',
            transition: 'all 0.15s ease'
          }}>
            <div
              onClick={() => toggleAccordion('policy')}
              style={{
                padding: '14px 18px',
                background: accordionState.policy ? 'rgba(225, 29, 72, 0.04)' : 'var(--fc-surface-card)',
                borderBottom: accordionState.policy ? '1px solid var(--fc-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: accordionState.policy ? 'rgba(225, 29, 72, 0.12)' : 'var(--fc-surface)',
                  border: '1px solid var(--fc-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem'
                }}>
                  <ConfirmationNumberIcon size={20} style={{ color: accordionState.policy ? '#e11d48' : 'var(--fc-text-secondary)' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                      Step 3: Delegate Pass Policy &amp; FAQ Configuration
                    </h3>
                    <span style={{
                      background: 'var(--fc-surface-subtle)',
                      color: 'var(--fc-text-secondary)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      {formSchema?.policy_info?.points?.length || 4} Rules Configured
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>
                    Controls the left-hand Policy box on the delegate registration form, rules bullet points, and FAQ trigger link.
                  </p>
                </div>
              </div>

              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: accordionState.policy ? '#e11d48' : 'var(--fc-text-muted)',
                background: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                padding: '4px 10px',
                borderRadius: '6px'
              }}>
                {accordionState.policy ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandLessIcon size={14} /> Collapse</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandMoreIcon size={14} /> Expand</span>
                )}
              </span>
            </div>

            {accordionState.policy && (
              <div style={{ padding: '20px', background: 'var(--fc-surface-card)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--fc-text-secondary)' }}>
                      Policy Card Title
                    </label>
                    <input
                      type="text"
                      value={formSchema?.policy_info?.title || ''}
                      onChange={(e) => handleUpdatePolicyInfo('title', e.target.value)}
                      placeholder="e.g. DELEGATE PASS POLICY"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--fc-text-secondary)' }}>
                      Policy Icon / Symbol
                    </label>
                    <input
                      type="text"
                      value={formSchema?.policy_info?.icon || ''}
                      onChange={(e) => handleUpdatePolicyInfo('icon', e.target.value)}
                      placeholder="e.g. Pass / Ticket"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--fc-text-secondary)' }}>
                      FAQ Link Text (Opens Delegate FAQ Dialog)
                    </label>
                    <input
                      type="text"
                      value={formSchema?.policy_info?.faq_text || ''}
                      onChange={(e) => handleUpdatePolicyInfo('faq_text', e.target.value)}
                      placeholder="e.g. Read all FAQs →"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                {/* Bullet Rules Editor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fc-text-secondary)' }}>
                      Policy Bullet Points (shown in Left Column of Registration Form):
                    </label>
                    <button
                      type="button"
                      onClick={handleAddPolicyPoint}
                      style={{
                        background: '#a82f2f',
                        color: '#fff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '5px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#922828')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#a82f2f')}
                    >
                      + Add Policy Rule
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {((formSchema?.policy_info?.points && formSchema.policy_info.points.length > 0)
                      ? formSchema.policy_info.points
                      : [
                          'Full-Festival Pass is valid for all screenings on all days.',
                          'Day Passes are valid only for individual days selected.',
                          'Delegate Pass does NOT guarantee seating, which is first come, first served.',
                          'Entry without Delegate Pass will be denied.'
                        ]
                    ).map((point, pIdx) => (
                      <div key={pIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: '#e11d48', fontWeight: 700, fontSize: '0.9rem' }}>•</span>
                        <input
                          type="text"
                          value={point}
                          onChange={(e) => handleUpdatePolicyPoint(pIdx, e.target.value)}
                          placeholder={`Policy rule ${pIdx + 1}`}
                          style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePolicyPoint(pIdx)}
                          title="Remove Policy Rule"
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: '0.78rem'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 4: Physical Badge Collection Desk Details */}
          <div className="fc-card" style={{
            background: 'var(--fc-surface-card)',
            borderRadius: '12px',
            border: accordionState.venue ? '1px solid #e11d48' : '1px solid var(--fc-border)',
            boxShadow: accordionState.venue ? '0 4px 16px rgba(225, 29, 72, 0.08)' : 'var(--shadow-sm)',
            overflow: 'hidden',
            transition: 'all 0.15s ease'
          }}>
            <div
              onClick={() => toggleAccordion('venue')}
              style={{
                padding: '14px 18px',
                background: accordionState.venue ? 'rgba(225, 29, 72, 0.04)' : 'var(--fc-surface-card)',
                borderBottom: accordionState.venue ? '1px solid var(--fc-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: accordionState.venue ? 'rgba(225, 29, 72, 0.12)' : 'var(--fc-surface)',
                  border: '1px solid var(--fc-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem'
                }}>
                  <PlaceIcon size={20} style={{ color: accordionState.venue ? '#e11d48' : 'var(--fc-text-secondary)' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                      Step 4: Physical Badge Collection Desk Details
                    </h3>
                    <span style={{
                      background: 'var(--fc-surface-subtle)',
                      color: 'var(--fc-text-secondary)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      {formSchema?.venue_info?.venue ? 'Configured' : 'Accreditation Desk'}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>
                    Accreditation pickup venue, festival dates, operational desk timing, and badge receipt instructions.
                  </p>
                </div>
              </div>

              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: accordionState.venue ? '#e11d48' : 'var(--fc-text-muted)',
                background: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                padding: '4px 10px',
                borderRadius: '6px'
              }}>
                {accordionState.venue ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandLessIcon size={14} /> Collapse</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandMoreIcon size={14} /> Expand</span>
                )}
              </span>
            </div>

            {accordionState.venue && (
              <div style={{ padding: '20px', background: 'var(--fc-surface-card)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--fc-text-secondary)' }}>
                      Venue Card Title
                    </label>
                    <input
                      type="text"
                      value={formSchema?.venue_info?.card_title || ''}
                      onChange={(e) => handleUpdateVenueInfo('card_title', e.target.value)}
                      placeholder="e.g. PASS COLLECTION AT VENUE:"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--fc-text-secondary)' }}>
                      Physical Collection Venue
                    </label>
                    <input
                      type="text"
                      value={formSchema?.venue_info?.venue || ''}
                      onChange={(e) => handleUpdateVenueInfo('venue', e.target.value)}
                      placeholder="e.g. National Gallery of Modern Art (NGMA), Bengaluru"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--fc-text-secondary)' }}>
                      Festival Dates
                    </label>
                    <input
                      type="text"
                      value={formSchema?.venue_info?.dates || ''}
                      onChange={(e) => handleUpdateVenueInfo('dates', e.target.value)}
                      placeholder="e.g. Nov 20th to Nov 22nd, 2026"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--fc-text-secondary)' }}>
                      Registration Desk Timing
                    </label>
                    <input
                      type="text"
                      value={formSchema?.venue_info?.timing || ''}
                      onChange={(e) => handleUpdateVenueInfo('timing', e.target.value)}
                      placeholder="e.g. 10:15 AM to 6:00 PM"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--fc-text-secondary)' }}>
                    Badge Pickup &amp; Onsite Instructions (printed on pass receipt)
                  </label>
                  <textarea
                    rows={2}
                    value={formSchema?.venue_info?.instructions || ''}
                    onChange={(e) => handleUpdateVenueInfo('instructions', e.target.value)}
                    placeholder="Present this Serial Number along with a valid Government Photo ID at the NGMA Registration Desk..."
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 5: Delegate FAQ Questions & Answers */}
          <div className="fc-card" style={{
            background: 'var(--fc-surface-card)',
            borderRadius: '12px',
            border: accordionState.faqs ? '1px solid #e11d48' : '1px solid var(--fc-border)',
            boxShadow: accordionState.faqs ? '0 4px 16px rgba(225, 29, 72, 0.08)' : 'var(--shadow-sm)',
            overflow: 'hidden',
            transition: 'all 0.15s ease'
          }}>
            <div
              onClick={() => toggleAccordion('faqs')}
              style={{
                padding: '14px 18px',
                background: accordionState.faqs ? 'rgba(225, 29, 72, 0.04)' : 'var(--fc-surface-card)',
                borderBottom: accordionState.faqs ? '1px solid var(--fc-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: accordionState.faqs ? 'rgba(225, 29, 72, 0.12)' : 'var(--fc-surface)',
                  border: '1px solid var(--fc-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem'
                }}>
                  <HelpIcon size={20} style={{ color: accordionState.faqs ? '#e11d48' : 'var(--fc-text-secondary)' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                      Step 5: Custom FAQ Questions &amp; Answers
                    </h3>
                    <span style={{
                      background: 'rgba(225, 29, 72, 0.1)',
                      color: '#e11d48',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      {formSchema?.policy_info?.faqs?.length || 0} Questions • Rich Text
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>
                    Configure the questions and rich formatted answers displayed in the public delegate registration FAQ popup dialog.
                  </p>
                </div>
              </div>

              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: accordionState.faqs ? '#e11d48' : 'var(--fc-text-muted)',
                background: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                padding: '4px 10px',
                borderRadius: '6px'
              }}>
                {accordionState.faqs ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandLessIcon size={14} /> Collapse</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandMoreIcon size={14} /> Expand</span>
                )}
              </span>
            </div>

            {accordionState.faqs && (
              <div style={{ padding: '20px', background: 'var(--fc-surface-card)' }}>
                {/* FAQ Actions Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fc-text-secondary)' }}>
                    FAQ Accordion Editor ({formSchema?.policy_info?.faqs?.length || 0} Items)
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleResetDefaultFaqs}
                      style={{
                        background: 'var(--fc-surface)',
                        color: 'var(--fc-text-muted)',
                        border: '1px solid var(--fc-border)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      ↺ Reset to Festival FAQs
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPreviewFaqModal(true)}
                      style={{
                        background: 'rgba(225, 29, 72, 0.08)',
                        color: '#e11d48',
                        border: '1px solid rgba(225, 29, 72, 0.25)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <VisibilityIcon size={14} /> Preview FAQ Dialog
                    </button>
                    <button
                      type="button"
                      onClick={handleAddFaqItem}
                      style={{
                        background: '#a82f2f',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(168, 47, 47, 0.25)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#922828')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#a82f2f')}
                    >
                      + Add FAQ Question
                    </button>
                  </div>
                </div>

                {/* FAQ Items List */}
                {(!formSchema?.policy_info?.faqs || formSchema.policy_info.faqs.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '24px 12px', border: '1px dashed var(--fc-border)', borderRadius: '8px', background: 'var(--fc-surface)' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '6px' }}>
                      No FAQ Items Configured
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={handleResetDefaultFaqs}
                        style={{ background: '#a82f2f', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#922828')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#a82f2f')}
                      >
                        ↺ Load Full Festival FAQs
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {formSchema.policy_info.faqs.map((faq, fIdx) => {
                      const isFaqExpanded = expandedFaqIndex === fIdx;

                      return (
                        <div
                          key={fIdx}
                          style={{
                            border: isFaqExpanded ? '1px solid #e11d48' : '1px solid var(--fc-border)',
                            borderRadius: '8px',
                            background: 'var(--fc-surface)',
                            boxShadow: isFaqExpanded ? '0 2px 8px rgba(225, 29, 72, 0.1)' : 'none',
                            overflow: 'hidden',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div
                            onClick={() => setExpandedFaqIndex(isFaqExpanded ? null : fIdx)}
                            style={{
                              padding: '10px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              cursor: 'pointer',
                              background: isFaqExpanded ? 'rgba(225, 29, 72, 0.04)' : 'transparent'
                            }}
                          >
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              color: isFaqExpanded ? '#fff' : '#e11d48',
                              background: isFaqExpanded ? '#e11d48' : 'rgba(225, 29, 72, 0.1)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              #{fIdx + 1}
                            </span>

                            <input
                              type="text"
                              value={faq.question || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleUpdateFaqItem(fIdx, 'question', e.target.value)}
                              placeholder="Question Title..."
                              style={{
                                flex: 1,
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                padding: '6px 10px',
                                border: '1px solid var(--fc-border)',
                                borderRadius: '5px',
                                background: 'var(--fc-surface-card)',
                                color: 'var(--fc-text-main)'
                              }}
                            />

                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                disabled={fIdx === 0}
                                onClick={() => handleMoveFaqItem(fIdx, -1)}
                                title="Move Up"
                                style={{
                                  background: 'transparent',
                                  border: '1px solid var(--fc-border)',
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  cursor: fIdx === 0 ? 'not-allowed' : 'pointer',
                                  color: fIdx === 0 ? 'var(--fc-text-muted)' : 'var(--fc-text-main)',
                                  opacity: fIdx === 0 ? 0.3 : 1,
                                  fontSize: '0.74rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <ArrowDropUpIcon size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={fIdx === formSchema.policy_info.faqs.length - 1}
                                onClick={() => handleMoveFaqItem(fIdx, 1)}
                                title="Move Down"
                                style={{
                                  background: 'transparent',
                                  border: '1px solid var(--fc-border)',
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  cursor: fIdx === formSchema.policy_info.faqs.length - 1 ? 'not-allowed' : 'pointer',
                                  color: fIdx === formSchema.policy_info.faqs.length - 1 ? 'var(--fc-text-muted)' : 'var(--fc-text-main)',
                                  opacity: fIdx === formSchema.policy_info.faqs.length - 1 ? 0.3 : 1,
                                  fontSize: '0.74rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <ArrowDropDownIcon size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveFaqItem(fIdx)}
                                title="Delete Question"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.08)',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  fontWeight: 800,
                                  fontSize: '0.74rem',
                                  marginLeft: '3px'
                                }}
                              >
                                ✕
                              </button>
                            </div>

                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: isFaqExpanded ? '#e11d48' : 'var(--fc-text-muted)', marginLeft: '4px', whiteSpace: 'nowrap' }}>
                              {isFaqExpanded ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><ExpandLessIcon size={13} /> Collapse</span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><ExpandMoreIcon size={13} /> Edit Answer</span>
                              )}
                            </span>
                          </div>

                          {isFaqExpanded && (
                            <div style={{ padding: '14px 18px', borderTop: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)' }}>
                              <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--fc-text-muted)', marginBottom: '8px' }}>
                                Answer Content (Rich Text / Formatted HTML):
                              </div>
                              <FaqRichTextEditor
                                value={faq.answer || ''}
                                onChange={(html) => handleUpdateFaqItem(fIdx, 'answer', html)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ACCORDION 6: Form Questions & Custom Add-ons (Open by default) */}
          <div className="fc-card" style={{
            background: 'var(--fc-surface-card)',
            borderRadius: '12px',
            border: accordionState.fields ? '1px solid #e11d48' : '1px solid var(--fc-border)',
            boxShadow: accordionState.fields ? '0 4px 16px rgba(225, 29, 72, 0.08)' : 'var(--shadow-sm)',
            overflow: 'hidden',
            transition: 'all 0.15s ease'
          }}>
            <div
              onClick={() => toggleAccordion('fields')}
              style={{
                padding: '14px 18px',
                background: accordionState.fields ? 'rgba(225, 29, 72, 0.04)' : 'var(--fc-surface-card)',
                borderBottom: accordionState.fields ? '1px solid var(--fc-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: accordionState.fields ? 'rgba(225, 29, 72, 0.12)' : 'var(--fc-surface)',
                  border: '1px solid var(--fc-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem'
                }}>
                  <TuneIcon size={20} style={{ color: accordionState.fields ? '#e11d48' : 'var(--fc-text-secondary)' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                      Step 6: Form Questions &amp; Custom Add-ons
                    </h3>
                    <span style={{
                      background: 'rgba(225, 29, 72, 0.1)',
                      color: '#e11d48',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      {formSchema?.fields?.filter(f => f.enabled !== false).length || 0} Active Fields
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>
                    Toggle fields, edit question labels, set mandatory rules, reorder, or add custom questions.
                  </p>
                </div>
              </div>

              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: accordionState.fields ? '#e11d48' : 'var(--fc-text-muted)',
                background: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                padding: '4px 10px',
                borderRadius: '6px'
              }}>
                {accordionState.fields ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandLessIcon size={14} /> Collapse</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ExpandMoreIcon size={14} /> Expand</span>
                )}
              </span>
            </div>

            {accordionState.fields && (
              <div style={{ padding: '20px', background: 'var(--fc-surface-card)' }}>
                {/* Header Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fc-text-secondary)' }}>
                    Accreditation Form Field Ordering &amp; Settings
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenAddFieldModal}
                    style={{
                      background: '#a82f2f',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(168, 47, 47, 0.25)',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#922828')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#a82f2f')}
                  >
                    + Add Custom Question
                  </button>
                </div>

                {/* Questions List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {formSchema?.fields?.map((field, index) => {
                    const isNameCore = field.key === 'name';
                    const isContactCore = ['email', 'phone'].includes(field.key);
                    const isEnabled = field.enabled !== false;
                    const isRequired = Boolean(field.required);

                    return (
                      <div
                        key={field.key || field.id || index}
                        style={{
                          border: '1px solid var(--fc-border)',
                          borderRadius: '8px',
                          padding: '12px 16px',
                          background: isEnabled ? 'var(--fc-surface)' : 'var(--fc-surface-subtle)',
                          opacity: isEnabled ? 1 : 0.65,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '14px',
                          flexWrap: 'wrap'
                        }}
                      >
                        {/* Left: Reorder & Type info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 340px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleMoveField(index, index - 1)}
                              style={{ border: 'none', background: 'transparent', cursor: index === 0 ? 'default' : 'pointer', fontSize: '0.78rem', opacity: index === 0 ? 0.3 : 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Move Up"
                            >
                              <ArrowDropUpIcon size={16} />
                            </button>
                            <button
                              type="button"
                              disabled={index === (formSchema.fields.length - 1)}
                              onClick={() => handleMoveField(index, index + 1)}
                              style={{ border: 'none', background: 'transparent', cursor: index === (formSchema.fields.length - 1) ? 'default' : 'pointer', fontSize: '0.78rem', opacity: index === (formSchema.fields.length - 1) ? 0.3 : 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Move Down"
                            >
                              <ArrowDropDownIcon size={16} />
                            </button>
                          </div>

                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              <input
                                type="text"
                                value={field.label}
                                onChange={(e) => handleFieldLabelChange(index, e.target.value)}
                                style={{
                                  fontWeight: 700,
                                  fontSize: '0.92rem',
                                  color: 'var(--fc-text-main)',
                                  border: '1px solid transparent',
                                  background: 'transparent',
                                  borderBottom: '1px dashed var(--fc-border)',
                                  padding: '2px 4px',
                                  width: '90%'
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem', color: 'var(--fc-text-muted)', flexWrap: 'wrap' }}>
                              <span style={{ background: 'var(--fc-surface-card)', border: '1px solid var(--fc-border)', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                                {field.type}
                              </span>
                              <code>{field.key}</code>
                              {isNameCore && (
                                <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <LockIcon size={12} /> Primary ID
                                </span>
                              )}
                              {isContactCore && (
                                <span style={{ color: '#2563eb', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <BadgeIcon size={12} /> Core Contact
                                </span>
                              )}
                              {field.options && (
                                <span>• Options: {field.options.slice(0, 3).join(', ')}{field.options.length > 3 ? '...' : ''}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Controls (Enabled, Required, Edit, Delete) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', cursor: isNameCore ? 'not-allowed' : 'pointer', color: 'var(--fc-text-secondary)' }}>
                            <input
                              type="checkbox"
                              checked={isRequired}
                              disabled={isNameCore}
                              onChange={() => handleToggleFieldRequired(index)}
                              style={{ cursor: isNameCore ? 'not-allowed' : 'pointer', accentColor: '#e11d48' }}
                            />
                            <span style={{ fontWeight: isRequired ? 600 : 400, color: isRequired ? 'var(--fc-text-main)' : 'var(--fc-text-muted)' }}>
                              {isRequired ? 'Required' : 'Optional'}
                            </span>
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', cursor: isNameCore ? 'not-allowed' : 'pointer', color: isEnabled ? '#059669' : '#6b7280', fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              disabled={isNameCore}
                              onChange={() => handleToggleFieldEnabled(index)}
                              style={{ cursor: isNameCore ? 'not-allowed' : 'pointer', accentColor: '#059669' }}
                            />
                            <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => handleOpenEditFieldModal(index)}
                            title="Edit Question Details & Rules"
                            aria-label="Edit question"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--fc-text-secondary)',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'color 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--fc-text-main)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--fc-text-secondary)'}
                          >
                            <EditIcon size={16} />
                          </button>

                          {!isNameCore && !isContactCore && (
                            <button
                              type="button"
                              onClick={() => handleDeleteField(index)}
                              title="Remove field"
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                            >
                              <DeleteIcon size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>


              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DELEGATE CATEGORIES & BADGES                                       */}
      {/* ========================================================================= */}
      {activeTab === 'categories' && (
        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--fc-text-main)' }}>
            Delegate Categories & Ribbon Badges
          </h2>

          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>Loading categories...</div>
          ) : categories.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>No categories created yet. Click "+ Add Delegate Category" above.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {categories.map((cat) => (
                <div 
                  key={cat.id} 
                  className="fc-audience-category-card"
                  style={{
                    border: '1px solid var(--fc-border)',
                    borderRadius: '10px',
                    padding: '16px',
                    background: 'var(--fc-surface)',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span 
                        style={{
                          background: cat.badge_color || '#6366f1',
                          color: '#fff',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          letterSpacing: '0.05em'
                        }}
                      >
                        {cat.badge_ribbon_text || cat.name.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>
                        Code: <code>{cat.code}</code>
                      </span>
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--fc-text-main)', marginTop: '4px' }}>
                      {cat.name}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '0.8rem', color: 'var(--fc-text-secondary)' }}>
                      <span><PeopleIcon size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} /><strong>{cat.attendee_count || 0}</strong> Registered</span>
                      <span><HowToVoteIcon size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />{cat.can_vote ? 'Can Vote' : 'Voting Disabled'}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--fc-border)', paddingTop: '8px' }}>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* TAB 3: AUDIENCE VOTING RULES & SCREENING PARAMETERS                       */}
      {/* ========================================================================= */}
      {activeTab === 'voting_rules' && (
        <div style={{ maxWidth: '880px', width: '100%' }}>
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--fc-text-main)' }}>
              Audience Voting Rules & Screening Parameters
            </h2>
            <form onSubmit={handleSaveSettings}>
              {/* Check-in Enforcement */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '6px' }}>
                  Option 3 Screening Check-in Enforcement
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    id="reqCheckin" 
                    checked={settings.require_screening_checkin}
                    onChange={(e) => setSettings({ ...settings, require_screening_checkin: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="reqCheckin" style={{ fontSize: '0.85rem', color: 'var(--fc-text-secondary)', cursor: 'pointer' }}>
                    Require verified attendance at screening door before unlocking ballot
                  </label>
                </div>
                <small style={{ display: 'block', color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.75rem' }}>
                  Prevents non-attendees from scanning shared QR screenshots online.
                </small>
              </div>

              {/* Bayesian Number */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '6px' }}>
                  Bayesian Adjustment Number (m)
                </label>
                <input 
                  type="number" 
                  value={settings.adjustment_number}
                  onChange={(e) => setSettings({ ...settings, adjustment_number: parseInt(e.target.value, 10) || 10 })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                />
                <small style={{ display: 'block', color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.75rem' }}>
                  Controls how many ratings a film needs before its own average outweighs the festival average. Default: 10 (per Kashish Scoring Guide).
                </small>
              </div>

              {/* Voting Window */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '6px' }}>
                  Default Voting Window (Minutes)
                </label>
                <input 
                  type="number" 
                  value={settings.voting_window_minutes}
                  onChange={(e) => setSettings({ ...settings, voting_window_minutes: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                />
                <small style={{ display: 'block', color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.75rem' }}>
                  Time window balloting remains active after end credits roll.
                </small>
              </div>

              <button 
                type="submit" 
                disabled={savingSettings}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#a82f2f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#922828')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#a82f2f')}
              >
                {savingSettings ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SCREENING VENUES                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'venues' && (
        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--fc-text-main)' }}>
            Screening Venues & Auditoriums
          </h2>
          {venues.length === 0 ? (
            <div style={{ color: 'var(--fc-text-muted)' }}>No venues registered.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {venues.map((v) => (
                <div key={v.id} className="fc-venue-card" style={{ border: '1px solid var(--fc-border)', borderRadius: '8px', padding: '16px', background: 'var(--fc-surface)' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--fc-text-main)' }}>{v.name}</div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.85rem', color: 'var(--fc-text-secondary)' }}>
                    <span>Capacity: <strong>{v.capacity}</strong> seats</span>
                    <span><MovieIcon size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Screenings: <strong>{v.total_screenings || 0}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD CUSTOM QUESTION                                              */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT CUSTOM QUESTION                                       */}
      {/* ========================================================================= */}
      {showAddFieldModal && (() => {
        const isEditing = editingFieldIndex !== null && editingFieldIndex >= 0;
        const currentEditingField = isEditing ? formSchema?.fields?.[editingFieldIndex] : null;
        const isEditingName = currentEditingField?.key === 'name';
        const isEditingCore = isEditingName || ['email', 'phone'].includes(currentEditingField?.key);

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', borderRadius: '12px', width: '100%', maxWidth: '520px', padding: '24px', boxShadow: 'var(--shadow-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--fc-text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isEditing ? <><EditIcon size={18} /> Edit Form Question</> : <><AddIcon size={18} /> Add Custom Form Question</>}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFieldModal(false);
                    setEditingFieldIndex(null);
                  }}
                  style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--fc-text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--fc-text-muted)' }}>
                {isEditing
                  ? (isEditingCore ? 'Configure label, helper guidance, and validation for this core identity question.' : 'Update question configuration, input type, options, or validation rules.')
                  : 'Add a new custom question to your attendee registration form.'}
              </p>

              <form onSubmit={handleSaveField}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>
                    Question / Field Label *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. College / Institute Name, Dietary Restrictions"
                    value={newField.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      if (isEditing) {
                        setNewField(prev => ({ ...prev, label }));
                      } else {
                        const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
                        setNewField(prev => ({ ...prev, label, key: prev.key ? prev.key : key }));
                      }
                    }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>
                      Input Type *
                    </label>
                    <select
                      value={newField.type}
                      disabled={isEditingCore}
                      onChange={(e) => setNewField({ ...newField, type: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: isEditingCore ? 'rgba(0,0,0,0.05)' : 'var(--fc-surface)', color: 'var(--fc-text-main)', cursor: isEditingCore ? 'not-allowed' : 'pointer' }}
                    >
                      <option value="text">Single Line Text</option>
                      <option value="email">Email Address</option>
                      <option value="phone">Phone / WhatsApp</option>
                      <option value="textarea">Multi-line Textarea</option>
                      <option value="select">Dropdown Select</option>
                      <option value="radio">Radio Options (Single Choice)</option>
                      <option value="multi_checkbox">Multi Checkboxes</option>
                      <option value="checkbox">Single Agreement Checkbox</option>
                      <option value="date">Date Picker</option>
                      <option value="number">Number</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>
                      Field Key (Slug)
                    </label>
                    <input
                      type="text"
                      disabled={isEditingCore}
                      placeholder="e.g. college_name"
                      value={newField.key}
                      onChange={(e) => setNewField({ ...newField, key: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: isEditingCore ? 'rgba(0,0,0,0.05)' : 'var(--fc-surface)', color: 'var(--fc-text-main)', cursor: isEditingCore ? 'not-allowed' : 'text' }}
                    />
                  </div>
                </div>

                {['select', 'radio', 'multi_checkbox'].includes(newField.type) && (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>
                      Options (comma-separated) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Vegetarian, Non-Vegetarian, Vegan, Jain"
                      value={newField.options}
                      onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                    />
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>
                    Placeholder / Helper Text (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Enter your university registration number"
                    value={newField.placeholder}
                    onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                  />
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isEditingName ? 'not-allowed' : 'pointer', color: 'var(--fc-text-main)' }}>
                    <input
                      type="checkbox"
                      checked={isEditingName ? true : newField.required}
                      disabled={isEditingName}
                      onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                      style={{ width: '16px', height: '16px', cursor: isEditingName ? 'not-allowed' : 'pointer' }}
                    />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {isEditingName ? 'Mark as Mandatory (Required for Primary ID)' : 'Mark as Mandatory / Required question'}
                    </span>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddFieldModal(false);
                      setEditingFieldIndex(null);
                    }}
                    style={{ padding: '8px 16px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '8px 18px', background: '#a82f2f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#922828')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#a82f2f')}
                  >
                    {isEditing ? 'Save Changes' : 'Add Field to Form'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 2: LIVE FORM PREVIEW (DYNAMIC REAL FORM REPLICA)                    */}
      {/* ========================================================================= */}
      {showPreviewModal && formSchema && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPreviewModal(false);
          }}
        >
          <div style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', borderRadius: '16px', width: '100%', maxWidth: '890px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.6)', overflow: 'hidden', border: '1px solid var(--fc-border)', position: 'relative' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <LiveFormPreviewContent
                formSchema={formSchema}
                previewGender={previewGender}
                setPreviewGender={setPreviewGender}
                previewPassType={previewPassType}
                setPreviewPassType={setPreviewPassType}
                previewDays={previewDays}
                setPreviewDays={setPreviewDays}
                previewCommunity={previewCommunity}
                setPreviewCommunity={setPreviewCommunity}
                previewMumbai={previewMumbai}
                setPreviewMumbai={setPreviewMumbai}
                onOpenFaqModal={() => setShowPreviewFaqModal(true)}
                onClose={() => setShowPreviewModal(false)}
                isCompact={false}
                previewDevice="desktop"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2.5: LIVE REAL FESTIVAL FAQ DIALOG PREVIEW                          */}
      {/* ========================================================================= */}
      <DelegateFaqPreviewModal
        open={showPreviewFaqModal}
        onClose={() => setShowPreviewFaqModal(false)}
        formSchema={formSchema}
      />

      {/* ========================================================================= */}
      {/* MODAL 3: ADD CATEGORY                                                     */}
      {/* ========================================================================= */}
      {showCatModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', borderRadius: '12px', width: '90%', maxWidth: '480px', padding: '24px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--fc-text-main)' }}>Add Delegate Category</h3>
            <form onSubmit={handleCreateCategory}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>Category Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. VIP Delegate, Press, Student"
                  value={catForm.name} 
                  onChange={(e) => {
                    const name = e.target.value;
                    const code = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    setCatForm({ ...catForm, name, code: catForm.code ? catForm.code : code, badge_ribbon_text: catForm.badge_ribbon_text ? catForm.badge_ribbon_text : name.toUpperCase() });
                  }}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>Category Code * (Unique slug)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. vip, press, delegate"
                  value={catForm.code} 
                  onChange={(e) => setCatForm({ ...catForm, code: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>Badge Color</label>
                  <input 
                    type="color" 
                    value={catForm.badge_color} 
                    onChange={(e) => setCatForm({ ...catForm, badge_color: e.target.value })}
                    style={{ width: '100%', height: '40px', padding: '2px', border: '1px solid var(--fc-border)', borderRadius: '6px', cursor: 'pointer', background: 'var(--fc-surface)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: 'var(--fc-text-main)' }}>Ribbon Text</label>
                  <input 
                    type="text" 
                    placeholder="DELEGATE"
                    value={catForm.badge_ribbon_text} 
                    onChange={(e) => setCatForm({ ...catForm, badge_ribbon_text: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--fc-border)', borderRadius: '6px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--fc-text-main)' }}>
                  <input 
                    type="checkbox" 
                    checked={catForm.can_vote} 
                    onChange={(e) => setCatForm({ ...catForm, can_vote: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enable Audience Choice Voting for this Category</span>
                </label>
              </div>

              {/* Badge Preview */}
              <div style={{ background: 'var(--fc-surface)', border: '1px solid var(--fc-border)', padding: '12px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginBottom: '6px' }}>LIVE BADGE PREVIEW</div>
                <span style={{ background: catForm.badge_color, color: '#fff', padding: '4px 12px', borderRadius: '4px', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                  {catForm.badge_ribbon_text || 'RIBBON TEXT'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCatModal(false)}
                  style={{ padding: '8px 16px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  style={{ padding: '8px 16px', background: '#a82f2f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#922828')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#a82f2f')}
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL: PUBLIC SELF-REGISTRATION TOGGLE ── */}
      {toggleConfirmModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0, 0, 0, 0.65)', 
            backdropFilter: 'blur(4px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 10000, 
            padding: '16px' 
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !updatingToggle) {
              setToggleConfirmModal(null);
            }
          }}
        >
          <div 
            style={{ 
              background: 'var(--fc-surface-card)', 
              color: 'var(--fc-text-main)', 
              border: '1px solid var(--fc-border)', 
              borderRadius: '16px', 
              width: '100%', 
              maxWidth: '520px', 
              padding: '28px', 
              boxShadow: 'var(--shadow-xl)' 
            }}
          >
            {/* Top Icon & Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div 
                style={{ 
                  width: '54px', 
                  height: '54px', 
                  borderRadius: '50%', 
                  background: toggleConfirmModal.nextValue ? 'rgba(16, 185, 129, 0.12)' : 'rgba(225, 29, 72, 0.12)', 
                  color: toggleConfirmModal.nextValue ? '#10b981' : '#e11d48', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: '0 auto 14px auto' 
                }}
              >
                {toggleConfirmModal.nextValue ? <CheckCircleIcon size={28} /> : <LockIcon size={28} />}
              </div>
              <h3 style={{ fontSize: '1.28rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--fc-text-main)' }}>
                {toggleConfirmModal.nextValue ? 'Enable Public Delegate Registration?' : 'Pause Public Delegate Registration?'}
              </h3>
              <p style={{ fontSize: '0.86rem', color: 'var(--fc-text-muted)', margin: 0, lineHeight: 1.5 }}>
                {toggleConfirmModal.nextValue 
                  ? 'Making delegate registration live will allow attendees to self-register online from the festival website.'
                  : 'Pausing registration will immediately close public access to the online accreditation form.'}
              </p>
            </div>

            {/* Information Breakdown Box */}
            <div 
              style={{ 
                background: 'var(--fc-surface)', 
                border: '1px solid var(--fc-border)', 
                borderRadius: '12px', 
                padding: '16px', 
                marginBottom: '24px', 
                fontSize: '0.84rem', 
                lineHeight: 1.55,
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px' 
              }}
            >
              {toggleConfirmModal.nextValue ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ color: '#10b981', fontSize: '1.1rem', lineHeight: '1rem', marginTop: '2px' }}>●</span>
                    <div>
                      <strong style={{ color: 'var(--fc-text-main)' }}>Public Website Access:</strong>
                      <div style={{ color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                        The registration form will immediately become accessible to visitors on the public festival portal.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ color: '#10b981', fontSize: '1.1rem', lineHeight: '1rem', marginTop: '2px' }}>●</span>
                    <div>
                      <strong style={{ color: 'var(--fc-text-main)' }}>Automatic Pass Issuance:</strong>
                      <div style={{ color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                        Delegates will receive a verified digital Serial Number badge voucher upon successful form submission.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ color: '#10b981', fontSize: '1.1rem', lineHeight: '1rem', marginTop: '2px' }}>●</span>
                    <div>
                      <strong style={{ color: 'var(--fc-text-main)' }}>Active Question Builder Schema:</strong>
                      <div style={{ color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                        All customized questions, pass rules, and FAQ dialogs will be served live to new registrants.
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ color: '#e11d48', fontSize: '1.1rem', lineHeight: '1rem', marginTop: '2px' }}>■</span>
                    <div>
                      <strong style={{ color: 'var(--fc-text-main)' }}>Public Portal Closed:</strong>
                      <div style={{ color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                        Website visitors will see that public registration is closed and cannot submit new forms.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ color: '#10b981', fontSize: '1.1rem', lineHeight: '1rem', marginTop: '2px' }}>✓</span>
                    <div>
                      <strong style={{ color: 'var(--fc-text-main)' }}>Existing Passes Unaffected:</strong>
                      <div style={{ color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                        All previously registered delegates, issued serial vouchers, and badges remain 100% valid.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ color: '#3b82f6', fontSize: '1.1rem', lineHeight: '1rem', marginTop: '2px' }}>●</span>
                    <div>
                      <strong style={{ color: 'var(--fc-text-main)' }}>Onsite Staff Intake Active:</strong>
                      <div style={{ color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                        Authorized festival staff can still register and check in delegates onsite from the <strong>Registration &amp; Passes</strong> desk.
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setToggleConfirmModal(null)}
                disabled={updatingToggle}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--fc-border)',
                  background: 'transparent',
                  color: 'var(--fc-text-main)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: updatingToggle ? 'not-allowed' : 'pointer',
                  opacity: updatingToggle ? 0.6 : 1
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleRegistration}
                disabled={updatingToggle}
                style={{
                  padding: '10px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  background: toggleConfirmModal.nextValue 
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                    : '#a82f2f',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: updatingToggle ? 'not-allowed' : 'pointer',
                  boxShadow: toggleConfirmModal.nextValue 
                    ? '0 4px 14px rgba(16, 185, 129, 0.35)' 
                    : '0 4px 14px rgba(168, 47, 47, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {updatingToggle ? (
                  'Updating Status...'
                ) : toggleConfirmModal.nextValue ? (
                  <><CheckCircleIcon size={16} /> Yes, Enable Public Registration</>
                ) : (
                  <><LockIcon size={16} /> Yes, Pause Public Registration</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
