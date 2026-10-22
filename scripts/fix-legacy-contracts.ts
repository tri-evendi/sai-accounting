/**
 * PERBAIKAN DATA WARISAN KONTRAK — status & kurs (keputusan pemilik 23 Okt 2026)
 *
 *   bun run legacy:fix-contracts -- --company pt-sai --dump <dump.sql>            # uji-kering (bawaan)
 *   bun run legacy:fix-contracts -- --company pt-sai --dump <dump.sql> --apply    # terapkan
 *
 * Di produksi (image migrator — sambungan langsung ke `pg`, bukan lewat pooler;
 * dump dipasang sebagai volume hanya-baca):
 *
 *   docker compose run --rm -v /jalur/dump.sql:/dump/legacy.sql:ro migrate \
 *     bun run legacy:fix-contracts -- --company pt-sai --dump /dump/legacy.sql
 *
 * Opsi:
 *   --company <slug>              WAJIB; harus menunjuk TEPAT satu perusahaan, dan
 *                                 hanya buku yang keputusannya sudah diambil
 *                                 (`DECIDED_FOR`) yang diterima.
 *   --dump <jalur>                WAJIB; dump SQL aplikasi lama (tb_trans_contract).
 *   --bi-rates <jalur>            CSV kurs BI; bawaan berkas yang ikut repo
 *                                 (`scripts/data/bi-rates/kurs-transaksi-bi.csv`).
 *   --relabel-payment-currency    ganti label `USD` pembayaran warisan dengan mata
 *                                 uang KONTRAKNYA sebelum kurs diisi (lihat di bawah).
 *   --actor <nama>                nama pelaksana di jejak audit.
 *   --detail                      cetak SEMUA baris yang tak bisa diisi.
 *   --apply                       tulis. Tanpa ini tidak ada satu baris pun ditulis.
 *
 * ══ YANG DILAKUKAN — urutan di dalam SATU transaksi ═══════════════════════
 *   1. koreksi kurs konversi #25 dan #325 (nilai lama DIPERIKSA dulu; #65
 *      dibiarkan dan dikecualikan sebagai acuan);
 *   2. kontrak `pending` berkode warisan PERSIS `2` → `signed`;
 *   3. (opsional) label mata uang pembayaran warisan → mata uang kontraknya;
 *   4. kurs + nilai IDR pembayaran kontrak valas tanpa kurs (konversi SAI
 *      hari-sama → terdekat ≤ 7 hari → kurs tengah BI);
 *   5. kurs + nilai IDR kontrak valas tanpa kurs (kurs tengah BI);
 *   6. hitungan sesudah DIBANDINGKAN dengan rencana — selisih satu baris pun
 *      membatalkan seluruhnya;
 *   7. satu baris `audit_logs` (`data_fix.legacy_contracts`) berisi setiap
 *      nilai lama → baru.
 *
 * Aturannya hidup di `src/lib/legacy-contract-fix.ts` (murni, diuji tanpa basis
 * data). Berkas ini hanya membaca, menyerahkan, dan menulis.
 *
 * ══ YANG TIDAK DISENTUH ════════════════════════════════════════════════════
 * Jurnal. Dokumen valas tanpa kurs tidak pernah bisa diposting (`resolveRate`
 * menolak menebak), jadi tidak punya jurnal — dan baris yang ternyata
 * BERJURNAL dilewati dan dilaporkan, sebab nilai IDR-nya sudah ada di buku
 * besar dan mengisinya di dokumen saja akan membuat keduanya berselisih. Skrip
 * ini juga tidak memposting apa pun: kontrak yang mendapat kurs tetap tanpa
 * jurnal sampai seseorang memutuskan lain. `currency_conversions` tidak
 * bertaut ke jurnal mana pun, jadi koreksinya tidak menuntut penyesuaian buku.
 *
 * ══ LABEL MATA UANG PEMBAYARAN ═════════════════════════════════════════════
 * Pengimpor lama menulis `currency: "USD"` ke SETIAP pembayaran kontrak —
 * `tb_byr_contract` tidak punya kolom mata uang, dan nominalnya dicatat dalam
 * mata uang kontrak. Di dump 18 Jul, 621 dari 725 pembayaran milik kontrak CNY.
 * Pembayaran yang labelnya berbeda dari kontraknya TIDAK diberi kurs tanpa
 * `--relabel-payment-currency`: kurs USD atas nominal yuan menilai uangnya
 * tujuh kali lipat. Dengan opsi itu labelnya diganti lebih dulu, di transaksi
 * yang sama, dan tercatat di jejak audit.
 *
 * ══ IDEMPOTEN ══════════════════════════════════════════════════════════════
 * Setiap langkah memilih barisnya dari keadaan "belum diperbaiki" (status
 * `pending`, kurs & nilai IDR NULL, nilai konversi lama). Jalan ulang sesudah
 * berhasil menemukan nol baris, tidak menulis apa pun — juga tidak jejak audit.
 */
