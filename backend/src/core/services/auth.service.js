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

  // Insert user
  const result = await query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [name.trim(), email.toLowerCase().trim(), passwordHash]
  );

  return { id: result.insertId, name: name.trim(), email: email.toLowerCase().trim() };
}

/**
 * Authenticate user and generate JWT.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, user: object }>}
 */
async function login(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  // Find user — generic error message to prevent user enumeration
  const users = await query(
    'SELECT id, name, email, password_hash, is_active FROM users WHERE email = ?',
    [email.toLowerCase().trim()]
  );

  if (users.length === 0) {
    throw new Error('Invalid email or password.');
  }

  const user = users[0];

  if (!user.is_active) {
    throw new Error('Account is deactivated. Please contact an administrator.');
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid email or password.');
  }

  // Generate JWT with exp claim
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: env.jwtExpiresIn,
    }
  );

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email },
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
    'SELECT id, name, email, is_active, created_at FROM users WHERE id = ? AND is_active = TRUE',
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

  const activeGroup = eventGroups.find(eg => eg.event_id === parseInt(editionId, 10));

  if (editionId) {
    const rows = await query(
      `SELECT DISTINCT p.id, p.permission_key, p.label, p.actions_match, p.actions_unmatch
       FROM user_event_groups ueg
       JOIN module_groups mg ON mg.group_id = ueg.group_id
       JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
       JOIN permissions p ON p.id = mgp.permission_id
       WHERE ueg.user_id = ? AND ueg.event_id = ?
       UNION
       SELECT DISTINCT p.id, p.permission_key, p.label, p.actions_match, p.actions_unmatch
       FROM user_event_custom_groups uecg
       JOIN event_custom_group_permissions ecgp ON ecgp.custom_group_id = uecg.custom_group_id
       JOIN permissions p ON p.id = ecgp.permission_id
       WHERE uecg.user_id = ? AND uecg.event_id = ?`,
      [userId, editionId, userId, editionId]
    );

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

      permissionsMap[p.permission_key] = {
        description: p.label || p.permission_key,
        page: resource,
        elementId,
        action: {
          match: p.actions_match || (isViewAction ? 'view' : 'active'),
          unmatch: p.actions_unmatch || (isViewAction ? 'hide' : 'inactive'),
        },
      };
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
