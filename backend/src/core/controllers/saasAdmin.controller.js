/**
 * SaaS Admin Controller (Freecomers_admin)
 * 
 * Provides platform-level administration for Freecomers Super Admin:
 * - List all festivals with SaaS enablement status
 * - Toggle SaaS access (is_saas / saas_enabled)
 * - Fetch full hierarchical architecture tree for a festival edition:
 *     [ Festival Edition ] -> [ Modules ] -> [ Routes & Scoped Permissions ] -> [ Group Access Matrix ]
 * - Toggle module provisioning for an edition (events_modules)
 * - Update Group Access Matrix (module_groups_permissions)
 * - Set seat limits (event_user_limits) and assign primary festival admin
 */

const { query } = require('../../config/database');

/**
 * GET /api/admin/saas/festivals
 * List festivals with SaaS status, edition info, and active module counts.
 */
async function listFestivals(req, res) {
  try {
    const search = req.query.search ? req.query.search.trim() : '';

    let sql = `
      SELECT 
        e.event_id,
        e.name,
        COALESCE(e.edition, 'Edition 4 · 2026') as edition,
        COALESCE(e.slug, CONCAT('fest-', e.event_id)) as slug,
        e.description,
        e.event_type,
        COALESCE(e.is_saas, 0) as is_saas,
        COALESCE(e.saas_enabled, 0) as saas_enabled,
        e.created_at,
        ff.film_festival_id,
        ff.film_festival_logo,
        ff.film_festival_banner,
        COALESCE(i.name, o.name, u.email, 'Freecomers Platform') as owner_name,
        u.email as owner_email,
        (SELECT COUNT(*) FROM events_modules em WHERE em.event_id = e.event_id) as active_modules_count,
        (SELECT eul.max_users FROM event_user_limits eul WHERE eul.event_id = e.event_id LIMIT 1) as max_users
      FROM events e
      LEFT JOIN film_festivals ff ON ff.event_id = e.event_id
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE e.is_deleted = 0
    `;
    const params = [];

    if (search) {
      sql += ` AND (e.name LIKE ? OR e.slug LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
      sql += ` ORDER BY (e.saas_enabled = 1 OR e.is_saas = 1) DESC, e.name ASC LIMIT 50`;
    } else {
      // By default: ONLY show enabled festivals
      sql += ` AND (e.saas_enabled = 1 OR e.is_saas = 1) ORDER BY e.name ASC`;
    }

    const festivals = await query(sql, params);

    res.json({
      success: true,
      count: festivals.length,
      festivals: festivals.map(f => ({
        ...f,
        is_saas: Boolean(f.is_saas || f.saas_enabled),
        saas_enabled: Boolean(f.saas_enabled || f.is_saas),
        max_users: f.max_users || 25,
        active_modules_count: Number(f.active_modules_count || 0)
      }))
    });
  } catch (error) {
    console.error('[SaaSAdmin] listFestivals error:', error);
    res.status(500).json({ error: 'Failed to retrieve festivals.' });
  }
}

/**
 * PUT /api/admin/saas/festivals/:eventId/toggle-saas
 * Enable or disable SaaS for a festival.
 */
async function toggleFestivalSaaS(req, res) {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    const { isEnabled } = req.body;

    const saasVal = isEnabled ? 1 : 0;
    await query(`
      UPDATE events 
      SET is_saas = ?, saas_enabled = ?
      WHERE event_id = ?
    `, [saasVal, saasVal, eventId]);

    // When enabling SaaS, ensure core modules are provisioned for this festival
    if (isEnabled) {
      const coreModules = await query("SELECT id FROM modules WHERE type = 'core'");
      for (const mod of coreModules) {
        await query('INSERT IGNORE INTO events_modules (event_id, module_id) VALUES (?, ?)', [eventId, mod.id]);
      }
    }

    res.json({
      success: true,
      message: `Festival SaaS ${isEnabled ? 'enabled' : 'disabled'} successfully.`,
      eventId,
      isEnabled: Boolean(isEnabled)
    });
  } catch (error) {
    console.error('[SaaSAdmin] toggleFestivalSaaS error:', error);
    res.status(500).json({ error: 'Failed to update festival SaaS status.' });
  }
}

/**
 * GET /api/admin/saas/festivals/:eventId/architecture
 * Retrieve full hierarchical tree:
 * [ Festival Edition ] -> [ Modules ] -> [ Routes & Scoped Permissions ] -> [ Group Access Matrix ]
 */
async function getFestivalArchitecture(req, res) {
  try {
    const eventId = parseInt(req.params.eventId, 10);

    // 1. Fetch Festival Edition details
    const events = await query(`
      SELECT 
        e.event_id, 
        e.name, 
        COALESCE(e.edition, 'Edition 4 · 2026') as edition,
        COALESCE(e.slug, CONCAT('fest-', e.event_id)) as slug,
        COALESCE(e.is_saas, 0) as is_saas,
        COALESCE(e.saas_enabled, 0) as saas_enabled
      FROM events e 
      WHERE e.event_id = ?
    `, [eventId]);

    if (events.length === 0) {
      return res.status(404).json({ error: 'Festival event not found.' });
    }

    const event = events[0];

    // Seat limits
    const limitRows = await query('SELECT max_users FROM event_user_limits WHERE event_id = ? LIMIT 1', [eventId]);
    const maxUsers = limitRows.length > 0 ? limitRows[0].max_users : 25;

    // 2. Fetch canonical active groups (Admin, Jury, Volunteer)
    const rawGroups = await query('SELECT id, group_key, label, description FROM `groups` ORDER BY id ASC');
    const standardKeysOrder = ['admin', 'jury', 'volunteer'];
    const groups = [];
    
    // Sort / normalize groups to match canonical 3-role architecture
    for (const key of standardKeysOrder) {
      const g = rawGroups.find(r => r.group_key === key || (key === 'jury' && r.group_key === 'judge'));
      if (g) {
        groups.push({
          id: g.id,
          key: g.group_key === 'judge' ? 'jury' : g.group_key,
          label: g.group_key === 'admin' ? 'Admin' :
                 (g.group_key === 'jury' || g.group_key === 'judge') ? 'Jury' :
                 g.group_key === 'volunteer' ? 'Volunteer' : g.label
        });
      }
    }

    // 3. Fetch all modules and active status in events_modules
    const allModules = await query(`
      SELECT 
        m.id, 
        m.module_key, 
        m.type, 
        m.label, 
        m.description, 
        m.route, 
        m.icon, 
        m.display_order,
        CASE WHEN em.id IS NOT NULL THEN 1 ELSE 0 END as is_enabled
      FROM modules m
      LEFT JOIN events_modules em ON em.module_id = m.id AND em.event_id = ?
      ORDER BY m.display_order ASC, m.id ASC
    `, [eventId]);

    // 4. Fetch all pages/routes with labels
    const allPages = await query('SELECT id, module_id, page_key, COALESCE(label, page_key) as label, route FROM pages ORDER BY display_order ASC, id ASC');
    const pagesByModule = {};
    const detailedPagesByModule = {};
    for (const p of allPages) {
      if (!pagesByModule[p.module_id]) pagesByModule[p.module_id] = [];
      if (!detailedPagesByModule[p.module_id]) detailedPagesByModule[p.module_id] = [];
      pagesByModule[p.module_id].push(p.route);
      detailedPagesByModule[p.module_id].push({
        id: p.id,
        pageKey: p.page_key,
        label: p.label,
        route: p.route
      });
    }

    // 5. Fetch all permissions scoped to modules
    const allPermissions = await query(`
      SELECT id, permission_key, label, description, module_id 
      FROM permissions 
      ORDER BY id ASC
    `);
    const permsByModule = {};
    for (const p of allPermissions) {
      const mId = p.module_id || 0;
      if (!permsByModule[mId]) permsByModule[mId] = [];
      const shortKey = p.permission_key.includes(':') ? p.permission_key.split(':')[1] : 
                       p.permission_key.includes('.') ? p.permission_key.split('.')[1] : p.permission_key;
      permsByModule[mId].push({
        id: p.id,
        key: p.permission_key,
        short_key: shortKey,
        shortKey: shortKey,
        fullKey: p.permission_key,
        label: p.label || shortKey
      });
    }

    // 6. Fetch Group Access Matrix (module_groups_permissions)
    const mgpRows = await query(`
      SELECT 
        mg.module_id, 
        mg.group_id, 
        g.group_key, 
        p.id as permission_id, 
        p.permission_key
      FROM module_groups mg
      JOIN \`groups\` g ON g.id = mg.group_id
      JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
      JOIN permissions p ON p.id = mgp.permission_id
    `);

    const matrixLookup = {};
    for (const row of mgpRows) {
      const key = `${row.module_id}_${row.group_key}`;
      if (!matrixLookup[key]) matrixLookup[key] = new Set();
      const shortKey = row.permission_key.includes(':') ? row.permission_key.split(':')[1] : 
                       row.permission_key.includes('.') ? row.permission_key.split('.')[1] : row.permission_key;
      matrixLookup[key].add(row.permission_key);
      matrixLookup[key].add(shortKey);
    }

    // Assemble the complete tree
    const moduleTree = allModules.map(m => {
      const routes = pagesByModule[m.id] || [m.route];
      const pages = detailedPagesByModule[m.id] || routes.map(r => ({ label: r, route: r }));
      const scopedPerms = permsByModule[m.id] || [];

      // Group Access Matrix for this module
      const groupAccessMatrix = {};
      for (const grp of groups) {
        // Administrator always has full access or whatever is mapped
        const enabledKeys = matrixLookup[`${m.id}_${grp.key}`] || new Set();
        groupAccessMatrix[grp.key] = Array.from(enabledKeys);
      }

      // If Administrator has no explicit entries, grant all scoped permissions by default
      if (groupAccessMatrix['admin'] && groupAccessMatrix['admin'].length === 0 && scopedPerms.length > 0) {
        groupAccessMatrix['admin'] = scopedPerms.map(p => p.key);
      }

      return {
        id: m.id,
        moduleKey: m.module_key,
        label: m.label,
        type: m.type, // 'core' | 'addon' | 'custom'
        description: m.description,
        route: m.route,
        icon: m.icon,
        isEnabled: Boolean(m.is_enabled),
        routes,
        pages,
        scopedPermissions: scopedPerms,
        groupAccessMatrix
      };
    });

    res.json({
      success: true,
      edition: {
        eventId: event.event_id,
        name: event.name,
        edition: event.edition,
        slug: event.slug,
        isSaaS: Boolean(event.is_saas),
        saasEnabled: Boolean(event.saas_enabled),
        maxUsers,
        portalUrl: `https://access.saas.autovertest.com/?eventId=${event.event_id}`
      },
      groups,
      modules: moduleTree
    });
  } catch (error) {
    console.error('[SaaSAdmin] getFestivalArchitecture error:', error);
    res.status(500).json({ error: 'Failed to retrieve festival architecture.' });
  }
}

