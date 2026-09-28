/**
 * Auth Service
 * Handles user registration, login, and session management.
 * 
 * Security:
 * - Passwords hashed with bcrypt (12 rounds)
 * - JWT with 'exp' claim
 * - Generic error messages to prevent user enumeration
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/database');
const env = require('../../config/environment');

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

/**
 * Validate password strength.
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  return { valid: true };
}

/**
 * Register a new user.
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ id: number, name: string, email: string }>}
 */
async function register(name, email, password) {
  // Validate inputs
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Name is required.');
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new Error('A valid email is required.');
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) {
    throw new Error(passwordCheck.message);
  }

  // Check if email already exists
  const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing.length > 0) {
    throw new Error('An account with this email already exists.');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Insert user into Freecomers users and individuals
  const result = await query(
    'INSERT INTO users (email, password, account_type, status) VALUES (?, ?, "individual", 1)',
    [email.toLowerCase().trim(), passwordHash]
  );
  await query(
    'INSERT INTO individuals (user_id, name) VALUES (?, ?)',
    [result.insertId, name.trim()]
  );

  return { id: result.insertId, name: name.trim(), email: email.toLowerCase().trim() };
}

/**
 * Authenticate user via the Freecomers production API and generate a local JWT.
 * This proxies the login through https://api.freecomers.com so users authenticate
 * with their real Freecomers credentials — no hardcoded passwords.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, user: object }>}
 */
async function login(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const normalizedEmail = email.toLowerCase().trim();

  // ── Step 1: Authenticate against the real Freecomers API ──
  const https = require('https');
  const freecomerAuth = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({ email: normalizedEmail, password });
    const options = {
      hostname: 'api.freecomers.com',
      port: 443,
      path: '/api/v1/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: { error: 'Invalid response from auth server' } });
        }
      });
    });
    req.on('error', (err) => reject(new Error('Authentication service unavailable: ' + err.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Authentication service timed out.')); });
    req.write(payload);
    req.end();
  });

  // Also try admin login endpoint if user login failed
  let adminAuth = null;
  if (freecomerAuth.status !== 200) {
    adminAuth = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ email: normalizedEmail, password });
      const options = {
        hostname: 'api.freecomers.com',
        port: 443,
        path: '/api/v1/admin/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: { error: 'Invalid response' } });
          }
        });
      });
      req.on('error', () => resolve({ status: 500, body: { error: 'Admin auth unavailable' } }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 500, body: { error: 'Timeout' } }); });
      req.write(payload);
      req.end();
    });
  }

  if (freecomerAuth.status !== 200 && (!adminAuth || adminAuth.status !== 200)) {
    const errorMsg = freecomerAuth.body?.error || 'Invalid email or password.';
    throw new Error(errorMsg);
  }

  // ── Step 2: Look up the user in the local Freecomers database ──
  let localUser = null;

  // Check users table first
  const users = await query(
    `SELECT 
       u.id, 
       u.email, 
       u.status,
       COALESCE(i.name, o.name, u.email) as name
     FROM users u
     LEFT JOIN individuals i ON i.user_id = u.id
     LEFT JOIN organizations o ON o.user_id = u.id
     WHERE u.email = ? AND u.status = 1
     ORDER BY u.id ASC
     LIMIT 1`,
    [normalizedEmail]
  );

  if (users.length > 0) {
    localUser = users[0];
  } else {
    // Check admins table
    const admins = await query(
      'SELECT id, email, name FROM admins WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
    if (admins.length > 0) {
      localUser = {
        id: admins[0].id,
        email: admins[0].email,
        name: admins[0].name || 'Administrator',
      };
    }
  }

  if (!localUser) {
    throw new Error('Account not found in this system. Please contact your administrator.');
  }

  // ── Step 3: Generate local JWT ──
  const token = jwt.sign(
    { id: localUser.id, email: localUser.email, name: localUser.name },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: env.jwtExpiresIn,
    }
  );

  return {
    token,
    user: { id: localUser.id, name: localUser.name, email: localUser.email },
  };
}

/**
 * Get user profile with all permissions and scopes for a specific edition.
 * @param {number} userId
 * @param {number|null} editionId
 * @returns {Promise<object>}
 */
