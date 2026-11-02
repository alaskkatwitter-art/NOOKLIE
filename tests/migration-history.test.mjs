import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';

const pendingMigrations = [
  '20261031194437_add_literary_collaboration_review_privacy_features.sql',
  '20261031210000_extend_moderation_reports_and_appeals.sql',
  '20261031220000_collaborator_exit_and_credit_withdrawal.sql',
];

const appliedRemoteMigrations = [
  '20261030021627_harden_public_schema_access_and_function_security.sql',
  '20261030024020_auth_attempt_rate_limits.sql',
  '20261030025623_complete_auth_recovery_atomically.sql',
  '20261031012246_secure_public_access_and_optimize_rls.sql',
  '20261031013628_add_tag_aware_story_discovery.sql',
  '20261031014115_exclude_unpublished_stories_before_paging.sql',
  '20261031015325_add_official_account_auto_follow.sql',
  '20261031174358_admin_foundation_rbac.sql',
  '20261031174855_admin_management_operations.sql',
  '20261031175148_admin_operations_role_permission_validation_fix.sql',
  '20261031175926_admin_opportunities_and_applications.sql',
  '20261031180005_admin_applications_prevent_self_appointment.sql',
  '20261031181002_admin_archived_roles_revoke_access.sql',
  '20261031181140_admin_active_role_permission_scope.sql',
  '20261031181704_moderation_reports_and_review.sql',
  '20261031183008_admin_user_account_status.sql',
  '20261031183656_moderation_content_visibility_actions.sql',
  '20261031184442_guard_moderation_visibility.sql',
  '20261031184537_allow_trusted_moderation_visibility_actors.sql',
  '20261031184710_restore_content_from_resolved_reports.sql',
  '20261031185255_admin_rls_and_fk_indexes.sql',
  '20261031185934_seed_platform_admin_ids.sql',
  '20261031190044_enforce_opportunity_openings.sql',
  '20261031190107_serialize_application_reviews.sql',
  '20261031190603_profile_theme_persistence.sql',
];

test('active migration files retain the exact applied Supabase history', async () => {
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url));
  const activeSqlFiles = files.filter((file) => /^\d+_.+\.sql$/.test(file));
  const versions = activeSqlFiles.map((file) => file.slice(0, file.indexOf('_')));

  assert.equal(new Set(versions).size, versions.length, 'migration versions must be unique');
  const expectedActiveMigrations = [...appliedRemoteMigrations, ...pendingMigrations].sort();
  assert.deepEqual(
    activeSqlFiles.sort(),
    expectedActiveMigrations,
    'active migrations must equal the applied database history plus the explicitly pending migrations'
  );
});
