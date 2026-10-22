/**
 * REPLIKA BACA untuk jalur baca berat (rancangan 09 §9, tahap 3).
 *
 *   await runReadOnly(() => buildReportPayload(report, params));
 *
 * Di dalam cakupan itu, `prisma` (proxy `@/lib/prisma`) membaca dari replika
 * PT yang sedang dibuka — bila replikanya terpasang DAN cukup segar — dan
 * MENOLAK setiap tulisan. Di luar cakupan itu tidak ada yang berubah.
 *
 * ══ MATI SECARA BAWAAN ═════════════════════════════════════════════════════
 * Tanpa `COMPANY_DATABASE_READ_URL_TEMPLATE`, `runReadOnly(fn)` adalah
 * `fn()` — tanpa cakupan, tanpa penolakan tulisan, tanpa satu query tambahan.
 * Produksi satu-VM hari ini berjalan persis seperti sebelum berkas ini ada.
 * Penolakan tulisan sengaja ikut mati: jalur yang ternyata menulis di tengah
 * laporan harus ketahuan saat replika DIPASANG (di staging), bukan menggagalkan
 * ekspor produksi pada hari berkas ini dirilis.
 *
 * ══ ATURAN KESEGARAN — BUKAN "LAG < N DETIK" ═══════════════════════════════
 * Replika dipakai hanya bila ia sudah MEMUTAR ULANG WAL sampai posisi primary
 * pada saat cakupan pertama kali menyentuh PT itu:
 *
 *   1. primary: `pg_current_wal_lsn()` → L
 *   2. replika: `pg_is_in_recovery()` DAN `pg_last_wal_replay_lsn() >= L`
 *   3. belum sampai → tunggu, paling lama `COMPANY_DATABASE_READ_MAX_WAIT_MS`
 *      (bawaan 5 detik), lalu JATUH KE PRIMARY.
 *
 * Akibatnya: ekspor dari replika memuat SETIAP transaksi yang sudah di-commit
 * sebelum ekspor itu mulai dihitung — janji yang sama dengan membaca primary
 * pada detik itu. Yang tidak dijanjikan hanyalah transaksi yang di-commit
 * SELAMA perhitungan, dan primary pun tidak menjanjikannya tanpa transaksi
 * `REPEATABLE READ`.
 *
 * Kenapa bukan `now() - pg_last_xact_replay_timestamp()`: angka itu membesar
 * saat primary DIAM (tidak ada transaksi baru untuk diputar), jadi replika yang
 * sempurna segar terbaca "tertinggal 10 menit" di malam hari; dan ia
 * membandingkan jam dua mesin. Perbandingan LSN tidak punya keduanya.
 *
 * Replika yang ternyata BUKAN standby (`pg_is_in_recovery() = false`) tidak
 * dipakai: itu salah konfigurasi, atau bekas standby yang sudah dipromosikan
 * sementara aplikasi masih menganggap primary lama hidup — keadaan *split
 * brain* yang tidak boleh dibaca diam-diam.
 *
 * ══ YANG TIDAK BOLEH MASUK CAKUPAN INI ═════════════════════════════════════
 * Apa pun yang MENULIS berdasarkan apa yang dibacanya: posting, tutup periode,
 * tutup tahun, revaluasi kurs, pembayaran. "Saldo dari replika, jurnal ke
 * primary" adalah jurnal yang dihitung dari angka yang mungkin bukan angka
 * terakhir. Karena itu pemanggil `runReadOnly` adalah DAFTAR-IZIN di
 * `tests/read-replica.test.ts`, dipindai lewat `akarSumber()`.
 *
 * ══ PENOLAKAN TULISAN: DUA LAPIS ═══════════════════════════════════════════
 *   • proxy `prisma` melempar `ReadScopeWriteError` untuk setiap method model
 *     yang menulis dan untuk `$executeRaw*` — SEBELUM memilih klien, jadi
 *     tulisan ditolak sama kerasnya saat cakupan jatuh ke primary;
 *   • `$transaction` di dalam cakupan dibuka `SET TRANSACTION READ ONLY`, jadi
 *     `tx.create(...)` di dalam callback ditolak PostgreSQL sendiri — di primary
 *     maupun replika (yang memang menolak semua tulisan).
 * Satu lubang yang DISEBUT: `$queryRaw` yang berisi `INSERT … RETURNING`. Di
 * replika ia ditolak server; di primary (jatuh) ia lolos. Tidak ada satu pun
 * di jalur laporan hari ini, dan penjaga daftar-izin membatasi di mana ia bisa
 * muncul.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { PrismaClient } from "@sai/db/client/company";
import { mesinDari } from "@sai/db/adapter";
import { companyPoolKey, type CompanyDatabaseTarget } from "@sai/db/company-url";

import { getCompanyClient, getCompanyReadClient, readTemplateUrl } from "@/lib/company-clients";

/** Method delegate model Prisma yang MENULIS. */
export const WRITE_METHODS: ReadonlySet<string> = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/** Method klien yang MENULIS tanpa bisa dibedakan dari teksnya. */
export const WRITE_CLIENT_METHODS: ReadonlySet<string> = new Set([
  "$executeRaw",
  "$executeRawUnsafe",
]);

