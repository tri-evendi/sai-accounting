/**
 * Terapkan migration basis data PERUSAHAAN ke SETIAP perusahaan terdaftar
 * (issue #104; fan-out 09 §6).
 *
 *   bun run db:migrate:companies              # perusahaan saja, KETAT
 *   bun run db:migrate:all                    # kendali → platform → perusahaan, KETAT
 *   bun run db:migrate:release                # langkah RILIS: buku boleh gagal sebagian
 *
 * ══ KEGAGALAN SATU PERUSAHAAN TIDAK BOLEH MENGGANTUNG YANG LAIN ════════════
 * Persyaratan eksplisit issue #104: setiap perusahaan dijalankan
 * sendiri-sendiri, kegagalannya dicatat, dan skrip terus berjalan.
 *
 * ══ DUA MODE KELUAR — DAN KENAPA RILIS TIDAK LAGI MENUNGGU SETIAP BUKU ════
 * Sampai 23 Okt 2026 satu buku yang gagal membuat skrip keluar 1, dan karena
 * `app-customer` dirantai `service_completed_successfully` pada `migrate`,
 * SATU buku menahan rilis untuk SEMUA buku. 09 §6 menyebut sasarannya:
 * gerbang berubah dari "semua perusahaan siap" menjadi "perusahaan INI siap".
 * Dua hal membuatnya aman, dan keduanya kini ada:
 *
 *   1. **expand/contract** (DATABASE.md §7.1, `tests/expand-contract.test.ts`)
 *      — kode LAMA tetap benar di skema BARU, jadi menerapkan migration
 *      sementara aplikasi lama melayani tidak merusak apa pun;
 *   2. **gerbang skema per perusahaan** (`src/lib/company-schema-gate.ts`) —
 *      kode BARU tidak pernah menyentuh buku yang skemanya LAMA: buku itu
 *      ditutup (503 / layar "buku sedang diperbarui") sampai migration-nya
 *      sampai, perusahaan lain tidak terpengaruh.
 *
 * Maka kode keluarnya dua mode (`rolloutExitCode`, `@sai/core/schema-version`):
 *   • KETAT (bawaan): kegagalan apa pun = 1 — manusia, CI, dev.
 *   • `--release`: sebagian gagal = 0 (`partial`). TIDAK SATU buku pun di
 *     kepala = 1 (`error`) — itu migration yang rusak, bukan buku yang rusak,
 *     dan aplikasi lama yang melayani semua buku lebih baik daripada aplikasi
 *     baru yang menutup semuanya.
 *
 * ══ DAPAT DILANJUTKAN DARI TENGAH, DAN MURAH ═══════════════════════════════
 * Sebelum proses Prisma dilahirkan, riwayat migration buku dibaca
 * (`readMigrationSummary`). Buku yang sudah di kepala DILEWATI — tanpa proses
 * Prisma CLI (ratusan MB) sama sekali. Putaran ulang sesudah rilis parsial
 * karena itu hanya menyentuh buku yang tertinggal. Sesudah `migrate deploy`
 * keluar 0, riwayatnya dibaca SEKALI LAGI: kode keluar Prisma adalah klaim,
 * riwayatnya kebenaran.
 *
 * ══ HASIL PER BUKU DICATAT ═════════════════════════════════════════════════
 * Satu baris `schema_migration_runs` (basis data kendali) per putaran, hasil
 * per buku di `details`. Dibaca `/api/health` (`migrations`) dan oleh orang
 * yang melanjutkan rilis. Gagal mencatat = peringatan, bukan kegagalan
 * putaran: jejak yang tak tertulis tidak membatalkan migration yang sudah
 * diterapkan.
 *
 * ══ KENAPA PROSES TERPISAH PER PERUSAHAAN ══════════════════════════════════
 * `prisma migrate deploy` membaca koneksinya dari environment saat proses itu
 * dimulai. Proses anak dengan `DATABASE_URL` yang ditunjuk ke buku yang
 * bersangkutan: tidak ada state yang bocor antar perusahaan, dan perintahnya
 * persis sama dengan yang dipakai orang secara manual.
 *
 * Perusahaan NONAKTIF ikut dimigrasikan. Nonaktif berarti "tidak bisa dibuka",
 * bukan "boleh tertinggal".
 *
 * ══ BOUNDED CONCURRENCY (rancangan §6, tahap 1b) — KINI SUNGGUHAN ══════════
 * `COMPANY_MIGRATE_CONCURRENCY` (bawaan 2, plafon 8) pelaksana bersamaan.
 *
 * ⚠ Sampai 23 Okt 2026 angka itu TIDAK berlaku: pelaksananya memanggil
 * `spawnSync`, yang memblokir event loop, dan loop pelaksana tidak punya satu
 * `await` pun — jadi pelaksana pertama menghabiskan SELURUH daftar sebelum
 * yang kedua sempat mulai (setiap blok log berlabel `[p1]`). Fan-out-nya
 * berurutan sejak tahap 1b, dan "24 detik untuk 17 buku" adalah angka
 * berurutan. Kini proses anaknya `spawn` asinkron, dan
 * `tests/migrate-fanout.test.ts` menolak `spawnSync` kembali.
 *
 * ⚠ ANGKANYA KECIL, DAN ITU DARI PENGUKURAN. Tiap pelaksana satu proses
 * Prisma CLI (ratusan MB) plus satu backend PostgreSQL, dan migration
 * berjalan SEMENTARA aplikasi masih melayani. Kotak ini sudah pernah
 * kehilangan proses ke OOM-killer (exit 137).
 *
 * ⚠ KELUARANNYA DIKUMPULKAN PER PERUSAHAAN, bukan diwariskan langsung: N
 * proses Prisma yang menulis ke terminal yang sama saling menyisip — tidak
 * bisa dibaca justru pada hari satu di antaranya gagal.
 *
 * ══ PENERAPNYA TETAP SATU: PRISMA ══════════════════════════════════════════
 * Prisma pemilik pembukuan skema (02 §12). Skrip ini MEMBACA riwayat untuk
 * memutuskan apa yang dilewati, tidak pernah menulisnya, dan jalur `schema`
 * tidak diterbitkan ke antrean — migration adalah langkah rilis yang
 * pelaksananya harus melihat kode keluarnya (09 §3.2).
 */

