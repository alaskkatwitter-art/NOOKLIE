-- Phase 2, isolated D1. No production cutover or user data import.
-- pinned_story_id FK will be installed with the stories schema before importing data.

CREATE TABLE "chat_blocks" (
  "blocker_id" TEXT NOT NULL,
  "blocked_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "chat_blocks_check" CHECK ((blocker_id <> blocked_id)),
  CONSTRAINT "chat_blocks_pkey" PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT "chat_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "chat_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "departments" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "archived_at" TEXT,
  CONSTRAINT "departments_status_check" CHECK ((status IN ('active', 'archived'))),
  CONSTRAINT "departments_pkey" PRIMARY KEY (id),
  CONSTRAINT "departments_slug_key" UNIQUE (slug),
  CONSTRAINT "departments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE "follow_requests" (
  "requester_id" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "follow_requests_check" CHECK ((requester_id <> target_id)),
  CONSTRAINT "follow_requests_pkey" PRIMARY KEY (requester_id, target_id),
  CONSTRAINT "follow_requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "follow_requests_target_id_fkey" FOREIGN KEY (target_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "follows" (
  "follower_id" TEXT NOT NULL,
  "following_id" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "follows_check" CHECK ((follower_id <> following_id)),
  CONSTRAINT "follows_pkey" PRIMARY KEY (follower_id, following_id),
  CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY (follower_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "follows_following_id_fkey" FOREIGN KEY (following_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "permissions" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "scope" TEXT NOT NULL DEFAULT 'department',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "permissions_scope_check" CHECK ((scope IN ('platform', 'department'))),
  CONSTRAINT "permissions_pkey" PRIMARY KEY (code)
) STRICT;

CREATE TABLE "platform_admins" (
  "user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "platform_admins_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE "profile_mutes" (
  "user_id" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "profile_mutes_check" CHECK ((user_id <> target_id)),
  CONSTRAINT "profile_mutes_pkey" PRIMARY KEY (user_id, target_id),
  CONSTRAINT "profile_mutes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "profile_mutes_target_id_fkey" FOREIGN KEY (target_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "profiles" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "display_name" TEXT,
  "bio" TEXT,
  "avatar_url" TEXT,
  "cover_url" TEXT,
  "theme_color" TEXT DEFAULT '#ff78b9',
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "user_id" TEXT,
  "recovery_key_hash" TEXT,
  "verified" INTEGER NOT NULL DEFAULT 0 CHECK ("verified" IN (0,1)),
  "is_official" INTEGER NOT NULL DEFAULT 0 CHECK ("is_official" IN (0,1)),
  "moderation_hidden_at" TEXT,
  "is_private" INTEGER NOT NULL DEFAULT 0 CHECK ("is_private" IN (0,1)),
  "social_notifications" INTEGER NOT NULL DEFAULT 1 CHECK ("social_notifications" IN (0,1)),
  "chapter_notifications" INTEGER NOT NULL DEFAULT 1 CHECK ("chapter_notifications" IN (0,1)),
  "reposts_private" INTEGER NOT NULL DEFAULT 0 CHECK ("reposts_private" IN (0,1)),
  "pinned_story_id" TEXT,
  "header_layout" TEXT NOT NULL DEFAULT 'classic',
  "avatar_position" TEXT NOT NULL DEFAULT 'left',
  "video_autoplay" INTEGER NOT NULL DEFAULT 1 CHECK ("video_autoplay" IN (0,1)),
  "avatar_animation" TEXT,
  "cover_animation" TEXT,
  "spotify_link" TEXT,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_username_key" UNIQUE (username),
  CONSTRAINT "profiles_username_length" CHECK (((username IS NULL) OR ((length(username) >= 3) AND (length(username) <= 30)))),
  CONSTRAINT "profiles_avatar_animation_check" CHECK ((json_type(avatar_animation) = 'object')),
  CONSTRAINT "profiles_header_layout_check" CHECK ((header_layout IN ('classic', 'immersive'))),
  CONSTRAINT "profiles_avatar_position_check" CHECK ((avatar_position IN ('left', 'right'))),
  CONSTRAINT "profiles_cover_animation_check" CHECK ((json_type(cover_animation) = 'object')),
  FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE "team_memberships" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "assigned_by" TEXT,
  "assigned_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "removed_by" TEXT,
  "removed_at" TEXT,
  "removal_reason" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "team_memberships_status_check" CHECK ((status IN ('active', 'removed'))),
  CONSTRAINT "team_memberships_check" CHECK ((((status = 'active') AND (removed_at IS NULL)) OR ((status = 'removed') AND (removed_at IS NOT NULL)))),
  CONSTRAINT "team_memberships_pkey" PRIMARY KEY (id),
  CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "team_memberships_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT "team_memberships_role_id_fkey" FOREIGN KEY (role_id) REFERENCES team_roles(id) ON DELETE RESTRICT,
  CONSTRAINT "team_memberships_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth_accounts(id) ON DELETE SET NULL,
  CONSTRAINT "team_memberships_removed_by_fkey" FOREIGN KEY (removed_by) REFERENCES auth_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE "team_role_permissions" (
  "role_id" TEXT NOT NULL,
  "permission_code" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "team_role_permissions_pkey" PRIMARY KEY (role_id, permission_code),
  CONSTRAINT "team_role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES team_roles(id) ON DELETE CASCADE,
  CONSTRAINT "team_role_permissions_permission_code_fkey" FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE RESTRICT
) STRICT;

CREATE TABLE "team_roles" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "badge_title" TEXT,
  "badge_description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "archived_at" TEXT,
  CONSTRAINT "team_roles_status_check" CHECK ((status IN ('active', 'archived'))),
  CONSTRAINT "team_roles_pkey" PRIMARY KEY (id),
  CONSTRAINT "team_roles_department_id_name_key" UNIQUE (department_id, name),
  CONSTRAINT "team_roles_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT "team_roles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE UNIQUE INDEX profiles_username_unique ON profiles(lower(username));
CREATE UNIQUE INDEX profiles_user_id_unique ON profiles(user_id);
CREATE UNIQUE INDEX profiles_recovery_key_hash_unique ON profiles(recovery_key_hash);
CREATE INDEX profiles_pinned_story_id_idx ON profiles(pinned_story_id);
CREATE UNIQUE INDEX team_memberships_one_active_role_idx ON team_memberships(user_id,role_id) WHERE status='active';
CREATE INDEX team_memberships_user_status_idx ON team_memberships(user_id,status);
CREATE INDEX team_memberships_department_status_idx ON team_memberships(department_id,status);
CREATE INDEX team_memberships_role_id_idx ON team_memberships(role_id);
CREATE INDEX team_roles_department_status_idx ON team_roles(department_id,status);
CREATE INDEX follows_target_idx ON follows(following_id,follower_id);
CREATE INDEX follow_requests_target_idx ON follow_requests(target_id,requester_id);
CREATE INDEX chat_blocks_target_idx ON chat_blocks(blocked_id,blocker_id);
CREATE INDEX profile_mutes_target_idx ON profile_mutes(target_id,user_id);

-- A membership may only use a role from the same department.
CREATE UNIQUE INDEX team_roles_id_department_idx ON team_roles(id,department_id);
CREATE TRIGGER membership_matching_department_insert BEFORE INSERT ON team_memberships
WHEN NOT EXISTS (SELECT 1 FROM team_roles r WHERE r.id=NEW.role_id AND r.department_id=NEW.department_id)
BEGIN SELECT RAISE(ABORT,'Role belongs to another department'); END;
CREATE TRIGGER membership_matching_department_update BEFORE UPDATE OF role_id,department_id ON team_memberships
WHEN NOT EXISTS (SELECT 1 FROM team_roles r WHERE r.id=NEW.role_id AND r.department_id=NEW.department_id)
BEGIN SELECT RAISE(ABORT,'Role belongs to another department'); END;
CREATE TRIGGER role_department_immutable BEFORE UPDATE OF department_id ON team_roles
WHEN NEW.department_id<>OLD.department_id AND EXISTS (SELECT 1 FROM team_memberships m WHERE m.role_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Role department has memberships'); END;

CREATE TRIGGER block_removes_relationships AFTER INSERT ON chat_blocks
BEGIN
  DELETE FROM follows WHERE (follower_id=NEW.blocker_id AND following_id=NEW.blocked_id)
    OR (follower_id=NEW.blocked_id AND following_id=NEW.blocker_id);
  DELETE FROM follow_requests WHERE (requester_id=NEW.blocker_id AND target_id=NEW.blocked_id)
    OR (requester_id=NEW.blocked_id AND target_id=NEW.blocker_id);
END;
CREATE TRIGGER follow_rejects_blocks BEFORE INSERT ON follows
WHEN EXISTS (SELECT 1 FROM chat_blocks b WHERE
  (b.blocker_id=NEW.follower_id AND b.blocked_id=NEW.following_id)
  OR (b.blocker_id=NEW.following_id AND b.blocked_id=NEW.follower_id))
BEGIN SELECT RAISE(ABORT,'Interaction unavailable'); END;
CREATE TRIGGER request_rejects_blocks BEFORE INSERT ON follow_requests
WHEN EXISTS (SELECT 1 FROM chat_blocks b WHERE
  (b.blocker_id=NEW.requester_id AND b.blocked_id=NEW.target_id)
  OR (b.blocker_id=NEW.target_id AND b.blocked_id=NEW.requester_id))
BEGIN SELECT RAISE(ABORT,'Interaction unavailable'); END;
CREATE TRIGGER follow_clears_request AFTER INSERT ON follows
BEGIN DELETE FROM follow_requests WHERE requester_id=NEW.follower_id AND target_id=NEW.following_id; END;

-- Public follows and private requests share one atomic entry point. Private
-- requests become follows only through the recipient-authorized acceptance SQL.
CREATE TRIGGER public_request_follows AFTER INSERT ON follow_requests
WHEN EXISTS (SELECT 1 FROM profiles p WHERE p.id=NEW.target_id AND p.is_private=0)
BEGIN
  INSERT INTO follows(follower_id,following_id) VALUES(NEW.requester_id,NEW.target_id) ON CONFLICT DO NOTHING;
  DELETE FROM follow_requests WHERE requester_id=NEW.requester_id AND target_id=NEW.target_id;
END;

CREATE VIEW d1_social_actors AS
SELECT s.token_hash,a.id AS user_id,p.id AS profile_id
FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id JOIN profiles p ON p.user_id=a.id
WHERE a.account_status='active' AND p.moderation_hidden_at IS NULL
  AND julianday(s.expires_at)>julianday('now');
