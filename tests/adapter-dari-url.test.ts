/**
 * TIDAK ADA YANG BOLEH MEMAKU ADAPTER BASIS DATA
 * (penukaran PostgreSQL — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase E)
 *
 * == CACAT YANG DIJAGA, DAN IA SUDAH MENJATUHKAN PRODUKSI ==================
 * 28 skrip membangun adapternya sendiri dengan `new PrismaMariaDb({...})`.
 * Selama mesinnya MariaDB itu tidak terlihat salah di mana pun.
 *
 * Pada penukaran 15 Okt 2026 ia muncul sebagai:
 *
 *   PrismaClientInitializationError: The Driver Adapter `@prisma/adapter-mariadb`,
 *   based on `mysql`, is not compatible with the provider `postgres`
 *
 * `migrate` gagal, dan karena `app-*` bergantung padanya lewat `depends_on`,
 * seluruh aplikasi tidak naik. Satu baris yang memaku mesin di 28 tempat.
 *
 * == KENAPA TIPE JUGA DIJAGA, BUKAN HANYA KONSTRUKSI =======================
 * Tujuh skrip menulis `adapter: PrismaMariaDb` sebagai TIPE di tanda tangan
 * generiknya. Itu memaku mesin di tingkat tipe — dan tipe yang memaku mesin
 * akan MENOLAK adapter yang benar saat mesinnya berganti, dengan galat yang
 * menunjuk ke tempat yang salah.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const AKAR = process.cwd();

function berkasTs(dir: string): string[] {
  const keluar: string[] = [];
  const telusuri = (p: string) => {
    for (const e of readdirSync(join(AKAR, p), { withFileTypes: true })) {
      const anak = `${p}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "generated" || e.name === "node_modules" || e.name === ".next") continue;
        telusuri(anak);
      } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
        keluar.push(anak);
      }
    }
  };
  telusuri(dir);
  return keluar;
}

/** Satu-satunya berkas yang BOLEH menyebut adapter per mesin. */
const PABRIK = "packages/db/src/adapter.ts";

/**
 * Isi berkas TANPA komentar.
 *
 * ⚠ Ini bukan kerapian. Komentar yang MENJELASKAN adapter per mesin — mis.
 * `src/lib/ledger.ts` yang merekam bug kolasi `@prisma/adapter-mariadb` —
 * akan membuat berkasnya tampak melanggar. Tes yang menghukum dokumentasi
 * yang baik akan membuat orang menghapus dokumentasinya.
 *
 * Pola ini sudah menggigit TIGA kali di repo ini (pg-trigger-parity,
 * postgres-service-utama, dan di sini).
 */
function tanpaKomentar(f: string): string {
  return readFileSync(join(AKAR, f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("adapter basis data dipilih dari URL, tidak pernah dipaku", () => {
  const semua = [...berkasTs("scripts"), ...berkasTs("src"), ...berkasTs("packages")];

  it("ada berkas untuk diperiksa — penjaga atas tes ini sendiri", () => {
    expect(semua.length).toBeGreaterThan(50);
    expect(semua).toContain(PABRIK);
  });

  it.each([
    ["@prisma/adapter-mariadb", /@prisma\/adapter-mariadb/],
    ["@prisma/adapter-pg", /@prisma\/adapter-pg/],
  ])("hanya @sai/db/adapter yang mengimpor %s", (_nama, pola) => {
    const pelanggar = semua.filter(
      (f) => f !== PABRIK && pola.test(tanpaKomentar(f))
    );
    expect(
      pelanggar,
      "Impor adapter per mesin MEMAKU mesinnya. Pakai `buatAdapter(url, { batasKoneksi })` " +
        "dari `@sai/db/adapter` — ia memilih adapter dari skema URL."
    ).toEqual([]);
  });

  it("nol `new PrismaMariaDb` / `new PrismaPg` di luar pabriknya", () => {
    const pelanggar = semua.filter(
      (f) => f !== PABRIK && /new\s+(PrismaMariaDb|PrismaPg)\s*\(/.test(tanpaKomentar(f))
    );
    expect(pelanggar).toEqual([]);
  });

  it("nol tipe `adapter: PrismaMariaDb` — memaku mesin di tingkat TIPE", () => {
    /* Bentuk inilah yang lolos dari pemeriksaan konstruksi: tidak ada `new`,
       jadi sapuan yang hanya mencari konstruktor akan menyatakannya bersih. */
    const pelanggar = semua.filter(
      (f) => f !== PABRIK && /adapter:\s*(PrismaMariaDb|PrismaPg)\b/.test(tanpaKomentar(f))
    );
    expect(
      pelanggar,
      "Pakai `AdapterBasisData` dari `@sai/db/adapter` sebagai tipenya."
    ).toEqual([]);
  });

  it("driver `mariadb` mentah hanya di @sai/db/server (+ dua alat migrasi data)", () => {
    /* Bentuk ketiga dari cacat yang sama, dan yang paling senyap: tanpa Prisma
       sama sekali. `makeLatestJournalDateReader` memaku `createPool` milik
       `mariadb`; sesudah penukaran setiap pembacaan gagal tersambung, galatnya
       ditelan, dan jangkar retensi hapus-tenant jatuh ke hari ini (#636).
       Kedua alat `pg-*` memang membaca MariaDB: itu tugasnya, dan keduanya
       ikut dicabut di Fase E. */
    const BOLEH = [
      "packages/db/src/server.ts",
      "scripts/pg-migrate-data.ts",
      "scripts/pg-prove-parity.ts",
    ];
    const pelanggar = semua.filter(
      (f) => !BOLEH.includes(f) && /from\s+["']mariadb["']|require\(\s*["']mariadb["']/.test(tanpaKomentar(f))
    );
    expect(
      pelanggar,
      "Driver per mesin MEMAKU mesinnya. Pakai `bukaBasisData(url, nama)` dari `@sai/db/server`."
    ).toEqual([]);
  });

  it("pabriknya sendiri memilih dari MESIN, bukan dari sakelar env", () => {
    const isi = readFileSync(join(AKAR, PABRIK), "utf8");
    expect(isi).toMatch(/uraikanUrl/);
    expect(isi).toMatch(/mesin === "postgresql"/);
    /* Sakelar env terpisah bisa menyimpang dari URL-nya — satu disetel, satunya
       lupa — lalu aplikasi menyambung ke mesin A sambil mengirim SQL mesin B. */
    expect(isi).not.toMatch(/process\.env\.\w*ENGINE/);
  });

  it("pabriknya memakai impor RELATIF, bukan alias `@/`", () => {
    /* Ia dipakai 28 skrip di luar Next, dan sebagian dijalankan `tsx` yang
       tidak selalu menyelesaikan alias tsconfig. Alias yang gagal di sana
       muncul saat BERJALAN, bukan saat `tsc`. */
    const isi = readFileSync(join(AKAR, PABRIK), "utf8");
    expect(isi).toMatch(/from "\.\/engine"/);
    expect(isi).not.toMatch(/from "@\//);
  });
});