export class ReadScopeWriteError extends Error {
  constructor(what: string) {
    super(
      `Tulisan \`${what}\` di dalam runReadOnly() ditolak. Cakupan ini membaca ` +
        "dari replika (atau primary sebagai cadangan) dan tidak pernah menulis — " +
        "pindahkan tulisannya ke luar cakupan, atau jalur ini memang bukan jalur baca."
    );
    this.name = "ReadScopeWriteError";
  }
}

interface ReadScope {
  /** Keputusan per basis data, diambil SEKALI per cakupan. */
  readonly decisions: Map<string, Promise<PrismaClient>>;
}

const als = new AsyncLocalStorage<ReadScope>();

const DEFAULT_MAX_WAIT_MS = 5_000;
const POLL_MS = 200;

function maxWaitMs(): number {
  const raw = process.env.COMPANY_DATABASE_READ_MAX_WAIT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_WAIT_MS;
}

/**
 * Replika baca terpasang? Hanya PostgreSQL: aturan kesegarannya LSN, dan
 * MariaDB tidak punya padanan yang sama ketatnya.
 */
export function readReplicaEnabled(): boolean {
  const url = readTemplateUrl();
  if (!url) return false;
  return mesinDari(url.toString()) === "postgresql";
}

/** Sedang di dalam `runReadOnly` yang aktif? */
export function inReadScope(): boolean {
  return als.getStore() !== undefined;
}

/**
 * Jalankan `fn` sebagai jalur BACA. Tanpa replika terpasang: `fn()` apa adanya.
 *
 * Konteks perusahaan TIDAK disediakan di sini — ia tetap datang dari penjaga
 * atau `runWithCompany()`, dan yang hilang tetap MELEMPAR (#104). Cakupan ini
 * hanya mengubah KE MANA query PT yang sudah ditentukan itu dikirim.
 */
export async function runReadOnly<T>(fn: () => Promise<T>): Promise<T> {
  if (!readReplicaEnabled()) return fn();
  return als.run({ decisions: new Map() }, fn);
}

export interface FreshnessDeps {
  sleep(ms: number): Promise<void>;
  now(): number;
  log(message: string): void;
}

const realDeps: FreshnessDeps = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  log: (m) => console.warn(m),
};

/**
 * Pakai replika atau primary? Diekspor untuk tes; jalannya lihat kepala berkas.
 * Setiap galat → primary. Replika yang tak terjangkau bukan alasan ekspor gagal.
 */
export async function chooseReadClient(
  databaseName: string,
  primary: PrismaClient,
  replica: PrismaClient,
  deps: FreshnessDeps = realDeps,
  waitMs: number = maxWaitMs()
): Promise<PrismaClient> {
  try {
    const [{ lsn } = { lsn: "" }] = await primary.$queryRaw<{ lsn: string }[]>`
      SELECT pg_current_wal_lsn()::text AS lsn`;
    if (!lsn) return primary;

    const deadline = deps.now() + waitMs;
    for (;;) {
      const [row] = await replica.$queryRaw<{ standby: boolean; caught: boolean | null }[]>`
        SELECT pg_is_in_recovery() AS standby,
               pg_last_wal_replay_lsn() >= ${lsn}::pg_lsn AS caught`;
      if (!row?.standby) {
        deps.log(
          `[replika ${databaseName}] bukan standby (pg_is_in_recovery = false) — ` +
            "membaca primary. Periksa COMPANY_DATABASE_READ_URL_TEMPLATE."
        );
        return primary;
      }
      if (row.caught) return replica;
      if (deps.now() >= deadline) {
        deps.log(
          `[replika ${databaseName}] belum memutar WAL sampai ${lsn} dalam ${waitMs}ms — ` +
            "membaca primary."
        );
        return primary;
      }
      await deps.sleep(POLL_MS);
    }
  } catch (e) {
    deps.log(`[replika ${databaseName}] tak terjangkau (${String(e)}) — membaca primary.`);
    return primary;
  }
}

/**
 * Klien untuk BACAAN di dalam cakupan — dipanggil proxy `@/lib/prisma` saja.
 * Di luar cakupan: primary, selalu.
 */
export function routeReadClient(target: CompanyDatabaseTarget): Promise<PrismaClient> {
  const primary = getCompanyClient(target);
  const scope = als.getStore();
  if (!scope) return Promise.resolve(primary);
  const key = companyPoolKey(target);
  let decision = scope.decisions.get(key);
  if (!decision) {
    const replica = getCompanyReadClient(target);
    decision = replica
      ? chooseReadClient(target.databaseName, primary, replica)
      : Promise.resolve(primary);
    scope.decisions.set(key, decision);
  }
  return decision;
}
