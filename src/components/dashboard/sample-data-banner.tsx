/**
 * Spanduk "buku ini masih memuat data contoh" — beranda perusahaan.
 *
 * ══ KENAPA SPANDUK, PADAHAL SUDAH ADA AWALAN `[CONTOH]` ════════════════════
 *
 * Karena awalan itu menandai BARIS, sedangkan yang dibaca orang adalah ANGKA.
 * Faktur contoh memang bertuliskan "[CONTOH] Penjualan barang dagang" di daftar
 * faktur — tetapi begitu angkanya masuk ke Laba/Rugi, Neraca, dan Arus Kas, ia
 * kehilangan namanya. Yang tersisa di layar hanyalah "Pendapatan Rp 82.650.000",
 * tanpa satu pun tanda bahwa nilainya karangan.
 *
 * Dan angka yang salah dipercaya tidak menimbulkan galat apa pun. Ia tidak
 * berhenti, tidak berwarna merah, tidak meminta perhatian: ia dibawa ke rapat,
 * ke bank, atau ke kantor pajak. Di aplikasi akuntansi itu kegagalan yang
 * paling mahal justru karena paling tenang.
 *
 * ── KENAPA DI BERANDA, BUKAN DI TATA LETAK ────────────────────────────────
 * Berbeda dari `DemoCompanyBanner`, yang memang dipasang di TATA LETAK karena
 * seluruh buku itu palsu. Di sini bukunya MILIK penggunanya dan sungguhan —
 * yang bercampur hanya sebagian isinya, dan keadaan itu bersifat sementara
 * (sekali dibuang, hilang selamanya). Menempelkannya di setiap layar akan
 * menjadi kebisingan yang dipelajari untuk diabaikan; beranda adalah layar
 * yang memajang ringkasan angkanya, jadi di situlah peringatannya berarti.
 *
 * ── KENAPA MURAH ──────────────────────────────────────────────────────────
 * `hasSampleData()`, bukan `sampleDataSummary()`: yang kedua menjalankan enam
 * hitungan dan empat di antaranya `LIKE` pada kolom tak berindeks. Alasan
 * lengkapnya ada di kepala fungsinya. Buku yang bersih membayar satu pencarian
 * indeks, sekali per pemuatan beranda.
 *
 * Server component: tanpa `antd`, warnanya `var(--ant-…)` (sah di server sejak
 * #227), dan tak sebaris pun ikut ke bundel client.
 */

import { ExperimentOutlined } from "@ant-design/icons";

import { ButtonLink } from "@/components/ui/button";
import { hasSampleData } from "@/lib/demo-seed";
import { getT } from "@/lib/i18n/server";
import { tenantPath } from "@/lib/tenant-routes";

const BANNER: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--ant-margin-xs)",
  paddingInline: "var(--ant-padding)",
  paddingBlock: "var(--ant-padding-sm)",
  borderRadius: "var(--ant-border-radius-lg)",
  /* Nada "perhatian", bukan galat: bukunya tidak rusak, hanya belum bersih.
     Merah akan membuat pengguna baru mengira produknya bermasalah — nada yang
     sama dengan `DemoCompanyBanner`, dengan alasan yang sama. */
  border: "var(--ant-line-width) solid var(--ant-color-warning-border)",
  background: "var(--ant-color-warning-bg)",
};

const TEXT: React.CSSProperties = {
  margin: 0,
  minWidth: 0,
  flex: 1,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.55,
  /* `colorText`, bukan `colorWarningText`: teks panjang di atas latar berwarna
     — pasangan yang sama yang gagal di kartu ringkasan (#355). */
  color: "var(--ant-color-text)",
};

export async function SampleDataBanner({
  tenantSlug,
  companySlug,
}: {
  tenantSlug: string;
  companySlug: string;
}) {
  if (!(await hasSampleData())) return null;

  const t = await getT();

  return (
    /*
     * `role="status"`, bukan `alert`: ia keadaan yang berlaku terus-menerus,
     * bukan peristiwa mendesak. `alert` akan menyela pembaca layar setiap kali
     * beranda dibuka.
     */
    <section role="status" style={BANNER}>
      <ExperimentOutlined
        aria-hidden="true"
        style={{ fontSize: 20, flexShrink: 0, color: "var(--ant-color-warning)" }}
      />
      <p style={TEXT}>
        <strong>{t("dashboard.sampleBannerTitle")}</strong>{" "}
        {t("dashboard.sampleBannerBody")}
      </p>
      {/* Tautan, bukan tombol hapus: pembuangannya adalah tindakan berakses
          penuh yang berdialog konfirmasi, dan tempatnya sudah ada di
          Pengaturan. Menaruh tombol keduanya di beranda berarti dua pintu ke
          satu tindakan merusak — dan yang satu ini akan terlihat oleh peran
          yang bahkan tidak boleh menekannya. */}
      <ButtonLink
        href={tenantPath(tenantSlug, companySlug, "/settings")}
        variant="secondary"
        size="sm"
      >
        {t("dashboard.sampleBannerAction")}
      </ButtonLink>
    </section>
  );
}
