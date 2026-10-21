/**
 * Media & Thumbnail Utilities
 * Formats relative image paths stored in users/individuals/organizations
 * to absolute CDN/API URLs.
 */

function formatThumbnailUrl(pic) {
  if (!pic) return null;
  let str = Buffer.isBuffer(pic) ? pic.toString('utf8') : String(pic);
  str = str.trim();
  if (!str) return null;
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  str = str.replace(/^\/+/, '');
  return `https://api.autovertest.com/api/v1/non-auth-user/retrieve-media/${str}`;
}

module.exports = { formatThumbnailUrl };
