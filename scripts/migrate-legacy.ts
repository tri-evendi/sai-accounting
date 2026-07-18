/**
 * Legacy data migration (ETL).
 *
 * Reads the OLD app's tables from a staging database (default: `sai_legacy`)
 * and loads them into the NEW Prisma schema. Users are intentionally NOT
 * migrated (old passwords are MD5, incompatible with bcrypt).
 *
 * Prerequisites:
 *   1. New schema already migrated into DATABASE_URL's database.
 *   2. Legacy dump imported into LEGACY_DB (same MariaDB server).
 *
 * Usage:
 *   LEGACY_DB=sai_legacy npx tsx scripts/migrate-legacy.ts
 *   (add --force to wipe already-migrated target tables and re-run)
 *
 * Re-running: without --force it refuses if target tables already have data.
 * With --force it deletes all rows in the migrated tables (NOT users) first.
 */
import "dotenv/config";
import { createPool } from "mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const FORCE = process.argv.includes("--force");

// ─── helpers ─────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse the legacy text date formats into a Date, or null.
 * Rejects implausible years — the legacy app used `01-Jan-1970` as a "no date"
 * sentinel and contains typos like `09-Nov-0222`. Business started ~2018.
 */
function parseDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === "0" || s === "0000-00-00") return null;

  let d: Date | null = null;
  // DD-Mon-YYYY  e.g. 27-Jun-2019, 9-Jul-2019
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()] != null) {
    d = new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));
  }
  // YYYY-MM-DD [HH:MM:SS]
  if (!d && (m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/))) {
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  }
  // DD MM YYYY HH:MM:SS  (space separated)
  if (!d && (m = s.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/))) {
    d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  }
  if (!d) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) d = new Date(t);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1990 || y > 2100) return null; // sentinel/typo — treat as "no date"
  return d;
}

/** Clean a legacy numeric string ("14109.00 ", "1,975,260,000") to a number. */
function parseNum(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function clean(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\r?\n/g, " ").trim();
  return s === "" ? null : s;
}

function mapCurrency(raw: unknown): string {
  const s = (clean(raw) || "").toUpperCase();
  if (s === "RP" || s === "IDR" || s === "RUPIAH") return "IDR";
  if (s === "USD" || s === "$" || s === "US$") return "USD";
  return s.slice(0, 5) || "USD";
}

/** Legacy contract/invoice status → new status string. */
function mapStatus(raw: unknown): string {
  const s = (clean(raw) || "").toLowerCase();
  if (s === "-1") return "cancelled";
  if (s === "1" || s === "lunas" || s === "paid" || s === "completed") return "completed";
  return "pending";
}

const FALLBACK_DATE = new Date(Date.UTC(2000, 0, 1)); // for required dates with no source

