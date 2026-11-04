/**
 * Media & Thumbnail Utilities
 * Turns relative image paths stored in users / individuals / organizations / film_festivals into
 * absolute URLs served by the Freecomers API of the CURRENT environment (env.freecomersApiUrl),
 * so production never points at the dev API and vice versa.
 */

const env = require('../../config/environment');

function toMediaUrl(path) {
  if (!path) return null;
  let str = Buffer.isBuffer(path) ? path.toString('utf8') : String(path);
  str = str.trim();
  if (!str) return null;
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  str = str.replace(/^\/+/, '');
  return `${env.freecomersApiUrl}/api/v1/non-auth-user/retrieve-media/${str}`;
}

// User / organisation thumbnails (stored as e.g. "images/users/thumb_users_x.webp")
const formatThumbnailUrl = toMediaUrl;

// Film festival banner / logo (stored as a bare file name in film_festivals.*_image_name)
function festivalImageUrl(fileName) {
  if (!fileName) return null;
  const str = String(fileName).trim();
  if (!str) return null;
  if (str.includes('/')) return toMediaUrl(str);
  return toMediaUrl(`images/film-festivals/${str}`);
}

module.exports = { formatThumbnailUrl, toMediaUrl, festivalImageUrl };
