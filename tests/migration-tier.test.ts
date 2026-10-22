/**
 * MIGRASI BERDIRI DI TINGKAT YANG BENAR (issue #458).
 *
 * ══ KENAPA PENJAGA INI ADA ═════════════════════════════════════════════════
 * Repo ini punya TIGA basis data dengan tiga skema dan tiga direktori migrasi:
 *
 *   prisma/postgresql/company  → basis data PERUSAHAAN (satu per PT, #104)
 *   prisma/postgresql/control  → basis data KENDALI (pengguna, tenant, PT)
 *   prisma/postgresql/platform → basis data PLATFORM (paket, tagihan kami)
 *
 * …ditambah riwayat MariaDB-nya di `prisma/_arsip-mariadb/<tingkat>` (arsip
 * hanya-baca sejak #636). Sampai #636 penjaga ini HANYA memindai pohon MariaDB,
 * jadi migration PostgreSQL yang ditulis sejak 15 Okt 2026 tidak dijaga sama
 * sekali — kini keduanya.
 *
 * Menaruh migrasi di direktori yang salah TIDAK BERBUNYI di `bun run verify`:
 * tidak ada basis data yang disentuh tes. Ia berbunyi pertama kali di
 * PRODUKSI, saat `migrate deploy` mencoba `ALTER TABLE registrations` di dalam
 * basis data sebuah PT yang tidak punya tabel itu — lalu gagal untuk SETIAP
 * perusahaan, satu per satu, di tengah deploy.
 *
 * Itu bukan hipotesis: migrasi `0048_registrations_account_name` ditulis ke
 * `prisma/migrations/` (kini `prisma/_arsip-mariadb/company/`) di PR #459 dan baru ketahuan saat pemeriksaan sebelum
 * deploy. Penjaga ini menggantikan pemeriksaan itu dengan sesuatu yang tidak
 * bergantung pada seseorang yang kebetulan ingat.
 *
 * ══ CARANYA ════════════════════════════════════════════════════════════════
 * Nama tabel dibaca dari SQL-nya (`CREATE TABLE` / `ALTER TABLE`) dan
 * dibandingkan dengan `@@map` di skema tingkat itu. Kasar dengan sengaja: yang
 * dijaga bukan kebenaran SQL-nya melainkan TINGKATNYA, dan untuk itu nama
 * tabel sudah cukup.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

const TINGKAT = (["company", "control", "platform"] as const).map((t) => ({
  nama: { company: "perusahaan", control: "kendali", platform: "platform" }[t],
  /** Pohon yang DITERAPKAN lebih dulu — itu yang disebut pesan "pindahkan ke". */
  migrasi: [`prisma/postgresql/${t}`, `prisma/_arsip-mariadb/${t}`],
  skema: `packages/db/prisma/${t}/schema.prisma`,
}));

/**
 * Tabel yang PERNAH ada di tingkat itu lalu pindah/dicabut — beserta sebabnya.
 *
 * Migrasi tidak pernah disunting mundur (ia sudah diterapkan di produksi), jadi
 * riwayat memuat nama yang tidak lagi ada di skema mana pun. Daftar ini dijaga
 * DUA ARAH: entri yang tidak lagi disebut migrasi mana pun ikut merah, supaya
 * ia tidak menjadi tempat menyembunyikan kesalahan berikutnya.
 */
const PERNAH_ADA: Readonly<Record<string, string>> = {
  users:
    "Pindah ke basis data KENDALI di #104 (multi-perusahaan): pengguna adalah milik akun, bukan milik satu buku.",
  cash_accounts: "Dicabut — digantikan akun bertipe `cash_bank` di bagan akun.",
  stock: "Dicabut — saldo stok dihitung dari mutasi, bukan disimpan sebagai tabel tersendiri.",
};

/* Pengutip identifier: backtick (arsip MariaDB) ATAU tanda kutip ganda (PostgreSQL). */
const POLA_TABEL = /(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF (?:NOT )?EXISTS\s+)?(?:ONLY\s+)?[`"]?([a-z0-9_]+)[`"]?/gi;

function tabelDiSkema(path: string): Set<string> {
  return new Set(
    [...readFileSync(join(ROOT, path), "utf8").matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1])
  );
}

function tabelDiMigrasi(dirs: readonly string[]): Map<string, string[]> {
  const hasil = new Map<string, string[]>();
  for (const dir of dirs) {
    const penuh = join(ROOT, dir);
    if (!existsSync(penuh)) continue;

    for (const entri of readdirSync(penuh, { withFileTypes: true })) {
      if (!entri.isDirectory()) continue;
      const sql = join(penuh, entri.name, "migration.sql");
      if (!existsSync(sql)) continue;
      /* Komentar SQL dibuang: "Satu CREATE TABLE baru" di prosa bukan tabel `baru`. */
      const isi = readFileSync(sql, "utf8").replace(/--.*$/gm, "");
      for (const m of isi.matchAll(POLA_TABEL)) {
        const tabel = m[1].toLowerCase();
        hasil.set(tabel, [...(hasil.get(tabel) ?? []), `${dir}/${entri.name}`]);
      }
    }
  }
  return hasil;
}

describe("migrasi berdiri di tingkat basis data yang benar", () => {
  for (const tingkat of TINGKAT) {
    it(`setiap tabel di migrasi ${tingkat.nama} ada di skema ${tingkat.nama}`, () => {
      const skema = tabelDiSkema(tingkat.skema);
      const salahTempat: string[] = [];

      for (const [tabel, migrasi] of tabelDiMigrasi(tingkat.migrasi)) {
        if (skema.has(tabel) || tabel in PERNAH_ADA) continue;

        /* Ke tingkat MANA ia sebenarnya milik? Menyebutnya di pesan galat
           mengubah "ada yang salah" menjadi "pindahkan ke sini". */
        const rumah = TINGKAT.find((t) => t !== tingkat && tabelDiSkema(t.skema).has(tabel));
        salahTempat.push(
          `${migrasi.join(", ")} → \`${tabel}\`` +
            (rumah ? ` (tabel itu milik basis data ${rumah.nama} — pindahkan ke ${rumah.migrasi[0]}/)` : "")
        );
      }

      expect(
        salahTempat,
        `Migrasi ${tingkat.nama} menyentuh tabel yang tidak ada di skemanya:\n\n  ` +
          salahTempat.join("\n  ") +
          "\n\nMigrasi di direktori yang salah TIDAK GAGAL di verify — ia gagal di " +
          "produksi, di tengah deploy, sekali untuk setiap basis data."
      ).toEqual([]);
    });
  }

  it("daftar `PERNAH_ADA` tidak menyimpan entri basi (dijaga dua arah)", () => {
    const semua = new Set(TINGKAT.flatMap((t) => [...tabelDiMigrasi(t.migrasi).keys()]));
    const basi = Object.keys(PERNAH_ADA).filter((t) => !semua.has(t));
    expect(
      basi,
      "Tabel ini tidak disebut migrasi mana pun lagi — keluarkan dari daftar, " +
        "supaya ia tidak menjadi tempat menyembunyikan kesalahan berikutnya."
    ).toEqual([]);
  });

  it("setiap entri `PERNAH_ADA` menyebut SEBABNYA, bukan sekadar terdaftar", () => {
    for (const [tabel, alasan] of Object.entries(PERNAH_ADA)) {
      expect(alasan.length, `alasan untuk \`${tabel}\` terlalu pendek`).toBeGreaterThan(30);
    }
  });
});
