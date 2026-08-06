/**
 * "Tambah Perusahaan" (issue #104; dipindah ke lingkup TENANT di issue #135).
 *
 * Izinnya kini `company.create` di MATRIKS TENANT (`lib/tenant-authz.ts`) —
 * milik owner/admin tenant, bukan peran di salah satu PT. Perbedaannya bukan
 * kosmetik: pemilik tenant TANPA satu pun perusahaan harus bisa membuka
 * halaman ini untuk membuat yang pertama, dan penjaga per-perusahaan menuntut
 * konteks yang justru belum ada (ayam-dan-telur, docs/MULTI-TENANT.md §4.2).
 *
 * Karena itu ia hidup di grup `(tenant)` dengan kulit `AuthShell` — sekeluarga
 * dengan /select-company, layar "di antara buku-buku": tanpa sidebar yang
 * menuntut peran per-PT, bisa dibuka sebelum PT pertama ada.
 */
import Link from "next/link";
import { ShopOutlined } from "@ant-design/icons";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { getT } from "@/lib/i18n/server";

import { CompanyForm } from "./company-form";

export const dynamic = "force-dynamic";

/**
 * Kalimat penjelas. Server component di dalam `AuthShell` yang belum
 * dikonversi, jadi tidak ada komponen AntD di atasnya dan variabel `--ant-…`
 * tidak akan teratasi (#227) — warnanya token `:root` aplikasi, sumber yang
 * sama dengan kulitnya.
 */
const BODY_TEXT: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.625,
  color: "var(--muted-foreground)",
};

export default async function NewCompanyPage() {
  const { tenant } = await requireTenantPagePermission("company.create");
  const t = await getT();

  return (
    <AuthShell
      heading={t("companies.newTitle")}
      description={t("companies.newDescription")}
      icon={<ShopOutlined aria-hidden="true" style={{ fontSize: 20 }} />}
      footer={
        /* JALAN KELUAR. Layar ini berdiri sebelum aplikasi, tanpa chrome apa
           pun — tanpa tautan ini satu-satunya tindakan yang mungkin adalah
           membuat perusahaan. */
        <Button asChild variant="outline" style={{ width: "100%" }}>
          <Link href="/select-company">{t("common.back")}</Link>
        </Button>
      }
    >
      {/* Konsekuensinya disebut SEBELUM tombolnya ditekan: buku yang terpisah
          penuh, dan wizard penyiapan yang masih menunggu. */}
      <div
        style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}
      >
        <p style={BODY_TEXT}>{t("companies.explainIsolation")}</p>
        <p style={BODY_TEXT}>{t("companies.explainNextStep")}</p>
      </div>

      {/* `tenantId` hanya untuk PRATINJAU nama basis data (`sai_t{id}_{slug}`,
          issue #153) — nilai yang dipakai server tetap datang dari penjaga
          `requireTenantApiPermission`, tidak pernah dari klien. */}
      {/* `tenantSlug` dipakai menyusun jalan pintas ke wizard penyiapan
          perusahaan yang baru dibuat — lihat komentar di `company-form`. */}
      <CompanyForm tenantId={tenant.tenantId} tenantSlug={tenant.tenantSlug} />
    </AuthShell>
  );
}
