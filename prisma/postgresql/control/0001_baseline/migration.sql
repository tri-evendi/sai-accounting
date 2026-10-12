-- DIBANGKITKAN dari prisma/postgresql/control.prisma oleh `bun run pg:baseline` — JANGAN DISUNTING.
-- Baseline PostgreSQL. Riwayat migration MariaDB (prisma/**/migrations) TIDAK
-- diport: skema adalah sumber kebenarannya, dan 5.241 baris SQL MariaDB tidak
-- punya nilai di mesin baru. Lihat docs/arsitektur/11-RENCANA-POSTGRESQL.md §9.2.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "slug_changed_at" TIMESTAMP(3),
    "name" VARCHAR(150) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
    "plan_key" VARCHAR(30) NOT NULL DEFAULT 'trial',
    "trial_ends_at" TIMESTAMP(3),
    "max_companies" INTEGER NOT NULL DEFAULT 1,
    "max_users" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "database_name" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "tenant_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100),
    "email" VARCHAR(255),
    "email_verified_at" TIMESTAMP(3),
    "tenant_id" INTEGER,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "pass_date" TIMESTAMP(3),
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "company_role" VARCHAR(20) NOT NULL,
    "invited_by_user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "account_name" VARCHAR(150),
    "password_hash" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "terms_version" VARCHAR(30),
    "privacy_version" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_deletion_requests" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "requested_by_user_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "grace_ends_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "retention_until" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "accountant_mode" BOOLEAN,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "created_by_user_id" INTEGER NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "href" VARCHAR(255),
    "dedupe_key" VARCHAR(120) NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_slug_history" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_slug_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_mail_settings" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "transport" VARCHAR(10) NOT NULL DEFAULT 'file',
    "host" VARCHAR(191),
    "port" INTEGER,
    "username" VARCHAR(191),
    "from_address" VARCHAR(191),
    "password_ciphertext" VARCHAR(512),
    "password_iv" VARCHAR(64),
    "password_tag" VARCHAR(64),
    "archive_address" VARCHAR(191),
    "last_test_at" TIMESTAMP(3),
    "last_test_to" VARCHAR(191),
    "last_test_status" VARCHAR(10),
    "last_test_message" TEXT,
    "updated_by" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_mail_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_audit_logs" (
    "id" SERIAL NOT NULL,
    "legacy_id" VARCHAR(40),
    "tenant_id" INTEGER NOT NULL,
    "tenant_slug" VARCHAR(63) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "tenant_role" VARCHAR(50),
    "action" VARCHAR(50) NOT NULL,
    "details" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key" ON "tenant_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_database_name_key" ON "companies"("database_name");

-- CreateIndex
CREATE INDEX "companies_is_active_idx" ON "companies"("is_active");

-- CreateIndex
CREATE INDEX "companies_tenant_id_idx" ON "companies"("tenant_id");

-- CreateIndex
CREATE INDEX "companies_is_demo_idx" ON "companies"("is_demo");

-- CreateIndex
CREATE UNIQUE INDEX "companies_tenant_id_slug_key" ON "companies"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_username_idx" ON "users"("tenant_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_idx" ON "invitations"("tenant_id");

-- CreateIndex
CREATE INDEX "invitations_company_id_idx" ON "invitations"("company_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_expires_at_idx" ON "invitations"("expires_at");

-- CreateIndex
CREATE INDEX "invitations_invited_by_user_id_idx" ON "invitations"("invited_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_token_hash_key" ON "registrations"("token_hash");

-- CreateIndex
CREATE INDEX "registrations_email_idx" ON "registrations"("email");

-- CreateIndex
CREATE INDEX "registrations_expires_at_idx" ON "registrations"("expires_at");

-- CreateIndex
CREATE INDEX "tenant_deletion_requests_tenant_id_idx" ON "tenant_deletion_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_deletion_requests_status_idx" ON "tenant_deletion_requests"("status");

-- CreateIndex
CREATE INDEX "tenant_deletion_requests_requested_by_user_id_idx" ON "tenant_deletion_requests"("requested_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_counters_key_key" ON "rate_limit_counters"("key");

-- CreateIndex
CREATE INDEX "rate_limit_counters_updated_at_idx" ON "rate_limit_counters"("updated_at");

-- CreateIndex
CREATE INDEX "memberships_company_id_idx" ON "memberships"("company_id");

-- CreateIndex
CREATE INDEX "memberships_is_active_idx" ON "memberships"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_company_id_key" ON "memberships"("user_id", "company_id");

-- CreateIndex
CREATE INDEX "api_tokens_company_id_idx" ON "api_tokens"("company_id");

-- CreateIndex
CREATE INDEX "api_tokens_revoked_at_idx" ON "api_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "api_tokens_created_by_user_id_idx" ON "api_tokens"("created_by_user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_kind_dedupe_key_key" ON "notifications"("user_id", "kind", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slug_history_slug_key" ON "tenant_slug_history"("slug");

-- CreateIndex
CREATE INDEX "tenant_slug_history_tenant_id_idx" ON "tenant_slug_history"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_mail_settings_tenant_id_key" ON "tenant_mail_settings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_audit_logs_legacy_id_key" ON "tenant_audit_logs"("legacy_id");

-- CreateIndex
CREATE INDEX "tenant_audit_logs_tenant_slug_created_at_idx" ON "tenant_audit_logs"("tenant_slug", "created_at");

-- CreateIndex
CREATE INDEX "tenant_audit_logs_tenant_id_idx" ON "tenant_audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_audit_logs_user_id_idx" ON "tenant_audit_logs"("user_id");

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_deletion_requests" ADD CONSTRAINT "tenant_deletion_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_mail_settings" ADD CONSTRAINT "tenant_mail_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

