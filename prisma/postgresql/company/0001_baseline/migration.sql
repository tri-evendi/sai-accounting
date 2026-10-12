-- DIBANGKITKAN dari prisma/postgresql/company.prisma oleh `bun run pg:baseline` — JANGAN DISUNTING.
-- Baseline PostgreSQL. Riwayat migration MariaDB (prisma/**/migrations) TIDAK
-- diport: skema adalah sumber kebenarannya, dan 5.241 baris SQL MariaDB tidak
-- punya nilai di mesin baru. Lihat docs/arsitektur/11-RENCANA-POSTGRESQL.md §9.2.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(20) NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission_overrides" (
    "id" SERIAL NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "permission" VARCHAR(50) NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "permission" VARCHAR(50) NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "contract_no" VARCHAR(50) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "buyer" VARCHAR(100) NOT NULL,
    "customer_id" INTEGER,
    "consignee" VARCHAR(100),
    "consignee_id" INTEGER,
    "packaging" VARCHAR(100),
    "shipment" VARCHAR(200),
    "top1" VARCHAR(200),
    "top2" VARCHAR(200),
    "currency" VARCHAR(5) NOT NULL DEFAULT 'USD',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "taxable" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_items" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "item_name" VARCHAR(100) NOT NULL,
    "bags" INTEGER NOT NULL DEFAULT 0,
    "kg_per_bag" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "price_per_kg" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payments" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'USD',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "cash_type" VARCHAR(20),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_no" VARCHAR(50) NOT NULL,
    "is_opening" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "customer_id" INTEGER,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "tax_rate" DECIMAL(15,2),
    "dpp" DECIMAL(15,2),
    "peb_number" VARCHAR(50),
    "peb_date" TIMESTAMP(3),
    "export_note" TEXT,
    "contract_id" INTEGER,
    "cost_center_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sends" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "recipient" VARCHAR(190) NOT NULL,
    "sent_by_user_id" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminder_kind" VARCHAR(20),
    "reminder_due_key" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER,
    "invoice_id" INTEGER NOT NULL,
    "item_name" VARCHAR(100) NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unit" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'USD',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "cash_type" VARCHAR(20),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "type" VARCHAR(15) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "unit_cost" DECIMAL(15,2),
    "value_adjustment" DECIMAL(15,2),
    "note" TEXT,
    "cost_center_id" INTEGER,
    "production_order_id" INTEGER,
    "supplier_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(30),
    "email" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_transactions" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "is_opening" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "cash_type" VARCHAR(20),
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "cost_center_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landed_cost_documents" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "basis" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "capitalized_amount" DECIMAL(15,2) NOT NULL,
    "expensed_amount" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landed_cost_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landed_cost_items" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "receipt_movement_id" INTEGER,
    "adjustment_movement_id" INTEGER,
    "quantity" DECIMAL(15,3) NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "on_hand_quantity" DECIMAL(15,3) NOT NULL,
    "allocated" DECIMAL(15,2) NOT NULL,
    "capitalized" DECIMAL(15,2) NOT NULL,
    "expensed" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landed_cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" SERIAL NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(30),
    "email" VARCHAR(100),
    "pic" VARCHAR(100),
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "npwp" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consignees" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" TEXT,
    "country" VARCHAR(60),
    "contact" VARCHAR(100),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_payments" (
    "id" SERIAL NOT NULL,
    "advance_no" VARCHAR(50) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customer_id" INTEGER,
    "supplier_id" INTEGER,
    "contract_id" INTEGER,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advance_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_applications" (
    "id" SERIAL NOT NULL,
    "advance_id" INTEGER NOT NULL,
    "invoice_id" INTEGER,
    "purchase_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advance_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" SERIAL NOT NULL,
    "return_no" VARCHAR(50) NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6),
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(15,2),
    "base_amount" DECIMAL(15,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'posted',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" SERIAL NOT NULL,
    "sales_return_id" INTEGER NOT NULL,
    "invoice_item_id" INTEGER NOT NULL,
    "item_name" VARCHAR(100) NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "item_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" SERIAL NOT NULL,
    "return_no" VARCHAR(50) NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "supplier_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6),
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(15,2),
    "base_amount" DECIMAL(15,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'posted',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" SERIAL NOT NULL,
    "purchase_return_id" INTEGER NOT NULL,
    "item_name" VARCHAR(100) NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "item_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2),
    "note" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciled_at" TIMESTAMP(3),
    "statement_id" INTEGER,
    "cost_center_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_conversions" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "from_currency" VARCHAR(5) NOT NULL,
    "to_currency" VARCHAR(5) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "result" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" SERIAL NOT NULL,
    "currency" VARCHAR(5) NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "source" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "normal_balance" VARCHAR(6) NOT NULL,
    "parent_id" INTEGER,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "expense_nature" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mappings" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'any',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "parent_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'general',
    "source_type" VARCHAR(30),
    "source_id" INTEGER,
    "note" TEXT,
    "is_reversed" BOOLEAN NOT NULL DEFAULT false,
    "reversal_of_id" INTEGER,
    "cost_center_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" SERIAL NOT NULL,
    "journal_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "base_debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "base_credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "memo" VARCHAR(255),
    "cost_center_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_closes" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "net_income" DECIMAL(15,2) NOT NULL,
    "closed_accounts" INTEGER NOT NULL,
    "closed_by_id" INTEGER,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "year_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_revaluations" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "currency" VARCHAR(5) NOT NULL,
    "closing_rate" DECIMAL(18,6) NOT NULL,
    "carrying_base" DECIMAL(15,2) NOT NULL,
    "revalued_base" DECIMAL(15,2) NOT NULL,
    "difference" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_revaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER,
    "filename" VARCHAR(255) NOT NULL,
    "filepath" VARCHAR(500) NOT NULL,
    "type" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" SERIAL NOT NULL,
    "cash_type" VARCHAR(20) NOT NULL DEFAULT 'bank',
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "locked_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" SERIAL NOT NULL,
    "statement_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "cash_movement_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "address" TEXT,
    "base_currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "fiscal_year_start" TIMESTAMP(3) NOT NULL,
    "npwp" VARCHAR(30),
    "is_pkp" BOOLEAN NOT NULL DEFAULT true,
    "tax_name" VARCHAR(150),
    "tax_address" TEXT,
    "business_category" VARCHAR(30),
    "enabled_modules" VARCHAR(255),
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminder_points" VARCHAR(100),
    "reminder_tested_at" TIMESTAMP(3),
    "is_setup" BOOLEAN NOT NULL DEFAULT false,
    "opening_journal_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "payment_gateway" VARCHAR(20),
    "payment_client_key" VARCHAR(120),
    "payment_server_key_ciphertext" TEXT,
    "payment_server_key_iv" VARCHAR(32),
    "payment_server_key_tag" VARCHAR(32),
    "payment_is_production" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "default_method" VARCHAR(20) NOT NULL DEFAULT 'straight_line',
    "default_useful_life_months" INTEGER NOT NULL,
    "asset_account_id" INTEGER NOT NULL,
    "accumulated_account_id" INTEGER NOT NULL,
    "expense_account_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" SERIAL NOT NULL,
    "asset_no" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "acquisition_date" TIMESTAMP(3) NOT NULL,
    "acquisition_cost" DECIMAL(15,2) NOT NULL,
    "residual_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL,
    "depreciation_method" VARCHAR(20) NOT NULL DEFAULT 'straight_line',
    "asset_account_id" INTEGER NOT NULL,
    "accumulated_account_id" INTEGER NOT NULL,
    "expense_account_id" INTEGER NOT NULL,
    "location" VARCHAR(150),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "accumulated_depreciation" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "last_depreciation_year" INTEGER,
    "last_depreciation_month" INTEGER,
    "disposal_date" TIMESTAMP(3),
    "disposal_proceeds" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_depreciations" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "accumulated_after" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_asset_depreciations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_location_histories" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "from_location" VARCHAR(150),
    "to_location" VARCHAR(150),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_asset_location_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_targets" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "item_id" INTEGER,
    "amount" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" SERIAL NOT NULL,
    "no" VARCHAR(50) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "contract_id" INTEGER,
    "invoice_id" INTEGER,
    "consignee_id" INTEGER,
    "vehicle_no" VARCHAR(50),
    "container_no" VARCHAR(50),
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'issued',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_order_items" (
    "id" SERIAL NOT NULL,
    "delivery_order_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "item_name" VARCHAR(100) NOT NULL,
    "bags" INTEGER NOT NULL DEFAULT 0,
    "kg_per_bag" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(15,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" SERIAL NOT NULL,
    "document_type" VARCHAR(30) NOT NULL,
    "min_amount" DECIMAL(15,2) NOT NULL,
    "approver_role" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" SERIAL NOT NULL,
    "source_type" VARCHAR(40) NOT NULL,
    "document_id" INTEGER NOT NULL,
    "document_type" VARCHAR(30) NOT NULL,
    "document_no" VARCHAR(50),
    "rule_id" INTEGER,
    "approver_role" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending_approval',
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'IDR',
    "rate" DECIMAL(18,6),
    "base_amount" DECIMAL(15,2) NOT NULL,
    "threshold_amount" DECIMAL(15,2) NOT NULL,
    "requested_by_id" INTEGER NOT NULL,
    "request_note" TEXT,
    "decided_by_id" INTEGER,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "approved_base_amount" DECIMAL(15,2),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "legacy_id" VARCHAR(40),
    "user_id" VARCHAR(64) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "role" VARCHAR(50),
    "action" VARCHAR(50) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" INTEGER,
    "details" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" SERIAL NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_templates" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "source_id" INTEGER NOT NULL,
    "frequency" VARCHAR(20) NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "max_occurrences" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_occurrences" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "occurrence_date" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "document_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills_of_material" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "output_item_id" INTEGER NOT NULL,
    "output_quantity" DECIMAL(15,3) NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_of_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_components" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "scrap_percent" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_centers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "labor_rate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "overhead_rate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_operations" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "work_center_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "standard_hours" DECIMAL(15,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" SERIAL NOT NULL,
    "order_no" VARCHAR(50) NOT NULL,
    "bom_id" INTEGER,
    "output_item_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "planned_quantity" DECIMAL(15,3) NOT NULL,
    "produced_quantity" DECIMAL(15,3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "cost_center_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_components" (
    "id" SERIAL NOT NULL,
    "production_order_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "item_name" VARCHAR(100) NOT NULL,
    "planned_quantity" DECIMAL(15,3) NOT NULL,
    "issued_quantity" DECIMAL(15,3),
    "issued_cost" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_order_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_operations" (
    "id" SERIAL NOT NULL,
    "production_order_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "work_center_id" INTEGER,
    "standard_hours" DECIMAL(15,3) NOT NULL,
    "actual_hours" DECIMAL(15,3),
    "labor_rate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "overhead_rate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_order_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "role_permission_overrides_role_idx" ON "role_permission_overrides"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_overrides_role_permission_key" ON "role_permission_overrides"("role", "permission");

-- CreateIndex
CREATE INDEX "user_permission_overrides_user_id_idx" ON "user_permission_overrides"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_user_id_permission_key" ON "user_permission_overrides"("user_id", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contract_no_key" ON "contracts"("contract_no");

-- CreateIndex
CREATE INDEX "contracts_due_date_idx" ON "contracts"("due_date");

-- CreateIndex
CREATE INDEX "contracts_date_idx" ON "contracts"("date");

-- CreateIndex
CREATE INDEX "contracts_consignee_id_idx" ON "contracts"("consignee_id");

-- CreateIndex
CREATE INDEX "contracts_customer_id_idx" ON "contracts"("customer_id");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contract_items_item_id_idx" ON "contract_items"("item_id");

-- CreateIndex
CREATE INDEX "contract_items_contract_id_idx" ON "contract_items"("contract_id");

-- CreateIndex
CREATE INDEX "contract_payments_date_idx" ON "contract_payments"("date");

-- CreateIndex
CREATE INDEX "contract_payments_contract_id_idx" ON "contract_payments"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_no_key" ON "invoices"("invoice_no");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE INDEX "invoices_contract_id_idx" ON "invoices"("contract_id");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE INDEX "invoices_date_idx" ON "invoices"("date");

-- CreateIndex
CREATE INDEX "invoices_cost_center_id_idx" ON "invoices"("cost_center_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoice_sends_invoice_id_idx" ON "invoice_sends"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_sends_sent_at_idx" ON "invoice_sends"("sent_at");

-- CreateIndex
CREATE INDEX "invoice_sends_sent_by_user_id_idx" ON "invoice_sends"("sent_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_sends_invoice_id_reminder_kind_reminder_due_key_key" ON "invoice_sends"("invoice_id", "reminder_kind", "reminder_due_key");

-- CreateIndex
CREATE INDEX "invoice_items_item_id_idx" ON "invoice_items"("item_id");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_payments_date_idx" ON "invoice_payments"("date");

-- CreateIndex
CREATE INDEX "invoice_payments_invoice_id_idx" ON "invoice_payments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE INDEX "items_is_active_idx" ON "items"("is_active");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "stock_movements_cost_center_id_idx" ON "stock_movements"("cost_center_id");

-- CreateIndex
CREATE INDEX "stock_movements_supplier_id_idx" ON "stock_movements"("supplier_id");

-- CreateIndex
CREATE INDEX "stock_movements_production_order_id_idx" ON "stock_movements"("production_order_id");

-- CreateIndex
CREATE INDEX "stock_movements_item_id_date_idx" ON "stock_movements"("item_id", "date");

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");

-- CreateIndex
CREATE INDEX "supplier_transactions_supplier_id_type_idx" ON "supplier_transactions"("supplier_id", "type");

-- CreateIndex
CREATE INDEX "supplier_transactions_due_date_idx" ON "supplier_transactions"("due_date");

-- CreateIndex
CREATE INDEX "supplier_transactions_cost_center_id_idx" ON "supplier_transactions"("cost_center_id");

-- CreateIndex
CREATE INDEX "supplier_transactions_date_idx" ON "supplier_transactions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "landed_cost_documents_number_key" ON "landed_cost_documents"("number");

-- CreateIndex
CREATE UNIQUE INDEX "landed_cost_documents_purchase_id_key" ON "landed_cost_documents"("purchase_id");

-- CreateIndex
CREATE INDEX "landed_cost_documents_date_idx" ON "landed_cost_documents"("date");

-- CreateIndex
CREATE INDEX "landed_cost_items_document_id_idx" ON "landed_cost_items"("document_id");

-- CreateIndex
CREATE INDEX "landed_cost_items_item_id_idx" ON "landed_cost_items"("item_id");

-- CreateIndex
CREATE INDEX "landed_cost_items_receipt_movement_id_idx" ON "landed_cost_items"("receipt_movement_id");

-- CreateIndex
CREATE INDEX "landed_cost_items_adjustment_movement_id_idx" ON "landed_cost_items"("adjustment_movement_id");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_purchase_id_idx" ON "supplier_payment_allocations"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_payment_id_purchase_id_key" ON "supplier_payment_allocations"("payment_id", "purchase_id");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "customers"("is_active");

-- CreateIndex
CREATE INDEX "consignees_is_active_idx" ON "consignees"("is_active");

-- CreateIndex
CREATE INDEX "consignees_name_idx" ON "consignees"("name");

-- CreateIndex
CREATE UNIQUE INDEX "advance_payments_advance_no_key" ON "advance_payments"("advance_no");

-- CreateIndex
CREATE INDEX "advance_payments_customer_id_idx" ON "advance_payments"("customer_id");

-- CreateIndex
CREATE INDEX "advance_payments_supplier_id_idx" ON "advance_payments"("supplier_id");

-- CreateIndex
CREATE INDEX "advance_payments_contract_id_idx" ON "advance_payments"("contract_id");

-- CreateIndex
CREATE INDEX "advance_payments_date_idx" ON "advance_payments"("date");

-- CreateIndex
CREATE INDEX "advance_payments_type_status_idx" ON "advance_payments"("type", "status");

-- CreateIndex
CREATE INDEX "advance_applications_invoice_id_idx" ON "advance_applications"("invoice_id");

-- CreateIndex
CREATE INDEX "advance_applications_purchase_id_idx" ON "advance_applications"("purchase_id");

-- CreateIndex
CREATE INDEX "advance_applications_date_idx" ON "advance_applications"("date");

-- CreateIndex
CREATE UNIQUE INDEX "advance_applications_advance_id_invoice_id_key" ON "advance_applications"("advance_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "advance_applications_advance_id_purchase_id_key" ON "advance_applications"("advance_id", "purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_return_no_key" ON "sales_returns"("return_no");

-- CreateIndex
CREATE INDEX "sales_returns_invoice_id_idx" ON "sales_returns"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_returns_customer_id_idx" ON "sales_returns"("customer_id");

-- CreateIndex
CREATE INDEX "sales_returns_date_idx" ON "sales_returns"("date");

-- CreateIndex
CREATE INDEX "sales_returns_status_idx" ON "sales_returns"("status");

-- CreateIndex
CREATE INDEX "sales_return_items_sales_return_id_idx" ON "sales_return_items"("sales_return_id");

-- CreateIndex
CREATE INDEX "sales_return_items_invoice_item_id_idx" ON "sales_return_items"("invoice_item_id");

-- CreateIndex
CREATE INDEX "sales_return_items_item_id_idx" ON "sales_return_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_return_no_key" ON "purchase_returns"("return_no");

-- CreateIndex
CREATE INDEX "purchase_returns_purchase_id_idx" ON "purchase_returns"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_returns_supplier_id_idx" ON "purchase_returns"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_returns_date_idx" ON "purchase_returns"("date");

-- CreateIndex
CREATE INDEX "purchase_returns_status_idx" ON "purchase_returns"("status");

-- CreateIndex
CREATE INDEX "purchase_return_items_purchase_return_id_idx" ON "purchase_return_items"("purchase_return_id");

-- CreateIndex
CREATE INDEX "purchase_return_items_item_id_idx" ON "purchase_return_items"("item_id");

-- CreateIndex
CREATE INDEX "cash_movements_statement_id_idx" ON "cash_movements"("statement_id");

-- CreateIndex
CREATE INDEX "cash_movements_reconciled_idx" ON "cash_movements"("reconciled");

-- CreateIndex
CREATE INDEX "cash_movements_cost_center_id_idx" ON "cash_movements"("cost_center_id");

-- CreateIndex
CREATE INDEX "cash_movements_date_idx" ON "cash_movements"("date");

-- CreateIndex
CREATE INDEX "currency_conversions_date_idx" ON "currency_conversions"("date");

-- CreateIndex
CREATE INDEX "exchange_rates_rate_date_idx" ON "exchange_rates"("rate_date");

-- CreateIndex
CREATE INDEX "exchange_rates_currency_idx" ON "exchange_rates"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_rate_date_key" ON "exchange_rates"("currency", "rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

-- CreateIndex
CREATE INDEX "accounts_parent_id_idx" ON "accounts"("parent_id");

-- CreateIndex
CREATE INDEX "accounts_type_idx" ON "accounts"("type");

-- CreateIndex
CREATE INDEX "account_mappings_account_id_idx" ON "account_mappings"("account_id");

-- CreateIndex
CREATE INDEX "account_mappings_key_idx" ON "account_mappings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "account_mappings_key_currency_key" ON "account_mappings"("key", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

-- CreateIndex
CREATE INDEX "cost_centers_parent_id_idx" ON "cost_centers"("parent_id");

-- CreateIndex
CREATE INDEX "cost_centers_is_active_idx" ON "cost_centers"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "journals_number_key" ON "journals"("number");

-- CreateIndex
CREATE INDEX "journals_date_idx" ON "journals"("date");

-- CreateIndex
CREATE INDEX "journals_type_idx" ON "journals"("type");

-- CreateIndex
CREATE INDEX "journals_source_type_source_id_idx" ON "journals"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "journals_cost_center_id_idx" ON "journals"("cost_center_id");

-- CreateIndex
CREATE INDEX "journals_reversal_of_id_idx" ON "journals"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_lines_journal_id_idx" ON "journal_lines"("journal_id");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

-- CreateIndex
CREATE INDEX "journal_lines_cost_center_id_idx" ON "journal_lines"("cost_center_id");

-- CreateIndex
CREATE INDEX "year_closes_closed_by_id_idx" ON "year_closes"("closed_by_id");

-- CreateIndex
CREATE INDEX "year_closes_reversed_by_id_idx" ON "year_closes"("reversed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "year_closes_year_key" ON "year_closes"("year");

-- CreateIndex
CREATE INDEX "fx_revaluations_year_month_idx" ON "fx_revaluations"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "fx_revaluations_year_month_currency_key" ON "fx_revaluations"("year", "month", "currency");

-- CreateIndex
CREATE INDEX "periods_status_idx" ON "periods"("status");

-- CreateIndex
CREATE INDEX "periods_closed_by_id_idx" ON "periods"("closed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "periods_year_month_key" ON "periods"("year", "month");

-- CreateIndex
CREATE INDEX "documents_contract_id_idx" ON "documents"("contract_id");

-- CreateIndex
CREATE INDEX "bank_statements_status_idx" ON "bank_statements"("status");

-- CreateIndex
CREATE INDEX "bank_statements_period_start_idx" ON "bank_statements"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statements_cash_type_currency_period_start_period_end_key" ON "bank_statements"("cash_type", "currency", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_cash_movement_id_key" ON "bank_statement_lines"("cash_movement_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_statement_id_idx" ON "bank_statement_lines"("statement_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_date_idx" ON "bank_statement_lines"("date");

-- CreateIndex
CREATE INDEX "bank_statement_lines_matched_idx" ON "bank_statement_lines"("matched");

-- CreateIndex
CREATE INDEX "company_settings_is_setup_idx" ON "company_settings"("is_setup");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_categories_name_key" ON "fixed_asset_categories"("name");

-- CreateIndex
CREATE INDEX "fixed_asset_categories_is_active_idx" ON "fixed_asset_categories"("is_active");

-- CreateIndex
CREATE INDEX "fixed_asset_categories_asset_account_id_idx" ON "fixed_asset_categories"("asset_account_id");

-- CreateIndex
CREATE INDEX "fixed_asset_categories_accumulated_account_id_idx" ON "fixed_asset_categories"("accumulated_account_id");

-- CreateIndex
CREATE INDEX "fixed_asset_categories_expense_account_id_idx" ON "fixed_asset_categories"("expense_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_asset_no_key" ON "fixed_assets"("asset_no");

-- CreateIndex
CREATE INDEX "fixed_assets_category_id_idx" ON "fixed_assets"("category_id");

-- CreateIndex
CREATE INDEX "fixed_assets_status_idx" ON "fixed_assets"("status");

-- CreateIndex
CREATE INDEX "fixed_assets_acquisition_date_idx" ON "fixed_assets"("acquisition_date");

-- CreateIndex
CREATE INDEX "fixed_assets_asset_account_id_idx" ON "fixed_assets"("asset_account_id");

-- CreateIndex
CREATE INDEX "fixed_assets_accumulated_account_id_idx" ON "fixed_assets"("accumulated_account_id");

-- CreateIndex
CREATE INDEX "fixed_assets_expense_account_id_idx" ON "fixed_assets"("expense_account_id");

-- CreateIndex
CREATE INDEX "fixed_asset_depreciations_asset_id_idx" ON "fixed_asset_depreciations"("asset_id");

-- CreateIndex
CREATE INDEX "fixed_asset_depreciations_year_month_idx" ON "fixed_asset_depreciations"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_depreciations_asset_id_year_month_key" ON "fixed_asset_depreciations"("asset_id", "year", "month");

-- CreateIndex
CREATE INDEX "fixed_asset_location_histories_asset_id_idx" ON "fixed_asset_location_histories"("asset_id");

-- CreateIndex
CREATE INDEX "fixed_asset_location_histories_date_idx" ON "fixed_asset_location_histories"("date");

-- CreateIndex
CREATE INDEX "budgets_account_id_idx" ON "budgets"("account_id");

-- CreateIndex
CREATE INDEX "budgets_year_month_idx" ON "budgets"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_account_id_year_month_key" ON "budgets"("account_id", "year", "month");

-- CreateIndex
CREATE INDEX "sales_targets_year_month_idx" ON "sales_targets"("year", "month");

-- CreateIndex
CREATE INDEX "sales_targets_customer_id_idx" ON "sales_targets"("customer_id");

-- CreateIndex
CREATE INDEX "sales_targets_item_id_idx" ON "sales_targets"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_targets_year_month_customer_id_item_id_key" ON "sales_targets"("year", "month", "customer_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_orders_no_key" ON "delivery_orders"("no");

-- CreateIndex
CREATE INDEX "delivery_orders_date_idx" ON "delivery_orders"("date");

-- CreateIndex
CREATE INDEX "delivery_orders_contract_id_idx" ON "delivery_orders"("contract_id");

-- CreateIndex
CREATE INDEX "delivery_orders_invoice_id_idx" ON "delivery_orders"("invoice_id");

-- CreateIndex
CREATE INDEX "delivery_orders_consignee_id_idx" ON "delivery_orders"("consignee_id");

-- CreateIndex
CREATE INDEX "delivery_orders_status_idx" ON "delivery_orders"("status");

-- CreateIndex
CREATE INDEX "delivery_order_items_delivery_order_id_idx" ON "delivery_order_items"("delivery_order_id");

-- CreateIndex
CREATE INDEX "delivery_order_items_item_id_idx" ON "delivery_order_items"("item_id");

-- CreateIndex
CREATE INDEX "approval_rules_document_type_idx" ON "approval_rules"("document_type");

-- CreateIndex
CREATE INDEX "approval_rules_is_active_idx" ON "approval_rules"("is_active");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "approval_requests_approver_role_idx" ON "approval_requests"("approver_role");

-- CreateIndex
CREATE INDEX "approval_requests_requested_by_id_idx" ON "approval_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "approval_requests_document_type_idx" ON "approval_requests"("document_type");

-- CreateIndex
CREATE INDEX "approval_requests_created_at_idx" ON "approval_requests"("created_at");

-- CreateIndex
CREATE INDEX "approval_requests_rule_id_idx" ON "approval_requests"("rule_id");

-- CreateIndex
CREATE INDEX "approval_requests_decided_by_id_idx" ON "approval_requests"("decided_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_source_type_document_id_key" ON "approval_requests"("source_type", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_legacy_id_key" ON "audit_logs"("legacy_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "tax_rates_effective_from_idx" ON "tax_rates"("effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_effective_from_key" ON "tax_rates"("effective_from");

-- CreateIndex
CREATE INDEX "recurring_templates_is_active_idx" ON "recurring_templates"("is_active");

-- CreateIndex
CREATE INDEX "recurring_templates_kind_idx" ON "recurring_templates"("kind");

-- CreateIndex
CREATE INDEX "recurring_templates_source_id_idx" ON "recurring_templates"("source_id");

-- CreateIndex
CREATE INDEX "recurring_occurrences_status_idx" ON "recurring_occurrences"("status");

-- CreateIndex
CREATE INDEX "recurring_occurrences_document_id_idx" ON "recurring_occurrences"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_occurrences_template_id_occurrence_date_key" ON "recurring_occurrences"("template_id", "occurrence_date");

-- CreateIndex
CREATE UNIQUE INDEX "bills_of_material_code_key" ON "bills_of_material"("code");

-- CreateIndex
CREATE INDEX "bills_of_material_output_item_id_idx" ON "bills_of_material"("output_item_id");

-- CreateIndex
CREATE INDEX "bills_of_material_is_active_idx" ON "bills_of_material"("is_active");

-- CreateIndex
CREATE INDEX "bom_components_bom_id_idx" ON "bom_components"("bom_id");

-- CreateIndex
CREATE INDEX "bom_components_item_id_idx" ON "bom_components"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_centers_code_key" ON "work_centers"("code");

-- CreateIndex
CREATE INDEX "work_centers_is_active_idx" ON "work_centers"("is_active");

-- CreateIndex
CREATE INDEX "bom_operations_work_center_id_idx" ON "bom_operations"("work_center_id");

-- CreateIndex
CREATE UNIQUE INDEX "bom_operations_bom_id_sequence_key" ON "bom_operations"("bom_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_order_no_key" ON "production_orders"("order_no");

-- CreateIndex
CREATE INDEX "production_orders_bom_id_idx" ON "production_orders"("bom_id");

-- CreateIndex
CREATE INDEX "production_orders_output_item_id_idx" ON "production_orders"("output_item_id");

-- CreateIndex
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");

-- CreateIndex
CREATE INDEX "production_orders_date_idx" ON "production_orders"("date");

-- CreateIndex
CREATE INDEX "production_orders_cost_center_id_idx" ON "production_orders"("cost_center_id");

-- CreateIndex
CREATE INDEX "production_order_components_production_order_id_idx" ON "production_order_components"("production_order_id");

-- CreateIndex
CREATE INDEX "production_order_components_item_id_idx" ON "production_order_components"("item_id");

-- CreateIndex
CREATE INDEX "production_order_operations_work_center_id_idx" ON "production_order_operations"("work_center_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_order_operations_production_order_id_sequence_key" ON "production_order_operations"("production_order_id", "sequence");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_consignee_id_fkey" FOREIGN KEY ("consignee_id") REFERENCES "consignees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_sends" ADD CONSTRAINT "invoice_sends_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_documents" ADD CONSTRAINT "landed_cost_documents_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "supplier_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_items" ADD CONSTRAINT "landed_cost_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "landed_cost_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_items" ADD CONSTRAINT "landed_cost_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_items" ADD CONSTRAINT "landed_cost_items_receipt_movement_id_fkey" FOREIGN KEY ("receipt_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_items" ADD CONSTRAINT "landed_cost_items_adjustment_movement_id_fkey" FOREIGN KEY ("adjustment_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "supplier_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_payments" ADD CONSTRAINT "advance_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_payments" ADD CONSTRAINT "advance_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_payments" ADD CONSTRAINT "advance_payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_applications" ADD CONSTRAINT "advance_applications_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "advance_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_applications" ADD CONSTRAINT "advance_applications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_applications" ADD CONSTRAINT "advance_applications_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "supplier_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "supplier_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "fixed_asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_depreciations" ADD CONSTRAINT "fixed_asset_depreciations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_location_histories" ADD CONSTRAINT "fixed_asset_location_histories_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_consignee_id_fkey" FOREIGN KEY ("consignee_id") REFERENCES "consignees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "recurring_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_material" ADD CONSTRAINT "bills_of_material_output_item_id_fkey" FOREIGN KEY ("output_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bills_of_material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bills_of_material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_work_center_id_fkey" FOREIGN KEY ("work_center_id") REFERENCES "work_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bills_of_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_output_item_id_fkey" FOREIGN KEY ("output_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_components" ADD CONSTRAINT "production_order_components_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_components" ADD CONSTRAINT "production_order_components_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_operations" ADD CONSTRAINT "production_order_operations_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_operations" ADD CONSTRAINT "production_order_operations_work_center_id_fkey" FOREIGN KEY ("work_center_id") REFERENCES "work_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

