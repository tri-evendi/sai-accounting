/**
 * `/platform/privacy` — dua hak UU PDP (issue #142): ekspor seluruh data dan
 * permintaan penghapusan akun. Penjaganya `tenant.export`; tombol penghapusan
 * menuntut `tenant.deletion` tersendiri, dan dua-duanya OWNER.
 *
 * ══ KENAPA HALAMAN SENDIRI, DAN BUKAN DI PENDARATAN ════════════════════════
 * Sampai audit rute, permintaan penghapusan akun berada di kaki halaman yang
 * dibuka SETIAP KALI pelanggan masuk. Ia sudah diturunkan secara visual, tapi
 * "satu gulungan dari setiap masuk" tetap tempat yang salah untuk tindakan yang
 * menutup seluruh akses sebuah badan usaha. Sebagai rute tersendiri ia menjadi
 * tempat yang harus DITUJU — dan tetap dijaga `ConfirmDialog` di dalamnya.
 *
 * Ekspor sengaja tinggal serumah dengannya: keduanya jawaban atas pertanyaan
 * yang sama ("data saya, hak saya"), dan orang yang datang untuk menghapus akun
 * harus melihat tombol unduh SEBELUM tombol hapus — itulah urutan di halaman
 * ini, dan alasan kenapa ekspor tetap hidup walau langganan ditangguhkan.
 */
import { getT } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/page-header";
import { tenantCan } from "@/lib/tenant-authz";
import { requireTenantPagePermission } from "@/lib/tenant-guard";

import { PrivacySection } from "../privacy-section";

export const dynamic = "force-dynamic";

export default async function PlatformPrivacyPage() {
  const { tenant } = await requireTenantPagePermission("tenant.export");
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t("tenantSettings.privacyHeading")}
        breadcrumbs={[
          { label: t("platform.title"), href: "/platform" },
          { label: t("tenantSettings.privacyHeading") },
        ]}
      />
      <PrivacySection canDelete={tenantCan(tenant, "tenant.deletion")} />
    </>
  );
}
