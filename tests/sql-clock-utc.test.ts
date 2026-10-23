/**
 * PENJAGA JAM SQL — di luar `jobs`, jam yang ditulis SQL adalah UTC.
 *
 * Kolom waktu repo ini `TIMESTAMP(3)` TANPA zona. Prisma — penulis hampir
 * seluruh baris — mengisi `@default(now())` dan `@updatedAt` SENDIRI (bukan
 * lewat DEFAULT basis data) dengan jam dinding UTC, dan membacanya kembali
 * sebagai UTC. Diukur di produksi 23 Okt 2026: 35 000+ baris di 19 basis data,
 * NOL baris yang `created_at`/`updated_at`-nya berselisih tujuh jam.
 *
 * Yang TIDAK UTC adalah jam yang dihitung SQL sendiri: `now()`,
 * `CURRENT_TIMESTAMP`, `LOCALTIMESTAMP`, dan DEFAULT `CURRENT_TIMESTAMP` yang
 * menyala saat sebuah INSERT mentah tidak menyebut `created_at`. Semuanya jam
 * dinding zona SESI = zona bawaan server (`Asia/Jakarta` di produksi). Satu
 * baris seperti itu di tabel yang dibaca Prisma tampil tujuh jam meleset,
 * tanpa galat. Sampai 23 Okt 2026 satu-satunya penulis demikian di luar `jobs`
 * adalah `rate-limit-persistent.ts`.
 *
 * Aturannya (docs/DATABASE.md §4 "Kolom waktu"):
 *   1. jam SQL di luar `jobs` ditulis `now() AT TIME ZONE 'UTC'`;
 *   2. INSERT mentah ke tabel ber-`created_at` MENYEBUT `created_at` — jangan
 *      bersandar pada DEFAULT-nya;
 *   3. migration baru yang menyalin/mengisi data mematuhi 1 & 2 juga.
 * `jobs` dikecualikan: jamnya jam `now()` sesi, disengaja dan dijaga
 * `tests/jobs-time-columns.test.ts`. Sisi Go dijaga `tests/services-go.test.ts`
 * ("jam kolom waktu"). Perilakunya dibuktikan terhadap PostgreSQL sungguhan
 * oleh `tests/sql-clock-utc.integration.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { AKAR_REPO, akarSumber } from "./akar-sumber";

/**
 * Berkas yang dikecualikan, beserta sebabnya. Dijaga dua arah: entri yang tidak
 * lagi memuat jam SQL apa pun ikut merah.
 */
const PENGECUALIAN: Readonly<Record<string, string>> = {
  "scripts/prove-onprem-migration.ts":
    "fixture di basis data sekali pakai yang dibuang di akhir pembuktian; jamnya tidak pernah dibaca sebagai instan",
};

/**
 * Migration yang SUDAH diterapkan di produksi sebelum penjaga ini lahir. Tidak
 * disunting mundur (`migrate deploy` memeriksa checksum); 0008 menyalin NOL
 * baris di produksi (`site_content_publications` kosong, diperiksa 23 Okt 2026).
 */
const MIGRATION_LAMA: Readonly<Record<string, string>> = {
  control: "0011_schema_migration_runs",
  platform: "0009_cache_signals",
  company: "0004_efaktur_coretax",
};

/** Tabel ber-`created_at` (dari ketiga skema Prisma). */
function tabelBerCreatedAt(): Set<string> {
  const hasil = new Set<string>();
  for (const t of ["company", "control", "platform"]) {
    const skema = readFileSync(join(AKAR_REPO, "packages/db/prisma", t, "schema.prisma"), "utf8");
    for (const m of skema.matchAll(/\nmodel\s+\w+\s*\{([\s\S]*?)\n\}/g)) {
      const isi = m[1]!;
      const peta = isi.match(/@@map\("([^"]+)"\)/)?.[1];
      if (peta && /@map\("created_at"\)/.test(isi)) hasil.add(peta);
    }
  }
  return hasil;
}