import "dotenv/config";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { controlDb } from "@sai/core/control-db";
import { round2 } from "@sai/core/money-format";
import { COMPANY_DATABASE_TARGET_SELECT } from "@sai/db/company-url";
import { companyContextOf, runWithCompany } from "../src/lib/company-context";
import { prisma } from "../src/lib/prisma";
import { parseInsertRows } from "../src/lib/mysql-dump";
import {
  CONVERSION_CORRECTIONS,
  EXCLUDED_CONVERSION_IDS,
  checkConversionCorrection,
  isoDay,
  legacyStatusIndex,
  parseBiRatesCsv,
  planContractRates,
  planCurrencyRelabel,
  planPaymentRates,
  planStatusFix,
  rateOutliers,
  summarizeFills,
  type BiRateTable,
  type ContractRow,
  type ConversionRef,
  type FillPlan,
  type FillRow,
  type PaymentRow,
  type StatusPlan,
} from "../src/lib/legacy-contract-fix";

/** Buku yang keputusannya SUDAH diambil pemilik. Buku lain ditolak. */
const DECIDED_FOR = ["pt-sai"] as const;

const DEFAULT_BI = join(process.cwd(), "scripts", "data", "bi-rates", "kurs-transaksi-bi.csv");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}
const flag = (name: string) => process.argv.includes(name);

const APPLY = flag("--apply");
const RELABEL = flag("--relabel-payment-currency");
const DETAIL = flag("--detail");
const SLUG = arg("--company");
const DUMP = arg("--dump");
const BI = arg("--bi-rates") ?? DEFAULT_BI;
const ACTOR = (arg("--actor") ?? "skrip legacy:fix-contracts").slice(0, 50);

const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 6 });
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

class Abort extends Error {}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Db = typeof prisma | Tx;

interface Plan {
  corrections: { id: number; verdict: string; before: { rate: number; result: number }; after: { rate: number; result: number } }[];
  status: StatusPlan;
  relabel: { id: number; from: string; to: string }[];
  payments: FillPlan;
  contracts: FillPlan;
  before: {
    pending: number;
    paymentsMissing: number;
    contractsMissing: number;
    paymentBase: Map<string, number>;
    contractBase: Map<string, number>;
  };
}

