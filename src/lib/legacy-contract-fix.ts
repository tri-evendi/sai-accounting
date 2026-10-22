/**
 * PERBAIKAN DATA WARISAN KONTRAK — aturan murninya (keputusan pemilik 23 Okt 2026).
 *
 * Berkas ini MURNI: tanpa basis data, tanpa berkas, tanpa jam. Skrip yang
 * menjalankannya (`scripts/fix-legacy-contracts.ts`) membaca baris, menyerahkannya
 * ke sini, dan menulis apa yang diputuskan di sini. Pemisahan itu sengaja: setiap
 * aturan di bawah mengubah angka di buku produksi, dan aturan yang hanya bisa
 * diuji dengan basis data produksi adalah aturan yang tidak pernah diuji.
 *
 * ══ YANG DIPUTUSKAN PEMILIK (buku `pt-sai`) ═══════════════════════════════
 *  1. `completed` status kontrak keempat yang sah (constants.ts) — berkas ini
 *     tidak menyentuhnya, 101 barisnya tetap.
 *  2. Kode warisan `2` → `signed`. Pengimpor lama memetakan SEMUA kode selain
 *     `-1`/`1` ke `pending` (`mapStatus` di `scripts/migrate-legacy.ts`,
 *     dicabut di c2f1d1c4), jadi kontrak yang di aplikasi lama sudah berjalan
 *     tercatat "menunggu". Hanya `pending` yang kodenya PERSIS `2` yang diubah;
 *     `0` tetap `pending`, `completed`/`canceled` tak disentuh.
 *  3. Kurs "gabungan" untuk dokumen valas yang lahir tanpa kurs:
 *       • pembayaran → kurs konversi SAI sendiri (`currency_conversions`, mata
 *         uang yang sama → IDR) di hari yang sama, rata-rata tertimbang nominal;
 *         bila tak ada, konversi terdekat ≤ 7 hari (seri → tanggal yang lebih
 *         awal); bila tak ada juga, kurs tengah BI di tanggal bayar;
 *       • kontrak → kurs tengah BI di tanggal kontrak; hari tanpa kurs BI
 *         (libur/akhir pekan) memakai kurs terbit TERAKHIR sebelumnya.
 *  4. Tiga baris konversi rusak: #25 dan #325 DIKOREKSI (nilai lama diperiksa
 *     dulu), #65 (kurs 0) dibiarkan dan DIKECUALIKAN sebagai acuan.
 *
 * Nilai IDR (`base_amount`) TIDAK dihitung di sini dengan rumus sendiri: ia
 * memakai `contractFx` / `fxAmounts` — fungsi yang sama dengan jalur tulis
 * aplikasi — supaya baris yang diperbaiki tak terbedakan dari baris yang lahir
 * lewat formulir.
 */
import { round2 } from "@sai/core/money-format";
import { contractFx } from "@/lib/validations/contract";
import { fxAmounts } from "@/lib/validations/fx";
import type { DumpRow } from "@/lib/mysql-dump";

// ─── Tanggal ─────────────────────────────────────────────────────────────────

