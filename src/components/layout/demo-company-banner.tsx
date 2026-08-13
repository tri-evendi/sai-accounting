/**
 * Spanduk "perusahaan CONTOH" (issue #355).
 *
 * ── Kenapa spanduk, padahal penjaganya sudah menolak setiap tulisan ────────
 * Penjaga menjaga BUKUNYA; spanduk menjaga PENGGUNANYA. Keduanya perlu, dan
 * mereka menjawab kegagalan yang berbeda:
 *
 *  • Tanpa penjaga, buku contoh bisa ditulisi — dan data buatan bercampur data
 *    sungguhan adalah kerusakan yang tak bisa dipisahkan lagi setelah terjadi.
 *  • Tanpa spanduk, seseorang bisa membaca laporan buku contoh dan MEMPERCAYAINYA.
 *    Di aplikasi akuntansi itu lebih berbahaya daripada tulisan yang ditolak:
 *    angka yang salah dipercaya tidak menimbulkan galat apa pun, dan bisa
 *    dibawa ke rapat, ke bank, atau ke kantor pajak.
 *
 * Karena itu ia dirender di TATA LETAK perusahaan, bukan di halaman: ia harus
 * muncul di setiap layar buku itu tanpa satu halaman pun perlu mengingatnya.
 *
 * ── Tanpa menyentuh sesi ──────────────────────────────────────────────────
 * Nilainya dibaca dari registry perusahaan (cache 60 detik) di server, BUKAN
 * dari JWT. Menaruhnya di sesi berarti menaruh keadaan yang bisa basi: sebuah
 * perusahaan yang berhenti menjadi demo akan tetap berspanduk sampai token
 * pengguna diperbarui — dan arah sebaliknya lebih buruk lagi.
 *
 * Server component: tanpa `antd`, warnanya `var(--ant-…)` (sah di server sejak
 * #227), dan tak sebaris pun ikut ke bundel client.
 */

import { ExperimentOutlined } from "@ant-design/icons";

import { getCompany } from "@/lib/company-registry";
import { getT } from "@/lib/i18n/server";

const BANNER: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--ant-margin-xs)",
  marginBottom: "var(--ant-margin)",
  paddingInline: "var(--ant-padding)",
  paddingBlock: "var(--ant-padding-sm)",
  borderRadius: "var(--ant-border-radius-lg)",
  /* Nada "menunggu/perhatian", bukan galat: buku contoh bukan kerusakan, dan
     mewarnainya merah akan membuat pengguna baru mengira produknya rusak di
     menit pertama. */
  border: "var(--ant-line-width) solid var(--ant-color-warning-border)",
  background: "var(--ant-color-warning-bg)",
};

const TEXT: React.CSSProperties = {
  margin: 0,
  minWidth: 0,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.55,
  /* `colorText`, bukan `colorWarningText`: teks panjang di atas latar berwarna
     — pasangan yang sama yang gagal di kartu ringkasan (#355, lihat
     `plain-summary.tsx`). */
  color: "var(--ant-color-text)",
};

export async function DemoCompanyBanner({ companyId }: { companyId: number }) {
  const company = await getCompany(companyId);
  if (!company?.isDemo) return null;

  const t = await getT();

  return (
    /*
     * `role="status"`, bukan `alert`: ia keadaan yang berlaku terus-menerus,
     * bukan peristiwa mendesak. `alert` akan menyela pembaca layar di setiap
     * perpindahan halaman di dalam buku ini.
     */
    <section role="status" style={BANNER}>
      <ExperimentOutlined
        aria-hidden="true"
        style={{ fontSize: 20, flexShrink: 0, color: "var(--ant-color-warning)" }}
      />
      <p style={TEXT}>
        <strong>{t("demoCompany.title")}</strong> {t("demoCompany.body")}
      </p>
    </section>
  );
}
