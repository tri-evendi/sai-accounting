/**
 * Bacaan halaman `/operator/backup`: riwayat CADANGAN dan VERSI SKEMA setiap
 * basis data. Sebelum halaman ini, "19/19 buku di migration terakhir" dan
 * "cadangan semalam berhasil" hanya bisa dibuktikan lewat SSH + `psql`.
 *
 * Versi skema dibaca lewat koneksi PENDEK `@sai/db/server` (satu klien `pg`
 * per basis data, ditutup segera), BUKAN `getCompanyClient`: membuka klien
 * Prisma untuk setiap buku dari satu halaman operator akan mengusir klien
 * buku yang sedang dipakai pelanggan dari kolam LRU-nya.
 */
import "server-only";

import { bukaBasisData } from "@sai/db/server";
import { uraikanUrl } from "@sai/db/engine";
import { controlDb } from "@sai/core/control-db";
import { platformDb } from "@/lib/platform-db";
import { MIGRATION_TERAKHIR, type JenisBasisData } from "@/lib/migration-manifest";
import { vonisVersi, type RingkasanMigrasiDb, type StatusVersi } from "@/lib/schema-version";

export interface OperatorBackupRun {
  id: number;
  startedAt: Date;
  finishedAt: Date;
  status: string;
  error: string | null;
  artifact: string | null;
  /** `number`, bukan BigInt: komponen tidak menerima BigInt, dan ukuran
   *  cadangan jauh di bawah 2^53. */
  sizeBytes: number | null;
}

/** `null` = `sai_platform` tak terjangkau — halaman berkata "belum bisa dibaca". */
export async function backupRunsForOperator(limit = 20): Promise<OperatorBackupRun[] | null> {
  try {
    const runs = await platformDb.backupRun.findMany({
      orderBy: { id: "desc" },
      take: Math.min(100, Math.max(1, limit)),
    });
    return runs.map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      status: r.status,
      error: r.error,
      artifact: r.artifact,
      sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
    }));
  } catch (error) {
    console.error("[operator-backups] riwayat cadangan tak terbaca:", error);
    return null;
  }
}

export interface SchemaVersionRow {
  jenis: JenisBasisData;
  database: string;
  /** Untuk buku PT: slug PT + slug tenant, supaya barisnya bisa dikenali. */
  label: string;
  isActive: boolean;
  ringkasan: RingkasanMigrasiDb | null;
  diharapkan: string;
  status: StatusVersi;
}

/** Berapa basis data dibaca BERSAMAAN — cukup cepat, tanpa membanjiri PgBouncer. */
const PARALEL = 4;

async function ringkasan(url: string, database: string): Promise<RingkasanMigrasiDb | null> {
  try {
    const db = await bukaBasisData(url, database);
    try {
      return await db.ringkasanMigrasi();
    } finally {
      await db.tutup();
    }
  } catch (error) {
    console.warn(`[operator-backups] versi skema ${database} tak terbaca: ${String(error)}`);
    return null;
  }
}

/**
 * Versi skema kendali, platform, dan SETIAP buku terdaftar (termasuk PT yang
 * nonaktif: bukunya tetap ada selama masa retensi, dan rilis berikutnya tetap
 * memigrasikannya).
 *
 * `null` = `CONTROL_DATABASE_URL` tidak diset, atau daftar perusahaan tak
 * terbaca — tanpa itu tidak ada yang bisa dijawab dengan jujur.
 */
export async function schemaVersionsForOperator(): Promise<SchemaVersionRow[] | null> {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) return null;

  let companies: { slug: string; databaseName: string; isActive: boolean; tenant: { slug: string } | null }[];
  try {
    companies = await controlDb.company.findMany({
      orderBy: { databaseName: "asc" },
      select: { slug: true, databaseName: true, isActive: true, tenant: { select: { slug: true } } },
    });
  } catch (error) {
    console.error("[operator-backups] daftar perusahaan tak terbaca:", error);
    return null;
  }

  const target: { jenis: JenisBasisData; url: string; database: string; label: string; isActive: boolean }[] = [
    { jenis: "control", url: controlUrl, database: uraikanUrl(controlUrl).database, label: "kendali", isActive: true },
  ];
  const platformUrl = process.env.PLATFORM_DATABASE_URL;
  if (platformUrl) {
    target.push({
      jenis: "platform",
      url: platformUrl,
      database: uraikanUrl(platformUrl).database,
      label: "platform",
      isActive: true,
    });
  }
  for (const c of companies) {
    target.push({
      jenis: "company",
      /* URL kendali sebagai TEMPLAT kredensial — pola pembaca retensi
         hapus-tenant; nama basis datanya diganti per buku. */
      url: controlUrl,
      database: c.databaseName,
      label: c.tenant ? `${c.tenant.slug} / ${c.slug}` : c.slug,
      isActive: c.isActive,
    });
  }

  const hasil: SchemaVersionRow[] = new Array(target.length);
  let berikut = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALEL, target.length) }, async () => {
      while (berikut < target.length) {
        const i = berikut++;
        const t = target[i];
        const r = await ringkasan(t.url, t.database);
        const diharapkan = MIGRATION_TERAKHIR[t.jenis];
        hasil[i] = {
          jenis: t.jenis,
          database: t.database,
          label: t.label,
          isActive: t.isActive,
          ringkasan: r,
          diharapkan,
          status: vonisVersi(r, diharapkan),
        };
      }
    })
  );
  return hasil;
}
