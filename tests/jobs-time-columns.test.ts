/**
 * PENJAGA JAM KOLOM `jobs` — sisi TypeScript.
 *
 * Kolom waktu `jobs` (`run_after`, `claimed_at`, `started_at`, `finished_at`,
 * `created_at`, `updated_at`) bertipe TIMESTAMP(3) TANPA zona, dan isinya jam
 * dinding `now()` dalam TimeZone SESI — zona bawaan server, `Asia/Jakarta` di
 * produksi. Klaim/perpanjangan/selesai di kedua bahasa menulis `now()`, dan
 * DEFAULT `run_after`/`created_at` adalah `CURRENT_TIMESTAMP`.
 *
 * `Date` JS yang diikat ke kolom seperti itu dikirim `@prisma/adapter-pg`
 * sebagai jam dinding UTC, dan Prisma membaca kolomnya kembali sebagai UTC.
 * Di server WIB keduanya meleset tujuh jam, tanpa satu galat — itulah yang
 * terjadi di produksi sampai 23 Okt 2026:
 *
 *   - `failJob`: `run_after` tujuh jam di masa lalu → percobaan ulang TANPA backoff;
 *   - `reclaimStaleJobs`: lease mati baru dipulangkan tujuh jam kemudian;
 *   - `jobStatus().createdAt` tujuh jam di masa depan → penyediaan PT yang
 *     BERHASIL terbaca gagal (perusahaannya "lahir sebelum" pekerjaannya);
 *   - `queueSnapshot`: umur antrean baris DEFAULT terbaca 0;
 *   - `jobMetrics`: jendela "N menit" menjadi N menit + tujuh jam.
 *
 * Aturannya: JS hanya mengirim DURASI dan SQL menghitung waktunya dari
 * `now()`/`LOCALTIMESTAMP`; nilai yang DIBACA dikonversi ke instan sejati
 * dengan `AT TIME ZONE current_setting('TimeZone')`. Padanan Go: penjaga "jam
 * kolom waktu" di `tests/services-go.test.ts`. Perilakunya dibuktikan
 * `tests/jobs-time-columns.integration.test.ts` terhadap PostgreSQL sungguhan.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { AKAR_REPO, akarSumber, tanpaKomentar } from "./akar-sumber";

const KOLOM = "run_after|claimed_at|started_at|finished_at|created_at|updated_at";
const FIELD = "runAfter|claimedAt|startedAt|finishedAt|createdAt|updatedAt";
const OP = "=|<>|!=|<=|>=|<|>";

/** Seluruh `.ts`/`.tsx` tulisan tangan: `src`, `packages/*`, `apps/*`, `workers`, `scripts`. */
function berkas(): { rel: string; isi: string }[] {
  const hasil: { rel: string; isi: string }[] = [];
  const telusuri = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name === "node_modules" || d.name === "generated" || d.name === ".next") continue;
      const penuh = join(dir, d.name);
      if (d.isDirectory()) telusuri(penuh);
      else if (/\.(ts|tsx)$/.test(d.name)) {
        hasil.push({
          rel: relative(AKAR_REPO, penuh).split(sep).join("/"),
          isi: tanpaKomentar(readFileSync(penuh, "utf8")),
        });
      }
    }
  };
  const akar = [...akarSumber(), join(AKAR_REPO, "workers"), join(AKAR_REPO, "scripts")];
  for (const a of akar) if (existsSync(a)) telusuri(a);
  return hasil;
}