/**
 * Hari kalender sebuah kolom tanggal, `YYYY-MM-DD`.
 *
 * UTC, dan itu bukan pilihan bebas: pengimpor warisan menulis setiap tanggal
 * sebagai `Date.UTC(y, m, d)` dan jalur tulis aplikasi menulis `new Date("YYYY-
 * MM-DD")` — keduanya tengah malam UTC. Membacanya dalam WIB akan menggeser
 * setiap tanggal ke hari yang sama (aman) tetapi membacanya di zona barat UTC
 * akan memundurkannya sehari; UTC adalah satu-satunya bacaan yang tidak
 * bergantung pada mesin yang menjalankan skrip.
 */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Tanggal tidak sah: ${iso}`);
  return Math.round(ms / DAY_MS);
}

/** Selisih hari `b - a` (negatif bila `b` lebih awal). */
export function dayDiff(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** Kurs disimpan `Decimal(18,6)` — dibulatkan SEBELUM dipakai menghitung IDR. */
export function roundRate(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

// ─── 2. Status warisan ───────────────────────────────────────────────────────

/** Kode status aplikasi lama yang, menurut pemilik, berarti "sah/berjalan". */
export const LEGACY_SIGNED_CODE = "2";

/** `clean()` pengimpor lama — dipertahankan persis supaya kuncinya sama. */
function legacyClean(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.replace(/\r?\n/g, " ").trim();
  return s === "" ? null : s;
}

/**
 * Kunci pencocokan nomor kontrak warisan ↔ kontrak di buku.
 *
 * Pengimpor menyimpan `clean(no_contract).slice(0, 50)`; kunci ini mengikuti
 * itu, lalu merapatkan spasi dan menyeragamkan huruf. Yang terakhir lebih
 * longgar dari pengimpornya, dan hanya boleh lebih longgar karena dua hal:
 * dump dibaca sebagai latin1 sementara pengimpor membacanya lewat konversi
 * latin2 → utf8, dan nomor yang kemudian disunting hanya huruf besar/kecilnya
 * tetap kontrak yang sama. Kunci yang menunjuk lebih dari satu kontrak warisan
 * TIDAK PERNAH dipakai — lihat `legacyStatusIndex`.
 */
export function legacyContractKey(contractNo: string): string {
  return contractNo.replace(/\r?\n/g, " ").trim().slice(0, 50).replace(/\s+/g, " ").toUpperCase();
}

export interface LegacyStatusIndex {
  /** Kunci → kode status warisan (sudah di-trim) dari baris "kepala" kontrak. */
  codes: Map<string, string>;
  /** Kunci yang dipakai lebih dari satu nomor kontrak warisan — tak dipakai. */
  ambiguous: Set<string>;
  /** Kontrak warisan yang barisnya menyebut status BERBEDA-BEDA. */
  mixed: string[];
  /** Jumlah kontrak warisan per kode, untuk laporan. */
  perCode: Map<string, number>;
}

/**
 * Kode status per kontrak dari baris `tb_trans_contract`.
 *
 * Satu kontrak warisan = beberapa baris (satu per barang). Statusnya diambil
 * dari baris KEPALA dengan aturan pengimpor lama — baris pertama yang punya
 * `buyer`, atau baris pertama — supaya kode yang dibaca di sini adalah kode
 * yang dulu dipetakan menjadi status yang sekarang tersimpan.
 */
export function legacyStatusIndex(rows: DumpRow[]): LegacyStatusIndex {
  const groups = new Map<string, DumpRow[]>();
  for (const r of rows) {
    const no = legacyClean(r.no_contract);
    if (!no) continue;
    const g = groups.get(no);
    if (g) g.push(r);
    else groups.set(no, [r]);
  }

  const codes = new Map<string, string>();
  const ambiguous = new Set<string>();
  const mixed: string[] = [];
  const perCode = new Map<string, number>();
  for (const [no, g] of groups) {
    const head = g.find((x) => legacyClean(x.buyer)) ?? g[0];
    const code = (head.status ?? "").trim();
    perCode.set(code, (perCode.get(code) ?? 0) + 1);
    if (new Set(g.map((x) => (x.status ?? "").trim())).size > 1) mixed.push(no);
    const key = legacyContractKey(no);
    // Dua nomor warisan yang menjadi satu kunci: tak satu pun dipakai, sekalipun
    // kodenya kebetulan sama — kontrak di buku tidak bisa ditunjuk ke salah satunya.
    if (codes.has(key) || ambiguous.has(key)) ambiguous.add(key);
    else codes.set(key, code);
  }
  for (const k of ambiguous) codes.delete(k);
  return { codes, ambiguous, mixed, perCode };
}

export interface StatusPlan {
  /** Kontrak yang akan menjadi `signed`. */
  toSigned: { id: number; contractNo: string }[];
  /** Kontrak `pending` per kode warisannya (`(tanpa padanan)` bila tak ketemu). */
  pendingByCode: Map<string, number>;
  /** Kontrak di buku yang nomornya tak ditemukan di dump, per status sekarang. */
  unmatchedByStatus: Map<string, number>;
  unmatchedPending: string[];
}

export const NO_MATCH = "(tanpa padanan)";

export function planStatusFix(
  contracts: { id: number; contractNo: string; status: string }[],
  index: LegacyStatusIndex
): StatusPlan {
  const plan: StatusPlan = {
    toSigned: [],
    pendingByCode: new Map(),
    unmatchedByStatus: new Map(),
    unmatchedPending: [],
  };
  for (const c of contracts) {
    const code = index.codes.get(legacyContractKey(c.contractNo));
    if (code === undefined) {
      plan.unmatchedByStatus.set(c.status, (plan.unmatchedByStatus.get(c.status) ?? 0) + 1);
      if (c.status === "pending") plan.unmatchedPending.push(c.contractNo);
    }
    if (c.status !== "pending") continue;
    const k = code ?? NO_MATCH;
    plan.pendingByCode.set(k, (plan.pendingByCode.get(k) ?? 0) + 1);
    if (code === LEGACY_SIGNED_CODE) plan.toSigned.push({ id: c.id, contractNo: c.contractNo });
  }
  return plan;
}

// ─── 4. Koreksi baris konversi ───────────────────────────────────────────────

export interface ConversionCorrection {
  id: number;
  date: string;
  fromCurrency: string;
  amount: number;
  before: { rate: number; result: number };
  after: { rate: number; result: number };
}

/**
 * Dua koreksi yang diputuskan pemilik. Nilai LAMA ikut dicatat dan DIPERIKSA:
 * baris yang isinya sudah berbeda dari yang dilihat pemilik bukan baris yang
 * ia putuskan, dan mengoreksinya berarti menimpa keputusan orang lain.
 */
export const CONVERSION_CORRECTIONS: readonly ConversionCorrection[] = [
  {
    // Kurs 1963 untuk USD — salah ketik 14163; hasilnya (Rp) sudah benar.
    id: 25,
    date: "2019-10-17",
    fromCurrency: "USD",
    amount: 190000,
    before: { rate: 1963, result: 2690970000 },
    after: { rate: 14163, result: 2690970000 },
  },
  {
    // Kurs 22460 untuk CNY — satu nol berlebih, dan hasilnya ikut sepuluh kali.
    id: 325,
    date: "2022-12-16",
    fromCurrency: "CNY",
    amount: 15600,
    before: { rate: 22460, result: 350376000 },
    after: { rate: 2246, result: 35037600 },
  },
];

/**
 * Baris konversi yang TIDAK BOLEH menjadi acuan kurs. #65: kurs 0, hasil 0 —
 * pemilik memutuskan "kosongkan saja": barisnya dibiarkan, tanpa kurs karangan.
 */
export const EXCLUDED_CONVERSION_IDS: ReadonlySet<number> = new Set([65]);

export type CorrectionVerdict = "apply" | "already_applied" | "mismatch" | "missing";

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

export function checkConversionCorrection(
  row: { id: number; date: string; fromCurrency: string; toCurrency: string; amount: number; rate: number; result: number } | null,
  c: ConversionCorrection
): CorrectionVerdict {
  if (!row) return "missing";
  const sameIdentity =
    row.id === c.id &&
    row.date === c.date &&
    row.fromCurrency === c.fromCurrency &&
    row.toCurrency === "IDR" &&
    near(row.amount, c.amount);
  if (!sameIdentity) return "mismatch";
  if (near(row.rate, c.after.rate) && near(row.result, c.after.result)) return "already_applied";
  if (near(row.rate, c.before.rate) && near(row.result, c.before.result)) {
    // Koreksi yang tidak konsisten dengan dirinya sendiri tidak boleh lahir.
    if (!near(round2(c.amount * c.after.rate), c.after.result)) return "mismatch";
    return "apply";
  }
  return "mismatch";
}

// ─── 3a. Kurs pembayaran dari konversi SAI ──────────────────────────────────

export interface ConversionRef {
  id: number;
  date: string;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  rate: number;
}

export type RateSource = "same_day" | "nearest_7d" | "bi";

export interface RateChoice {
  rate: number;
  source: RateSource;
  /** Tanggal acuan (hari konversi / hari kurs BI yang dipakai). */
  refDate: string;
  /** Id `currency_conversions` yang dipakai (kosong untuk BI). */
  refIds: number[];
}

/** Acuan yang sah: mata uang cocok → IDR, kurs > 0, tidak dikecualikan. */
export function usableRefs(
  refs: readonly ConversionRef[],
  currency: string,
  excluded: ReadonlySet<number> = EXCLUDED_CONVERSION_IDS
): ConversionRef[] {
  return refs.filter(
    (r) => r.fromCurrency === currency && r.toCurrency === "IDR" && r.rate > 0 && !excluded.has(r.id)
  );
}

/**
 * Rata-rata kurs tertimbang nominal valasnya — `Σ(nominal × kurs) / Σ nominal`,
 * yaitu kurs efektif seluruh uang yang ditukar hari itu. Nominal nol di semua
 * baris (tak pernah terjadi di data, tetapi tidak boleh membagi nol) jatuh ke
 * rata-rata biasa.
 */
export function weightedRate(rows: readonly ConversionRef[]): number {
  const w = rows.reduce((s, r) => s + Math.max(r.amount, 0), 0);
  if (w <= 0) return roundRate(rows.reduce((s, r) => s + r.rate, 0) / rows.length);
  return roundRate(rows.reduce((s, r) => s + Math.max(r.amount, 0) * r.rate, 0) / w);
}

/**
 * Kurs konversi SAI untuk sebuah pembayaran, atau `null` bila tak ada acuan
 * dalam `windowDays` hari (pemanggil lalu jatuh ke BI).
 *
 * Hari yang sama menang. Selain itu: hari terdekat; bila dua hari sama dekatnya
 * (sebelum & sesudah), yang LEBIH AWAL — kurs yang sudah diketahui pada saat
 * uangnya masuk lebih dekat dengan kenyataan pembayaran itu daripada kurs dari
 * hari yang belum terjadi. Beberapa konversi di hari terpilih → rata-rata
 * tertimbang hari itu.
 */
export function conversionRateFor(
  refs: readonly ConversionRef[],
  currency: string,
  date: string,
  windowDays = 7,
  excluded: ReadonlySet<number> = EXCLUDED_CONVERSION_IDS
): RateChoice | null {
  const usable = usableRefs(refs, currency, excluded);
  const same = usable.filter((r) => r.date === date);
  if (same.length > 0) {
    return { rate: weightedRate(same), source: "same_day", refDate: date, refIds: same.map((r) => r.id) };
  }
  let best: { dist: number; signed: number; date: string } | null = null;
  for (const r of usable) {
    const d = dayDiff(date, r.date);
    const dist = Math.abs(d);
    if (dist === 0 || dist > windowDays) continue;
    if (!best || dist < best.dist || (dist === best.dist && d < best.signed)) {
      best = { dist, signed: d, date: r.date };
    }
  }
  if (!best) return null;
  const chosen = usable.filter((r) => r.date === best.date);
  return {
    rate: weightedRate(chosen),
    source: "nearest_7d",
    refDate: best.date,
    refIds: chosen.map((r) => r.id),
  };
}

// ─── 3b. Kurs tengah Bank Indonesia ─────────────────────────────────────────

/** mata uang → (hari → kurs tengah), hari terurut naik. */
export type BiRateTable = Map<string, { days: string[]; middle: Map<string, number> }>;

/**
 * CSV kurs BI: `date,currency,buy,sell` (kurs tengah = (beli + jual) / 2) atau
 * `date,currency,middle`. Baris ganda untuk hari & mata uang yang sama dengan
 * nilai BERBEDA ditolak — dua jawaban untuk satu pertanyaan adalah persis
 * keadaan yang tabel kurs ada untuk mencegahnya.
 */
export function parseBiRatesCsv(text: string): BiRateTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  if (lines.length === 0) throw new Error("Berkas kurs BI kosong.");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (n: string) => header.indexOf(n);
  const [iDate, iCur, iBuy, iSell, iMid] = ["date", "currency", "buy", "sell", "middle"].map(col);
  const hasBuySell = iBuy >= 0 && iSell >= 0;
  if (iDate < 0 || iCur < 0 || (!hasBuySell && iMid < 0)) {
    throw new Error(
      `Kepala CSV kurs BI harus "date,currency,buy,sell" atau "date,currency,middle" — ditemukan "${lines[0]}".`
    );
  }
  const table: BiRateTable = new Map();
  lines.slice(1).forEach((line, n) => {
    const f = line.split(",").map((x) => x.trim());
    const date = f[iDate];
    const cur = f[iCur].toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new Error(`CSV kurs BI baris ${n + 2}: tanggal "${date}" bukan YYYY-MM-DD.`);
    }
    const middle = hasBuySell ? (Number(f[iBuy]) + Number(f[iSell])) / 2 : Number(f[iMid]);
    if (!Number.isFinite(middle) || middle <= 0) {
      throw new Error(`CSV kurs BI baris ${n + 2}: kurs "${line}" tidak positif.`);
    }
    let t = table.get(cur);
    if (!t) table.set(cur, (t = { days: [], middle: new Map() }));
    const prev = t.middle.get(date);
    if (prev !== undefined && Math.abs(prev - middle) > 1e-9) {
      throw new Error(`CSV kurs BI: ${cur} ${date} muncul dua kali dengan kurs berbeda (${prev} vs ${middle}).`);
    }
    if (prev === undefined) t.days.push(date);
    t.middle.set(date, roundRate(middle));
  });
  for (const t of table.values()) t.days.sort();
  return table;
}

/**
 * Batas mundur mencari kurs terbit terakhir. Libur terpanjang di data BI
 * 2019–2026 adalah 12 hari (cuti bersama Lebaran 2025); 14 memberi ruang tanpa
 * pernah menjembatani lubang DATA — berkas yang tidak mencakup suatu periode
 * harus berbunyi, bukan diam-diam memakai kurs berbulan-bulan sebelumnya.
 */
export const BI_MAX_LOOKBACK_DAYS = 14;

/** Kurs tengah BI pada `date`, atau kurs terbit terakhir sebelumnya. */
export function biMiddleRate(
  table: BiRateTable,
  currency: string,
  date: string,
  maxLookbackDays = BI_MAX_LOOKBACK_DAYS
): { rate: number; refDate: string } | null {
  const t = table.get(currency);
  if (!t || t.days.length === 0) return null;
  // Lebih dari ujung akhir berkas ditolak: "terakhir sebelumnya" hanya bermakna
  // di dalam rentang yang memang dicakup berkasnya.
  if (date > t.days[t.days.length - 1]) return null;
  let lo = 0;
  let hi = t.days.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t.days[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const refDate = t.days[found];
  if (dayDiff(refDate, date) > maxLookbackDays) return null;
  return { rate: t.middle.get(refDate)!, refDate };
}

// ─── Rencana pengisian kurs ─────────────────────────────────────────────────

/** Mata uang valas yang bisa diberi kurs — kode lain (mis. `LC`) bukan mata uang. */
export const FILLABLE_CURRENCIES: readonly string[] = ["USD", "CNY"];

export interface PaymentRow {
  id: number;
  contractId: number;
  date: string;
  amount: number;
  currency: string;
  contractCurrency: string;
  hasLiveJournal: boolean;
}

/** Label mata uang yang ditulis pengimpor lama ke SETIAP pembayaran kontrak. */
export const LEGACY_PAYMENT_LABEL = "USD";

/**
 * Pembayaran warisan yang labelnya hanya bawaan pengimpor, bukan isi dokumen:
 * berlabel `USD`, kontraknya ber-mata uang valas LAIN yang dikenal. Labelnya
 * diganti dengan mata uang kontraknya — `tb_byr_contract` tidak punya kolom
 * mata uang, dan nominalnya dicatat dalam mata uang kontrak.
 *
 * Hanya dipanggil untuk baris tanpa kurs & tanpa nilai IDR (pemanggil yang
 * memilihnya), dan hanya bila diminta: mengganti label adalah keputusan yang
 * terpisah dari mengisi kurs.
 */
export function planCurrencyRelabel(
  payments: readonly PaymentRow[]
): { id: number; from: string; to: string }[] {
  return payments
    .filter(
      (p) =>
        !p.hasLiveJournal &&
        p.currency === LEGACY_PAYMENT_LABEL &&
        p.contractCurrency !== p.currency &&
        FILLABLE_CURRENCIES.includes(p.contractCurrency)
    )
    .map((p) => ({ id: p.id, from: p.currency, to: p.contractCurrency }));
}

export interface FillRow {
  id: number;
  currency: string;
  date: string;
  rate: number;
  baseAmount: number;
  source: RateSource;
  refDate: string;
  refIds: number[];
}

export interface Unfillable {
  id: number;
  label: string;
  reason: string;
}

export interface FillPlan {
  fills: FillRow[];
  unfillable: Unfillable[];
  /** Hari yang dibutuhkan dari BI tetapi tidak ada di berkasnya. */
  missingBi: { currency: string; date: string }[];
}

/**
 * Rencana kurs pembayaran kontrak.
 *
 * Mata uang pembayaran yang BERBEDA dari kontraknya tidak diisi: pengimpor lama
 * menulis `currency: "USD"` ke setiap pembayaran (tabel lamanya tidak punya kolom
 * mata uang), sehingga pembayaran atas kontrak CNY berlabel USD. Memberinya kurs
 * USD akan menilai yuan sebagai dolar — tujuh kali lipat. Label itu dibetulkan
 * lebih dulu (opsi `--relabel-payment-currency` di skrip), atau barisnya
 * dibiarkan dan dilaporkan.
 */
export function planPaymentRates(
  payments: readonly PaymentRow[],
  refs: readonly ConversionRef[],
  bi: BiRateTable,
  windowDays = 7
): FillPlan {
  const plan: FillPlan = { fills: [], unfillable: [], missingBi: [] };
  for (const p of payments) {
    const label = `bayar kontrak #${p.id} (${p.currency}, ${p.date})`;
    if (p.hasLiveJournal) {
      plan.unfillable.push({ id: p.id, label, reason: "sudah berjurnal — nilai IDR-nya ada di buku besar" });
      continue;
    }
    if (!FILLABLE_CURRENCIES.includes(p.currency)) {
      plan.unfillable.push({ id: p.id, label, reason: `mata uang "${p.currency}" tidak dikenal` });
      continue;
    }
    if (p.currency !== p.contractCurrency) {
      plan.unfillable.push({
        id: p.id,
        label,
        reason: `label ${p.currency} ≠ mata uang kontraknya ${p.contractCurrency}`,
      });
      continue;
    }
    let choice: RateChoice | null = conversionRateFor(refs, p.currency, p.date, windowDays);
    if (!choice) {
      const b = biMiddleRate(bi, p.currency, p.date);
      if (!b) {
        plan.missingBi.push({ currency: p.currency, date: p.date });
        plan.unfillable.push({ id: p.id, label, reason: "tak ada konversi ≤ 7 hari dan kurs BI tidak tersedia" });
        continue;
      }
      choice = { rate: b.rate, source: "bi", refDate: b.refDate, refIds: [] };
    }
    const { rate, baseAmount } = fxAmounts(p.currency, p.amount, choice.rate);
    plan.fills.push({
      id: p.id,
      currency: p.currency,
      date: p.date,
      rate,
      baseAmount,
      source: choice.source,
      refDate: choice.refDate,
      refIds: choice.refIds,
    });
  }
  return plan;
}

