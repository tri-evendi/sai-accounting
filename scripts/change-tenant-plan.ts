/**
 * Ganti PAKET sebuah tenant — JALUR PEMULIHAN command-line (issue #140,
 * dijadikan pembungkus tipis di #155).
 *
 *   bun run change-plan -- --tenant <id|slug> --plan <key> --reason "<alasan>"
 *
 * ══ PEMBUNGKUS, BUKAN IMPLEMENTASI KEDUA ════════════════════════════════════
 * Sejak #155 logikanya hidup di `src/lib/operator/writes.ts` dan dipakai
 * BERSAMA oleh konsol operator. Skrip ini tinggal tiga hal: merakit klien,
 * membaca argumen, mencetak hasil. Kalau kedua jalur punya salinan logikanya
 * sendiri, salah satunya akan menyimpang diam-diam — dan yang menyimpang
 * selalu ketahuan terlambat, dari tenant yang kuotanya salah.
 *
 * Skripnya TETAP ADA dengan sengaja: saat konsol operator sendiri mati (host
 * salah konfigurasi, IP belum di-allowlist, Next tidak menyala), pemulihan
 * tidak boleh ikut mati. Yang tidak berubah adalah kewajibannya — `--reason`
 * WAJIB di sini persis seperti di konsol: tindakan tanpa alasan tidak bisa
 * ditinjau ulang, siapa pun yang menjalankannya.
 *
 * Urutan tulis #137 (platform DULU, kendali BELAKANGAN), snapshot harga &
 * kuota, dan jejak audit tenant beraktor+beralasan semuanya milik inti — lihat
 * dokumentasinya di `writes.ts`.
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { changeTenantPlan } from "../src/lib/operator/writes";

function clientFor<T>(Ctor: new (args: { adapter: PrismaMariaDb }) => T, rawUrl: string): T {
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

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const USAGE =
  'Pakai: bun run change-plan -- --tenant <id|slug> --plan <key> --reason "<alasan>"';

async function main() {
  const tenantArg = argValue("--tenant");
  const planKey = argValue("--plan");
  const reason = argValue("--reason")?.trim() ?? "";
  if (!tenantArg || !planKey) {
    console.error(USAGE);
    process.exit(1);
  }
  if (reason.length < 5) {
    console.error(
      "✗ --reason WAJIB (minimal 5 karakter) — alasannya ikut tercatat di jejak audit tenant.\n" +
        USAGE
    );
    process.exit(1);
  }

  const platformUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();
  if (!platformUrl || !controlUrl) {
    console.error("✗ PLATFORM_DATABASE_URL dan CONTROL_DATABASE_URL wajib diset.");
    process.exit(1);
  }

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);

  const result = await changeTenantPlan(
    { platform, control },
    {
      tenantRef: /^\d+$/.test(tenantArg) ? { id: Number(tenantArg) } : { slug: tenantArg },
      planKey,
      /* Aktor CLI ditandai sebagai CLI — jejak harus bisa membedakan tindakan
       * konsol dari tindakan shell tanpa menebak. */
      actor: { operator: `cli:${process.env.USER ?? "unknown"}`, reason },
    }
  );

  await platform.$disconnect();
  await control.$disconnect();

  switch (result.outcome) {
    case "changed": {
      console.log(
        `✓ tenant "${result.tenantSlug}": ${result.fromPlanKey} → ${result.toPlanKey} ` +
          `(subscription #${result.subscriptionId}, status=${result.subscriptionStatus}) — ` +
          "salinan kendali ditulis TERAKHIR"
      );
      if (result.quotaWarning) {
        const { companies, users } = result.quotaWarning;
        console.warn("⚠ Kuota paket baru DI BAWAH pemakaian nyata:");
        if (companies) console.warn(`  PT: ${companies.used} terpakai, kuota baru ${companies.max}`);
        if (users) console.warn(`  Pengguna: ${users.used} terpakai, kuota baru ${users.max}`);
        console.warn(
          "  Turun paket tetap sah — tenant tidak bisa menambah sampai kembali di bawah\n" +
            "  kuota. Konsekuensi ini ikut tercatat di jejak audit."
        );
      }
      return;
    }
    case "tenant_not_found":
      console.error(`✗ Tenant "${tenantArg}" tidak ditemukan di basis data kendali.`);
      process.exit(1);
      return;
    case "plan_not_found":
      console.error(
        `✗ Paket "${planKey}" tidak ada / nonaktif. Jalankan dulu: bun run db:seed:plans`
      );
      process.exit(1);
      return;
    case "race_lost":
      console.error(
        "✗ Bentrok dengan putaran penjadwal: langganan pertama tenant ini baru saja lahir\n" +
          "  di tangan lain (UNIQUE initial_for_tenant_id). Jalankan ulang perintah yang sama."
      );
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Ganti paket gagal:", error);
  process.exit(1);
});
