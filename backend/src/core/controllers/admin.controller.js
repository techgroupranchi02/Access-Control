/**
 * Admin Controller
 * Handles role management, user role assignment, and festival config.
 */

const permissionService = require('../services/permission.service');
const festivalService = require('../services/festival.service');
const { query } = require('../../config/database');

// ── Roles ────────────────────────────────────────────────────────────

async function listRoles(req, res) {
  try {
    const roles = await permissionService.getAllRoles();
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch roles.' });
  }
}

async function createRole(req, res) {
  try {
    const { name, slug, description, permissionIds } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required.' });
    }
    const role = await permissionService.createRole(name, slug, description, permissionIds || []);
    res.status(201).json(role);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function updateRolePermissions(req, res) {
  try {
    const roleId = parseInt(req.params.id, 10);
    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({ error: 'permissionIds array is required.' });
    }
    await permissionService.updateRolePermissions(roleId, permissionIds);
    const role = await permissionService.getRoleById(roleId);
    res.json(role);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// ── Permissions ──────────────────────────────────────────────────────

async function listPermissions(req, res) {
  try {
    const permissions = await permissionService.getAllPermissions();
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch permissions.' });
  }
}

async function listPermissionGroups(req, res) {
  try {
    const groups = await permissionService.getAllPermissionGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch permission groups.' });
  }
}

// ── Users ────────────────────────────────────────────────────────────

async function listUsers(req, res) {
  try {
    const users = await permissionService.getAllUsersWithRoles();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
}

async function assignUserRole(req, res) {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { festivalId, roleId } = req.body;
    if (!festivalId || !roleId) {
      return res.status(400).json({ error: 'festivalId and roleId are required.' });
    }
    await permissionService.assignUserRole(userId, festivalId, roleId);
    res.json({ message: 'Role assigned successfully.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function removeUserRole(req, res) {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { festivalId, roleId } = req.body;
    if (!festivalId || !roleId) {
      return res.status(400).json({ error: 'festivalId and roleId are required.' });
    }
    await permissionService.removeUserRole(userId, festivalId, roleId);
    res.json({ message: 'Role removed successfully.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// ── Festivals (Admin) ────────────────────────────────────────────────

async function listAllFestivals(req, res) {
  try {
    const festivals = await query('SELECT * FROM events ORDER BY name');
    res.json(festivals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events.' });
  }
}

async function listFeatures(req, res) {
  try {
    const features = await query('SELECT * FROM modules ORDER BY display_order, name');
    res.json(features);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch modules.' });
  }
}

module.exports = {
  listRoles,
  createRole,
  updateRolePermissions,
  listPermissions,
  listPermissionGroups,
  listUsers,
  assignUserRole,
  removeUserRole,
  listAllFestivals,
  listFeatures,
};