/**
 * POST /api/admin/saas/festivals/:eventId/modules/:moduleId/toggle
 * Enable or disable a module for a festival edition.
 */
async function toggleFestivalModule(req, res) {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    const moduleId = parseInt(req.params.moduleId, 10);
    const { isEnabled } = req.body;

    if (isEnabled) {
      await query('INSERT IGNORE INTO events_modules (event_id, module_id) VALUES (?, ?)', [eventId, moduleId]);
    } else {
      await query('DELETE FROM events_modules WHERE event_id = ? AND module_id = ?', [eventId, moduleId]);
    }

    res.json({
      success: true,
      message: `Module ${isEnabled ? 'enabled' : 'disabled'} for festival edition.`,
      eventId,
      moduleId,
      isEnabled: Boolean(isEnabled)
    });
  } catch (error) {
    console.error('[SaaSAdmin] toggleFestivalModule error:', error);
    res.status(500).json({ error: 'Failed to toggle festival module.' });
  }
}

/**
 * PUT /api/admin/saas/festivals/:eventId/modules/:moduleId/matrix
 * Update Group Access Matrix permissions for a group on a module.
 */
async function updateGroupPermissionMatrix(req, res) {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    const moduleId = parseInt(req.params.moduleId, 10);
    const { groupKey, permissionShortKeys } = req.body;

    // Find group
    const groups = await query('SELECT id FROM `groups` WHERE group_key = ? LIMIT 1', [groupKey]);
    if (groups.length === 0) return res.status(404).json({ error: 'Group not found.' });
    const groupId = groups[0].id;

    // Find or create module_group
    let mgRows = await query('SELECT id FROM module_groups WHERE group_id = ? AND module_id = ? LIMIT 1', [groupId, moduleId]);
    let mgId;
    if (mgRows.length === 0) {
      const res = await query('INSERT INTO module_groups (group_id, module_id, name) VALUES (?, ?, ?)', [groupId, moduleId, `${groupKey} - module ${moduleId}`]);
      mgId = res.insertId;
    } else {
      mgId = mgRows[0].id;
    }

    // Find permission IDs for this module matching the short keys
    const allPerms = await query('SELECT id, permission_key FROM permissions WHERE module_id = ?', [moduleId]);
    const targetPermIds = [];

    for (const p of allPerms) {
      const shortKey = p.permission_key.includes(':') ? p.permission_key.split(':')[1] : 
                       p.permission_key.includes('.') ? p.permission_key.split('.')[1] : p.permission_key;
      if (permissionShortKeys.includes(shortKey) || permissionShortKeys.includes(p.permission_key)) {
        targetPermIds.push(p.id);
      }
    }

    // Clear existing permissions for this module_group and insert target ones
    await query('DELETE FROM module_groups_permissions WHERE module_group_id = ?', [mgId]);

    for (const permId of targetPermIds) {
      await query('INSERT INTO module_groups_permissions (module_group_id, permission_id) VALUES (?, ?)', [mgId, permId]);
    }

    res.json({
      success: true,
      message: 'Group access matrix updated successfully.',
      moduleId,
      groupKey,
      grantedPermissionsCount: targetPermIds.length
    });
  } catch (error) {
    console.error('[SaaSAdmin] updateGroupPermissionMatrix error:', error);
    res.status(500).json({ error: 'Failed to update group access matrix.' });
  }
}

/**
 * PUT /api/admin/saas/festivals/:eventId/settings
 * Update seat allocation limits (max_users).
 */
async function updateFestivalSettings(req, res) {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    const { maxUsers, edition } = req.body;

    if (maxUsers) {
      const mgRows = await query('SELECT id FROM module_groups LIMIT 1');
      const mgId = mgRows.length > 0 ? mgRows[0].id : 1;
      await query(`
        INSERT INTO event_user_limits (event_id, module_group_id, max_users)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE max_users = VALUES(max_users)
      `, [eventId, mgId, parseInt(maxUsers, 10)]);
    }

    if (edition) {
      await query('UPDATE events SET edition = ? WHERE event_id = ?', [edition.trim(), eventId]);
    }

    res.json({
      success: true,
      message: 'Festival settings updated successfully.',
      eventId,
      maxUsers,
      edition
    });
  } catch (error) {
    console.error('[SaaSAdmin] updateFestivalSettings error:', error);
    res.status(500).json({ error: 'Failed to update festival settings.' });
  }
}

module.exports = {
  listFestivals,
  toggleFestivalSaaS,
  getFestivalArchitecture,
  toggleFestivalModule,
  updateGroupPermissionMatrix,
  updateFestivalSettings,
};
