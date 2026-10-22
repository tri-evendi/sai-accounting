/**
 * PENJAGA expand/contract atas migration PostgreSQL.
 *
 * ══ KENAPA PENJAGA DAN BUKAN KEBIASAAN ════════════════════════════════════
 * Rancangan §12 menyebut aturan ini "ditegakkan penjaga, bukan kebiasaan", dan
 * §6 menyebutnya **PRASYARAT** — bukan pelengkap — bagi apa pun yang memindahkan
 * penerapan migration keluar dari gerbang pemblokir:
 *
 * > *"Memindahkan migration ke antrean tanpa expand/contract berarti aplikasi
 * > melayani buku yang skemanya lebih tua daripada kodenya, yaitu persis keadaan
 * > yang expand/contract ada untuk membuatnya aman."*
 *
 * Hari ini SETIAP migration di `prisma/postgresql/` sudah expand-only — tak ada
 * satu pun `DROP`, `RENAME`, atau penyempitan tipe. Jadi penjaga ini tidak
 * memperbaiki apa pun; ia mengubah **kenyataan yang kebetulan** menjadi
 * **aturan yang dijaga**. Bedanya muncul pada orang berikutnya yang menulis
 * `DROP COLUMN` karena tidak ada yang memberitahunya.
 *
 * ══ YANG DIJAGA: "KODE LAMA MASIH JALAN DI SKEMA BARU" ════════════════════
 * Satu kalimat memutuskan apakah sebuah pernyataan expand atau contract:
 *
 * > Bisakah versi aplikasi yang BERJALAN SEKARANG — yang belum tahu apa-apa
 * > tentang migration ini — tetap membaca dan menulis setelah ia diterapkan?
 *
 * Itu sebabnya daftar di bawah terlihat tidak simetris, dan ketidaksimetrisannya
 * disengaja: **melepas** batasan aman (kode lama tidak pernah bergantung pada
 * sesuatu DITOLAK), sementara **menambah** batasan tidak (kode lama menulis
 * tanpa mengetahuinya).
 *
 * ══ ARSIP MariaDB TIDAK DIPINDAI, DAN ITU BUKAN KELONGGARAN ═══════════════
 * `prisma/_arsip-mariadb/company/` dan `prisma/_arsip-mariadb/{control,platform}/` adalah arsip
 * hanya-baca: migration yang ditulis di sana tidak akan pernah diterapkan
 * (AGENTS.md §Database). Ia memuat **33 `RENAME`, satu `DROP TABLE`, satu
 * `DROP COLUMN`, delapan `MODIFY COLUMN`** — riwayat yang sudah terjadi, pada
 * mesin yang sudah diganti. Memindainya akan membuat penjaga ini merah atas
 * masa lalu yang tidak bisa diubah siapa pun, dan penjaga yang merah karena hal
 * yang tak bisa diperbaiki adalah penjaga yang dimatikan orang.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const AKAR_MIGRATION = join(AKAR_REPO, "prisma/postgresql");
const TINGKAT = ["company", "control", "platform"] as const;

/**
 * Kontraksi yang DIIZINKAN, satu entri per pernyataan.
 *
 * Kosong hari ini, dan bentuknya ditulis di sini supaya entri pertama tidak
 * perlu menebak apa yang harus dibuktikan. Setiap entri WAJIB menyebut rilis
 * tempat paruh **expand**-nya sudah terkirim — sebab itulah satu-satunya yang
 * membuat kontraksi aman, dan satu-satunya yang tidak bisa disimpulkan dari
 * berkas SQL-nya sendiri.
 *
 * ⚠ Menambah entri di sini adalah KEPUTUSAN RILIS, bukan perbaikan tes: ia
 * menyatakan bahwa tidak ada lagi instans berjalan yang memakai bentuk lama.
 * Pada pemasangan on-premise pernyataan itu tidak bisa diperiksa dari sini —
 * dan itu sebabnya jendela dukungan (§12) harus tertulis lebih dulu.
 */
const KONTRAKSI_DIIZINKAN: {
  migration: string;
  pernyataan: string;
  expandDiRilis: string;
  sebab: string;
}[] = [];

/**
 * Satu migration yang sudah diurai: pernyataannya, dan tabel yang IA sendiri
 * buat.
 *
 * Yang kedua menentukan, dan saya menemukannya dengan menabraknya: penjaga
 * versi pertama menuding **69** `CREATE UNIQUE INDEX` di baseline. Semuanya
 * benar — Prisma menulis indeks uniknya sebagai pernyataan TERSENDIRI sesudah
 * `CREATE TABLE`, bukan sebagai constraint di dalamnya. Indeks unik atas tabel
 * yang baru dibuat di migration yang sama tidak bisa mematahkan kode mana pun:
 * tak ada kode lama yang menulis ke tabel yang belum ada.
 */