/** Rencana lengkap dari keadaan basis data SAAT INI (dibaca lewat `db`). */
async function buildPlan(db: Db, legacy: ReturnType<typeof legacyStatusIndex>, bi: BiRateTable): Promise<Plan> {
  // 1. Koreksi konversi — dinilai terhadap baris yang ada.
  const convRows = await db.currencyConversion.findMany({ orderBy: { id: "asc" } });
  const asRef = (r: (typeof convRows)[number]) => ({
    id: r.id,
    date: isoDay(r.date),
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    amount: Number(r.amount),
    rate: Number(r.rate),
    result: Number(r.result),
  });
  const corrections = CONVERSION_CORRECTIONS.map((c) => {
    const row = convRows.find((r) => r.id === c.id);
    return {
      id: c.id,
      verdict: checkConversionCorrection(row ? asRef(row) : null, c),
      before: c.before,
      after: c.after,
    };
  });
  // Acuan kurs = keadaan SESUDAH koreksi (yang `apply` diganti nilainya).
  const refs: ConversionRef[] = convRows.map((r) => {
    const ref = asRef(r);
    const c = corrections.find((x) => x.id === r.id && x.verdict === "apply");
    return c ? { ...ref, rate: c.after.rate } : ref;
  });

  // 2. Status.
  const contracts = await db.contract.findMany({
    select: { id: true, contractNo: true, status: true },
    orderBy: { id: "asc" },
  });
  const status = planStatusFix(contracts, legacy);

  // 3–4. Pembayaran valas tanpa kurs & tanpa nilai IDR.
  const pays = await db.contractPayment.findMany({
    where: { currency: { not: "IDR" }, rate: null, baseAmount: null },
    select: { id: true, contractId: true, date: true, amount: true, currency: true, contract: { select: { currency: true } } },
    orderBy: { id: "asc" },
  });
  const liveOf = async (sourceType: string, ids: number[]) =>
    new Set(
      ids.length === 0
        ? []
        : (
            await db.journal.findMany({
              where: { sourceType, sourceId: { in: ids }, isReversed: false, type: { not: "reversal" } },
              select: { sourceId: true },
            })
          ).map((j) => j.sourceId)
    );
  const payLive = await liveOf("contract_payment", pays.map((p) => p.id));
  let payRows: PaymentRow[] = pays.map((p) => ({
    id: p.id,
    contractId: p.contractId,
    date: isoDay(p.date),
    amount: Number(p.amount),
    currency: p.currency,
    contractCurrency: p.contract.currency,
    hasLiveJournal: payLive.has(p.id),
  }));
  const relabel = planCurrencyRelabel(payRows);
  if (RELABEL) {
    const to = new Map(relabel.map((r) => [r.id, r.to]));
    payRows = payRows.map((p) => (to.has(p.id) ? { ...p, currency: to.get(p.id)! } : p));
  }
  const payments = planPaymentRates(payRows, refs, bi);

  // 5. Kontrak valas tanpa kurs & tanpa nilai IDR.
  const cons = await db.contract.findMany({
    where: { currency: { not: "IDR" }, rate: null, baseAmount: null },
    select: {
      id: true,
      contractNo: true,
      date: true,
      currency: true,
      items: { select: { bags: true, kgPerBag: true, pricePerKg: true } },
    },
    orderBy: { id: "asc" },
  });
  const conLive = await liveOf("contract", cons.map((c) => c.id));
  const conRows: ContractRow[] = cons.map((c) => ({
    id: c.id,
    contractNo: c.contractNo,
    date: isoDay(c.date),
    currency: c.currency,
    items: c.items.map((i) => ({ bags: Number(i.bags), kgPerBag: Number(i.kgPerBag), pricePerKg: Number(i.pricePerKg) })),
    hasLiveJournal: conLive.has(c.id),
  }));
  const contractsPlan = planContractRates(conRows, bi);

  // Angka "sebelum" untuk laporan dan untuk verifikasi sesudah.
  const sumBase = async (table: "contract" | "payment") => {
    const rows =
      table === "contract"
        ? await db.contract.groupBy({ by: ["currency"], _sum: { baseAmount: true } })
        : await db.contractPayment.groupBy({ by: ["currency"], _sum: { baseAmount: true } });
    return new Map(rows.map((r) => [r.currency, round2(Number(r._sum.baseAmount ?? 0))]));
  };
  return {
    corrections,
    status,
    relabel,
    payments,
    contracts: contractsPlan,
    before: {
      pending: contracts.filter((c) => c.status === "pending").length,
      paymentsMissing: pays.length,
      contractsMissing: cons.length,
      paymentBase: await sumBase("payment"),
      contractBase: await sumBase("contract"),
    },
  };
}

