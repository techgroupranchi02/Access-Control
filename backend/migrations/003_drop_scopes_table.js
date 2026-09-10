/**
 * Migration 003: Drop Scopes Table
 * 
 * Scope definitions are now maintained directly in application code
 * (`backend/src/core/constants/scope.constants.js`) for zero-latency in-memory lookup
 * and zero database join overhead.
 * 
 * Group-to-scope mappings remain persisted in `group_permissions.scope_key`.
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 003] Dropping `scopes` table...');
  await query('DROP TABLE IF EXISTS scopes;');
  console.log('[Migration 003] ✓ `scopes` table dropped successfully.');
}

async function down() {
  console.log('[Migration 003] Re-creating `scopes` table...');
  await query(`
    CREATE TABLE IF NOT EXISTS scopes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scope_key VARCHAR(100) NOT NULL UNIQUE,
      resource VARCHAR(100) NOT NULL DEFAULT '*',
      rule TEXT NULL,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const scopes = [
    { scope_key: 'all', resource: '*', rule: null, description: 'Global access across the entire edition/event.' },
    { scope_key: 'assigned', resource: 'submission', rule: 'submission.assigned_reviewers.contains(user.id)', description: 'Restricted strictly to resources assigned to the user.' },
    { scope_key: 'jury_panel', resource: 'submission', rule: 'submission.category_id in user.jury_category_ids', description: 'Restricted to submissions within the juror assigned jury panel category.' },
    { scope_key: 'department', resource: '*', rule: 'resource.department_id in user.department_ids', description: 'Restricted to resources within the user assigned department(s).' }
  ];

  for (const s of scopes) {
    await query(
      'INSERT IGNORE INTO scopes (scope_key, resource, rule, description) VALUES (?, ?, ?, ?)',
      [s.scope_key, s.resource, s.rule, s.description]
    );
  }
  console.log('[Migration 003] ✓ `scopes` table restored.');
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
