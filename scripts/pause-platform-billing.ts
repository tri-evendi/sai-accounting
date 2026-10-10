/**
 * FASE A KOMERSIALISASI — hentikan penagihan otomatis terhadap akun yang tidak
 * punya perjanjian komersial, dan pulihkan yang sudah terkena.
 *
 * ══ APA YANG DIPERBAIKI ════════════════════════════════════════════════════
 * Penjadwal menerbitkan tagihan untuk SETIAP langganan yang masa uji cobanya
 * habis, tanpa satu pun pemeriksaan "apakah akun ini memang pelanggan"
 * (`docs/KOMERSIALISASI.md` §1.1). Di produksi, 10 Okt 2026: sembilan akun UJI
 * COBA ditagih Rp 664.890, ditagih ulang lewat 40 surel pengingat, lima di
 * antaranya ditangguhkan menjadi hanya-baca, dan nol pembayaran pernah
 * tercatat — sebab tidak ada gerbang pembayaran terpasang sama sekali.
 *
 * Skrip ini melakukan empat hal, dalam urutan ini, per akun sasaran:
 *
 *   1. `billing_mode` → `none` (migration 0014). Ini perbaikan yang BERTAHAN:
 *      begitu image baru terpasang, ketiga langkah penjadwal melewatinya.
 *   2. tagihan `issued` yang TIDAK punya pembayaran → `void`. Piutang fiktif
 *      berhenti menjadi piutang; `void` dan bukan dihapus, sebab nomornya
 *      pernah terbit dan pernah dikirim lewat surel.
 *   3. `trial_ends_at` → NULL bila masih `trialing`. Ini ikat pinggang untuk
 *      image LAMA yang belum punya gerbang (1): tanpa tanggal, langkah
 *      "trial habis" tidak punya apa pun untuk ditindak.
 *   4. `suspended`/`past_due` → `active`, lewat `setTenantSuspension` — bukan
 *      UPDATE langsung. Fungsi itu memakai mesin siklus hidup yang sama dengan
 *      konsol, menulis salinan status ke basis data KENDALI (yang dibaca
 *      penjaga hanya-baca), dan meninggalkan jejak audit beralasan. Buku yang
 *      dibuka tanpa jejak adalah buku yang tidak ada yang tahu kenapa terbuka.
 *
 * ══ SIAPA YANG DISASAR — DIUKUR, TIDAK DIDAFTAR ════════════════════════════
 * Sasarannya: tenant yang **belum pernah punya satu pun pembayaran**. Itu
 * definisi "belum pernah menjadi pelanggan" yang bisa dihitung, dan ia
 * membatasi dirinya sendiri di masa depan — begitu sebuah tenant membayar, ia
 * tidak akan pernah lagi tersentuh skrip ini.
 *
 * Daftar slug yang diketik tangan sengaja TIDAK dipakai: ia benar hari ini dan
 * salah pada akun kedua belas.
 *
 * ⚠ `--tenant <id|slug>` tersedia untuk menyasar SATU akun. Tanpa itu, seluruh
 * akun tanpa pembayaran ikut.
 *
 * ══ KERING DULU ════════════════════════════════════════════════════════════
 * Bawaannya **KERING** (dry-run): mencetak apa yang AKAN terjadi dan tidak
 * menulis satu baris pun. `--apply` yang menulis, dan ia menuntut `--reason`
 * (minimal 5 karakter) karena alasannya ikut ke jejak audit tenant — aturan
 * yang sama dengan setiap aksi tulis konsol (#155).
 *
 *   bun run billing:pause                                    # kering
 *   bun run billing:pause -- --apply --reason "Fase A: ..."   # menulis
 *
 * IDEMPOTEN: dijalankan dua kali, putaran kedua melaporkan "tidak ada yang
 * perlu diubah". Itu yang membuatnya aman dijalankan lagi setelah rilis.
 *
 * ══ MIGRATION 0014 WAJIB LEBIH DULU — DIPELAJARI DENGAN CARA YANG MAHAL ════
 * Versi pertama skrip ini mengaku "bisa dijalankan sebelum migration 0014":
 * langkah 1 dilewati, langkah 2–4 tetap berjalan. Dijalankan di produksi, ia
 * BERHENTI DI TENGAH — satu tagihan sudah di-`void`, lalu `P2022
 * ColumnNotFound`, dan tidak satu pun tenant dipulihkan.
 *
 * Sebabnya bukan baris di skrip ini melainkan sifat Prisma 7: klien hasil
 * `prisma generate` yang LEBIH BARU daripada basis datanya akan gagal pada
 * setiap TULIS ke model yang kolomnya belum ada — bukan hanya saat kolom itu
 * disebut. `subscription.update()` menyertakan seluruh kolom model dalam
 * pengembaliannya, jadi `setTenantSuspension` gagal meski tidak menyentuh
 * `billing_mode` sama sekali. Membaca tetap aman; menulis tidak.
 *
 * Karena itu sekarang: KERING tetap boleh (ia hanya membaca, dan berguna untuk
 * melihat lingkupnya), tetapi `--apply` DITOLAK sampai kolomnya ada. Urutan
 * yang benar, dan satu-satunya yang pernah berhasil:
 *
 *   bun run db:migrate:platform          # 0014
 *   bun run billing:pause                # kering, periksa lingkupnya
 *   bun run billing:pause -- --apply --reason "..."
 *
 * Skrip ini IDEMPOTEN, jadi putaran yang berhenti di tengah aman diulang:
 * yang sudah benar dilaporkan "tidak ada yang diubah".
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { setTenantSuspension } from "../src/lib/operator/writes";

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
  'Pakai: bun run billing:pause [-- --tenant <id|slug>] [--apply --reason "<alasan>"]';

/**
 * Apakah kolom `billing_mode` sudah ada di basis data ini?
 *
 * Diperiksa lewat `information_schema`, bukan dengan mencoba-lalu-menangkap:
 * query yang gagal karena kolom hilang akan menggagalkan transaksi/koneksi pada
 * sebagian driver, dan "gagal" juga bisa berarti hal lain (hak akses, basis
 * data salah). Pertanyaannya spesifik, jadi jawabannya pun harus spesifik.
 */