export interface ContractRow {
  id: number;
  contractNo: string;
  date: string;
  currency: string;
  items: { bags: number; kgPerBag: number; pricePerKg: number }[];
  hasLiveJournal: boolean;
}

/** Rencana kurs kontrak — kurs tengah BI di tanggal kontrak. */
export function planContractRates(contracts: readonly ContractRow[], bi: BiRateTable): FillPlan {
  const plan: FillPlan = { fills: [], unfillable: [], missingBi: [] };
  for (const c of contracts) {
    const label = `kontrak ${c.contractNo} (${c.currency}, ${c.date})`;
    if (c.hasLiveJournal) {
      plan.unfillable.push({ id: c.id, label, reason: "sudah berjurnal — nilai IDR-nya ada di buku besar" });
      continue;
    }
    if (!FILLABLE_CURRENCIES.includes(c.currency)) {
      plan.unfillable.push({ id: c.id, label, reason: `mata uang "${c.currency}" tidak dikenal` });
      continue;
    }
    const b = biMiddleRate(bi, c.currency, c.date);
    if (!b) {
      plan.missingBi.push({ currency: c.currency, date: c.date });
      plan.unfillable.push({ id: c.id, label, reason: "kurs BI tidak tersedia untuk tanggal ini" });
      continue;
    }
    const fx = contractFx(c.currency, c.items, b.rate);
    if (fx.rate == null || fx.baseAmount == null) {
      plan.unfillable.push({ id: c.id, label, reason: "contractFx tidak menghasilkan kurs" });
      continue;
    }
    plan.fills.push({
      id: c.id,
      currency: c.currency,
      date: c.date,
      rate: fx.rate,
      baseAmount: fx.baseAmount,
      source: "bi",
      refDate: b.refDate,
      refIds: [],
    });
  }
  return plan;
}