// ─── main ────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const legacyDbName = process.env.LEGACY_DB || "sai_legacy";

  const target = new URL(process.env.DATABASE_URL);

  // Legacy reader (same MariaDB server, different database)
  const legacy = createPool({
    host: target.hostname,
    port: Number(target.port) || 3306,
    user: decodeURIComponent(target.username),
    password: decodeURIComponent(target.password),
    database: legacyDbName,
    connectionLimit: 4,
    // Return plain objects; keep big ints as numbers (values here are small).
    insertIdAsNumber: true,
    bigIntAsNumber: true,
    charset: "latin2", // dump tables are latin2; driver converts to utf8
  });

  // Target writer (Prisma)
  const adapter = new PrismaMariaDb({
    host: target.hostname,
    port: Number(target.port) || 3306,
    user: decodeURIComponent(target.username),
    password: decodeURIComponent(target.password),
    database: target.pathname.slice(1),
    connectionLimit: 4,
  });
  const prisma = new PrismaClient({ adapter });

  const q = <T = Record<string, unknown>[]>(sql: string): Promise<T> =>
    legacy.query(sql) as Promise<T>;

  const stats: Record<string, number> = {};
  const warn: string[] = [];
  const bump = (k: string, n = 1) => (stats[k] = (stats[k] || 0) + n);

  // ── guard / reset ──
  const existing =
    (await prisma.contract.count()) +
    (await prisma.customer.count()) +
    (await prisma.supplier.count()) +
    (await prisma.cashAccount.count());
  if (existing > 0 && !FORCE) {
    throw new Error(
      `Target already has ${existing} migrated rows. Re-run with --force to wipe & reload.`
    );
  }
  if (FORCE) {
    console.log("→ --force: clearing previously migrated tables (users kept)…");
    await prisma.contractPayment.deleteMany();
    await prisma.contractItem.deleteMany();
    await prisma.document.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.invoicePayment.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.supplierTransaction.deleteMany();
    await prisma.stock.deleteMany();
    await prisma.cashAccount.deleteMany();
    await prisma.currencyConversion.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.item.deleteMany();
    await prisma.customer.deleteMany();
  }

  // ── customers (tb_pelanggan) ──
  for (const r of await q("SELECT * FROM tb_pelanggan")) {
    const name = clean(r.nama_perusahaan);
    if (!name) continue;
    const address = [r.alamat, r.alamat_2, r.kota, r.provinsi, r.kode_pos]
      .map(clean).filter(Boolean).join(", ") || null;
    await prisma.customer.create({
      data: {
        name: name.slice(0, 100),
        pic: clean(r.nama_kontak)?.slice(0, 100) || null,
        address,
        phone: clean(r.telepon)?.slice(0, 30) || null,
        email: clean(r.email)?.slice(0, 100) || null,
      },
    });
    bump("customers");
  }

  // ── suppliers (tb_supplier) — preserve id for FK mapping ──
  const supplierIds = new Set<number>();
  for (const r of await q("SELECT * FROM tb_supplier")) {
    const id = Number(r.id);
    const name = clean(r.nm_supplier) || `Supplier ${id}`;
    await prisma.supplier.create({
      data: {
        id,
        name: name.slice(0, 100),
        address: clean(r.alamat),
        phone: clean(r.telepon)?.slice(0, 30) || null,
      },
    });
    supplierIds.add(id);
    bump("suppliers");
  }

  // ── items (tb_item) — dedupe by name, keep id→canonicalId map ──
  const itemIdMap = new Map<number, number>(); // legacy id → new item id
  const itemByName = new Map<string, number>();
  for (const r of await q("SELECT * FROM tb_item")) {
    const legacyId = Number(r.id);
    const name = (clean(r.description) || `Item ${legacyId}`).slice(0, 100);
    let newId = itemByName.get(name.toLowerCase());
    if (newId == null) {
      const created = await prisma.item.create({ data: { name } });
      newId = created.id;
      itemByName.set(name.toLowerCase(), newId);
      bump("items");
    }
    itemIdMap.set(legacyId, newId);
  }

  // ── stock (tb_stok) ──
  for (const r of await q("SELECT * FROM tb_stok")) {
    const itemId = itemIdMap.get(Number(r.id_item));
    const date = parseDate(r.tanggal);
    if (!itemId || !date) { bump("stock_skipped"); continue; }
    await prisma.stock.create({
      data: {
        itemId,
        quantity: parseNum(r.volume) || Number(r.bag) || 0,
        type: (clean(r.status) || "in").slice(0, 10),
        date,
        note: [clean(r.item), r.bag ? `bags=${r.bag}` : null, clean(r.shipment)]
          .filter(Boolean).join("; ") || null,
      },
    });
    bump("stock");
  }

  // ── currency_conversions (tb_konversi) ──
  for (const r of await q("SELECT * FROM tb_konversi")) {
    const date = parseDate(r.tgl_transaksi);
    if (!date) { bump("conversions_skipped"); continue; }
    await prisma.currencyConversion.create({
      data: {
        date,
        fromCur: mapCurrency(r.currency_awal),
        toCur: mapCurrency(r.currency_akhir),
        amount: parseNum(r.amount),
        rate: parseNum(r.kurs),
        result: parseNum(r.total),
      },
    });
    bump("conversions");
  }

  // ── contracts + items (tb_trans_contract, grouped by no_contract) ──
  const contractRows = await q("SELECT * FROM tb_trans_contract");
  const contractGroups = new Map<string, Record<string, unknown>[]>();
  for (const r of contractRows) {
    const no = clean(r.no_contract);
    if (!no) { bump("contract_rows_no_number"); continue; }
    (contractGroups.get(no) ?? contractGroups.set(no, []).get(no)!).push(r);
  }
  const contractIdByNo = new Map<string, number>();
  for (const [no, rows] of contractGroups) {
    const h = rows.find((x) => clean(x.buyer)) ?? rows[0]; // header-ish row
    const date =
      parseDate(h.tgl_contract) ?? parseDate(h.input_date) ?? parseDate(h.update_date);
    if (!date) warn.push(`contract ${no}: no parseable date, used fallback`);
    const created = await prisma.contract.create({
      data: {
        contractNo: no.slice(0, 50),
        date: date ?? FALLBACK_DATE,
        buyer: (clean(h.buyer) || "UNKNOWN").slice(0, 100),
        consignee: clean(h.consignee)?.slice(0, 100) || null,
        packaging: clean(h.packaging)?.slice(0, 100) || null,
        shipment: clean(h.shipment)?.slice(0, 200) || null,
        top1: clean(h.top1)?.slice(0, 200) || null,
        top2: clean(h.top2)?.slice(0, 200) || null,
        currency: mapCurrency(h.currency),
        status: mapStatus(h.status),
        items: {
          create: rows
            .filter((x) => clean(x.item))
            .map((x) => ({
              itemName: (clean(x.item) as string).slice(0, 100),
              bags: Number(x.bag) || 0,
              kgPerBag: parseNum(x.kg_bags),
              pricePerKg: parseNum(x.price_kg),
            })),
        },
      },
    });
    contractIdByNo.set(no, created.id);
    bump("contracts");
    bump("contract_items", rows.filter((x) => clean(x.item)).length);
  }

  // ── contract_payments (tb_byr_contract) ──
  for (const r of await q("SELECT * FROM tb_byr_contract")) {
    const cid = contractIdByNo.get(clean(r.no_contract) || "");
    const date = parseDate(r.tgl_byr);
    if (!cid || !date) { bump("contract_payments_skipped"); continue; }
    await prisma.contractPayment.create({
      data: {
        contractId: cid,
        date,
        amount: parseNum(r.jml_byr),
        currency: "USD",
        note: [clean(r.no_invoice), clean(r.update_by)].filter(Boolean).join(" · ") || null,
      },
    });
    bump("contract_payments");
  }

  // ── invoices + items (tb_trans_faktur, grouped by no_faktur) ──
  const fakturRows = await q("SELECT * FROM tb_trans_faktur");
  const fakturGroups = new Map<string, Record<string, unknown>[]>();
  for (const r of fakturRows) {
    const no = clean(r.no_faktur);
    if (!no) { bump("invoice_rows_no_number"); continue; }
    (fakturGroups.get(no) ?? fakturGroups.set(no, []).get(no)!).push(r);
  }
  const invoiceIdByNo = new Map<string, number>();
  for (const [no, rows] of fakturGroups) {
    const h = rows[0];
    const date = parseDate(h.tgl_faktur) ?? parseDate(h.input_date);
    const created = await prisma.invoice.create({
      data: {
        invoiceNo: no.slice(0, 50),
        date: date ?? FALLBACK_DATE,
        status: mapStatus(h.status),
        items: {
          create: rows
            .filter((x) => clean(x.item))
            .map((x) => ({
              itemName: (clean(x.item) as string).slice(0, 100),
              quantity: parseNum(x.kg_bags) || Number(x.bag) || 0,
              price: parseNum(x.price_kg),
              unit: "kg",
            })),
        },
      },
    });
    invoiceIdByNo.set(no, created.id);
    bump("invoices");
    bump("invoice_items", rows.filter((x) => clean(x.item)).length);
  }

  // ── invoice_payments (tb_bayar_faktur) ──
  for (const r of await q("SELECT * FROM tb_bayar_faktur")) {
    const iid = invoiceIdByNo.get(clean(r.no_faktur) || "");
    const date = parseDate(r.tanggal);
    if (!iid || !date) { bump("invoice_payments_skipped"); continue; }
    await prisma.invoicePayment.create({
      data: {
        invoiceId: iid,
        date,
        amount: parseNum(r.deposit),
        currency: "USD",
        note: clean(r.banker),
      },
    });
    bump("invoice_payments");
  }

  // ── supplier_transactions (tb_trans_supplier) ──
  for (const r of await q("SELECT * FROM tb_trans_supplier")) {
    let sid = Number(r.id_supplier);
    if (!supplierIds.has(sid)) sid = NaN;
    const date = parseDate(r.tgl_trans);
    if (Number.isNaN(sid) || !date) { bump("supplier_tx_skipped"); continue; }
    await prisma.supplierTransaction.create({
      data: {
        supplierId: sid,
        date,
        type: (clean(r.kategori) || "other").slice(0, 20),
        amount: parseNum(r.jumlah),
        currency: "IDR",
        note: [clean(r.deskripsi), clean(r.item), r.quantity ? `qty=${r.quantity}` : null,
          r.harga ? `harga=${r.harga}` : null, clean(r.sumber)].filter(Boolean).join("; ") || null,
      },
    });
    bump("supplier_tx");
  }

  // ── cash_accounts (tb_penjualan → petty/other cash; tb_kasbesar → big cash) ──
  for (const r of await q("SELECT * FROM tb_penjualan")) {
    const date = parseDate(r.tgl_transaksi);
    if (!date) { bump("cash_kecil_skipped"); continue; }
    const amt = parseNum(r.total) || parseNum(r.nilai);
    const isOut = (clean(r.kategori) || "").toLowerCase().startsWith("pengeluaran");
    await prisma.cashAccount.create({
      data: {
        type: (clean(r.sumber) || "Kas Kecil").slice(0, 20),
        date,
        description: (clean(r.diskripsi) || "-").slice(0, 255),
        currency: "IDR",
        debit: isOut ? 0 : amt,
        credit: isOut ? amt : 0,
        note: clean(r.user),
      },
    });
    bump("cash_kecil");
  }
  for (const r of await q("SELECT * FROM tb_kasbesar")) {
    const date = parseDate(r.tgl_transaksi);
    if (!date) { bump("cash_besar_skipped"); continue; }
    const amt = parseNum(r.total);
    const st = (clean(r.status) || "").toLowerCase();
    const isCredit = st.startsWith("kredit") || st.startsWith("credit");
    await prisma.cashAccount.create({
      data: {
        type: "Kas Besar",
        date,
        description: (clean(r.status) || "Kas Besar").slice(0, 255),
        currency: "IDR",
        debit: isCredit ? 0 : amt,
        credit: isCredit ? amt : 0,
      },
    });
    bump("cash_besar");
  }

  await legacy.end();
  await prisma.$disconnect();

  console.log("\n═══ Migration complete ═══");
  for (const k of Object.keys(stats).sort()) console.log(`  ${k.padEnd(26)} ${stats[k]}`);
  if (warn.length) console.log(`\n  ${warn.length} warnings (dates fell back). First few:`);
  warn.slice(0, 5).forEach((w) => console.log("   - " + w));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nMIGRATION FAILED:", err);
    process.exit(1);
  });
