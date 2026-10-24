/**
 * `bun run demo:seed -- --tenant <slug>` · `bun run demo:reset -- --tenant <slug> --confirm <slug>`
 *
 * Mengisi TENANT DEMO (alur demo-first, keputusan pemilik 24 Okt 2026) dengan
 * data contoh Indonesia yang realistis: TIGA PT satu grup, masing-masing satu
 * BULAN penuh transaksi — faktur penjualan ber-PPN, pembelian, pelunasan dan
 * pembayaran, mutasi stok (masuk & keluar dengan HPP), beban kas, dan satu
 * jurnal umum — supaya laporan KONSOLIDASI terisi dan ekspor XML e-Faktur
 * Coretax langsung bisa diunduh di depan prospek.
 *
 * ══ PAGAR ═══════════════════════════════════════════════════════════════════
 * Skrip ini menulis ke buku PT, dan `--reset` MENGOSONGKANNYA. Karena itu:
 *
 *   • Tenant WAJIB disebut (`--tenant`) dan WAJIB bertanda `tenants.is_demo`
 *     (migration kendali 0013) — bendera yang hanya dinyalakan operator saat
 *     membuat tenant demo di konsol. Tenant lain DITOLAK, apa pun isinya
 *     (`demoSeedRefusal`, `@sai/core/demo-tenant`).
 *   • Hanya PT milik tenant itu yang disentuh, dan hanya tiga slug tetap di
 *     `DEMO_COMPANIES`. PT lain di tenant yang sama dibiarkan.
 *   • `demo:seed` MENOLAK PT yang bukunya sudah berisi transaksi (`bookActivity`)
 *     — jalankan `demo:reset` untuk mengisi ulang.
 *   • `demo:reset` menuntut `--confirm <slug-tenant>` diketik ulang. Ia
 *     MENGOSONGKAN setiap tabel buku ketiga PT (kecuali riwayat migration),
 *     menyiapkan ulang bagan akun & saldo awal, lalu mengisi ulang. Tidak ada
 *     `--force`, tidak ada mode semua-tenant.
 *
 * Satu tenant demo per mitra bisa berdampingan: nama basis data PT
 * `sai_t{tenantId}_{slug}` memuat id tenant, jadi slug PT yang sama di dua
 * tenant tidak pernah bertabrakan.
 *
 * ══ MENEMPUH MESIN YANG SAMA DENGAN FORMULIR ═══════════════════════════════
 * Penyediaan PT lewat `scripts/create-company.ts` (dijalankan sebagai proses
 * anak, persis seperti operator menjalankannya); bagan akun lewat
 * `seedCoaForModules`, saldo awal lewat `applyOpeningBalances` (wisaya
 * penyiapan); faktur lewat `createInvoiceInTx`; semua posting lewat
 * `postForSource`/`postJournal`. Neraca Saldo karena itu seimbang, HPP lahir
 * dari rata-rata tertimbang, dan PPN Keluaran mendarat di akunnya — kalau mesin
 * posting berubah, demo ini ikut berubah.
 *
 * DETERMINISTIK: tanpa `Math.random()`. Tanggalnya bulan penuh sebelum
 * `--today` (bawaan: hari ini), polanya sama setiap kali.
 *
 * Dijalankan dengan `--conditions=react-server` (lihat `package.json`): modul
 * bersama di `src/lib` yang ber-`server-only` termuat sebagai modul kosong,
 * sama seperti skrip paritas. Skrip/cron tidak lahir dari permintaan HTTP, jadi
 * setiap pekerjaan buku dibungkus `runWithCompany()` (doktrin #104).
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";

import { controlDb } from "@sai/core/control-db";
import { ROLES } from "@sai/core/constants";
import { DEFAULT_TAX_RATE } from "@sai/core/tax";
import { businessISODate } from "@sai/core/business-date";
import {
  DEMO_COMPANIES,
  DEMO_TAG,
  demoDate,
  demoFiscalYearStart,
  demoSeedRefusal,
  type DemoCompanyProfile,
} from "@sai/core/demo-tenant";
import { COMPANY_DATABASE_TARGET_SELECT } from "@sai/db/company-url";
import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { prisma } from "../src/lib/prisma";
import { postForSource } from "../src/lib/posting";
import { MAPPING_KEYS, resolveAccountId } from "../src/lib/posting/mapping";
import { postJournal } from "../src/lib/ledger";
import { seedCoaForModules } from "../src/lib/coa-seeding";
import { applyOpeningBalances } from "../src/lib/opening-balance";
import { bookActivity } from "../src/lib/demo-seed";
import { allocateByShare } from "../src/lib/partners";
import { equityModelFor } from "@sai/core/legal-form";
import { createInvoiceInTx } from "../src/lib/document-writes";
import { invoiceSchema } from "../src/lib/validations/invoice";
import {
  BUSINESS_MODULES,
  normalizeEnabledModules,
  serializeEnabledModules,
} from "../src/lib/business-modules";

interface Args {
  tenant: string | null;
  reset: boolean;
  confirm: string | null;
  today: Date;
}

function argValue(argv: string[], name: string): string | null {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return null;
}

function parseArgs(argv: string[]): Args {
  const todayArg = argValue(argv, "today");
  const today = todayArg ? new Date(`${todayArg}T12:00:00+07:00`) : new Date();
  if (Number.isNaN(today.getTime())) throw new Error(`--today bukan tanggal yang sah: ${todayArg}`);
  return {
    tenant: argValue(argv, "tenant"),
    reset: argv.includes("--reset"),
    confirm: argValue(argv, "confirm"),
    today,
  };
}

const REFUSAL_TEXT: Record<string, string> = {
  not_found: "Tenant itu tidak ada di basis data kendali.",
  not_demo:
    "Tenant itu BUKAN tenant demo (tenants.is_demo = false). Skrip berhenti — buku tenant " +
    "sungguhan tidak pernah diisi atau dikosongkan. Buat tenant demo lewat konsol operator " +
    '(/tenants/new, centang "Tenant DEMO").',
  inactive: "Tenant demo itu tidak berstatus trialing/active (dihapus, berhenti, atau pindah).",
  confirm_mismatch:
    "demo:reset MENGOSONGKAN buku ketiga PT contoh. Ulangi dengan --confirm <slug-tenant> " +
    "yang diketik persis sama.",
};

/** Lahirkan PT contoh yang belum ada — lewat skrip operator yang sudah teruji. */
function provisionCompany(tenantSlug: string, profile: DemoCompanyProfile): void {
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/create-company.ts",
      "--slug",
      profile.slug,
      "--name",
      profile.name,
      "--tenant",
      tenantSlug,
      "--bentuk-usaha",
      profile.legalForm ?? "pt",
    ],
    { stdio: "inherit", env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(`Penyediaan PT "${profile.slug}" gagal (create-company keluar ${result.status}).`);
  }
}