function printFillPlan(title: string, p: FillPlan, missing: number, base: Map<string, number>, bi: BiRateTable) {
  console.log(`\n── ${title} ──`);
  console.log(`  tanpa kurs & tanpa nilai IDR: ${missing} · diisi: ${p.fills.length} · tak bisa diisi: ${p.unfillable.length}`);
  for (const [cur, s] of summarizeFills(p.fills)) {
    const before = base.get(cur) ?? 0;
    console.log(
      `  ${cur}: ${s.count} baris · hari-sama ${s.bySource.same_day} · ≤7 hari ${s.bySource.nearest_7d} · BI ${s.bySource.bi}` +
        ` · kurs ${fmt(s.minRate)} – ${fmt(s.maxRate)}`
    );
    console.log(`       total IDR (base_amount) ${cur}: sebelum Rp ${fmt(before)} → sesudah Rp ${fmt(round2(before + s.base))} (+${fmt(s.base)})`);
  }
  const byReason = new Map<string, string[]>();
  for (const u of p.unfillable) byReason.set(u.reason, [...(byReason.get(u.reason) ?? []), u.label]);
  for (const [reason, labels] of byReason) {
    console.log(`  ✗ ${labels.length} × ${reason}`);
    for (const l of DETAIL ? labels : labels.slice(0, 15)) console.log(`      · ${l}`);
    if (!DETAIL && labels.length > 15) console.log(`      … ${labels.length - 15} lagi (--detail untuk semuanya)`);
  }
  const out = rateOutliers(p.fills, bi);
  for (const o of out) {
    console.log(
      `  ⚠ #${o.id} ${o.currency} ${o.date}: kurs ${fmt(o.rate)} menyimpang > 15% dari BI ${fmt(o.bi)} (acuan konversi #${o.refIds.join(", #")})`
    );
  }
}

function printPlan(plan: Plan, legacy: ReturnType<typeof legacyStatusIndex>) {
  console.log("\n── 1. Koreksi kurs konversi (currency_conversions) ──");
  for (const c of plan.corrections) {
    console.log(
      `  #${c.id}: kurs ${fmt(c.before.rate)} → ${fmt(c.after.rate)}, hasil Rp ${fmt(c.before.result)} → Rp ${fmt(c.after.result)} — ${c.verdict}`
    );
  }
  console.log(`  #${[...EXCLUDED_CONVERSION_IDS].join(", #")}: dibiarkan apa adanya, DIKECUALIKAN sebagai acuan kurs.`);

  console.log("\n── 2. Status kontrak warisan ──");
  console.log(
    `  dump: ${[...legacy.perCode].map(([k, n]) => `kode ${k || "(kosong)"} = ${n}`).join(" · ")}` +
      (legacy.ambiguous.size ? ` · ${legacy.ambiguous.size} nomor ambigu (dilewati)` : "") +
      (legacy.mixed.length ? ` · ${legacy.mixed.length} kontrak berstatus campur` : "")
  );
  console.log(
    `  pending di buku per kode warisan: ${[...plan.status.pendingByCode].map(([k, n]) => `${k} = ${n}`).join(" · ")}`
  );
  console.log(
    `  tanpa padanan di dump, per status sekarang: ${[...plan.status.unmatchedByStatus].map(([k, n]) => `${k} = ${n}`).join(" · ") || "—"}`
  );
  for (const no of plan.status.unmatchedPending) console.log(`      · pending tanpa padanan (tetap pending): ${no}`);
  console.log(`  → pending → signed: ${plan.status.toSigned.length} kontrak (pending sebelum ${plan.before.pending}, sesudah ${plan.before.pending - plan.status.toSigned.length})`);

  console.log("\n── 3. Label mata uang pembayaran warisan ──");
  const per = new Map<string, number>();
  for (const r of plan.relabel) per.set(`${r.from}→${r.to}`, (per.get(`${r.from}→${r.to}`) ?? 0) + 1);
  console.log(
    `  ${plan.relabel.length} pembayaran berlabel bawaan pengimpor ≠ mata uang kontraknya` +
      (per.size ? ` (${[...per].map(([k, n]) => `${k}: ${n}`).join(", ")})` : "") +
      (RELABEL ? " — DIGANTI (--relabel-payment-currency)" : " — TIDAK diganti; baris itu tak diberi kurs")
  );

  printFillPlan("4. Kurs pembayaran kontrak", plan.payments, plan.before.paymentsMissing, plan.before.paymentBase, bi);
  printFillPlan("5. Kurs kontrak (kurs tengah BI)", plan.contracts, plan.before.contractsMissing, plan.before.contractBase, bi);
}

