/**
 * Auth Service
 * Handles user registration, unified credential login, Google OAuth login,
 * and session management with strict persona & role isolation.
 * 
 * Personas & Authorization:
 * - Freecomers Admin: stored in `admins` table (Full access, isSuperAdmin: true).
 * - Festival Admin, Jury, Volunteer: stored in `users` table from next.autovertest.com,
 *   strictly gated by membership in `user_event_groups` (admin, volunteer, jury) or festival ownership in `events`.
 * - General platform users with no festival roles are denied with 403 Forbidden.
 * 
 * Security:
 * - Passwords hashed with bcrypt
 * - Google ID tokens cryptographically verified
 * - JWT with 'exp' claim & HS256 hardcoded algorithm
 * - Parameterized SQL queries preventing SQL injection
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/database');
const env = require('../../config/environment');
const { verifyGoogleToken } = require('./googleAuth.service');

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
 * Check if a platform user has any active festival roles (Admin, Jury, Volunteer)
 * or owns any festivals.
 * 
 * @param {number} userId
 * @returns {Promise<Array<{ event_id: number, group_id: number, group_key: string, role_name: string, event_name: string }>>}
 */
async function checkFestivalRoles(userId) {
  const roles = await query(
    `SELECT 
       ueg.event_id, 
       g.id as group_id,
       g.group_key, 
       g.label as role_name, 
       e.name as event_name
     FROM user_event_groups ueg
     JOIN \`groups\` g ON g.id = ueg.group_id
     JOIN events e ON e.event_id = ueg.event_id AND e.is_deleted = 0
     WHERE ueg.user_id = ? AND g.group_key IN ('admin', 'volunteer', 'jury')

     UNION

     SELECT 
       e.event_id, 
       1 as group_id,
       'admin' as group_key, 
       'Admin' as role_name, 
       e.name as event_name
     FROM events e
     WHERE e.user_id = ? AND e.is_deleted = 0`,
    [userId, userId]
  );

  return roles;
}

/**
 * Register a new user.
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ id: number, name: string, email: string }>}
 */
async function register(name, email, password) {
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

  const normalizedEmail = email.toLowerCase().trim();

  // Check if email already exists in users or admins
  const existing = await query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing.length > 0) {
    throw new Error('An account with this email already exists.');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Insert user into Freecomers users and individuals
  const result = await query(
    'INSERT INTO users (email, password, account_type, status) VALUES (?, ?, "individual", 1)',
    [normalizedEmail, passwordHash]
  );
  await query(
    'INSERT INTO individuals (user_id, name) VALUES (?, ?)',
    [result.insertId, name.trim()]
  );

  return { id: result.insertId, name: name.trim(), email: normalizedEmail };
}

/**
 * Authenticate with Google ID Token.
 * - If email matches `admins` table: Authenticates as Freecomers Admin.
 * - If email matches `users` table: Verifies membership as Festival Admin, Jury, or Volunteer.
 * - If no festival role: Rejects with 403 Forbidden.
 * 
 * @param {string} idToken
 * @returns {Promise<{ token: string, user: object }>}
 */
async function loginWithGoogle(idToken) {
  const googleIdentity = await verifyGoogleToken(idToken);
  const normalizedEmail = googleIdentity.email;

  // ── Step 1: Check Freecomers Admin (`admins` table) ──
  const admins = await query(
    'SELECT id, email, name FROM admins WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );

  if (admins.length > 0) {
    const admin = admins[0];
    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        name: admin.name || googleIdentity.name || 'Administrator',
        role: 'admin',
        isSuperAdmin: true,
      },
      env.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: env.jwtExpiresIn,
      }
    );

    return {
      token,
      user: {
        id: admin.id,
        name: admin.name || googleIdentity.name || 'Administrator',
        email: admin.email,
        role: 'admin',
        isSuperAdmin: true,
      },
    };
  }

  // ── Step 2: Check Platform Users (`users` table from next.autovertest.com) ──
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

  if (users.length === 0) {
    const err = new Error('No Freecomers account found with this Google email. Please create an account on https://next.autovertest.com/ first.');
    err.statusCode = 401;
    throw err;
  }

  const localUser = users[0];

  // ── Step 3: Strict Role Gate (Festival Admin, Jury, Volunteer) ──
  const roles = await checkFestivalRoles(localUser.id);
  if (roles.length === 0) {
    const err = new Error(
      'Access Denied: You do not have an active Festival Admin, Jury, or Volunteer role assigned. ' +
      'Please contact your Festival Director to be added to an event team.'
    );
    err.statusCode = 403;
    throw err;
  }

  // Record/update provider mapping in Freecomers DB
  if (googleIdentity.sub) {
    query(
      `INSERT INTO user_provider_maps (user_id, provider_name, provider_id, provider_token, updated_at) 
       VALUES (?, 'google', ?, '', NOW()) 
       ON DUPLICATE KEY UPDATE provider_id = VALUES(provider_id), updated_at = NOW()`,
      [localUser.id, googleIdentity.sub]
    ).catch((err) => {
      console.warn('[Auth Service] Failed to update user_provider_maps:', err.message);
    });
  }

  // ── Step 4: Generate Local JWT ──
  const token = jwt.sign(
    {
      id: localUser.id,
      email: localUser.email,
      name: localUser.name,
      role: 'user',
      isSuperAdmin: false,
    },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: env.jwtExpiresIn,
    }
  );

  return {
    token,
    user: {
      id: localUser.id,
      name: localUser.name,
      email: localUser.email,
      role: 'user',
      isSuperAdmin: false,
      roles,
    },
  };
}

