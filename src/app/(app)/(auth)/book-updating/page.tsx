/**
 * "Buku sedang diperbarui" — layar untuk buku yang ditutup gerbang skema per
 * perusahaan (09 §6, `lib/company-schema-gate.ts`).
 *
 * Sejak migration buku boleh gagal sebagian tanpa menahan rilis, image baru
 * bisa melayani 16 buku yang sudah termigrasi sementara satu buku masih
 * menunggu migration-nya. Buku itu ditutup — hanya buku itu — dan penjaga
 * halaman memantulkan pembukanya ke sini, bukan ke layar galat.
 *
 * Sengaja TANPA query apa pun, termasuk nama perusahaannya: halaman ini
 * menerima slug dari query string, dan menjawab "ada atau tidak" untuk slug
 * sembarang akan menjadikannya penebak keberadaan PT (kelas kebocoran yang
 * membuat `company-route.ts` menjawab 404 seragam). Kedua slug hanya dipakai
 * menyusun tujuan "coba lagi" — dan hanya bila bentuknya sah, supaya halaman
 * ini tidak bisa menjadi pengalihan terbuka.
 *
 * Grup `(auth)`, bukan `(dashboard)`: tata letak dashboard membaca konteks
 * perusahaan, dan buku inilah yang sedang tidak bisa dibaca.
 */
import { redirect } from "next/navigation";
import { SyncOutlined } from "@ant-design/icons";
import { ButtonLink } from "@sai/ui/button";

import { auth } from "@/lib/auth";
import { isValidSlug, tenantPath } from "@sai/core/tenant-routes";
import { getT } from "@sai/platform/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";

/** Kalimat penjelas — gaya yang sama dengan `setup-required`. */
const BODY_TEXT: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

const EXIT_ROW: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 20,
  borderTop: "1px solid var(--ant-color-border-secondary)",
};

export default async function BookUpdatingPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; company?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { tenant, company } = await searchParams;
  /* Tujuan disusun dari slug yang SAH saja; selainnya kembali ke `/dashboard`,
     yang memilih perusahaannya sendiri. */
  const retry =
    tenant && company && isValidSlug(tenant) && isValidSlug(company)
      ? tenantPath(tenant, company, "/dashboard")
      : "/dashboard";

  const t = await getT();

  return (
    <AuthShell
      heading={t("auth.bookUpdating.heading")}
      description={t("auth.bookUpdating.description")}
      icon={<SyncOutlined aria-hidden="true" style={{ fontSize: 20 }} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={BODY_TEXT}>{t("auth.bookUpdating.body")}</p>
        <p style={BODY_TEXT}>{t("auth.bookUpdating.whoCanFix")}</p>
      </div>

      {/* Tautan biasa, bukan polling — alasannya sama dengan `setup-required`:
          gerbangnya berjalan lagi saat tautan ditekan, dan hasilnya benar ke
          dua arah. Buku yang sudah termigrasi terbuka paling lambat 5 detik
          sesudahnya (`RETRY_MS`). */}
      <div style={EXIT_ROW}>
        <ButtonLink href={retry} variant="outline" style={{ width: "100%" }}>
          {t("auth.bookUpdating.retry")}
        </ButtonLink>
      </div>
    </AuthShell>
  );
}