let bi: BiRateTable = new Map();

async function applyPlan(tx: Tx, plan: Plan, meta: Record<string, unknown>): Promise<number> {
  let writes = 0;
  const expect = (what: string, got: number, want: number) => {
    if (got !== want) throw new Abort(`${what}: tertulis ${got}, direncanakan ${want} — dibatalkan.`);
  };

  // 1. Koreksi konversi.
  for (const c of plan.corrections.filter((x) => x.verdict === "apply")) {
    const { count } = await tx.currencyConversion.updateMany({
      where: { id: c.id, rate: c.before.rate, result: c.before.result },
      data: { rate: c.after.rate, result: c.after.result },
    });
    expect(`koreksi konversi #${c.id}`, count, 1);
    writes += count;
  }

  // 2. Status.
  const ids = plan.status.toSigned.map((c) => c.id);
  if (ids.length) {
    const { count } = await tx.contract.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: { status: "signed" },
    });
    expect("pending → signed", count, ids.length);
    writes += count;
  }

  // 3. Label.
  if (RELABEL) {
    for (const to of new Set(plan.relabel.map((r) => r.to))) {
      const group = plan.relabel.filter((r) => r.to === to);
      const { count } = await tx.contractPayment.updateMany({
        where: { id: { in: group.map((r) => r.id) }, currency: group[0].from, rate: null, baseAmount: null },
        data: { currency: to },
      });
      expect(`label pembayaran → ${to}`, count, group.length);
      writes += count;
    }
  }

  // 4–5. Kurs & nilai IDR.
  const fill = async (table: "payment" | "contract", rows: FillRow[]) => {
    let n = 0;
    for (const f of rows) {
      const where = { id: f.id, rate: null, baseAmount: null };
      const data = { rate: f.rate, baseAmount: f.baseAmount };
      const { count } =
        table === "payment"
          ? await tx.contractPayment.updateMany({ where, data })
          : await tx.contract.updateMany({ where, data });
      n += count;
    }
    expect(`kurs ${table === "payment" ? "pembayaran" : "kontrak"}`, n, rows.length);
    return n;
  };
  writes += await fill("payment", plan.payments.fills);
  writes += await fill("contract", plan.contracts.fills);

  // 6. Verifikasi sesudah — dibaca ulang di dalam transaksi yang sama.
  const pendingAfter = await tx.contract.count({ where: { status: "pending" } });
  expect("kontrak pending sesudah", pendingAfter, plan.before.pending - ids.length);
  const payMissingAfter = await tx.contractPayment.count({
    where: { currency: { not: "IDR" }, rate: null, baseAmount: null },
  });
  expect("pembayaran tanpa kurs sesudah", payMissingAfter, plan.before.paymentsMissing - plan.payments.fills.length);
  const conMissingAfter = await tx.contract.count({
    where: { currency: { not: "IDR" }, rate: null, baseAmount: null },
  });
  expect("kontrak tanpa kurs sesudah", conMissingAfter, plan.before.contractsMissing - plan.contracts.fills.length);
  for (const [table, rows] of [
    ["payment", plan.payments.fills],
    ["contract", plan.contracts.fills],
  ] as const) {
    const got =
      table === "payment"
        ? await tx.contractPayment.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, rate: true, baseAmount: true } })
        : await tx.contract.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, rate: true, baseAmount: true } });
    const byId = new Map(got.map((g) => [g.id, g]));
    for (const r of rows) {
      const g = byId.get(r.id);
      if (!g || Math.abs(Number(g.rate) - r.rate) > 1e-6 || Math.abs(Number(g.baseAmount) - r.baseAmount) > 0.005) {
        throw new Abort(`${table} #${r.id}: nilai tersimpan tidak sama dengan rencana — dibatalkan.`);
      }
    }
  }

  if (writes === 0) return 0;

  // 7. Jejak audit — DI DALAM transaksi: tanpa jejak, tanpa perbaikan.
  await tx.auditLog.create({
    data: {
      userId: "script:legacy:fix-contracts",
      username: ACTOR,
      role: null,
      action: "data_fix.legacy_contracts",
      entity: "data_fix",
      entityId: null,
      details: JSON.stringify({
        ...meta,
        conversionsCorrected: plan.corrections
          .filter((c) => c.verdict === "apply")
          .map((c) => ({ id: c.id, before: c.before, after: c.after })),
        conversionsExcluded: [...EXCLUDED_CONVERSION_IDS],
        statusPendingToSigned: plan.status.toSigned.map((c) => c.id),
        paymentCurrencyRelabel: RELABEL ? plan.relabel.map((r) => [r.id, r.from, r.to]) : [],
        // [id, kurs, base_amount, sumber, tanggal acuan, id konversi acuan]
        paymentRates: plan.payments.fills.map((f) => [f.id, f.rate, f.baseAmount, f.source, f.refDate, f.refIds]),
        contractRates: plan.contracts.fills.map((f) => [f.id, f.rate, f.baseAmount, f.source, f.refDate]),
        unfillable: {
          payments: plan.payments.unfillable.map((u) => [u.id, u.reason]),
          contracts: plan.contracts.unfillable.map((u) => [u.id, u.reason]),
        },
      }),
      ipAddress: null,
    },
  });
  return writes;
}