interface MigrationTerurai {
  pernyataan: string[];
  tabelBaru: Set<string>;
}

function urai(sql: string): MigrationTerurai {
  /* Komentar dulu: repo ini menulis puluhan baris alasan di atas setiap
     migration, dan "DROP COLUMN" paling sering muncul di dalam penjelasan
     mengapa ia TIDAK dilakukan. Penjaga yang menolaknya memaksa alasannya
     dihapus dari tempat ia paling berguna (`tanpaKomentar`, akar-sumber.ts). */
  const bersih = sql
    .split("\n")
    .filter((baris) => !baris.trim().startsWith("--"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  /*
   * ⚠ Isi `CREATE TABLE (...)` dibuang SEBELUM apa pun diperiksa, dan ini
   * bagian yang paling mudah salah di seluruh berkas ini.
   *
   * `NOT NULL` di dalam tabel BARU sepenuhnya aman — tak ada kode lama yang
   * menulis ke tabel yang belum ada. `NOT NULL` yang ditambahkan ke kolom
   * tabel yang SUDAH ADA justru kebalikannya. Keduanya teks yang sama persis.
   *
   * Repo ini punya 96 `CREATE TABLE`; penjaga yang tidak membuang isinya akan
   * menuding semuanya, dan penjaga yang menuding 96 hal yang benar akan
   * dimatikan pada hari pertama.
   */
  const tanpaIsiTabel = bersih.replace(
    /CREATE\s+TABLE[\s\S]*?\n\);/gi,
    "CREATE TABLE <dibuang>;"
  );

  /* Nama tabel dikumpulkan dari teks SEBELUM isinya dibuang. */
  const tabelBaru = new Set<string>();
  for (const m of bersih.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi)) {
    tabelBaru.add(m[1].toLowerCase());
  }

  return {
    pernyataan: tanpaIsiTabel
      .split(";")
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0),
    tabelBaru,
  };
}

/** Tabel yang disasar sebuah `CREATE ... INDEX ... ON <tabel>`. */
function tabelIndeks(p: string): string | null {
  return p.match(/\bON\s+"?([A-Za-z0-9_]+)"?/i)?.[1]?.toLowerCase() ?? null;
}

/**
 * Aturan kontraksi — masing-masing menjawab "kode lama berhenti jalan kenapa".
 *
 * Yang TIDAK ada di sini, dan sengaja: `DROP CONSTRAINT`, `DROP INDEX`, dan
 * `DROP NOT NULL`. Ketiganya MELEPAS batasan, dan kode lama tidak pernah
 * bergantung pada sesuatu ditolak — ia bergantung pada sesuatu diterima.
 * Melarangnya akan menghalangi justru paruh pertama expand/contract yang benar.
 */
type Konteks = { tabelBaru: Set<string> };

/*
 * `cocok` adalah FUNGSI, bukan `RegExp` — dan itu bukan kelebihan rekayasa:
 * dua dari delapan aturan di bawah TIDAK bisa dinyatakan satu pola, dan
 * keduanya saya temukan dengan salah lebih dulu.
 *
 *   • `ADD COLUMN ... NOT NULL` aman bila ada `DEFAULT`, dan PostgreSQL
 *     menerima kedua urutan (`NOT NULL DEFAULT 0` maupun `DEFAULT 0 NOT
 *     NULL`). Pola dengan lookahead di antara keduanya lolos pada urutan yang
 *     satu dan gagal pada yang lain — uji positifnya sendiri yang
 *     membuktikannya;
 *   • `CREATE UNIQUE INDEX` aman pada tabel yang dibuat migration yang SAMA,
 *     dan itu fakta tentang berkasnya, bukan tentang pernyataannya.
 */