/**
 * Kosongkan SELURUH buku satu PT — hanya dipanggil `--reset`, hanya untuk PT
 * tenant demo, sesudah `demoSeedRefusal` lolos (termasuk ketik-ulang slug).
 * Riwayat migration (`_prisma_migrations`) dipertahankan: skemanya tetap,
 * isinya kembali nol.
 */
async function truncateBook(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return 0;
  const list = rows.map((r) => `"${r.tablename.replace(/"/g, '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  return rows.length;
}

/** Wisaya penyiapan versi skrip: bagan akun + profil pajak + saldo awal. */
async function setupBook(profile: DemoCompanyProfile, today: Date): Promise<void> {
  const modules = normalizeEnabledModules(BUSINESS_MODULES.filter((m) => m !== "manufacturing"));
  /* Templat ekuitas menurut bentuk usaha profil — CV contoh mendapat modal &
     prive per sekutu, persis seperti wisaya. */
  await seedCoaForModules(prisma, modules, {
    legalForm: profile.legalForm ?? "pt",
    partners: profile.partners ?? [],
  });

  const bank = await prisma.account.findFirst({
    where: { type: "cash_bank", isActive: true },
    orderBy: { code: "asc" },
    select: { id: true },
  });
  if (!bank) throw new Error("Bagan akun tidak memuat akun kas/bank — template COA berubah?");

  const items: { id: number; name: string }[] = [];
  for (const it of profile.items) {
    items.push(
      await prisma.item.create({ data: { code: it.code, name: `${DEMO_TAG} ${it.name}`, unit: it.unit } })
    );
  }

  await applyOpeningBalances({
    company: {
      name: profile.name,
      address: profile.address,
      baseCurrency: "IDR",
      fiscalYearStart: demoFiscalYearStart(today),
      npwp: profile.npwp,
      isPkp: true,
      taxName: profile.name,
      taxAddress: profile.address,
      businessCategory: "trading",
      enabledModules: serializeEnabledModules(modules),
    },
    cash: [{ accountId: bank.id, currency: "IDR", amount: 350_000_000, rate: 1 }],
    receivables: [],
    payables: [],
    inventory: profile.items.map((it, i) => ({
      itemId: items[i].id,
      itemName: items[i].name,
      quantity: it.openingQty,
      unitCost: it.unitCost,
    })),
    fixedAssets: [],
  });

  /* NITKU penjual tidak ditanyakan wisaya — diisi langsung supaya ekspor
     Coretax tidak menandai penjualnya sebagai masalah. */
  await prisma.companySetting.updateMany({ data: { nitku: profile.nitku } });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Satu bulan transaksi — pola tetap, angkanya dari profil PT. */
async function seedMonth(profile: DemoCompanyProfile, today: Date): Promise<string[]> {
  const log: string[] = [];
  const items = await prisma.item.findMany({ orderBy: { id: "asc" } });
  const byCode = new Map(items.map((i) => [i.code, i]));

  const customers: { id: number }[] = [];
  for (const c of profile.customers) {
    customers.push(
      await prisma.customer.create({
        data: { name: `${DEMO_TAG} ${c.name}`, address: c.address, phone: c.phone, npwp: c.npwp, nitku: c.nitku },
      })
    );
  }
  const suppliers: { id: number }[] = [];
  for (const s of profile.suppliers) {
    suppliers.push(
      await prisma.supplier.create({ data: { name: `${DEMO_TAG} ${s.name}`, address: s.address, phone: s.phone } })
    );
  }
  log.push(`${customers.length} pelanggan ber-NPWP, ${suppliers.length} pemasok`);

  /* ── Pembelian barang (PPN Masukan) + barang masuk gudang ──────────────── */
  const purchases = [
    { day: 3, supplier: 0, item: 0, qty: 150 },
    { day: 8, supplier: 1, item: 1, qty: 200 },
    { day: 14, supplier: 0, item: 2, qty: 300 },
    { day: 22, supplier: 1, item: 0, qty: 120 },
  ];
  const purchaseIds: { id: number; supplier: number; total: number }[] = [];
  for (const p of purchases) {
    const prof = profile.items[p.item];
    const item = byCode.get(prof.code)!;
    const date = demoDate(today, p.day);
    const dpp = round2(prof.unitCost * p.qty);
    const tax = round2((dpp * DEFAULT_TAX_RATE) / 100);
    const trx = await prisma.supplierTransaction.create({
      data: {
        supplierId: suppliers[p.supplier].id,
        date,
        dueDate: demoDate(today, p.day + 30),
        type: "purchase",
        amount: dpp,
        taxAmount: tax,
        currency: "IDR",
        rate: 1,
        baseAmount: round2(dpp + tax),
        note: `${DEMO_TAG} Pembelian ${prof.name} ${p.qty} ${prof.unit}`,
      },
    });
    await postForSource({ sourceType: "supplier_transaction", sourceId: trx.id });
    const movement = await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        quantity: p.qty,
        type: "in",
        date,
        unitCost: prof.unitCost,
        note: `${DEMO_TAG} Barang masuk dari pembelian`,
        supplierId: suppliers[p.supplier].id,
      },
    });
    await postForSource({ sourceType: "stock_movement", sourceId: movement.id });
    purchaseIds.push({ id: trx.id, supplier: p.supplier, total: round2(dpp + tax) });
  }
  log.push(`${purchases.length} pembelian ber-PPN + ${purchases.length} barang masuk`);

  /* ── Penjualan ber-PPN (faktur) + barang keluar (HPP) + pelunasan ──────── */
  const sales = [
    { day: 5, customer: 0, lines: [[0, 60], [2, 120]], paidAfter: 10 },
    { day: 9, customer: 1, lines: [[1, 90]], paidAfter: 14 },
    { day: 13, customer: 2, lines: [[0, 40], [1, 50]], paidAfter: 7 },
    { day: 18, customer: 0, lines: [[2, 200]], paidAfter: 9 },
    { day: 24, customer: 1, lines: [[0, 70], [1, 40], [2, 100]], paidAfter: null },
    { day: 27, customer: 2, lines: [[1, 120]], paidAfter: null },
  ] as const;
  const { year, month } = (() => {
    const d = demoDate(today, 1);
    return { year: businessISODate(d).slice(0, 4), month: businessISODate(d).slice(5, 7) };
  })();
  let seq = 0;
  let paid = 0;
  for (const sale of sales) {
    seq += 1;
    const date = demoDate(today, sale.day);
    const input = invoiceSchema.parse({
      invoiceNo: `DEMO/${profile.code}/${year}${month}/${String(seq).padStart(3, "0")}`,
      date: date.toISOString(),
      dueDate: demoDate(today, sale.day + 30).toISOString(),
      status: "signed",
      customerId: customers[sale.customer].id,
      currency: "IDR",
      taxable: true,
      taxRate: DEFAULT_TAX_RATE,
      items: sale.lines.map(([idx, qty]) => {
        const prof = profile.items[idx];
        return {
          itemId: byCode.get(prof.code)!.id,
          itemName: prof.name,
          quantity: qty,
          price: prof.price,
          unit: prof.unit,
        };
      }),
    });
    const { invoice, total } = await prisma.$transaction(
      (tx) => createInvoiceInTx(tx, input, { requestedById: 0 }),
      { timeout: 30_000 }
    );
    for (const [idx, qty] of sale.lines) {
      const movement = await prisma.stockMovement.create({
        data: {
          itemId: byCode.get(profile.items[idx].code)!.id,
          quantity: qty,
          type: "out",
          date,
          note: `${DEMO_TAG} Barang keluar — ${invoice.invoiceNo}`,
        },
      });
      await postForSource({ sourceType: "stock_movement", sourceId: movement.id });
    }
    if (sale.paidAfter !== null) {
      const payment = await prisma.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          date: demoDate(today, sale.day + sale.paidAfter),
          amount: total,
          currency: "IDR",
          rate: 1,
          baseAmount: total,
          note: `${DEMO_TAG} Pelunasan transfer bank`,
        },
      });
      await postForSource({ sourceType: "invoice_payment", sourceId: payment.id });
      paid += 1;
    }
  }
  log.push(`${sales.length} faktur penjualan ber-PPN (${paid} lunas, ${sales.length - paid} masih piutang) + barang keluar ber-HPP`);

  /* ── Pembayaran ke pemasok (dua pembelian pertama) ─────────────────────── */
  for (const [i, p] of purchaseIds.slice(0, 2).entries()) {
    const pay = await prisma.supplierTransaction.create({
      data: {
        supplierId: suppliers[p.supplier].id,
        date: demoDate(today, 20 + i * 5),
        type: "payment",
        cashType: "bank",
        amount: p.total,
        taxAmount: 0,
        currency: "IDR",
        rate: 1,
        baseAmount: p.total,
        note: `${DEMO_TAG} Pembayaran pembelian #${p.id}`,
      },
    });
    await postForSource({ sourceType: "supplier_transaction", sourceId: pay.id });
  }
  log.push("2 pembayaran ke pemasok");

  /* ── Beban operasional dari bank ───────────────────────────────────────── */
  const expenseAccountId = await resolveAccountId(MAPPING_KEYS.PURCHASE_EXPENSE, "IDR", prisma);
  const expenses = [
    { day: 1, description: "Sewa gudang", amount: 12_500_000 },
    { day: 25, description: "Gaji karyawan", amount: 38_000_000 },
    { day: 12, description: "Listrik, air & internet", amount: 4_750_000 },
    { day: 16, description: "Transportasi & BBM armada", amount: 6_200_000 },
  ];
  for (const e of expenses) {
    const movement = await prisma.cashMovement.create({
      data: {
        type: "bank",
        date: demoDate(today, e.day),
        description: `${DEMO_TAG} ${e.description}`,
        currency: "IDR",
        debit: 0,
        credit: e.amount,
        rate: 1,
        baseAmount: e.amount,
      },
    });
    await postForSource({ sourceType: "cash_movement", sourceId: movement.id, counterAccountId: expenseAccountId });
  }
  log.push(`${expenses.length} beban operasional`);

  /* ── Jurnal umum: pengisian kas kecil dari bank ────────────────────────── */
  const [bankId, pettyId] = await Promise.all([
    resolveAccountId(MAPPING_KEYS.CASH_BANK, "IDR", prisma).catch(() => null),
    resolveAccountId(MAPPING_KEYS.CASH_KAS_KECIL, "IDR", prisma).catch(() => null),
  ]);
  if (bankId && pettyId && bankId !== pettyId) {
    await postJournal({
      date: demoDate(today, 2),
      type: "general",
      note: `${DEMO_TAG} Pengisian kas kecil dari rekening bank`,
      lines: [
        { accountId: pettyId, debit: 5_000_000, currency: "IDR", rate: 1, memo: "Kas kecil" },
        { accountId: bankId, credit: 5_000_000, currency: "IDR", rate: 1, memo: "Bank" },
      ],
    });
    log.push("1 jurnal umum (pengisian kas kecil)");
  } else {
    log.push("jurnal umum dilewati — pemetaan kas kecil/bank tidak terpisah di bagan akun ini");
  }
  return log;
}