import "dotenv/config";
import { spawn } from "node:child_process";
import { PrismaClient } from "@sai/db/client/control";
import { PrismaClient as CompanyClient } from "@sai/db/client/company";
import { buatAdapter } from "@sai/db/adapter";
import {
  COMPANY_DATABASE_TARGET_SELECT,
  companyDatabaseUrl,
  DEFAULT_DB_INSTANCE_LABEL,
  toCompanyDatabaseTarget,
} from "@sai/db/company-url";
import { MIGRATION_TERAKHIR } from "@sai/core/migration-manifest";
import { readMigrationSummary } from "@sai/core/migration-summary";
import { rolloutExitCode, rolloutStatus, vonisVersi } from "@sai/core/schema-version";

/** `--release`: sebagian gagal tidak menahan rilis (lihat kepala berkas). */
const MODE: "strict" | "release" = process.argv.includes("--release") ? "release" : "strict";

function controlClient(): PrismaClient {
  const raw = process.env.CONTROL_DATABASE_URL;
  if (!raw) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(1);
  }
  const url = new URL(raw);
  return new PrismaClient({
    adapter: buatAdapter(url.toString(), { batasKoneksi: 2 }),
  });
}

/**
 * Berapa perusahaan dimigrasikan BERSAMAAN.
 *
 * Bawaan 2 — lihat catatan memori di kepala berkas. Nilai di luar jangkauan
 * diabaikan dengan BUNYI, bukan diam: angka salah tulis yang diam-diam jatuh ke
 * bawaan membuat orang mengira ia sedang menjalankan sesuatu yang lain.
 */
function batasSerentak(): number {
  const raw = process.env.COMPANY_MIGRATE_CONCURRENCY;
  if (raw === undefined || raw === "") return 2;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.warn(
      `⚠ COMPANY_MIGRATE_CONCURRENCY=${JSON.stringify(raw)} bukan bilangan bulat ≥ 1 — memakai 2.`
    );
    return 2;
  }
  if (n > 8) {
    /* Plafon, dan bukan selera: tiap pelaksana satu proses Prisma CLI plus satu
       backend PostgreSQL, dan migration berjalan sementara aplikasi masih
       melayani. Angka besar di sini adalah OOM-killer yang kita jadwalkan
       sendiri, pada langkah rilis yang paling tidak boleh gagal separuh jalan. */
    console.warn(`⚠ COMPANY_MIGRATE_CONCURRENCY=${n} di atas plafon 8 — memakai 8.`);
    return 8;
  }
  return n;
}