/** Template SQL Prisma (`$queryRaw`/`$executeRaw`/`Prisma.sql`) beserta namanya bila ditetapkan ke konstanta. */
function templateSql(isi: string): { nama: string | null; sql: string }[] {
  const hasil: { nama: string | null; sql: string }[] = [];
  const re = /(?:const\s+(\w+)\s*=\s*)?(?:\$queryRaw(?:Unsafe)?|\$executeRaw(?:Unsafe)?|Prisma\.sql)(?:<[^`]*?>)?`/g;
  for (const m of isi.matchAll(re)) {
    const mulai = m.index! + m[0].length;
    let i = mulai;
    let kedalaman = 0;
    for (; i < isi.length; i++) {
      const c = isi[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "$" && isi[i + 1] === "{") {
        kedalaman++;
        i++;
        continue;
      }
      if (c === "}" && kedalaman > 0) {
        kedalaman--;
        continue;
      }
      if (c === "`" && kedalaman === 0) break;
    }
    hasil.push({ nama: m[1] ?? null, sql: isi.slice(mulai, i) });
  }
  return hasil;
}

const pisah = (daftar: string) => {
  const hasil: string[] = [];
  let kedalaman = 0;
  let kini = "";
  for (const c of daftar) {
    if (c === "(" || c === "{") kedalaman++;
    if (c === ")" || c === "}") kedalaman--;
    if (c === "," && kedalaman === 0) {
      hasil.push(kini.trim());
      kini = "";
    } else kini += c;
  }
  if (kini.trim()) hasil.push(kini.trim());
  return hasil;
};

/**
 * Pelanggaran satu template SQL yang menyentuh `jobs`.
 *
 * `fragmenAman`: nama konstanta `Prisma.sql` di berkas yang sama yang dibangun
 * dari `LOCALTIMESTAMP`/`now()` — interpolasinya adalah jam server, bukan `Date`.
 */
function periksa(sql: string, fragmenAman: Set<string> = new Set()): string[] {
  if (!/\b(FROM|UPDATE|INTO)\s+"?jobs"?\b/i.test(sql)) return [];
  const pel: string[] = [];

  const langsung = new RegExp(
    `\\b(${KOLOM})\\s*(?:${OP})\\s*\\$\\{\\s*([^}]*?)\\s*\\}|\\$\\{\\s*([^}]*?)\\s*\\}\\s*(?:${OP})\\s*(${KOLOM})\\b`,
    "g"
  );
  for (const m of sql.matchAll(langsung)) {
    const ekspr = (m[2] ?? m[3])!;
    if (!fragmenAman.has(ekspr)) pel.push(`${m[1] ?? m[4]} dibandingkan/ditulis dengan \${${ekspr}}`);
  }

  const ins = sql.match(/INSERT\s+INTO\s+"?jobs"?\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)/i);
  if (ins) {
    const kolom = pisah(ins[1]!);
    const nilai = pisah(ins[2]!.replace(/\)\s*(ON CONFLICT|RETURNING)[\s\S]*$/i, ""));
    kolom.forEach((k, i) => {
      if (!new RegExp(`^(${KOLOM})$`).test(k)) return;
      const v = nilai[i] ?? "";
      if (v.includes("${") && !/\b(now\(\)|LOCALTIMESTAMP)[\s\S]*interval/.test(v)) {
        pel.push(`INSERT jobs.${k} = ${v}`);
      }
    });
  }

  /* Dibaca ke JS tanpa konversi: Prisma menafsirkannya sebagai UTC. */
  const baca = new RegExp(`(?:\\b(?:MIN|MAX)\\(\\s*(?:${KOLOM})\\s*\\)|\\b(?:${KOLOM}))\\s+AS\\s+"?\\w`, "g");
  for (const m of sql.matchAll(baca)) pel.push(`dibaca tanpa AT TIME ZONE: ${m[0]}`);
  return pel;
}