async function main() {
  if (!SLUG || !DUMP) {
    console.error("Wajib: --company <slug> dan --dump <jalur dump SQL lama>. Lihat kepala skrip.");
    process.exit(2);
  }
  if (!(DECIDED_FOR as readonly string[]).includes(SLUG)) {
    console.error(`Perusahaan "${SLUG}" belum punya keputusan pemilik untuk perbaikan ini (hanya: ${DECIDED_FOR.join(", ")}).`);
    process.exit(2);
  }
  if (!existsSync(DUMP)) {
    console.error(`Dump tidak ditemukan: ${DUMP}`);
    process.exit(2);
  }

  const companies = await controlDb.company.findMany({
    where: { slug: SLUG },
    select: { id: true, slug: true, isActive: true, ...COMPANY_DATABASE_TARGET_SELECT },
  });
  if (companies.length !== 1) {
    console.error(`--company ${SLUG} menunjuk ${companies.length} perusahaan, bukan tepat satu — berhenti.`);
    process.exit(2);
  }
  const company = companies[0];

  const dumpBuf = readFileSync(DUMP);
  // latin1: satu byte = satu karakter, jadi penguraian tidak pernah gagal karena
  // byte yang bukan UTF-8 sah (dump lama ber-charset latin1/latin2).
  const legacyRows = parseInsertRows(dumpBuf.toString("latin1"), "tb_trans_contract");
  if (legacyRows.length === 0) {
    console.error("Dump tidak memuat satu baris pun `tb_trans_contract` — dump yang salah?");
    process.exit(2);
  }
  const legacy = legacyStatusIndex(legacyRows);

  let biSha: string | null = null;
  if (existsSync(BI)) {
    const buf = readFileSync(BI);
    biSha = sha256(buf);
    bi = parseBiRatesCsv(buf.toString("utf8"));
  } else {
    console.error(`⚠ Berkas kurs BI tidak ada (${BI}) — setiap baris yang butuh kurs BI akan terdaftar di bawah.`);
  }

  console.log(APPLY ? "MODE TULIS — satu transaksi; selisih apa pun membatalkan seluruhnya." : "UJI-KERING — tidak ada satu baris pun ditulis. Tambahkan --apply untuk menerapkan.");
  console.log(`Perusahaan: ${company.slug} (#${company.id}${company.isActive ? "" : ", NONAKTIF"}) · basis data ${company.databaseName}`);
  console.log(`Dump: ${DUMP} (sha256 ${sha256(dumpBuf).slice(0, 16)}…, ${legacyRows.length} baris tb_trans_contract)`);
  console.log(`Kurs BI: ${existsSync(BI) ? `${BI} (sha256 ${biSha!.slice(0, 16)}…)` : "TIDAK ADA"}`);

  const meta = {
    decision: "pemilik, 23 Okt 2026",
    dump: { path: DUMP, sha256: sha256(dumpBuf) },
    biRates: { path: BI, sha256: biSha },
    relabelPaymentCurrency: RELABEL,
  };

  const exitCode = await runWithCompany(companyContextOf(company), async () => {
    const plan = await buildPlan(prisma, legacy, bi);
    printPlan(plan, legacy);

    const missing = [...plan.payments.missingBi, ...plan.contracts.missingBi];
    if (missing.length > 0) {
      const per = new Map<string, Set<string>>();
      for (const m of missing) per.set(m.currency, (per.get(m.currency) ?? new Set()).add(m.date));
      console.error("\n✗ Kurs BI dibutuhkan untuk tanggal berikut tetapi tidak ada di berkasnya:");
      for (const [cur, days] of per) console.error(`  ${cur} (${days.size} hari): ${[...days].sort().join(", ")}`);
      console.error("  Lengkapi CSV (lihat scripts/data/bi-rates/README.md). Tidak ada yang diterapkan.");
      return 3;
    }
    const bad = plan.corrections.filter((c) => c.verdict === "mismatch" || c.verdict === "missing");
    if (bad.length > 0) {
      console.error(
        `\n✗ Baris konversi ${bad.map((c) => `#${c.id} (${c.verdict})`).join(", ")} tidak sama dengan yang diputuskan pemilik — tidak ada yang diterapkan.`
      );
      return 3;
    }
    if (!APPLY) return 0;

    try {
      const writes = await prisma.$transaction(
        async (tx) => {
          // Kunci tulis tiga tabelnya selama perbaikan: rencana yang dihitung
          // ulang di bawah tidak boleh berubah di tengah jalan. Pembaca tidak
          // terhalang (SHARE ROW EXCLUSIVE hanya menahan penulis).
          await tx.$executeRawUnsafe(
            'LOCK TABLE "contracts", "contract_payments", "currency_conversions" IN SHARE ROW EXCLUSIVE MODE'
          );
          const fresh = await buildPlan(tx, legacy, bi);
          return applyPlan(tx, fresh, meta);
        },
        { timeout: 300_000, maxWait: 15_000 }
      );
      console.log(writes === 0 ? "\n✓ Tidak ada yang perlu diperbaiki — sudah diterapkan sebelumnya." : `\n✓ Diterapkan: ${writes} baris ditulis, jejak audit tercatat.`);
      return 0;
    } catch (e) {
      if (e instanceof Abort) {
        console.error(`\n✗ ${e.message}`);
        return 4;
      }
      throw e;
    }
  });

  await prisma.$disconnect().catch(() => {});
  await controlDb.$disconnect().catch(() => {});
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

