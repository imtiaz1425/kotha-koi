-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('student', 'admin');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'banned');

-- CreateEnum
CREATE TYPE "chat_mode" AS ENUM ('text', 'video');

-- CreateEnum
CREATE TYPE "ended_reason" AS ENUM ('skip', 'end', 'disconnect_timeout', 'moderation', 'server_restart');

-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('harassment', 'sexual_content', 'hate_speech', 'spam_or_bot', 'impersonation', 'threats_or_self_harm', 'other');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');

-- CreateEnum
CREATE TYPE "moderation_action_type" AS ENUM ('warn', 'suspend', 'ban', 'unban', 'dismiss');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'student',
    "status" "user_status" NOT NULL DEFAULT 'active',
    "suspended_until" TIMESTAMPTZ,
    "email_verified_at" TIMESTAMPTZ,
    "terms_accepted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_login_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "current_nickname" TEXT NOT NULL,
    "avatar_preset" TEXT NOT NULL DEFAULT 'mango',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "login_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mode" "chat_mode" NOT NULL,
    "user_a_id" UUID,
    "user_b_id" UUID,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "ended_reason" "ended_reason",
    "ended_by_user_id" UUID,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "reported_id" UUID NOT NULL,
    "chat_session_id" UUID,
    "reason" "report_reason" NOT NULL,
    "details" TEXT,
    "evidence" JSONB,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "report_id" UUID,
    "action" "moderation_action_type" NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "login_codes_email_created_at_idx" ON "login_codes"("email", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "chat_sessions_started_at_idx" ON "chat_sessions"("started_at");

-- CreateIndex
CREATE INDEX "chat_sessions_user_a_id_idx" ON "chat_sessions"("user_a_id");

-- CreateIndex
CREATE INDEX "chat_sessions_user_b_id_idx" ON "chat_sessions"("user_b_id");

-- CreateIndex
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_reported_id_idx" ON "reports"("reported_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_chat_session_id_key" ON "reports"("reporter_id", "chat_session_id");

-- CreateIndex
CREATE INDEX "moderation_actions_target_user_id_created_at_idx" ON "moderation_actions"("target_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custom SQL CHECK Constraints per BACKEND-SCHEMA.md
ALTER TABLE "blocks" ADD CONSTRAINT "chk_blocks_no_self" CHECK ("blocker_id" <> "blocked_id");

ALTER TABLE "chat_sessions" ADD CONSTRAINT "chk_chat_sessions_no_self" CHECK ("user_a_id" <> "user_b_id");

ALTER TABLE "profiles" ADD CONSTRAINT "chk_nickname_length" CHECK (char_length("current_nickname") >= 2 AND char_length("current_nickname") <= 20);