/**
 * CV/Firma contoh: modal per sekutu dan satu prive, supaya Laporan Perubahan
 * Ekuitas menampilkan "Rincian Modal per Pemilik" dan tangkapan layar panduan
 * punya isinya.
 *
 * Saldo awal wisaya mendarat di 3101 "Modal Belum Dibagi" (aplikasi tidak tahu
 * bagian tiap sekutu dalam modal awal). Di buku sungguhan pembagiannya dicatat
 * pemilik dengan jurnal umum — persis yang dilakukan di sini, menurut porsi
 * profil, bertanggal sama dengan saldo awal. Lalu sekutu pertama menarik prive
 * dari bank di bulan contoh.
 */
async function seedPartnerEquity(profile: DemoCompanyProfile, today: Date): Promise<string[]> {
  if (equityModelFor(profile.legalForm ?? "pt") !== "partners") return [];
  const [undivided, partners] = await Promise.all([
    prisma.account.findUnique({ where: { code: "3101" }, select: { id: true } }),
    prisma.companyPartner.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
  ]);
  if (!undivided || partners.length === 0) return ["modal per sekutu dilewati — 3101 atau daftar sekutu tidak ada"];

  const sum = await prisma.journalLine.aggregate({
    where: { accountId: undivided.id },
    _sum: { baseDebit: true, baseCredit: true },
  });
  const balanceCents = Math.round(
    (Number(sum._sum.baseCredit ?? 0) - Number(sum._sum.baseDebit ?? 0)) * 100
  );
  const log: string[] = [];
  if (balanceCents > 0) {
    const shares = allocateByShare(
      balanceCents,
      partners.map((p) => ({ key: p.id, shareBp: p.shareBp, sortOrder: p.sortOrder }))
    );
    await postJournal({
      date: demoFiscalYearStart(today),
      type: "general",
      note: `${DEMO_TAG} Pembagian Modal Belum Dibagi ke modal sekutu sesuai akta`,
      lines: [
        { accountId: undivided.id, debit: balanceCents / 100, currency: "IDR", rate: 1, memo: "Modal Belum Dibagi" },
        ...shares.map((s) => {
          const p = partners.find((x) => x.id === s.key)!;
          return { accountId: p.capitalAccountId, credit: s.cents / 100, currency: "IDR", rate: 1, memo: `Modal ${p.name}` };
        }),
      ],
    });
    log.push(`modal awal dibagi ke ${partners.length} sekutu`);
  }

  const bankId = await resolveAccountId(MAPPING_KEYS.CASH_BANK, "IDR", prisma).catch(() => null);
  const first = partners[0]!;
  if (bankId && first.drawingAccountId) {
    await postJournal({
      date: demoDate(today, 26),
      type: "general",
      note: `${DEMO_TAG} Prive ${first.name} — penarikan pribadi lewat transfer bank`,
      lines: [
        { accountId: first.drawingAccountId, debit: 7_500_000, currency: "IDR", rate: 1, memo: `Prive ${first.name}` },
        { accountId: bankId, credit: 7_500_000, currency: "IDR", rate: 1, memo: "Bank" },
      ],
    });
    log.push(`1 prive sekutu (${first.name})`);
  }
  return log;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenant) {
    throw new Error(
      "Sebutkan tenant demonya: bun run demo:seed -- --tenant <slug>\n" +
        "Tidak ada nilai bawaan dan tidak ada mode semua-tenant."
    );
  }

  const tenant = await controlDb.tenant.findUnique({
    where: { slug: args.tenant },
    select: { id: true, slug: true, name: true, status: true, isDemo: true },
  });
  const refusal = demoSeedRefusal(tenant, { reset: args.reset, confirm: args.confirm });
  if (refusal || !tenant) throw new Error(REFUSAL_TEXT[refusal ?? "not_found"]);

  console.log(`\nTenant demo: ${tenant.name} (${tenant.slug})${args.reset ? " — MODE RESET" : ""}`);
  console.log(`Bulan contoh: ${businessISODate(demoDate(args.today, 1)).slice(0, 7)}\n`);

  const owners = await controlDb.tenantMembership.findMany({
    where: { tenantId: tenant.id, role: "owner" },
    select: { userId: true },
  });

  for (const profile of DEMO_COMPANIES) {
    let company = await controlDb.company.findFirst({
      where: { tenantId: tenant.id, slug: profile.slug },
      select: { id: true, slug: true, name: true, isActive: true, ...COMPANY_DATABASE_TARGET_SELECT },
    });
    if (!company) {
      console.log(`• ${profile.name}: menyediakan PT baru`);
      provisionCompany(tenant.slug, profile);
      company = await controlDb.company.findFirst({
        where: { tenantId: tenant.id, slug: profile.slug },
        select: { id: true, slug: true, name: true, isActive: true, ...COMPANY_DATABASE_TARGET_SELECT },
      });
      if (!company) throw new Error(`PT "${profile.slug}" tidak terdaftar sesudah penyediaan.`);
    }
    if (!company.isActive) throw new Error(`PT "${profile.slug}" nonaktif — skrip berhenti.`);
    /* PT contoh yang lahir sebelum profilnya punya bentuk usaha: registry
       diselaraskan dengan profil (tenant DEMO saja — `demoSeedRefusal` sudah
       menolak tenant lain di atas). Bukunya mengikuti saat `--reset`. */
    await controlDb.company.update({
      where: { id: company.id },
      data: { legalForm: profile.legalForm ?? "pt", name: profile.name },
    });

    /* Owner tenant menjadi anggota setiap PT contoh (Direktur Utama), supaya
       demo bisa dibuka dari akun yang sama. */
    for (const o of owners) {
      await controlDb.membership.upsert({
        where: { userId_companyId: { userId: o.userId, companyId: company.id } },
        create: { userId: o.userId, companyId: company.id, role: ROLES.MANAGING_DIRECTOR },
        update: { isActive: true },
      });
    }

    const lines = await runWithCompany(companyContextOf(company), async () => {
      if (args.reset) {
        const n = await truncateBook();
        console.log(`  ✓ ${profile.name}: ${n} tabel dikosongkan`);
      } else {
        const used = await bookActivity();
        if (used.total > 0) {
          throw new Error(
            `${profile.name} sudah berisi transaksi (${used.total}). demo:seed tidak menimpa — ` +
              `jalankan bun run demo:reset -- --tenant ${tenant.slug} --confirm ${tenant.slug}.`
          );
        }
      }
      const settings = await prisma.companySetting.findFirst({ select: { isSetup: true } });
      if (!settings?.isSetup) await setupBook(profile, args.today);
      const month = await seedMonth(profile, args.today);
      return [...month, ...(await seedPartnerEquity(profile, args.today))];
    });
    console.log(`  ✓ ${profile.name}`);
    for (const l of lines) console.log(`      – ${l}`);
  }

  console.log(
    "\nSelesai. Buka aplikasi dengan akun owner tenant ini: tiga PT contoh siap untuk laporan\n" +
      "konsolidasi, dan menu Pajak → e-Faktur → Coretax memuat faktur bulan contoh.\n" +
      `Setiap baris contoh diberi awalan "${DEMO_TAG}". Cache aplikasi kedaluwarsa sendiri ±60 detik.\n`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
