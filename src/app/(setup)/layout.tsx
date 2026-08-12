/**
 * Grup rute `(setup)` — wisaya penyiapan perusahaan.
 *
 * Grup rute TIDAK mengubah URL: halamannya tetap `/t/{tenant}/{company}/setup`,
 * semua tautan lama tetap benar. Yang berubah hanya kerangka yang membungkusnya.
 *
 * ══ KENAPA LAYAR INI DULU TANPA MENU SAMPING — DAN KENAPA ITU BERUBAH ══════
 * Sampai perbaikan ini wisaya memakai kulitnya sendiri (`SetupShell`), dan
 * alasannya tertulis apa adanya di sana: wisaya pernah tinggal di grup
 * `(dashboard)`, jadi ia dirender dengan sidebar ~40 menu — dan karena gerbang
 * "belum disiapkan" memantulkan setiap halaman itu kembali ke wisaya, hasilnya
 * empat puluh pintu yang semuanya memantul ke tempat yang sama, pada layar
 * pertama yang pernah dilihat pengguna baru.
 *
 * Alasan itu benar, dan ia TETAP benar — tapi hanya untuk sidebar DASBOR.
 * Dibaca ulang di kode: gerbang setup hidup di `requirePagePermission`
 * (`lib/page-auth.ts`), yang menjaga halaman berlingkup PERUSAHAAN. Menu panel
 * akun tidak lewat sana sama sekali — `/platform`, `/platform/team`,
 * `/platform/billing`, `/platform/privacy`, `/companies/new` semuanya dijaga
 * `requireTenantPagePermission` (`lib/tenant-guard.ts`), yang tidak punya
 * gerbang setup. Tidak satu pun butirnya memantul.
 *
 * Jadi jebakan yang melahirkan `SetupShell` tidak pernah berlaku untuk menu
 * ini; ia hanya belum ada saat `SetupShell` ditulis (#103 mendahului panel akun
 * #172). Yang tersisa hanyalah satu layar yang bentuknya berbeda sendiri.
 *
 * ⚠ Yang HILANG bersama `SetupShell`, dan itu memang ditukar dengan sadar:
 * "satu jalan ke depan, yaitu wisaya itu sendiri". Wisaya kini bisa
 * ditinggalkan lewat menu samping. Yang membuat pertukaran ini aman adalah
 * mekanisme yang sudah ada sejak audit 2026-07: ketikan wisaya disimpan ke
 * `sessionStorage` pada setiap perubahan dan dipulihkan saat kembali, dan sejak
 * penanda "draf tersimpan" muncul di sebelah hitungan langkah, jaring itu juga
 * TERBACA. Kalau kelak fokus dianggap lebih berharga daripada keseragaman,
 * yang perlu dikembalikan adalah kulit ini — bukan menunya.
 *
 * Halamannya sendiri TETAP dijaga `requirePagePermission("setup.manage")`, dan
 * `tests/authz-coverage.test.ts` ikut menelusuri grup ini persis seperti
 * `(dashboard)` — pindah kulit tidak boleh berarti pindah keluar dari penjaga.
 * Penjaga di layout ini (`tenant.home`) adalah lapisan pertamanya, bukan
 * penggantinya.
 *
 * Provider-nya tetap dua — sesi (menu pengguna & keluar) dan toast (wisaya
 * melaporkan hasil simpan lewat toast). Tidak ada `GuidedTour`: tur adalah
 * lapisan penjelas untuk aplikasi yang sudah berjalan, dan memunculkannya di
 * atas layar wajib pertama justru menambah satu hal lagi yang harus ditutup
 * sebelum bisa bekerja.
 */

import { SessionProvider } from "next-auth/react";

import { PlatformShell } from "@/components/tenant/platform-shell";
import { ToastProvider } from "@/components/ui/toast";
import { getT } from "@/lib/i18n/server";
import { panelNav } from "@/lib/panel-nav";
import { requireTenantPagePermission } from "@/lib/tenant-guard";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant } = await requireTenantPagePermission("tenant.home");
  const t = await getT();

  return (
    <SessionProvider>
      <ToastProvider>
        <PlatformShell
          tenantName={tenant.tenantName}
          nav={panelNav(tenant, t)}
          userName={user.name ?? ""}
          role={tenant.role ?? ""}
        >
          {children}
        </PlatformShell>
      </ToastProvider>
    </SessionProvider>
  );
}
