/**
 * Cacah TUMPUKAN PERHITUNGAN LAPORAN — ongkos tahap 1d yang bisa diulang.
 *
 *   bun run report:count            # tabel per berkas + total
 *   bun run report:count --json     # untuk dibandingkan antar-commit
 *
 * Rancangan 09 §3.3 menyebut ongkos 1d dengan angka ("45 berkas · 14.625
 * baris TS"), tapi angka itu lahir tanpa daftar berkasnya — jadi tak seorang
 * pun bisa mengulanginya, dan angka yang tak bisa diulang tidak bisa dibantah
 * maupun diperbarui. Skrip ini menulis daftarnya SECARA EKSPLISIT di bawah:
 * mengubah cakupan "tumpukan laporan" berarti mengubah `STACK`, di diff yang
 * terbaca, bukan mengubah angka di dokumen.
 *
 * Yang dicacah adalah yang akan DITULIS ULANG bila sebuah generator laporan
 * pindah ke Go: perhitungan (buku besar, neraca saldo, laporan keuangan,
 * piutang, anggaran, persediaan, ekuitas), tata letaknya, dan perakit
 * berkasnya (PDF, lembar sebar). Yang TIDAK dicacah: rute & halaman di
 * `src/app` — mereka PEMAKAI tumpukan ini, dan jumlahnya dicetak terpisah
 * sebagai "pengimpor", sebab itulah ongkos transisi dua-implementasi (§3.3
 * baris kedua), bukan ongkos penulisan ulang.
 *
 * Baris = jumlah karakter baris baru, sama seperti `wc -l`. Komentar ikut
 * dihitung: di repo ini komentar memuat ALASAN aturan akuntansinya, dan
 * penulisan ulang yang membuangnya kehilangan separuh isinya.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const AKAR = join(import.meta.dirname, "..");

/**
 * Cakupan tumpukan laporan. Pola `*` hanya di nama berkas, satu direktori.
 * Urutannya urutan cetak.
 */
const STACK: readonly string[] = [
  // Inti buku & laporan keuangan
  "src/lib/accounting.ts",
  "src/lib/ledger.ts",
  "src/lib/reports.ts",
  "src/lib/statement-layout.ts",
  "src/lib/statement-compare.ts",
  "src/lib/equity-statement.ts",
  "src/lib/expense-nature-report.ts",
  "src/lib/finance-report-rows.ts",
  "src/lib/materiality.ts",
  // Katalog, payload, ringkasan, dan perakit berkas laporan
  "src/lib/report-*.ts",
  "src/lib/xlsx.ts",
  // Laporan per domain
  "src/lib/receivables.ts",
  "src/lib/party-recap.ts",
  "src/lib/budget*.ts",
  "src/lib/stock-*.ts",
  "src/lib/project-profit-report.ts",
  "src/lib/health-report.ts",
  // Generator PDF
  "src/lib/pdf-company.ts",
  "src/lib/pdf/*.ts",
];

function cocok(pola: string): string[] {
  const i = pola.lastIndexOf("/");
  const dir = pola.slice(0, i);
  const nama = pola.slice(i + 1);
  if (!nama.includes("*")) return [pola];
  const re = new RegExp(`^${nama.replace(/[.]/g, "\\.").replace(/\*/g, "[^/]*")}$`);
  return readdirSync(join(AKAR, dir))
    .filter((f) => re.test(f))
    .sort()
    .map((f) => `${dir}/${f}`);
}

function stackFiles(): string[] {
  const hasil: string[] = [];
  for (const pola of STACK) {
    const ditemukan = cocok(pola);
    /* Pola yang tidak menemukan apa pun = cakupan yang diam-diam menyusut
       (berkas dipindah atau diganti nama). Itu galat, bukan nol. */
    if (ditemukan.length === 0) throw new Error(`pola \`${pola}\` tidak menemukan satu berkas pun`);
    for (const f of ditemukan) if (!hasil.includes(f)) hasil.push(f);
  }
  return hasil;
}

function baris(berkas: string): number {
  const isi = readFileSync(join(AKAR, berkas), "utf8");
  let n = 0;
  for (let i = 0; i < isi.length; i++) if (isi.charCodeAt(i) === 10) n++;
  return n;
}

function semuaBerkas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return semuaBerkas(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/** Berkas di `src/app` yang mengimpor SATU atau lebih modul tumpukan (`@/lib/…`). */
function pengimpor(files: readonly string[]): number {
  const spesifier = new Set(files.map((f) => `@/${f.replace(/^src\//, "").replace(/\.ts$/, "")}`));
  let n = 0;
  for (const f of semuaBerkas(join(AKAR, "src/app"))) {
    const isi = readFileSync(f, "utf8");
    for (const m of isi.matchAll(/from\s+"([^"]+)"/g)) {
      if (spesifier.has(m[1])) {
        n++;
        break;
      }
    }
  }
  return n;
}

function main(): void {
  const files = stackFiles();
  const rows = files.map((f) => ({ file: f, lines: baris(f) }));
  const total = rows.reduce((s, r) => s + r.lines, 0);
  const importers = pengimpor(files);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ files: rows.length, lines: total, importers, rows }, null, 2));
    return;
  }
  const lebar = Math.max(...rows.map((r) => r.file.length));
  for (const r of rows) console.log(`${r.file.padEnd(lebar)}  ${String(r.lines).padStart(6)}`);
  console.log("─".repeat(lebar + 8));
  const id = (n: number) => n.toLocaleString("id-ID");
  console.log(`${id(rows.length)} berkas · ${id(total)} baris TS · ${id(importers)} pengimpor di src/app`);
  console.log(`(dihitung ${new Date().toISOString().slice(0, 10)} dari ${relative(process.cwd(), AKAR) || "."})`);
}

main();