const ATURAN: {
  nama: string;
  cocok: (p: string, ctx: Konteks) => boolean;
  kenapa: string;
}[] = [
  {
    nama: "DROP TABLE",
    cocok: (p) => /\bDROP\s+TABLE\b/i.test(p),
    kenapa: "kode lama masih meng-SELECT tabel itu",
  },
  {
    nama: "DROP COLUMN",
    cocok: (p) => /\bDROP\s+COLUMN\b/i.test(p),
    kenapa: "kode lama masih menyebut kolom itu — di SELECT maupun di INSERT",
  },
  {
    nama: "RENAME",
    cocok: (p) => /\bRENAME\b/i.test(p),
    kenapa:
      "ganti nama adalah DROP dan ADD dalam satu langkah: kode lama menyebut nama lama, kode baru nama baru, dan tidak ada saat di mana keduanya benar",
  },
  {
    nama: "SET NOT NULL",
    cocok: (p) => /\bALTER\s+COLUMN\b[\s\S]*?\bSET\s+NOT\s+NULL\b/i.test(p),
    kenapa:
      "kode lama menulis tanpa kolom itu; INSERT-nya mulai GAGAL — dan gagal pada tulisan, yaitu tempat kegagalan paling mahal",
  },
  {
    nama: "ADD COLUMN NOT NULL tanpa DEFAULT",
    /* Setiap klausa `ADD COLUMN` diperiksa SENDIRI: satu pernyataan boleh
       memuat beberapa, dan yang satu ber-DEFAULT tidak menyelamatkan yang lain. */
    cocok: (p) =>
      p
        .split(/\bADD\s+COLUMN\b/i)
        .slice(1)
        .some((klausa) => {
          const sampaiKlausaBerikut = klausa.split(/,\s*(?=ADD\b|ALTER\b|DROP\b)/i)[0];
          return (
            /\bNOT\s+NULL\b/i.test(sampaiKlausaBerikut) &&
            !/\bDEFAULT\b/i.test(sampaiKlausaBerikut)
          );
        }),
    kenapa:
      "sama dengan di atas, DAN ia gagal seketika pada tabel yang sudah berisi baris. Dengan DEFAULT ia aman, jadi yang dilarang hanya yang tanpa",
  },
  {
    nama: "ALTER COLUMN TYPE",
    cocok: (p) => /\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b/i.test(p),
    kenapa:
      "penyempitan tipe memotong data yang sudah ada, dan pelebaran pun mengubah apa yang dipulangkan driver ke kode lama (Decimal→Float adalah uang yang berubah nilainya)",
  },
  {
    nama: "CREATE UNIQUE INDEX pada tabel yang sudah ada",
    cocok: (p, ctx) => {
      if (!/\bCREATE\s+UNIQUE\s+INDEX\b/i.test(p)) return false;
      const tabel = tabelIndeks(p);
      /* Tabel yang dibuat migration INI: tak ada kode lama yang menulisinya. */
      return tabel === null || !ctx.tabelBaru.has(tabel);
    },
    kenapa:
      "kode lama tidak tahu nilainya harus unik dan akan menulis duplikat; INSERT-nya mulai gagal. Pada tabel BARU ini aman — dan tabel baru memakai constraint di dalam CREATE TABLE, yang tidak dipindai",
  },
  {
    nama: "UPDATE / DELETE data",
    cocok: (p) => /^\s*(UPDATE|DELETE\s+FROM)\b/i.test(p),
    kenapa:
      "migration adalah perubahan SKEMA. Tulisan data di dalamnya berjalan sekali, tanpa transaksi yang bisa dibatalkan per tenant, pada 19 basis data — dan tidak punya jejak audit. Backfill adalah skrip, dengan pemiliknya sendiri",
  },
];

interface Temuan {
  tingkat: string;
  migration: string;
  aturan: string;
  pernyataan: string;
  kenapa: string;
}

function pindai(): Temuan[] {
  const temuan: Temuan[] = [];
  for (const tingkat of TINGKAT) {
    const dir = join(AKAR_MIGRATION, tingkat);
    if (!existsSync(dir)) continue;
    for (const migration of readdirSync(dir).sort()) {
      const berkas = join(dir, migration, "migration.sql");
      if (!existsSync(berkas)) continue;
      const { pernyataan, tabelBaru } = urai(readFileSync(berkas, "utf8"));
      for (const p of pernyataan) {
        for (const aturan of ATURAN) {
          if (!aturan.cocok(p, { tabelBaru })) continue;
          const diizinkan = KONTRAKSI_DIIZINKAN.some(
            (izin) => izin.migration === `${tingkat}/${migration}` && p.includes(izin.pernyataan)
          );
          if (!diizinkan) {
            temuan.push({
              tingkat,
              migration,
              aturan: aturan.nama,
              pernyataan: p.slice(0, 160),
              kenapa: aturan.kenapa,
            });
          }
        }
      }
    }
  }
  return temuan;
}

