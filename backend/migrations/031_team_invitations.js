/**
 * Migration 031: team invitations (docs/adr/0008-team-invitations.md)
 *
 * A festival can invite someone to its team before they have a Freecomers account. Team access needs a
 * users.id (user_event_groups), so the invite waits here and is claimed the first time that email signs in
 * to FestiPlus (teamInvites.service.js › claimInvitations). FestiPlus-owned table; additive and idempotent
 * (Jenkins runs migrate on every deploy).
 */

const { query } = require('../src/config/database');

async function tableExists(table) {
  const rows = await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [table]);
  return rows.length > 0;
}

async function up() {
  console.log('[Migration 031] Team invitations: starting...');
  if (await tableExists('team_invitations')) {
    console.log('[Migration 031] • team_invitations already exists');
  } else {
    await query(`
      CREATE TABLE team_invitations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        event_id BIGINT UNSIGNED NOT NULL,
        email VARCHAR(255) NOT NULL COMMENT 'lower-case, trimmed',
        groups_json JSON NOT NULL COMMENT 'group keys for assignUserToGroups: admin, jury, volunteer, custom_<id>',
        status ENUM('pending','accepted','revoked') NOT NULL DEFAULT 'pending',
        invited_by_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
        invited_by_admin_id BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'admins.id when a Freecomers admin invited (ADR 0007)',
        send_count INT UNSIGNED NOT NULL DEFAULT 0,
        last_sent_at DATETIME NULL DEFAULT NULL,
        last_send_error VARCHAR(255) NULL DEFAULT NULL,
        expires_at DATETIME NOT NULL,
        accepted_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
        accepted_at DATETIME NULL DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_team_invitations_event_email (event_id, email),
        KEY idx_team_invitations_email_status (email, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Migration 031] ✓ Created team_invitations');
  }
  console.log('[Migration 031] ✓ Completed.');
}

async function down() {
  try { await query('DROP TABLE IF EXISTS team_invitations'); } catch (e) { }
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