/** Ringkasan sebuah rencana untuk laporan: per mata uang × sumber. */
export function summarizeFills(fills: readonly FillRow[]) {
  const per = new Map<
    string,
    { count: number; bySource: Record<RateSource, number>; minRate: number; maxRate: number; base: number }
  >();
  for (const f of fills) {
    let s = per.get(f.currency);
    if (!s) {
      s = {
        count: 0,
        bySource: { same_day: 0, nearest_7d: 0, bi: 0 },
        minRate: Infinity,
        maxRate: -Infinity,
        base: 0,
      };
      per.set(f.currency, s);
    }
    s.count++;
    s.bySource[f.source]++;
    s.minRate = Math.min(s.minRate, f.rate);
    s.maxRate = Math.max(s.maxRate, f.rate);
    s.base = round2(s.base + f.baseAmount);
  }
  return per;
}

/**
 * Kurs terpilih yang menyimpang jauh dari kurs tengah BI di hari yang sama —
 * PERINGATAN, bukan penolakan. Pemilik sudah memutuskan acuan mana yang rusak;
 * yang ini hanya memastikan bila ada baris keempat yang serupa, ia terlihat di
 * laporan uji-kering sebelum dipakai, bukan sesudahnya.
 */
export function rateOutliers(
  fills: readonly FillRow[],
  bi: BiRateTable,
  tolerance = 0.15
): { id: number; currency: string; date: string; rate: number; bi: number; refIds: number[] }[] {
  const out: { id: number; currency: string; date: string; rate: number; bi: number; refIds: number[] }[] = [];
  for (const f of fills) {
    if (f.source === "bi") continue;
    const b = biMiddleRate(bi, f.currency, f.date);
    if (b && Math.abs(f.rate - b.rate) / b.rate > tolerance) {
      out.push({ id: f.id, currency: f.currency, date: f.date, rate: f.rate, bi: b.rate, refIds: f.refIds });
    }
  }
  return out;
}
