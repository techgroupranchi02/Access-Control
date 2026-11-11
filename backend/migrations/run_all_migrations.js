/**
 * Master Migration Runner for Access-Control
 * Sequentially executes all migrations (005 -> 011) and platform spec synchronization.
 * 
 * Usage: node migrations/run_all_migrations.js
 */

const { execFileSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const MIGRATION_SCRIPTS = [
  path.resolve(__dirname, '005_implement_new_schema_no_scope.js'),
  path.resolve(__dirname, '006_freecomers_all_modules_schema.js'),
  path.resolve(__dirname, '007_settings_and_criteria_schema.js'),
  path.resolve(__dirname, '008_audience_addon_module_schema.js'),
  path.resolve(__dirname, '009_implement_scope_key_scoping.js'),
  path.resolve(__dirname, '010_sequential_6_stages_review_workflow.js'),
  path.resolve(__dirname, '011_remove_jury_addon_module.js'),
  path.resolve(__dirname, '012_align_submissions_and_review_schema.js'),
  path.resolve(__dirname, '013_dedup_and_constrain_review_stages.js'),
  path.resolve(__dirname, '014_qr_credential_serial.js'),
  path.resolve(__dirname, '015_vote_badge_link_and_kashish_receipts.js'),
  path.resolve(__dirname, '../src/scripts/migrate_kashish_integration.js'),
  path.resolve(__dirname, '016_kashish_external_leaderboard.js'),
  path.resolve(__dirname, '017_saas_qr_lost_flag.js'),
  path.resolve(__dirname, '018_pass_templates.js'),
  path.resolve(__dirname, '019_qr_sequence.js'),
  path.resolve(__dirname, '020_fix_saas_festival_id.js'),
  path.resolve(__dirname, '021_pass_template_elements.js'),
  path.resolve(__dirname, '022_pass_print_settings.js'),
  path.resolve(__dirname, '../src/scripts/sync_specs_to_database.js'),
];

async function run() {
  console.log('====================================================');
  console.log(`[Master Migration] Target Database: ${process.env.DB_DATABASE || 'freecomers_database'}`);
  console.log(`[Master Migration] Target Host    : ${process.env.DB_HOST || '127.0.0.1'}`);
  console.log('====================================================\n');

  for (let i = 0; i < MIGRATION_SCRIPTS.length; i++) {
    const scriptPath = MIGRATION_SCRIPTS[i];
    const scriptName = path.basename(scriptPath);

    console.log(`>>> [Step ${i + 1}/${MIGRATION_SCRIPTS.length}] Running ${scriptName}...`);
    try {
      execFileSync(process.execPath, [scriptPath], {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      });
      console.log(`✓ [Step ${i + 1}/${MIGRATION_SCRIPTS.length}] ${scriptName} completed.\n`);
    } catch (err) {
      console.error(`\n❌ [Step ${i + 1}/${MIGRATION_SCRIPTS.length}] ${scriptName} FAILED.`);
      console.error(err.message);
      process.exit(1);
    }
  }

  console.log('====================================================');
  console.log('🎉 All Access-Control migrations & specs synced successfully!');
  console.log('====================================================');
}

run();
