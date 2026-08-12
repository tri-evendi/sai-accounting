/**
 * "Tambah Perusahaan" (issue #104; dipindah ke lingkup TENANT di issue #135).
 *
 * Izinnya `company.create` di MATRIKS TENANT (`lib/tenant-authz.ts`) — milik
 * owner/admin tenant, bukan peran di salah satu PT. Perbedaannya bukan
 * kosmetik: pemilik tenant TANPA satu pun perusahaan harus bisa membuka
 * halaman ini untuk membuat yang pertama, dan penjaga per-perusahaan menuntut
 * konteks yang justru belum ada (ayam-dan-telur, docs/MULTI-TENANT.md §4.2).
 *
 * ══ DARI `AuthShell` KE PANEL AKUN ═════════════════════════════════════════
 * Halaman ini dulu memakai `AuthShell` — kulit yang sama dengan `/login` dan
 * `/select-company` — dengan alasan yang tertulis apa adanya: "layar di antara
 * buku-buku, bisa dibuka sebelum PT pertama ada". Separuh alasan itu benar dan
 * separuhnya tidak mengikat: `PlatformShell` juga tidak menuntut perusahaan
 * aktif (`/platform` sendiri berdiri tanpa satu pun PT — itu justru alasan grup
 * `(tenant)` ada). Jadi yang tersisa hanyalah kulit yang salah.
 *
 * Dan kulit itu salahnya terukur, bukan selera. `AuthShell` membawa panel
 * jualan gelap di kirinya — nama produk, slogan, tiga poin centang — yang
 * ditujukan kepada orang yang BELUM masuk. Halaman ini justru sebaliknya:
 * pintunya ada di MENU SAMPING `/platform` (lihat `nav` di `(panel)/layout`),
 * jadi sampai perbaikan ini menekan sebuah butir menu melempar penggunanya
 * keluar dari panel yang memuat menu itu, ke layar yang membujuknya membeli apa
 * yang sudah ia bayar — tanpa menu samping, tanpa breadcrumb, dan dengan
 * satu-satunya jalan pulang berupa tombol "Kembali" selebar kartu.
 *
 * Sekarang bentuknya sama persis dengan saudara-saudaranya di panel
 * (`/platform/team`, `/platform/billing`): `PageHeader` + breadcrumb + `Card`.
 * Tombol "Kembali" ikut dicabut, dan itu bukan kehilangan — menu samping dan
 * breadcrumb keduanya jalan pulang, sedangkan tombol garis selebar kartu tepat
 * di bawah tombol primer adalah ajakan kedua yang bersaing dengan
 * satu-satunya aksi utama layar ini (MASTER.md §Aksi utama per layar).
 *
 * URL-nya TIDAK berubah: `(panel)` adalah grup rute, dan grup rute tidak muncul
 * di alamat. Lihat kepala `(panel)/layout.tsx`.
 */
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { getT } from "@/lib/i18n/server";

import { CompanyForm } from "./company-form";

export const dynamic = "force-dynamic";

/**
 * Kalimat penjelas. Server component, jadi tanpa `theme.useToken()`; warnanya
 * variabel token AntD, yang teratasi walau tak ada komponen AntD di atasnya —
 * sejak #227 kelas `ANTD_CSS_VAR_KEY` dipikul `<html>` oleh root layout, bukan
 * oleh elemen yang digambar komponen AntD (#203).
 */
const BODY_TEXT: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

export default async function NewCompanyPage() {
  const { user, tenant } = await requireTenantPagePermission("company.create");
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t("companies.newTitle")}
        description={t("companies.newDescription")}
        breadcrumbs={[
          { label: t("platform.title"), href: "/platform" },
          { label: t("companies.newTitle") },
        ]}
      />

      <Card>
        <CardContent>
          {/* Konsekuensinya disebut SEBELUM tombolnya ditekan: buku yang
              terpisah penuh, dan wizard penyiapan yang masih menunggu. */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}
          >
            <p style={BODY_TEXT}>{t("companies.explainIsolation")}</p>
            {/*
             * SIAPA yang menjadi administratornya — disebut SEBELUM tombolnya
             * ditekan, dan menyebut nama akunnya.
             *
             * Ini bukan hiasan: pembuat PT otomatis menjadi Direktur Utama di
             * PT yang baru lahir (`api/companies/route.ts` → `ROLES.
             * MANAGING_DIRECTOR`), dan sampai kalimat ini ada, satu-satunya
             * cara mengetahuinya adalah membuat PT-nya lalu melihat hasilnya.
             * Yang paling perlu tahu justru pemilik yang sedang masuk memakai
             * akun yang SALAH — mis. akun bersama, atau akun staf yang
             * dipinjam. Baginya kalimat ini adalah kesempatan terakhir untuk
             * berhenti; sesudah PT lahir, peran itu sudah tertulis sebagai
             * keanggotaan dan mencabutnya bukan lagi urusan satu tombol.
             *
             * Namanya diambil dari SESI (penjaga), bukan dari klien.
             */}
            <p style={BODY_TEXT}>
              {t("companies.explainAdmin", { name: user.name ?? user.email ?? "" })}
            </p>
            <p style={BODY_TEXT}>{t("companies.explainNextStep")}</p>
          </div>

          {/* `tenantId` hanya untuk PRATINJAU nama basis data (`sai_t{id}_{slug}`,
              issue #153) — nilai yang dipakai server tetap datang dari penjaga
              `requireTenantApiPermission`, tidak pernah dari klien. */}
          {/* `tenantSlug` dipakai menyusun jalan pintas ke wizard penyiapan
              perusahaan yang baru dibuat — lihat komentar di `company-form`. */}
          <CompanyForm tenantId={tenant.tenantId} tenantSlug={tenant.tenantSlug} />
        </CardContent>
      </Card>
    </>
  );
}