/**
 * Setiap template literal yang DIBUKA dengan kata kunci SQL.
 *
 * Bukan "setiap backtick": satu backtick di dalam string biasa atau regex
 * menggeser pasangan seluruh berkas, dan pemindai yang tergeser lulus diam-diam.
 */
function templateSql(isi: string): string[] {
  const hasil: string[] = [];
  for (const m of isi.matchAll(/`(?=\s*(?:INSERT|UPDATE|SELECT|DELETE|WITH)\b)/gi)) {
    const mulai = m.index! + 1;
    let kedalaman = 0;
    let j = mulai;
    for (; j < isi.length; j++) {
      const c = isi[j];
      if (c === "\\") {
        j++;
        continue;
      }
      if (c === "$" && isi[j + 1] === "{") {
        kedalaman++;
        j++;
        continue;
      }
      if (c === "}" && kedalaman > 0) {
        kedalaman--;
        continue;
      }
      if (c === "`" && kedalaman === 0) break;
    }
    hasil.push(isi.slice(mulai, j));
  }
  return hasil;
}

/** Komentar blok dan baris-komentar penuh dibuang; `//` di tengah baris TIDAK (URL di string). */
const tanpaKomentar = (teks: string) =>
  teks
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((b) => (/^\s*\/\//.test(b) ? "" : b))
    .join("\n");

const JAM = /\b(now\s*\(\s*\)|CURRENT_TIMESTAMP|LOCALTIMESTAMP)/gi;

const pisah = (daftar: string) =>
  daftar
    .split(",")
    .map((k) => k.trim().replace(/"/g, "").toLowerCase())
    .filter(Boolean);

/** Pelanggaran satu pernyataan/teks SQL. */
function periksa(sql: string, berCreatedAt: Set<string>): string[] {
  /* `jobs` memakai jam sesi dengan sengaja — penjaganya sendiri. */
  if (/\b(FROM|UPDATE|INTO)\s+"?jobs"?\b/i.test(sql)) return [];
  const pel: string[] = [];

  for (const m of sql.matchAll(JAM)) {
    const sesudah = sql.slice(m.index! + m[0].length);
    if (/^\s*AT\s+TIME\s+ZONE\s+'UTC'/i.test(sesudah)) continue;
    pel.push(`${m[0]} tanpa AT TIME ZONE 'UTC' (jam dinding zona sesi)`);
  }

  for (const m of sql.matchAll(/INSERT\s+INTO\s+"?(\w+)"?\s*\(([^)]*)\)/gi)) {
    const tabel = m[1]!.toLowerCase();
    if (!berCreatedAt.has(tabel)) continue;
    if (!pisah(m[2]!).includes("created_at")) {
      pel.push(`INSERT ${tabel} tanpa created_at — DEFAULT CURRENT_TIMESTAMP menulis jam sesi`);
    }
  }
  return pel;
}

function berkasTs(): { rel: string; isi: string }[] {
  const hasil: { rel: string; isi: string }[] = [];
  const telusuri = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name === "node_modules" || d.name === "generated" || d.name === ".next") continue;
      const penuh = join(dir, d.name);
      if (d.isDirectory()) telusuri(penuh);
      else if (/\.(ts|tsx)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)) {
        hasil.push({
          rel: relative(AKAR_REPO, penuh).split(sep).join("/"),
          isi: tanpaKomentar(readFileSync(penuh, "utf8")),
        });
      }
    }
  };
  for (const a of [...akarSumber(), join(AKAR_REPO, "workers"), join(AKAR_REPO, "scripts")]) {
    if (existsSync(a)) telusuri(a);
  }
  return hasil;
}