/** Panggilan ORM pada model `Job` yang menyentuh field waktunya. */
function periksaOrm(isi: string): string[] {
  const pel: string[] = [];
  for (const m of isi.matchAll(/\.job\.(\w+)\(/g)) {
    let i = m.index! + m[0].length;
    let kedalaman = 1;
    const mulai = i;
    for (; i < isi.length && kedalaman > 0; i++) {
      if (isi[i] === "(") kedalaman++;
      if (isi[i] === ")") kedalaman--;
    }
    const arg = isi.slice(mulai, i);
    if (/^(create|createMany|createManyAndReturn|update|updateMany|upsert)$/.test(m[1]!)) {
      /* Prisma mengisi `createdAt`/`updatedAt` sendiri dengan UTC — baris itu
         akan tujuh jam "lebih muda" daripada tetangganya. */
      pel.push(`job.${m[1]}() — tulis lewat SQL berjam now(), bukan ORM`);
    } else if (new RegExp(`\\b(${FIELD})\\b`).test(arg)) {
      pel.push(`job.${m[1]}() menyentuh field waktu`);
    }
  }
  return pel;
}

describe("jam kolom `jobs`: JS tidak mengikat `Date` ke TIMESTAMP tanpa zona", () => {
  const SEMUA = berkas();

  it("penjaganya menolak bentuk yang dulu ada di repo ini", () => {
    /* Penjaga atas penjaga — bentuk persis dari sebelum perbaikan. */
    expect(periksa("UPDATE jobs SET run_after = ${runAfter}, claimed_at = NULL")).not.toEqual([]);
    expect(periksa("UPDATE jobs SET status = 'queued' WHERE claimed_at < ${ambang}")).not.toEqual([]);
    expect(periksa("DELETE FROM jobs WHERE status = 'done' AND finished_at < ${ambang}")).not.toEqual([]);
    expect(periksa("SELECT COUNT(*) FILTER (WHERE created_at > ${batas}) FROM jobs")).not.toEqual([]);
    expect(periksa("SELECT kind, MIN(run_after) AS oldest FROM jobs GROUP BY kind")).not.toEqual([]);
    expect(periksa(`SELECT id, created_at AS "createdAt" FROM jobs WHERE id = \${id}`)).not.toEqual([]);
    expect(
      periksa("INSERT INTO jobs (kind, run_after, updated_at) VALUES (${k}, ${input.runAfter ?? new Date()}, now())")
    ).not.toEqual([]);
    expect(periksaOrm("controlDb.job.findMany({ where: { createdAt: { gte: x } } })")).not.toEqual([]);
    expect(periksaOrm("controlDb.job.create({ data: { kind } })")).not.toEqual([]);

    // …dan menerima bentuk yang benar.
    expect(
      periksa("UPDATE jobs SET run_after = now() + ${tunda}::bigint * interval '1 millisecond' WHERE id = ${id}")
    ).toEqual([]);
    expect(periksa("DELETE FROM jobs WHERE finished_at < LOCALTIMESTAMP - ${d}::int * interval '1 day'")).toEqual([]);
    expect(
      periksa(`SELECT MIN(run_after) AT TIME ZONE current_setting('TimeZone') AS oldest FROM jobs`)
    ).toEqual([]);
    expect(periksa("SELECT 1 FROM jobs WHERE created_at > ${batas}", new Set(["batas"]))).toEqual([]);
    expect(periksaOrm("control.job.count({ where: { tenantId: 1 } })")).toEqual([]);
  });

  it("tidak ada SQL yang mengikat `Date` ke kolom waktu `jobs` atau membacanya tanpa konversi", () => {
    const pelanggar: string[] = [];
    let dilihat = 0;
    for (const b of SEMUA) {
      const tpl = templateSql(b.isi);
      const aman = new Set(
        tpl
          .filter((t) => t.nama && /\b(LOCALTIMESTAMP|now\(\))/.test(t.sql) && !/\$\{[^}]*\bDate\b/.test(t.sql))
          .map((t) => t.nama!)
      );
      for (const t of tpl) {
        if (/\b(FROM|UPDATE|INTO)\s+"?jobs"?\b/i.test(t.sql)) dilihat++;
        for (const p of periksa(t.sql, aman)) pelanggar.push(`${b.rel}: ${p}`);
      }
    }
    /* Pemindai yang tidak melihat apa pun lulus dengan nol pelanggar. */
    expect(dilihat, "template SQL `jobs` yang terbaca").toBeGreaterThanOrEqual(15);
    expect(pelanggar, "Date terikat ke / dibaca dari kolom waktu `jobs`").toEqual([]);
  });

  it("tidak ada panggilan ORM `job.*` yang menulis barisnya atau menyaring field waktunya", () => {
    const pelanggar: string[] = [];
    for (const b of SEMUA) for (const p of periksaOrm(b.isi)) pelanggar.push(`${b.rel}: ${p}`);
    expect(pelanggar).toEqual([]);
  });

  it("`publishJob` menerima DURASI, bukan `Date`", () => {
    const antrean = SEMUA.find((b) => b.rel === "packages/platform/src/job-queue.ts")!;
    expect(antrean.isi).toContain("delayMs?: number");
    expect(antrean.isi).not.toMatch(/runAfter\?:\s*Date/);
  });
});
