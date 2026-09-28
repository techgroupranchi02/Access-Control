const { query } = require('../config/database');

async function fixGroupsAndPerms() {
  console.log('Fixing user group assignments and permissions...');

  // Ensure groups table has clean keys
  // 1: admin, 2: volunteer, 4: jury_member / judge
  // Let's ensure group 4 has label 'Judge' and group_key 'judge' or 'jury_member'
  await query("UPDATE `groups` SET group_key = 'judge', label = 'Judge' WHERE id = 4");
  await query("UPDATE `groups` SET group_key = 'volunteer', label = 'Volunteer' WHERE id = 2");
  await query("UPDATE `groups` SET group_key = 'admin', label = 'Admin' WHERE id = 1");

  // Re-assign users to proper group_id in user_event_groups for event 1
  const admins = [1, 2, 3, 7];
  const judges = [8, 9, 12];
  const volunteers = [4, 5, 6, 10, 11, 13, 14, 15, 16];

  for (const uid of admins) {
    await query('REPLACE INTO user_event_groups (user_id, event_id, group_id) VALUES (?, 1, 1)', [uid]);
  }
  for (const uid of judges) {
    await query('REPLACE INTO user_event_groups (user_id, event_id, group_id) VALUES (?, 1, 4)', [uid]);
  }
  for (const uid of volunteers) {
    await query('REPLACE INTO user_event_groups (user_id, event_id, group_id) VALUES (?, 1, 2)', [uid]);
  }

  // Ensure volunteer module_groups_permissions has task:view, task.view, task:update_status, calendar:view, calendar.view
  // Check permission IDs
  const permRows = await query('SELECT id, permission_key FROM permissions');
  const permMap = {};
  permRows.forEach(p => { permMap[p.permission_key] = p.id; });

  // Volunteer module_group for tasks is id 19
  const volTaskMgId = 19;
  const taskPermKeys = ['task.view', 'task:view', 'task.update_status', 'task:update_status', 'calendar.view', 'calendar:view', 'submission.view', 'submission:view'];

  for (const key of taskPermKeys) {
    if (permMap[key]) {
      await query(`
        INSERT IGNORE INTO module_groups_permissions (module_group_id, permission_id)
        VALUES (?, ?)
      `, [volTaskMgId, permMap[key]]);
    }
  }

  // Judge module_groups (4: jury_member)
  // Ensure module_groups exist for jury_member on review_dashboard, submissions, jury
  let judgeMg = await query('SELECT id FROM module_groups WHERE group_id = 4 AND module_id = 3');
  let judgeMgId;
  if (judgeMg.length === 0) {
    const res = await query('INSERT INTO module_groups (group_id, module_id, name) VALUES (4, 3, "Judge - review_dashboard")');
    judgeMgId = res.insertId;
  } else {
    judgeMgId = judgeMg[0].id;
  }

  const judgePermKeys = ['review.view', 'review:view', 'review:read', 'review.evaluate', 'review:evaluate', 'jury.view_panel', 'jury:read', 'submission.view', 'submission:read'];
  for (const key of judgePermKeys) {
    if (permMap[key]) {
      await query(`
        INSERT IGNORE INTO module_groups_permissions (module_group_id, permission_id)
        VALUES (?, ?)
      `, [judgeMgId, permMap[key]]);
    }
  }

  console.log('✓ Successfully fixed user_event_groups and permissions.');
  process.exit(0);
}

fixGroupsAndPerms().catch(err => {
  console.error(err);
  process.exit(1);
});