describe("jam SQL di luar `jobs` adalah UTC", () => {
  const BER_CREATED_AT = tabelBerCreatedAt();

  it("penjaganya menolak bentuk yang dulu ada di repo ini, dan menerima bentuk yang benar", () => {
    expect(BER_CREATED_AT.has("rate_limit_counters")).toBe(true);
    expect(BER_CREATED_AT.size).toBeGreaterThan(100);
    /* Bentuk `rate-limit-persistent.ts` sebelum 23 Okt 2026. */
    expect(
      periksa(
        `INSERT INTO rate_limit_counters ("key", window_started_at, count, created_at, updated_at)
         VALUES (\${key}, NOW(), 1, NOW(), NOW())`,
        BER_CREATED_AT
      )
    ).toHaveLength(3);
    /* Bentuk platform 0008: DEFAULT menyala untuk `created_at`. */
    expect(
      periksa(
        `INSERT INTO "site_content_publications" ("kind", "note", "updated_at") SELECT 'baseline', 'x', CURRENT_TIMESTAMP`,
        BER_CREATED_AT
      )
    ).toHaveLength(2);
    expect(periksa("UPDATE users SET locked_at = LOCALTIMESTAMP WHERE id = 1", BER_CREATED_AT)).toHaveLength(1);

    expect(
      periksa(
        `INSERT INTO rate_limit_counters ("key", window_started_at, created_at, updated_at)
         VALUES (\${key}, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC', now()  AT  TIME ZONE 'UTC')`,
        BER_CREATED_AT
      )
    ).toEqual([]);
    expect(periksa("UPDATE jobs SET claimed_at = now() WHERE id = 1", BER_CREATED_AT)).toEqual([]);
    expect(periksa(`INSERT INTO jobs (kind, updated_at) VALUES ('x', now())`, BER_CREATED_AT)).toEqual([]);
  });

  it("kode TypeScript: tidak ada jam sesi di SQL mentah, tidak ada INSERT yang bersandar pada DEFAULT created_at", () => {
    const pelanggar: string[] = [];
    const terpakai = new Set<string>();
    let dilihat = 0;
    for (const b of berkasTs()) {
      for (const sql of templateSql(b.isi)) {
        dilihat++;
        const p = periksa(sql, BER_CREATED_AT);
        if (p.length === 0) continue;
        if (PENGECUALIAN[b.rel]) {
          terpakai.add(b.rel);
          continue;
        }
        for (const x of p) pelanggar.push(`${b.rel}: ${x}`);
      }
    }
    /* Pemindai yang tidak melihat apa pun lulus dengan nol pelanggar. */
    expect(dilihat, "template SQL yang terbaca").toBeGreaterThan(50);
    expect(pelanggar).toEqual([]);
    expect(
      Object.keys(PENGECUALIAN).filter((k) => !terpakai.has(k)),
      "pengecualian yang tidak lagi diperlukan — cabut entrinya"
    ).toEqual([]);
  });

  it("migration baru: data yang diisi migration memakai jam UTC dan menyebut created_at", () => {
    const pelanggar: string[] = [];
    let dilihat = 0;
    for (const [tingkat, terakhirLama] of Object.entries(MIGRATION_LAMA)) {
      const dir = join(AKAR_REPO, "prisma/postgresql", tingkat);
      const semua = readdirSync(dir).filter((d) => /^\d{4}_/.test(d)).sort();
      expect(semua, `${terakhirLama} tidak ada di ${tingkat}`).toContain(terakhirLama);
      for (const mig of semua) {
        dilihat++;
        if (mig <= terakhirLama) continue;
        const sql = readFileSync(join(dir, mig, "migration.sql"), "utf8")
          .replace(/--[^\n]*/g, "")
          /* DDL `DEFAULT CURRENT_TIMESTAMP` adalah padanan `@default(now())`
             yang tak pernah menyala untuk tulisan Prisma — yang dijaga di sini
             DATA yang ditulis migration itu sendiri. */
          .replace(/\bDEFAULT\s+CURRENT_TIMESTAMP\b/gi, "");
        for (const p of periksa(sql, BER_CREATED_AT)) pelanggar.push(`${tingkat}/${mig}: ${p}`);
      }
    }
    expect(dilihat).toBeGreaterThan(20);
    expect(pelanggar).toEqual([]);
  });
});