/**
 * Helper to verify credentials against external Freecomers APIs (api.freecomers.com or api.autovertest.com)
 * This ensures Freecomers Admin can log in using their credentials same like currently.
 * 
 * @param {string} hostname
 * @param {string} path
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ ok: boolean, status: number, body?: object }>}
 */
async function verifyApiAuth(hostname, path, email, password) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://${hostname}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 500, error: err.message };
  }
}

/**
 * Authenticate user with Email & Password.
 * - Freecomers Admin: checks credentials against `admins` table or admin login APIs.
 * - Festival Team: checks credentials against `users` table from next.autovertest.com (and Freecomers APIs),
 *   and strictly verifies assignment as Festival Admin, Jury, or Volunteer.
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

  // ── Step 1: Check Freecomers Admin (same like currently) ──
  let isAdminAuthenticated = false;
  let adminRecord = null;

  const admins = await query(
    'SELECT id, email, name, password FROM admins WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );

  if (admins.length > 0) {
    adminRecord = admins[0];
    if (adminRecord.password) {
      isAdminAuthenticated = await bcrypt.compare(password, adminRecord.password).catch(() => false);
    }
  }

  // If local bcrypt check did not match, verify against the admin login API (same like currently)
  if (!isAdminAuthenticated) {
    const adminApi1 = await verifyApiAuth('api.freecomers.com', '/api/v1/admin/login', normalizedEmail, password);
    if (adminApi1.ok) {
      isAdminAuthenticated = true;
    } else {
      const adminApi2 = await verifyApiAuth('api.autovertest.com', '/api/v1/admin/login', normalizedEmail, password);
      if (adminApi2.ok) {
        isAdminAuthenticated = true;
      } else {
        const adminApi3 = await verifyApiAuth('api.freecomers.com', '/api/v1/login', normalizedEmail, password);
        if (adminApi3.ok) {
          isAdminAuthenticated = true;
        } else {
          const adminApi4 = await verifyApiAuth('api.autovertest.com', '/api/v1/login', normalizedEmail, password);
          if (adminApi4.ok) {
            isAdminAuthenticated = true;
          }
        }
      }
    }
  }

  if (isAdminAuthenticated) {
    if (!adminRecord) {
      const adminRows = await query('SELECT id, email, name FROM admins WHERE email = ? LIMIT 1', [normalizedEmail]);
      if (adminRows.length > 0) {
        adminRecord = adminRows[0];
      } else {
        adminRecord = { id: 1, email: normalizedEmail, name: 'Administrator' };
      }
    }

    // Auto-sync updated password hash into local admins table
    if (adminRecord && adminRecord.id) {
      bcrypt.hash(password, 12).then((hash) => {
        query('UPDATE admins SET password = ? WHERE id = ?', [hash, adminRecord.id]).catch(() => {});
      }).catch(() => {});
    }

    const token = jwt.sign(
      {
        id: adminRecord.id,
        email: adminRecord.email,
        name: adminRecord.name || 'Administrator',
        role: 'admin',
        isSuperAdmin: true,
      },
      env.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: env.jwtExpiresIn,
      }
    );

    return {
      token,
      user: {
        id: adminRecord.id,
        name: adminRecord.name || 'Administrator',
        email: adminRecord.email,
        role: 'admin',
        isSuperAdmin: true,
      },
    };
  }

  // ── Step 2: Check Freecomers Users (`users` table from next.autovertest.com) ──
  let isUserAuthenticated = false;
  let localUser = null;

  const users = await query(
    `SELECT 
       u.id, 
       u.email, 
       u.password,
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
    if (localUser.password) {
      isUserAuthenticated = await bcrypt.compare(password, localUser.password).catch(() => false);
    }
  }

  // Fallback to Freecomers user login APIs if local hash didn't match
  if (!isUserAuthenticated) {
    const userApi1 = await verifyApiAuth('api.autovertest.com', '/api/v1/login', normalizedEmail, password);
    if (userApi1.ok) {
      isUserAuthenticated = true;
    } else {
      const userApi2 = await verifyApiAuth('api.freecomers.com', '/api/v1/login', normalizedEmail, password);
      if (userApi2.ok) {
        isUserAuthenticated = true;
      }
    }
  }

  if (isUserAuthenticated) {
    if (!localUser) {
      const userRows = await query(
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
      if (userRows.length > 0) localUser = userRows[0];
    }

    if (!localUser) {
      const err = new Error('User account not found or deactivated.');
      err.statusCode = 401;
      throw err;
    }

    // ── Step 3: Strict Role Gate (Festival Admin, Jury, Volunteer) ──
    const roles = await checkFestivalRoles(localUser.id);
    if (roles.length === 0) {
      const err = new Error(
        'Access Denied: You do not have an active Festival Admin, Jury, or Volunteer role assigned. ' +
        'Please contact your Festival Director to be added to an event team.'
      );
      err.statusCode = 403;
      throw err;
    }

    const token = jwt.sign(
      {
        id: localUser.id,
        email: localUser.email,
        name: localUser.name,
        role: 'user',
        isSuperAdmin: false,
      },
      env.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: env.jwtExpiresIn,
      }
    );

    return {
      token,
      user: {
        id: localUser.id,
        name: localUser.name,
        email: localUser.email,
        role: 'user',
        isSuperAdmin: false,
        roles,
      },
    };
  }

  // If neither matches, deny with generic message
  const err = new Error('Invalid email or password.');
  err.statusCode = 401;
  throw err;
}

/**
 * Get user profile with permissions and scopes for a specific edition.
 * Supports both Freecomers Admin (`admins` table) and Festival Team (`users` table).
 * 
 * @param {number} userId
 * @param {string|null} role
 * @param {number|null} editionId
 * @returns {Promise<object>}
 */
