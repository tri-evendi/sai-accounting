/**
 * Ujung serah-terima SaaS → on-premise, di sisi SaaS. Runbook:
 * docs/ONPREM-PINDAH-DARI-SAAS.md. Dua perintah, satu berkas:
 *
 *   bun run tenant:mark-migrated-out -- --tenant <slug>                       # pratinjau
 *   bun run tenant:mark-migrated-out -- --tenant <slug> --apply --reason "…"  # nyatakan pindah
 *   bun run tenant:unfreeze -- --tenant <slug> --reason "…"                   # jalan balik
 *
 * `mark-migrated-out` dijalankan SESUDAH customer menyatakan pemasangan
 * on-premise-nya berjalan: penagihan berhenti (langganan `cancelled`, mode
 * `none`), PT dinonaktifkan, sesi dicabut, dan pengguna yang masuk ke SaaS
 * membaca kalimat "sudah dipindahkan". TIDAK menghapus apa pun — retensi &
 * penghapusan lewat alur #142. Pratinjau secara bawaan karena `cancelled`
 * adalah keadaan akhir mesin langganan.
 *
 * `unfreeze` membatalkan serah-terima SEBELUM dinyatakan pindah: buku SaaS
 * kembali bisa ditulis. Bundel yang sudah diambil menjadi BASI sejak tulisan
 * pertama sesudahnya — ambil yang baru bila serah-terima diulang.
 *
 * Logikanya di `apps/operator/src/lib/operator/onprem-cutover.ts` (pola
 * `execute-tenant-deletion.ts`): skrip ini hanya merakit klien & mencetak.
 */
import "dotenv/config";

