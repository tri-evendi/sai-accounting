/**
 * REKONSILIASI platform ↔ kendali (issue #137) — KERANGKA.
 *
 *   bun run reconcile:platform
 *
 * ══ KENAPA PEKERJAAN INI ADA ═══════════════════════════════════════════════
 * FK dan transaksi tidak menyeberangi basis data (docs/MULTI-TENANT.md §4A).
 * Konsistensi platform↔kendali karena itu ditegakkan URUTAN TULIS:
 *
 *     Tulis di `sai_platform` DULU, baru tandai di `sai_control`.
 *
 * Urutan itu memilih arah kegagalannya: crash di tengah meninggalkan catatan
 * platform tanpa jejak di kendali (yatim yang BISA ditemukan), tidak pernah
 * tenant yang naik kelas tanpa pembayaran (drift yang tanpa pemeriksaan ini
 * tidak akan pernah ketahuan). Skrip inilah pemeriksanya — ia MEMBACA kedua
 * sisi dan MELAPORKAN selisih; ia tidak memperbaiki apa pun sendiri, sebab
 * setiap perbaikan penagihan adalah keputusan uang yang harus diambil orang.
 *
 * ══ STATUS: LENGKAP sejak issue #140 ═══════════════════════════════════════
 * Empat pemeriksaan: langganan yatim, tenant berbayar tanpa langganan,
 * kecocokan status tenant ↔ langganan terbarunya (aturannya dari mesin
 * siklus hidup `src/lib/subscription-lifecycle.ts`), dan usage_counters vs
 * jumlah sesungguhnya. Penjadwal (`bun run scheduler:subscriptions`)
 * menjalankannya berkala lewat `runReconciliation` yang diekspor dari sini;
 * pemasangan pra-#134 tetap melewati pemeriksaan lintas-sisi dengan
 * pengumuman — bukan pura-pura hijau.
 *
 * Exit code: 0 = tidak ada selisih (atau pemeriksaan dilewati dengan alasan
 * yang tercetak), 1 = ADA selisih yang menuntut tindakan orang.
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { runReconciliation } from "../src/lib/platform-reconciliation";

function clientFor<T>(
  Ctor: new (args: { adapter: PrismaMariaDb }) => T,
  rawUrl: string
): T {
  const url = new URL(rawUrl);
  return new Ctor({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
}


async function main() {
  const platformUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();

  if (!platformUrl) {
    console.warn(
      "⚠ PLATFORM_DATABASE_URL belum diset — pemasangan ini berjalan tanpa " +
        "penagihan, tidak ada yang direkonsiliasi. Selesai."
    );
    process.exit(0);
  }
  if (!controlUrl) {
    console.error("✗ CONTROL_DATABASE_URL belum diset — tidak tahu sisi kendalinya.");
    process.exit(1);
  }

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);

  const report = await runReconciliation(platform, control);

  await platform.$disconnect();
  await control.$disconnect();

  console.log(
    `Rekonsiliasi platform ↔ kendali — ${report.subscriptionsChecked} langganan diperiksa.`
  );
  for (const item of report.skipped) console.log(`  ⏭  dilewati: ${item}`);
  if (report.findings.length === 0) {
    console.log("✓ Tidak ada selisih pada pemeriksaan yang berjalan.");
    process.exit(0);
  }
  console.error(`✗ ${report.findings.length} selisih ditemukan:`);
  for (const f of report.findings) console.error(`  [${f.check}] ${f.detail}`);
  process.exit(1);
}

/* Hanya berjalan bila dipanggil langsung (bun run reconcile:platform) — bukan
 * saat diimpor penjadwal. */
if (process.argv[1]?.endsWith("reconcile-platform.ts")) {
  main().catch((error) => {
    console.error("Rekonsiliasi gagal berjalan:", error);
    process.exit(1);
  });
}