describe("migration PostgreSQL wajib expand-only", () => {
  it("tidak ada satu pun pernyataan yang mematahkan kode lama", () => {
    const temuan = pindai();
    const laporan = temuan
      .map(
        (t) =>
          `  ${t.tingkat}/${t.migration} — ${t.aturan}\n` +
          `    ${t.pernyataan}\n` +
          `    kode lama patah sebab: ${t.kenapa}`
      )
      .join("\n\n");
    expect(
      temuan,
      "Migration berikut BUKAN expand-only. Pecah jadi dua rilis: paruh " +
        "EXPAND sekarang (tambah yang baru, biarkan yang lama), paruh CONTRACT " +
        "sesudah tak ada lagi instans yang memakai bentuk lama — lalu daftarkan " +
        `di KONTRAKSI_DIIZINKAN beserta rilis expand-nya.\n\n${laporan}`
    ).toEqual([]);
  });

  it("setiap migration punya `migration.sql` yang terbaca", () => {
    /* Direktori migration tanpa berkasnya diam-diam TIDAK diterapkan
       `migrate deploy`, dan tidak ada yang mengeluh. */
    const kosong: string[] = [];
    for (const tingkat of TINGKAT) {
      const dir = join(AKAR_MIGRATION, tingkat);
      if (!existsSync(dir)) continue;
      for (const m of readdirSync(dir)) {
        const berkas = join(dir, m, "migration.sql");
        if (!existsSync(berkas) || readFileSync(berkas, "utf8").trim().length === 0) {
          kosong.push(`${tingkat}/${m}`);
        }
      }
    }
    expect(kosong, "direktori migration tanpa SQL").toEqual([]);
  });
});

