/**
 * PEMBANDING PARITAS Neraca Saldo — TypeScript ⇄ Go (tahap 1d, 09 §9).
 *
 * Fungsi MURNI: dua hasil masuk, daftar selisih keluar. Pemanggilnya
 * `scripts/parity-trial-balance.ts`; aturannya diuji langsung oleh
 * `tests/trial-balance-parity.test.ts`, sebab pembanding yang salah lulus
 * dengan nol selisih — dan "nol selisih" adalah satu-satunya bukti yang dipakai
 * untuk memindahkan jalur berkas ke Go.
 *
 * ══ KETELITIANNYA SEN, DAN ITU KEPUTUSAN ═══════════════════════════════════
 * Go menghitung sen bilangan bulat; TS menjumlahkan float. Membandingkan float
 * mentah akan melaporkan selisih 1e-9 yang tidak ada di buku mana pun, jadi
 * angka TS dibulatkan ke satuan `MONEY_SCALE` (kontrak yang sama yang dibaca
 * Go) lalu dibandingkan sebagai BigInt dengan angka Go yang diurai TEPAT dari
 * teks. Selisih yang tersisa sesudah itu nyata: satu sen yang berbeda adalah
 * satu sen yang berbeda di berkas yang diunduh pengguna.
 */
import { MONEY_SCALE } from "@sai/core/generated/accounting";
import type { TrialBalanceRow } from "@/lib/reports";

/** Bentuk keluaran `parity trial-balance` (Go) — uang sebagai teks desimal. */
export interface GoTrialBalance {
  asOf: string;
  rows: { code: string; name: string; type: string; debit: string; credit: string }[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
  unknownTypes: string[];
}

export interface TsTrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

const UNITS = 10 ** MONEY_SCALE;

/** Float rupiah TS → satuan terkecil (sen), dibulatkan seperti `eq` di reports.ts. */
export function tsUnits(n: number): bigint {
  if (!Number.isFinite(n)) throw new Error(`angka TS tidak terhingga: ${n}`);
  return BigInt(Math.round(n * UNITS));
}

/** Teks desimal Go (`-1234.50`) → satuan terkecil, TEPAT. */
export function goUnits(s: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!m) throw new Error(`angka Go tidak sah: ${JSON.stringify(s)}`);
  const frac = (m[3] ?? "").padEnd(MONEY_SCALE, "0");
  if (frac.length > MONEY_SCALE) {
    throw new Error(`angka Go berpecahan melebihi skala ${MONEY_SCALE}: ${s}`);
  }
  const v = BigInt(m[2]! + frac);
  return m[1] === "-" ? -v : v;
}

/** Satuan terkecil → teks desimal berskala kontrak (`-1234.50`), untuk pesan selisih. */
export const formatUnits = (units: bigint) => {
  const neg = units < BigInt(0);
  const digits = (neg ? -units : units).toString().padStart(MONEY_SCALE + 1, "0");
  const cut = digits.length - MONEY_SCALE;
  return `${neg ? "-" : ""}${digits.slice(0, cut)}${MONEY_SCALE > 0 ? "." + digits.slice(cut) : ""}`;
};

/**
 * Daftar selisih; kosong = setara. Yang dibandingkan: himpunan & URUTAN kode
 * akun, nama, debit, kredit per baris, kedua total, dan vonis seimbang.
 */
export function compareTrialBalance(ts: TsTrialBalance, go: GoTrialBalance): string[] {
  const diffs: string[] = [];

  const tsCodes = ts.rows.map((r) => r.code);
  const goCodes = go.rows.map((r) => r.code);
  const goSet = new Set(goCodes);
  const tsSet = new Set(tsCodes);
  for (const c of tsCodes) if (!goSet.has(c)) diffs.push(`akun ${c}: hanya di TS`);
  for (const c of goCodes) if (!tsSet.has(c)) diffs.push(`akun ${c}: hanya di Go`);

  /* Urutan ikut dibandingkan: berkas yang diunduh dibaca dari atas ke bawah,
     dan dua mesin yang sepakat tentang angka tapi tidak tentang urutan
     menghasilkan dua berkas berbeda. Hanya dilaporkan bila himpunannya sama —
     kalau tidak, selisih urutan hanyalah gema dari baris yang hilang. */
  if (diffs.length === 0 && tsCodes.join("\n") !== goCodes.join("\n")) {
    const i = tsCodes.findIndex((c, k) => c !== goCodes[k]);
    diffs.push(`urutan berbeda mulai baris ${i + 1}: TS ${tsCodes[i]} ⇄ Go ${goCodes[i]}`);
  }

  const goByCode = new Map(go.rows.map((r) => [r.code, r]));
  for (const t of ts.rows) {
    const g = goByCode.get(t.code);
    if (!g) continue;
    if (t.name !== g.name) diffs.push(`akun ${t.code}: nama TS ${JSON.stringify(t.name)} ⇄ Go ${JSON.stringify(g.name)}`);
    const [td, gd] = [tsUnits(t.debit), goUnits(g.debit)];
    if (td !== gd) diffs.push(`akun ${t.code}: debit TS ${formatUnits(td)} ⇄ Go ${formatUnits(gd)}`);
    const [tc, gc] = [tsUnits(t.credit), goUnits(g.credit)];
    if (tc !== gc) diffs.push(`akun ${t.code}: kredit TS ${formatUnits(tc)} ⇄ Go ${formatUnits(gc)}`);
  }

  const [tTD, gTD] = [tsUnits(ts.totalDebit), goUnits(go.totalDebit)];
  if (tTD !== gTD) diffs.push(`total debit TS ${formatUnits(tTD)} ⇄ Go ${formatUnits(gTD)}`);
  const [tTC, gTC] = [tsUnits(ts.totalCredit), goUnits(go.totalCredit)];
  if (tTC !== gTC) diffs.push(`total kredit TS ${formatUnits(tTC)} ⇄ Go ${formatUnits(gTC)}`);
  if (ts.balanced !== go.balanced) {
    diffs.push(`vonis seimbang TS ${ts.balanced} ⇄ Go ${go.balanced}`);
  }
  return diffs;
}
