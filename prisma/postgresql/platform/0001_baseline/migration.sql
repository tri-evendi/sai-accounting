-- DIBANGKITKAN dari prisma/postgresql/platform.prisma oleh `bun run pg:baseline` — JANGAN DISUNTING.
-- Baseline PostgreSQL. Riwayat migration MariaDB (prisma/**/migrations) TIDAK
-- diport: skema adalah sumber kebenarannya, dan 5.241 baris SQL MariaDB tidak
-- punya nilai di mesin baru. Lihat docs/arsitektur/11-RENCANA-POSTGRESQL.md §9.2.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "price_monthly" DECIMAL(15,2) NOT NULL,
    "price_yearly" DECIMAL(15,2),
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "max_companies" INTEGER NOT NULL DEFAULT 1,
    "max_users" INTEGER NOT NULL DEFAULT 3,
    "trial_days" INTEGER NOT NULL DEFAULT 14,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "contact_only" BOOLEAN NOT NULL DEFAULT false,
    "is_recommended" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "billing_cycle" VARCHAR(10) NOT NULL DEFAULT 'monthly',
    "billing_mode" VARCHAR(10) NOT NULL DEFAULT 'none',
    "price" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_ends_at" TIMESTAMP(3),
    "past_due_since" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "initial_for_tenant_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "target_plan_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "platform_invoice_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "method" VARCHAR(30),
    "gateway" VARCHAR(30),
    "gateway_ref" VARCHAR(100),
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "bank" VARCHAR(20),
    "va_number" VARCHAR(40),
    "qr_string" TEXT,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_billing_profiles" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "npwp" VARCHAR(25),
    "name" VARCHAR(150),
    "address" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "due_key" VARCHAR(40) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "invoices_issued" INTEGER NOT NULL DEFAULT 0,
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "status_changes" INTEGER NOT NULL DEFAULT 0,
    "adoptions" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "key" VARCHAR(30) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_settings" (
    "id" SERIAL NOT NULL,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "transport" VARCHAR(10) NOT NULL,
    "host" VARCHAR(191),
    "port" INTEGER,
    "username" VARCHAR(191),
    "from_address" VARCHAR(191) NOT NULL,
    "password_ciphertext" VARCHAR(512),
    "password_iv" VARCHAR(64),
    "password_tag" VARCHAR(64),
    "archive_address" VARCHAR(191),
    "last_test_at" TIMESTAMP(3),
    "last_test_to" VARCHAR(191),
    "last_test_status" VARCHAR(10),
    "last_test_message" TEXT,
    "updated_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformance_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "companies_checked" INTEGER NOT NULL DEFAULT 0,
    "companies_failed" INTEGER NOT NULL DEFAULT 0,
    "finding_count" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conformance_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "error" TEXT,
    "artifact" VARCHAR(255),
    "size_bytes" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_contents" (
    "id" SERIAL NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "content_key" VARCHAR(120) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" SERIAL NOT NULL,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "contact_whatsapp" VARCHAR(30),
    "contact_email" VARCHAR(191),
    "manual_payment_instructions" TEXT,
    "self_serve_signup_open" BOOLEAN,
    "ppn_enabled" BOOLEAN,
    "updated_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE INDEX "plans_is_active_idx" ON "plans"("is_active");

-- CreateIndex
CREATE INDEX "plans_is_active_is_public_idx" ON "plans"("is_active", "is_public");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_initial_for_tenant_id_key" ON "subscriptions"("initial_for_tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

-- CreateIndex
CREATE INDEX "subscriptions_billing_mode_idx" ON "subscriptions"("billing_mode");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_number_key" ON "platform_invoices"("number");

-- CreateIndex
CREATE INDEX "platform_invoices_tenant_id_idx" ON "platform_invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "platform_invoices_status_idx" ON "platform_invoices"("status");

-- CreateIndex
CREATE INDEX "platform_invoices_due_date_idx" ON "platform_invoices"("due_date");

-- CreateIndex
CREATE INDEX "platform_invoices_subscription_id_idx" ON "platform_invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "platform_invoices_target_plan_id_idx" ON "platform_invoices"("target_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_ref_key" ON "payments"("gateway_ref");

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "payments"("tenant_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_platform_invoice_id_idx" ON "payments"("platform_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_profiles_tenant_id_key" ON "tenant_billing_profiles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_logs_subscription_id_kind_due_key_key" ON "reminder_logs"("subscription_id", "kind", "due_key");

-- CreateIndex
CREATE INDEX "scheduler_runs_started_at_idx" ON "scheduler_runs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_tenant_id_key_key" ON "usage_counters"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "mail_settings_singleton_key" ON "mail_settings"("singleton");

-- CreateIndex
CREATE INDEX "conformance_runs_finished_at_idx" ON "conformance_runs"("finished_at");

-- CreateIndex
CREATE INDEX "conformance_runs_status_finished_at_idx" ON "conformance_runs"("status", "finished_at");

-- CreateIndex
CREATE INDEX "backup_runs_finished_at_idx" ON "backup_runs"("finished_at");

-- CreateIndex
CREATE INDEX "backup_runs_status_finished_at_idx" ON "backup_runs"("status", "finished_at");

-- CreateIndex
CREATE INDEX "site_contents_locale_idx" ON "site_contents"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "site_contents_locale_content_key_key" ON "site_contents"("locale", "content_key");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_singleton_key" ON "site_settings"("singleton");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_target_plan_id_fkey" FOREIGN KEY ("target_plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_platform_invoice_id_fkey" FOREIGN KEY ("platform_invoice_id") REFERENCES "platform_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