import { PrismaClient as ControlClient } from "@sai/db/client/control";
import { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import { buatAdapter } from "@sai/db/adapter";

import {
  markTenantMigratedOut,
  unfreezeTenant,
} from "../apps/operator/src/lib/operator/onprem-cutover";
import { argValue } from "./lib/bundle-io";

const MODES = ["mark-migrated-out", "unfreeze"] as const;
type Mode = (typeof MODES)[number];

async function main(): Promise<void> {
  const [modeArg, ...argv] = process.argv.slice(2);
  const mode = MODES.includes(modeArg as Mode) ? (modeArg as Mode) : null;
  const slug = argValue(argv, "--tenant");
  const reason = argValue(argv, "--reason")?.trim() ?? "";
  const apply = argv.includes("--apply");
  if (!mode || !slug) {
    console.error(
      "Pakai: bun run tenant:mark-migrated-out -- --tenant <slug> [--apply --reason \"…\"]\n" +
        "       bun run tenant:unfreeze -- --tenant <slug> --reason \"…\""
    );
    process.exit(1);
  }
  const controlRaw = process.env.CONTROL_DATABASE_URL;
  if (!controlRaw) {
    console.error("CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }
  const control = new ControlClient({ adapter: buatAdapter(controlRaw, { batasKoneksi: 1 }) });
  const actor = { operator: `cli:${process.env.USER ?? "unknown"}`, reason };
  const needReason = () => {
    if (reason.length < 5) {
      console.error("✗ --reason WAJIB (minimal 5 karakter) — alasannya ikut tercatat di jejak tenant.");
      process.exit(1);
    }
  };

  try {
    const tenant = await control.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, status: true, frozenAt: true, migratedOutAt: true },
    });
    if (!tenant) {
      console.error(`✗ tenant "${slug}" tidak ditemukan.`);
      process.exit(1);
    }
    console.log(
      `Tenant: ${tenant.name} (${slug}) — status ${tenant.status}, ` +
        (tenant.frozenAt ? `beku sejak ${tenant.frozenAt.toISOString()}` : "TIDAK beku")
    );

    if (mode === "unfreeze") {
      needReason();
      const r = await unfreezeTenant({ control }, { tenantRef: { id: tenant.id }, actor });
      switch (r.outcome) {
        case "unfrozen":
          console.log("✓ pembekuan dicabut — buku SaaS kembali bisa ditulis (≤ 60 detik di setiap proses).");
          console.log("  Bundel yang sudah diambil kini BASI: ambil yang baru bila serah-terima diulang.");
          return;
        case "not_frozen":
          console.log("Tidak beku — tidak ada yang diubah.");
          return;
        case "migrated_out":
          console.error(
            "✗ tenant sudah migrated_out: bukunya nonaktif dan langganannya berhenti. Mencairkan " +
              "tidak mengembalikannya — lihat runbook §Jalan balik."
          );
          process.exit(1);
          return;
        case "tenant_not_found":
          console.error("✗ tenant tidak ditemukan.");
          process.exit(1);
      }
      return;
    }

    // ── mark-migrated-out ───────────────────────────────────────────────
    const companies = await control.company.count({ where: { tenantId: tenant.id, isActive: true } });
    const users = await control.user.count({ where: { tenantId: tenant.id } });
    console.log("Yang akan terjadi:");
    console.log("  1. langganan: mode penagihan → none; status → cancelled (lewat mesin siklus hidup)");
    console.log(`  2. ${companies} PT aktif → nonaktif (buku TIDAK dihapus)`);
    console.log(`  3. sesi ${users} pengguna tenant ini dicabut; masuk ke SaaS menampilkan "sudah dipindahkan"`);
    console.log("  4. tenants.status → migrated_out");
    if (!tenant.frozenAt && tenant.status !== "migrated_out") {
      console.error(
        "\n✗ DITOLAK: tenant belum pernah dibekukan, jadi belum ada bundel yang diambil di bawah " +
          "pembekuan. Jalankan tenant:export-onprem dulu."
      );
      process.exit(1);
    }
    if (!apply) {
      console.log('\nPRATINJAU — tidak ada yang ditulis. Tambahkan --apply --reason "…" sesudah customer menyatakan on-premise berjalan.');
      return;
    }
    needReason();
    const platformRaw = process.env.PLATFORM_DATABASE_URL;
    if (!platformRaw) {
      console.error("✗ PLATFORM_DATABASE_URL belum diset — penagihan tidak bisa dihentikan, jadi tidak ada yang ditulis.");
      process.exit(1);
    }
    const platform = new PlatformClient({ adapter: buatAdapter(platformRaw, { batasKoneksi: 1 }) });
    try {
      const r = await markTenantMigratedOut({ control, platform }, { tenantRef: { id: tenant.id }, actor });
      switch (r.outcome) {
        case "migrated_out":
          console.log(
            `\n✓ ${slug} → migrated_out. ${r.companiesDeactivated} PT dinonaktifkan, ` +
              `${r.sessionsRevoked} sesi dicabut.`
          );
          console.log(
            r.subscription
              ? `  langganan #${r.subscription.id}: ${r.subscription.from} → ${r.subscription.to}; mode penagihan: ${r.billingMode}`
              : "  tenant tanpa langganan — tidak ada penagihan untuk dihentikan."
          );
          if (r.openInvoices.length > 0) {
            console.log(`  ⚠ ${r.openInvoices.length} tagihan masih terbuka — TIDAK disentuh (keputusan uang):`);
            for (const i of r.openInvoices) {
              console.log(`     ${i.number} ${i.status} Rp ${i.total} jatuh tempo ${i.dueDate.toISOString().slice(0, 10)}`);
            }
          }
          console.log(
            "  Buku, dokumen, dan pengguna TETAP tersimpan. Penghapusan & retensi: alur #142 " +
              "(docs/ONPREM-PINDAH-DARI-SAAS.md §Sesudah pindah)."
          );
          return;
        case "already_migrated_out":
          console.log(`Sudah migrated_out sejak ${r.migratedOutAt?.toISOString() ?? "?"} — tidak ada yang diubah.`);
          return;
        case "not_frozen":
          console.error("✗ tenant belum dibekukan — jalankan tenant:export-onprem dulu.");
          process.exit(1);
          return;
        case "tenant_not_found":
          console.error("✗ tenant tidak ditemukan.");
          process.exit(1);
      }
    } finally {
      await platform.$disconnect();
    }
  } finally {
    await control.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