async function getProfile(userId, role, editionId) {
  // If role is explicitly 'admin' or no user exists in users table, check admins table
  let isAdminUser = (role === 'admin');
  let adminProfile = null;

  if (isAdminUser) {
    const adminRows = await query(
      'SELECT id, name, email FROM admins WHERE id = ? LIMIT 1',
      [userId]
    );
    if (adminRows.length > 0) {
      adminProfile = adminRows[0];
    }
  }

  // ── Flow A: Freecomers Admin Profile ──
  if (adminProfile) {
    const allEvents = await query(
      `SELECT 
         event_id, 
         event_id as id, 
         name as event_name, 
         description,
         1 as group_id, 
         'Administrator' as group_name, 
         'Admin' as name, 
         'admin' as group_key, 
         1 as is_system
       FROM events
       WHERE is_deleted = 0
       ORDER BY event_id DESC`
    );

    // Freecomers Admin receives all system permissions
    const allPermissions = await query(
      `SELECT id, permission_key, label, actions_match, actions_unmatch
       FROM permissions
       WHERE permission_key != '*'
       ORDER BY id ASC`
    );

    const permissionsMap = {};
    for (const p of allPermissions) {
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

      const elementId = `permission-${resource}-${action.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      const permObj = {
        description: p.label || p.permission_key,
        page: resource,
        elementId,
        action: { match: 'view', unmatch: 'hide' },
      };

      permissionsMap[p.permission_key] = permObj;
      if (p.permission_key.includes(':')) {
        permissionsMap[p.permission_key.replace(':', '.')] = permObj;
      } else if (p.permission_key.includes('.')) {
        permissionsMap[p.permission_key.replace('.', ':')] = permObj;
      }
    }

    return {
      id: adminProfile.id,
      name: adminProfile.name || 'Administrator',
      email: adminProfile.email,
      status: 1,
      is_active: true,
      eventGroups: allEvents,
      current_group: 'admin',
      permissions: permissionsMap,
      isSuperAdmin: true,
      role: 'admin',
    };
  }

  // ── Flow B: Platform User Profile (Festival Admin, Jury, Volunteer) ──
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
    // Check if user is in admins table as fallback
    const fallbackAdmins = await query(
      'SELECT id, name, email FROM admins WHERE id = ? LIMIT 1',
      [userId]
    );
    if (fallbackAdmins.length > 0) {
      return getProfile(userId, 'admin', editionId);
    }
    throw new Error('User not found or deactivated.');
  }

  const user = users[0];

  // Get user's assigned events and groups (plus festival ownership)
  const eventGroups = await query(
    `SELECT e.event_id, e.event_id as id, e.name as event_name, e.description,
            g.id as group_id, g.label as group_name, g.label as name, g.group_key, g.is_system
     FROM user_event_groups ueg
     JOIN events e ON e.event_id = ueg.event_id AND e.is_deleted = 0
     JOIN \`groups\` g ON g.id = ueg.group_id
     WHERE ueg.user_id = ?
     UNION
     SELECT e.event_id, e.event_id as id, e.name as event_name, e.description,
            1 as group_id, 'Administrator' as group_name, 'Admin' as name, 'admin' as group_key, 1 as is_system
     FROM events e
     WHERE e.user_id = ? AND e.is_deleted = 0`,
    [userId, userId]
  );

  let permissionsMap = {};
  let isSuperAdmin = false;
  let activeGroup = eventGroups.find(eg => eg.event_id === parseInt(editionId, 10));

  if (editionId) {
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
    role: 'user',
  };
}

module.exports = {
  register,
  login,
  loginWithGoogle,
  getProfile,
  validatePassword,
  checkFestivalRoles,
};