/** Hasil `prisma migrate deploy` satu buku — keluarannya ditangkap utuh. */
interface HasilProses {
  code: number | null;
  output: string;
  /** `ENOENT` = binary `prisma` tidak ada di PATH. */
  errorCode?: string;
  errorMessage?: string;
}

/**
 * `prisma migrate deploy` sebagai proses anak ASINKRON. Bukan `spawnSync`:
 * yang sinkron memblokir event loop, dan pelaksana lain tidak pernah
 * mendapat giliran (lihat kepala berkas).
 */
function migrateDeploy(databaseUrl: string): Promise<HasilProses> {
  return new Promise((resolve) => {
    const potongan: string[] = [];
    const child = spawn("prisma", ["migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => potongan.push(d));
    child.stderr.on("data", (d: string) => potongan.push(d));
    child.on("error", (e: NodeJS.ErrnoException) =>
      resolve({ code: null, output: potongan.join(""), errorCode: e.code, errorMessage: e.message })
    );
    child.on("close", (code) => resolve({ code, output: potongan.join("") }));
  });
}

/**
 * Riwayat satu buku → vonis terhadap image INI. Klien sekali pakai, satu
 * koneksi, langsung ditutup — pembacaan ini satu query, bukan kolam.
 */
async function vonisBuku(databaseUrl: string): Promise<{
  status: ReturnType<typeof vonisVersi>;
  terakhir: string | null;
}> {
  const client = new CompanyClient({ adapter: buatAdapter(databaseUrl, { batasKoneksi: 1 }) });
  try {
    const ringkasan = await readMigrationSummary(client);
    return {
      status: vonisVersi(ringkasan, MIGRATION_TERAKHIR.company),
      terakhir: ringkasan?.terakhir ?? null,
    };
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

/** Sudah di kepala image ini (atau di depannya) — tidak ada yang perlu diterapkan. */
const diKepala = (status: ReturnType<typeof vonisVersi>) =>
  status === "mutakhir" || status === "mendahului";

type Outcome = "migrated" | "skipped" | "failed";

interface HasilBuku {
  slug: string;
  databaseName: string;
  instance: string;
  outcome: Outcome;
  before: string | null;
  after: string | null;
  ms: number;
  error?: string;
}

async function main() {
  const control = controlClient();
  const companies = await control.company.findMany({
    orderBy: { id: "asc" },
    select: { id: true, slug: true, name: true, ...COMPANY_DATABASE_TARGET_SELECT, isActive: true },
  });

  if (companies.length === 0) {
    await control.$disconnect();
    /*
     * Registry kosong = aplikasi tidak bisa melayani siapa pun, sebab setiap
     * halaman menuntut perusahaan. Karena itu keluar dengan kode BUKAN NOL —
     * di KEDUA mode: service `migrate` di compose dirantai
     * `service_completed_successfully`, jadi `app-customer` tidak akan naik —
     * dan itu memang yang benar.
     *
     * Tidak ada satu pun migration perusahaan yang dijalankan di jalur ini.
     * Itulah pengamannya: naiknya container sebelum adopsi tidak bisa
     * menghapus akun siapa pun.
     */
    console.error(
      "Belum ada perusahaan terdaftar — tidak ada migration perusahaan yang dijalankan.\n\n" +
        "  Pemasangan yang SUDAH berjalan (punya basis data & pengguna):\n" +
        "    bun run adopt-company -- --slug <slug> --name \"Nama PT\"\n\n" +
        "  Pemasangan BARU:\n" +
        "    bun run create-company -- --slug <slug> --name \"Nama PT\"\n\n" +
        "Lihat docs/MULTI-COMPANY.md untuk urutan lengkapnya."
    );
    process.exit(1);
  }

  /* Label instans per perusahaan (tahap 4) — dari kolomnya, bukan dari
     penyelesaian: baris yang instansnya tak terselesaikan tetap harus
     terlaporkan di bawah instans yang ia sebut. */
  const instanceOf = (c: (typeof companies)[number]): string =>
    c.dbInstanceKey ?? DEFAULT_DB_INSTANCE_LABEL;
  const hasil: HasilBuku[] = [];
  const failures: { slug: string; databaseName: string; instance: string; detail: string }[] = [];
  const startedAt = new Date();
  const mulai = Date.now();

  /* Pelaksana berikutnya diambil dari satu kursor bersama, bukan dari potongan
     daftar yang dibagi rata: perusahaan tidak sama besar, dan pembagian rata
     membuat satu pelaksana selesai lebih dulu lalu menganggur sementara yang
     lain masih punya giliran. */
  let kursor = 0;

  async function pelaksana(nomor: number): Promise<void> {
    for (;;) {
      const i = kursor++;
      if (i >= companies.length) return;
      const company = companies[i]!;
      const instance = instanceOf(company);
      const label =
        `${company.slug} (${company.databaseName} @${instance})` +
        (company.isActive ? "" : " [nonaktif]");
      const t0 = Date.now();
      const catat = (outcome: Outcome, before: string | null, after: string | null, error?: string) => {
        hasil.push({
          slug: company.slug,
          databaseName: company.databaseName,
          instance,
          outcome,
          before,
          after,
          ms: Date.now() - t0,
          ...(error ? { error: error.slice(0, 500) } : {}),
        });
        if (outcome === "failed") {
          failures.push({ slug: company.slug, databaseName: company.databaseName, instance, detail: error ?? "" });
        }
      };

      /* URL dari penyelesai tunggal (`@sai/db/company-url`). Instans yang tak
         terselesaikan = kegagalan PT ini saja; yang lain tetap berjalan. */
      let databaseUrl: string;
      try {
        databaseUrl = companyDatabaseUrl(toCompanyDatabaseTarget(company));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        catat("failed", null, null, detail);
        console.error(`\n── [p${nomor}] ${label}\n   GAGAL: ${detail}`);
        continue;
      }

      /* Sudah di kepala → dilewati tanpa proses Prisma. Ini yang membuat
         putaran ulang sesudah rilis parsial murah. */
      const sebelum = await vonisBuku(databaseUrl);
      if (diKepala(sebelum.status)) {
        catat("skipped", sebelum.terakhir, sebelum.terakhir);
        console.log(`\n── [p${nomor}] ${label}: sudah di ${sebelum.terakhir} — dilewati.`);
        continue;
      }

      /* Keluarannya DITANGKAP, bukan diwariskan: N proses yang menulis ke
         terminal yang sama saling menyisip. */
      const result = await migrateDeploy(databaseUrl);

      if (result.errorCode === "ENOENT") {
        console.error(
          "✗ Binary `prisma` tidak ditemukan di PATH. Jalankan lewat package " +
            "manager: `bun run db:migrate:companies`."
        );
        process.exit(1);
      }

      /* Satu blok per perusahaan, dicetak saat ia selesai — label di atas
         keluarannya, supaya potongan log mana pun bisa ditelusuri ke bukunya. */
      const badan = result.output.trimEnd();
      console.log(`\n── [p${nomor}] migrate deploy → ${label}`);
      if (badan) console.log(badan);

      if (result.code !== 0) {
        const detail =
          result.errorMessage ?? `prisma migrate deploy keluar dengan kode ${result.code}`;
        catat("failed", sebelum.terakhir, null, detail);
        console.error(`   GAGAL: ${detail} — perusahaan lain TIDAK terpengaruh.`);
        continue;
      }

      /* Kode keluar 0 adalah klaim; riwayat buku adalah kebenaran. */
      const sesudah = await vonisBuku(databaseUrl);
      if (!diKepala(sesudah.status)) {
        const detail =
          `migrate deploy keluar 0, tetapi riwayat buku berkata \`${sesudah.status}\` ` +
          `(terpasang ${sesudah.terakhir ?? "(tak terbaca)"}, image membawa ${MIGRATION_TERAKHIR.company})`;
        catat("failed", sebelum.terakhir, sesudah.terakhir, detail);
        console.error(`   GAGAL: ${detail}`);
        continue;
      }
      catat("migrated", sebelum.terakhir, sesudah.terakhir);
    }
  }

  const serentak = Math.max(1, Math.min(batasSerentak(), companies.length));
  console.log(
    `${companies.length} perusahaan, ${serentak} dimigrasikan bersamaan ` +
      `(COMPANY_MIGRATE_CONCURRENCY=${serentak}), target ${MIGRATION_TERAKHIR.company}, mode ${MODE}.`
  );
  await Promise.all(Array.from({ length: serentak }, (_, n) => pelaksana(n + 1)));

  /* Urutan laporan DITETAPKAN ulang menurut id: dengan beberapa pelaksana,
     urutan selesai berubah tiap putaran — dan ringkasan yang urutannya berubah
     membuat dua rilis yang hasilnya sama terbaca berbeda. */
  const urutan = (slug: string) => companies.findIndex((c) => c.slug === slug);
  failures.sort((a, b) => urutan(a.slug) - urutan(b.slug));
  hasil.sort((a, b) => urutan(a.slug) - urutan(b.slug));

  const dimigrasikan = hasil.filter((h) => h.outcome === "migrated").length;
  const dilewati = hasil.filter((h) => h.outcome === "skipped").length;
  const status = rolloutStatus({ atHead: dimigrasikan + dilewati, failed: failures.length });

  console.log(
    `\n═══ Ringkasan: ${companies.length - failures.length}/${companies.length} di kepala ` +
      `(${dimigrasikan} dimigrasikan, ${dilewati} sudah di kepala) dalam ` +
      `${Math.round((Date.now() - mulai) / 1000)}s — ${status}`
  );
  /* Per instans (tahap 4): satu server yang tak terjangkau terbaca sebagai
     SATU baris merah, bukan sebagai sekian PT acak yang kebetulan gagal. */
  const perInstans = new Map<string, number>();
  for (const c of companies) perInstans.set(instanceOf(c), (perInstans.get(instanceOf(c)) ?? 0) + 1);
  if (perInstans.size > 1 || !perInstans.has(DEFAULT_DB_INSTANCE_LABEL)) {
    for (const [instans, jumlah] of [...perInstans].sort()) {
      const gagal = failures.filter((f) => f.instance === instans).length;
      console.log(`    instans ${instans}: ${jumlah - gagal}/${jumlah} berhasil`);
    }
  }

  /* Jejak putaran — sesudah semua buku, satu baris. Gagal mencatat tidak
     membatalkan migration yang sudah diterapkan. */
  try {
    await control.schemaMigrationRun.create({
      data: {
        startedAt,
        finishedAt: new Date(),
        status,
        targetMigration: MIGRATION_TERAKHIR.company,
        companiesTotal: companies.length,
        companiesMigrated: dimigrasikan,
        companiesSkipped: dilewati,
        companiesFailed: failures.length,
        details: JSON.stringify({ mode: MODE, companies: hasil }),
      },
    });
  } catch (error) {
    console.warn(
      "⚠ Jejak putaran (`schema_migration_runs`) tidak tertulis — migration kendali " +
        "0011 sudah diterapkan? `/api/health` akan melaporkan `migrations: unknown`.",
      error instanceof Error ? error.message : error
    );
  }
  await control.$disconnect();

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`   ✗ ${f.slug} (${f.databaseName} @${f.instance}): ${f.detail}`);
    }
    console.error(
      "\nBuku yang gagal MASIH memakai skema lama dan DITUTUP gerbang skema (503 / " +
        "\"buku sedang diperbarui\") untuk image yang membawa migration-nya. Perbaiki " +
        "lalu jalankan ulang perintah ini — buku yang sudah di kepala dilewati tanpa " +
        "proses Prisma."
    );
    if (status === "partial" && MODE === "release") {
      console.error(
        "Mode --release: rilis BOLEH LANJUT — buku lain sudah di kepala (09 §6). " +
          "Buku di atas tetap tertutup sampai putaran berikutnya berhasil."
      );
    }
  }
  process.exit(rolloutExitCode(status, MODE));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