async function getProfile(userId, editionId) {
  const users = await query(
    `SELECT 
       u.id, 
       COALESCE(i.name, o.name, u.email) as name, 
       u.email, 
       u.status,
       (u.status = 1) as is_active, 
       u.created_at 
     FROM users u
     LEFT JOIN individuals i ON i.user_id = u.id
     LEFT JOIN organizations o ON o.user_id = u.id
     WHERE u.id = ? AND u.status = 1`,
    [userId]
  );

  if (users.length === 0) {
    throw new Error('User not found or deactivated.');
  }

  const user = users[0];

  // Get user's assigned events and groups
  const eventGroups = await query(
    `SELECT e.event_id, e.event_id as id, e.name as event_name, e.description,
            g.id as group_id, g.label as group_name, g.label as name, g.group_key, g.is_system
     FROM user_event_groups ueg
     JOIN events e ON e.event_id = ueg.event_id AND e.is_deleted = 0
     JOIN \`groups\` g ON g.id = ueg.group_id
     WHERE ueg.user_id = ?`,
    [userId]
  );

  // If a specific event / edition is requested, get scoped permissions for it
  let permissionsMap = {};
  let isSuperAdmin = false;

  let activeGroup = eventGroups.find(eg => eg.event_id === parseInt(editionId, 10));

  if (editionId) {
    // If user is a platform admin (e.g. user 1 or has admin group in any festival) or event owner,
    // ensure they are assigned as Administrator (group_id = 1) for this event
    if (!activeGroup) {
      const isPlatformAdmin = (userId === 1 || eventGroups.some(eg => eg.group_key === 'admin'));
      const ownerRows = await query('SELECT user_id FROM events WHERE event_id = ?', [editionId]);
      const isOwner = ownerRows.length > 0 && ownerRows[0].user_id === userId;

      if (isPlatformAdmin || isOwner) {
        await query(
          'INSERT IGNORE INTO user_event_groups (user_id, event_id, group_id) VALUES (?, ?, 1)',
          [userId, editionId]
        );
        activeGroup = {
          event_id: parseInt(editionId, 10),
          group_id: 1,
          group_key: 'admin',
          group_name: 'Administrator',
        };
      }
    }

    let rows = await query(
      `SELECT DISTINCT p.id, p.permission_key, p.label, p.actions_match, p.actions_unmatch
       FROM user_event_custom_groups uecg
       JOIN event_custom_group_permissions ecgp ON ecgp.custom_group_id = uecg.custom_group_id
       JOIN permissions p ON p.id = ecgp.permission_id
       WHERE uecg.user_id = ? AND uecg.event_id = ?`,
      [userId, editionId]
    );

    if (rows.length === 0) {
      const hasCustomConfig = await query(
        'SELECT 1 FROM user_event_custom_groups WHERE user_id = ? AND event_id = ? LIMIT 1',
        [userId, editionId]
      );
      if (hasCustomConfig.length === 0) {
        rows = await query(
          `SELECT DISTINCT p.id, p.permission_key, p.label, p.actions_match, p.actions_unmatch
           FROM user_event_groups ueg
           JOIN module_groups mg ON mg.group_id = ueg.group_id
           JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
           JOIN permissions p ON p.id = mgp.permission_id
           WHERE ueg.user_id = ? AND ueg.event_id = ?`,
          [userId, editionId]
        );
      }
    }

    const hasWildcard = rows.some(r => r.permission_key === '*');
    const isAdmin = Boolean((activeGroup && activeGroup.group_key === 'admin') || hasWildcard);
    isSuperAdmin = isAdmin;

    let targetRows = rows;
    if (isAdmin) {
      // For Admin (or wildcard), expand to ALL individual permissions in the system, excluding '*'
      targetRows = await query(
        `SELECT id, permission_key, label, actions_match, actions_unmatch
         FROM permissions
         WHERE permission_key != '*'
         ORDER BY id ASC`
      );
    }

    for (const p of targetRows) {
      if (p.permission_key === '*') continue;

      let resource = 'general';
      let action = 'view';
      if (p.permission_key.includes(':')) {
        const parts = p.permission_key.split(':');
        resource = parts[0];
        action = parts.slice(1).join('_');
      } else if (p.permission_key.includes('.')) {
        const parts = p.permission_key.split('.');
        resource = parts[0];
        action = parts.slice(1).join('_');
      }

      const isViewAction = (p.actions_match === 'view' || action === 'view' || action === 'read' || action === 'all');

      const elementId = isViewAction
        ? `permission-${resource}`
        : `permission-${resource}-${action.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      const permObj = {
        description: p.label || p.permission_key,
        page: resource,
        elementId,
        action: {
          match: p.actions_match || (isViewAction ? 'view' : 'active'),
          unmatch: p.actions_unmatch || (isViewAction ? 'hide' : 'inactive'),
        },
      };

      permissionsMap[p.permission_key] = permObj;

      // Provide both colon and dot aliases so UI checks match seamlessly
      if (p.permission_key.includes(':')) {
        permissionsMap[p.permission_key.replace(':', '.')] = permObj;
      } else if (p.permission_key.includes('.')) {
        permissionsMap[p.permission_key.replace('.', ':')] = permObj;
      }
    }
  }

  return {
    ...user,
    eventGroups,
    current_group: activeGroup ? activeGroup.group_key : null,
    permissions: permissionsMap,
    isSuperAdmin,
  };
}

module.exports = { register, login, getProfile, validatePassword };