describe("penjaganya sendiri harus benar-benar MENANGKAP sesuatu", () => {
  /*
   * Penjaga di atas hijau karena repo ini memang bersih — dan penjaga yang
   * hijau karena tidak ada pelanggar tidak bisa dibedakan dari penjaga yang
   * hijau karena pencocoknya rusak. Keempat belas berkas uji di bawah adalah
   * pembedanya: ia memberi aturan itu bahan yang HARUS ditolak.
   */
  const jalankan = (sql: string) => {
    const { pernyataan, tabelBaru } = urai(sql);
    return pernyataan.flatMap((p) =>
      ATURAN.filter((a) => a.cocok(p, { tabelBaru })).map((a) => a.nama)
    );
  };

  it.each([
    ['ALTER TABLE "jobs" DROP COLUMN "payload";', "DROP COLUMN"],
    ['DROP TABLE "jobs";', "DROP TABLE"],
    ['ALTER TABLE "jobs" RENAME COLUMN "a" TO "b";', "RENAME"],
    ['ALTER TABLE "jobs" ALTER COLUMN "kind" SET NOT NULL;', "SET NOT NULL"],
    ['ALTER TABLE "jobs" ADD COLUMN "x" integer NOT NULL;', "ADD COLUMN NOT NULL tanpa DEFAULT"],
    ['ALTER TABLE "jobs" ALTER COLUMN "amount" TYPE double precision;', "ALTER COLUMN TYPE"],
    ['CREATE UNIQUE INDEX "jobs_x" ON "jobs"("x");', "CREATE UNIQUE INDEX pada tabel yang sudah ada"],
    ["UPDATE jobs SET status = 'queued';", "UPDATE / DELETE data"],
    ["DELETE FROM jobs;", "UPDATE / DELETE data"],
  ])("menolak: %s", (sql, aturan) => {
    expect(jalankan(sql)).toContain(aturan);
  });

  it.each([
    ['ALTER TABLE "jobs" ADD COLUMN "started_at" TIMESTAMP(3);', "kolom baru yang nullable"],
    [
      'ALTER TABLE "jobs" ADD COLUMN "x" integer NOT NULL DEFAULT 0;',
      "NOT NULL dengan DEFAULT — kode lama tetap bisa INSERT",
    ],
    ['CREATE INDEX "jobs_x" ON "jobs"("x");', "indeks non-unik tidak menolak tulisan apa pun"],
    [
      'ALTER TABLE "jobs" DROP CONSTRAINT "jobs_x_fkey";',
      "MELEPAS batasan — kode lama tidak pernah bergantung pada sesuatu ditolak",
    ],
    [
      'ALTER TABLE "jobs" ALTER COLUMN "kind" DROP NOT NULL;',
      "idem: melepas, bukan menambah",
    ],
    [
      'CREATE TABLE "baru" (\n  "id" serial NOT NULL,\n  "wajib" text NOT NULL\n);',
      "NOT NULL di tabel BARU aman — tak ada kode lama yang menulis ke tabel yang belum ada",
    ],
    [
      'CREATE TABLE "baru" (\n  "id" serial NOT NULL\n);\nCREATE UNIQUE INDEX "baru_id_key" ON "baru"("id");',
      "indeks unik atas tabel yang dibuat migration INI — bentuk yang Prisma tulis di setiap baseline (69 kali di repo ini)",
    ],
    [
      'ALTER TABLE "jobs" ADD COLUMN "x" integer DEFAULT 0 NOT NULL;',
      "urutan terbalik, tetap ber-DEFAULT — PostgreSQL menerima keduanya, dan pola dengan lookahead di antaranya hanya menangkap salah satu",
    ],
  ])("meloloskan: %s", (sql) => {
    expect(jalankan(sql)).toEqual([]);
  });

  it("pengecualian tabel-baru TIDAK menelan indeks unik di tabel lain", () => {
    /*
     * Pengecualiannya berlaku per TABEL, bukan per migration. Satu migration
     * yang membuat tabel baru DAN menambahkan indeks unik ke tabel lama adalah
     * bentuk yang paling mudah lolos dari penjaga yang hanya bertanya "apakah
     * migration ini membuat tabel?" — dan justru paruh contract-nya yang
     * berbahaya.
     */
    const sql = [
      'CREATE TABLE "baru" (',
      '  "id" serial NOT NULL',
      ");",
      'CREATE UNIQUE INDEX "baru_id_key" ON "baru"("id");',
      'CREATE UNIQUE INDEX "jobs_dedupe_key" ON "jobs"("dedupe_key");',
    ].join("\n");
    expect(jalankan(sql)).toEqual(["CREATE UNIQUE INDEX pada tabel yang sudah ada"]);
  });

  it("komentar yang MENYEBUT pola terlarang tidak ikut tertuduh", () => {
    /* Repo ini menulis alasan panjang di atas setiap migration, dan "DROP
       COLUMN" paling sering muncul justru di penjelasan mengapa ia TIDAK
       dilakukan. Lima kemunculan pola yang sama sudah pernah membuat penjaga
       lain salah tuding — aturannya di `akar-sumber.ts`. */
    const sql = [
      "-- Tanpa backfill, dan TANPA DROP COLUMN: kode lama masih menyebutnya.",
      "-- Kalau suatu hari ia di-DROP TABLE, paruh expand-nya harus terkirim dulu.",
      '/* RENAME juga tidak dipakai di sini. */',
      'ALTER TABLE "jobs" ADD COLUMN "started_at" TIMESTAMP(3);',
    ].join("\n");
    expect(jalankan(sql)).toEqual([]);
  });

  it("daftar-izin menuntut rilis expand-nya disebut, bukan sekadar terdaftar", () => {
    /*
     * Entri tanpa rilis expand adalah entri yang tidak bisa diperiksa siapa
     * pun: satu-satunya yang membuat kontraksi aman adalah bahwa paruh
     * pertamanya SUDAH terkirim, dan itu fakta rilis — tidak tersimpan di
     * berkas SQL mana pun.
     */
    for (const izin of KONTRAKSI_DIIZINKAN) {
      expect(izin.expandDiRilis.trim().length, `${izin.migration}: rilis expand`).toBeGreaterThan(0);
      expect(izin.sebab.trim().length, `${izin.migration}: sebab`).toBeGreaterThan(20);
    }
  });

  it("arsip MariaDB TIDAK dipindai — ia hanya-baca dan memang memuat DROP", () => {
    /*
     * Pembuktian dua arah, dan ini yang membuat pengecualiannya bukan
     * kelonggaran: arsipnya SUNGGUH memuat pernyataan yang aturan di atas
     * tolak (33 RENAME, satu DROP TABLE, satu DROP COLUMN). Memindainya akan
     * membuat penjaga ini merah atas masa lalu yang tidak bisa diubah siapa
     * pun — dan penjaga yang merah karena hal yang tak bisa diperbaiki adalah
     * penjaga yang dimatikan orang.
     */
    const arsip = join(AKAR_REPO, "prisma/_arsip-mariadb/company");
    if (!existsSync(arsip)) return;
    const semua = readdirSync(arsip)
      .map((m) => join(arsip, m, "migration.sql"))
      .filter((f) => existsSync(f))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(semua, "arsip memuat DDL merusak — karena itu ia dikecualikan").toMatch(/\bRENAME\b/i);
    /* Dan jalur yang dipindai TIDAK memuat arsipnya. */
    expect(AKAR_MIGRATION).toContain("prisma/postgresql");
  });
});
