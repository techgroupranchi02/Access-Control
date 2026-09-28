const { query } = require('../config/database');

async function main() {
  const groups = await query('SELECT * FROM `groups`');
  console.log('groups:', groups);
  const ueg = await query('SELECT * FROM user_event_groups WHERE user_id IN (1, 2, 4, 8)');
  console.log('ueg:', ueg);
  const mg = await query('SELECT mg.*, g.group_key FROM module_groups mg JOIN `groups` g ON g.id = mg.group_id');
  console.log('module_groups:', mg);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