async function kolomBillingModeAda(platform: PlatformClient): Promise<boolean> {
  const rows = await platform.$queryRaw<{ jumlah: bigint | number }[]>`
    SELECT COUNT(*) AS jumlah
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'subscriptions'
       AND COLUMN_NAME = 'billing_mode'`;
  return Number(rows[0]?.jumlah ?? 0) > 0;
}

/** Rupiah untuk mata manusia — skrip ini dibaca di terminal, bukan diparse. */
function rp(value: unknown): string {
  return `Rp ${Number(value).toLocaleString("id-ID")}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const reason = argValue("--reason")?.trim() ?? "";
  const tenantArg = argValue("--tenant");

  if (apply && reason.length < 5) {
    console.error(
      "✗ --apply menuntut --reason (minimal 5 karakter) — alasannya ikut tercatat\n" +
        "  di jejak audit tenant, dan tindakan tanpa alasan tidak bisa ditinjau ulang.\n" +
        USAGE
    );
    process.exit(1);
  }

  const platformUrl = process.env.PLATFORM_DATABASE_URL;
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!platformUrl || !controlUrl) {
    console.error("✗ PLATFORM_DATABASE_URL dan CONTROL_DATABASE_URL wajib diset.");
    process.exit(1);
  }

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);

  console.log(
    apply
      ? "⚑ MODE TULIS (--apply) — perubahan di bawah BENAR-BENAR diterapkan.\n"
      : "⚑ MODE KERING — tidak satu baris pun ditulis. Tambahkan --apply untuk menerapkan.\n"
  );

  /* ── 1. Siapa yang BELUM PERNAH membayar ─────────────────────────────────── */
  const pembayaran = await platform.payment.groupBy({
    by: ["tenantId"],
    _count: { _all: true },
  });
  const pernahBayar = new Set(pembayaran.map((row) => row.tenantId));

  const subscriptions = await platform.subscription.findMany({
    orderBy: { tenantId: "asc" },
    select: {
      id: true,
      tenantId: true,
      status: true,
      billingCycle: true,
      price: true,
      trialEndsAt: true,
      pastDueSince: true,
    },
  });

  /* Gerbang yang BERTAHAN hanya bisa dipasang bila kolomnya sudah ada. */
  const adaKolomMode = await kolomBillingModeAda(platform);
  const modeSekarang = new Map<number, string>();
  if (adaKolomMode) {
    const baris = await platform.subscription.findMany({
      select: { id: true, billingMode: true },
    });
    for (const row of baris) modeSekarang.set(row.id, row.billingMode);
  } else if (apply) {
    /*
     * GAGAL-TERTUTUP, dan ia dibayar dengan satu putaran yang berhenti di
     * tengah di produksi (lihat kepala berkas): dengan klien yang lebih baru
     * daripada basis datanya, SETIAP tulis ke `subscriptions` gagal P2022 —
     * termasuk `setTenantSuspension`, yang tidak menyebut kolomnya sama sekali.
     * Lebih baik menolak sebelum menulis apa pun daripada memulihkan separuh
     * tenant lalu berhenti.
     */
    console.error(
      "✗ Kolom `billing_mode` belum ada (migration 0014 belum diterapkan), dan\n" +
        "  dengan klien Prisma yang lebih baru daripada basis datanya SETIAP tulis\n" +
        "  ke `subscriptions` akan gagal di tengah jalan. Terapkan dulu:\n\n" +
        "    bun run db:migrate:platform\n\n" +
        "  lalu jalankan ulang perintah yang sama. Skrip ini idempoten."
    );
    await platform.$disconnect();
    await control.$disconnect();
    process.exit(1);
  } else {
    console.log(
      "⚠ Kolom `billing_mode` belum ada (migration 0014 belum diterapkan).\n" +
        "  Rencana di bawah TIDAK BISA diterapkan sampai migrationnya jalan —\n" +
        "  `--apply` akan menolak. Terapkan dulu: bun run db:migrate:platform\n"
    );
  }

  const tenants = await control.tenant.findMany({
    select: { id: true, slug: true, name: true, status: true },
  });
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const sasaran = subscriptions.filter((sub) => {
    if (pernahBayar.has(sub.tenantId)) return false;
    if (tenantArg === null) return true;
    const tenant = tenantById.get(sub.tenantId);
    return /^\d+$/.test(tenantArg)
      ? sub.tenantId === Number(tenantArg)
      : tenant?.slug === tenantArg;
  });

  if (sasaran.length === 0) {
    console.log("✓ Tidak ada langganan tanpa pembayaran — tidak ada yang perlu diubah.");
    await platform.$disconnect();
    await control.$disconnect();
    return;
  }

  console.log(`Sasaran: ${sasaran.length} langganan tanpa satu pun pembayaran.\n`);

  let diubahMode = 0;
  let dibatalkan = 0;
  let nominalDibatalkan = 0;
  let trialDibersihkan = 0;
  let dipulihkan = 0;
  let gagalPulih = 0;

  for (const sub of sasaran) {
    const tenant = tenantById.get(sub.tenantId);
    const nama = tenant ? `${tenant.slug} (#${sub.tenantId})` : `tenant #${sub.tenantId}`;
    const baris: string[] = [];

    /* ── a. billing_mode → none ──────────────────────────────────────────── */
    const modeLama = modeSekarang.get(sub.id);
    if (adaKolomMode && modeLama !== "none") {
      baris.push(`billing_mode: ${modeLama ?? "?"} → none`);
      if (apply) {
        await platform.subscription.update({
          where: { id: sub.id },
          data: { billingMode: "none" },
        });
      }
      diubahMode += 1;
    }

    /* ── b. tagihan terbit tanpa pembayaran → void ───────────────────────── */
    const terbit = await platform.platformInvoice.findMany({
      where: { subscriptionId: sub.id, status: "issued" },
      select: { id: true, number: true, total: true, _count: { select: { payments: true } } },
    });
    for (const inv of terbit) {
      if (inv._count.payments > 0) {
        /* Tagihan yang sudah punya baris pembayaran TIDAK disentuh: di situ ada
           uang, atau setidaknya instruksi bayar yang pernah dibuat. Yang
           seperti itu diselesaikan manusia, bukan skrip. */
        baris.push(`⚠ ${inv.number} DILEWATI — sudah punya baris pembayaran`);
        continue;
      }
      baris.push(`tagihan ${inv.number} (${rp(inv.total)}): issued → void`);
      if (apply) {
        await platform.platformInvoice.update({
          where: { id: inv.id },
          data: { status: "void" },
        });
      }
      dibatalkan += 1;
      nominalDibatalkan += Number(inv.total);
    }

    /* ── c. trial_ends_at → NULL (ikat pinggang untuk image lama) ────────── */
    if (sub.status === "trialing" && sub.trialEndsAt !== null) {
      baris.push(`trial_ends_at: ${sub.trialEndsAt.toISOString().slice(0, 10)} → NULL`);
      if (apply) {
        await platform.subscription.update({
          where: { id: sub.id },
          data: { trialEndsAt: null },
        });
      }
      trialDibersihkan += 1;
    }

    /* ── d. pulihkan yang tertangguhkan / menunggak ──────────────────────── */
    if (sub.status === "suspended" || sub.status === "past_due") {
      baris.push(`status: ${sub.status} → active (lewat setTenantSuspension, berjejak)`);
      if (apply) {
        const hasil = await setTenantSuspension(
          { platform, control },
          {
            tenantRef: { id: sub.tenantId },
            mode: "restore",
            actor: { operator: `cli:${process.env.USER ?? "unknown"}`, reason },
          }
        );
        if (hasil.outcome === "done") {
          dipulihkan += 1;
        } else {
          /* Dihitung sebagai TIDAK dipulihkan, dan itu penting: ringkasan di
             bawah adalah yang dibaca manusia untuk memutuskan "sudah beres
             atau belum". Penghitung yang mencatat PERCOBAAN alih-alih HASIL
             pernah melaporkan "6 tenant dipulihkan" ketika satu di antaranya
             ditolak mesin siklus hidup — satu akun tertinggal menunggak dengan
             laporan yang mengatakan sebaliknya. */
          baris.push(`  ⚠ pemulihan TIDAK berlaku: ${hasil.outcome} — masih ${sub.status}`);
          gagalPulih += 1;
        }
      } else {
        dipulihkan += 1;
      }
    }

    if (baris.length === 0) {
      console.log(`  = ${nama}: sudah benar, tidak ada yang diubah`);
      continue;
    }
    console.log(`  • ${nama} — status=${sub.status}, ${sub.billingCycle} ${rp(sub.price)}`);
    for (const b of baris) console.log(`      ${b}`);
  }

  await platform.$disconnect();
  await control.$disconnect();

  console.log("\n── Ringkasan ────────────────────────────────────────────────");
  console.log(
    `  billing_mode → none        : ${adaKolomMode ? String(diubahMode) : "DILEWATI (kolom belum ada)"}`
  );
  console.log(`  tagihan dibatalkan (void)  : ${dibatalkan} (${rp(nominalDibatalkan)})`);
  console.log(`  trial_ends_at dibersihkan  : ${trialDibersihkan}`);
  console.log(`  tenant dipulihkan          : ${dipulihkan}`);
  if (gagalPulih > 0) {
    console.log(`  ⚠ pemulihan DITOLAK mesin   : ${gagalPulih} — periksa baris di atas`);
  }
  if (!apply) {
    console.log(
      "\n⚑ Belum ada yang ditulis. Jalankan ulang dengan:\n" +
        '   bun run billing:pause -- --apply --reason "<alasan>"'
    );
  } else {
    console.log(
      "\n✓ Diterapkan. Yang BELUM selesai, dan tidak bisa diselesaikan skrip ini:\n" +
        "   • `SELF_SERVE_SIGNUP` jangan diset `open` sampai rel bayar hidup\n" +
        "     (`docs/KOMERSIALISASI.md` §5 gerbang Fase C);\n" +
        "   • `PLATFORM_PPN_DISABLED=true` sampai status PKP dijawab (§9);\n" +
        "   • akun yang MEMANG berbayar ditandai `billing_mode=auto` satu per satu." +
        (adaKolomMode
          ? ""
          : "\n   • migration 0014 (`billing_mode`) BELUM diterapkan — gerbang yang\n" +
            "     bertahan baru berdiri setelah rilis + skrip ini dijalankan sekali lagi.")
    );
  }
}

main().catch((error) => {
  console.error("✗ gagal:", error);
  process.exit(1);
});
