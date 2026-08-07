/**
 * Kebijakan Privasi (issue #142, UU PDP No. 27/2022) — halaman PUBLIK
 * pasangan /terms; versinya ikut tercatat pada setiap persetujuan.
 *
 * ⚠ ISINYA DRAF (lihat catatan /terms) — mekanismenya nyata dan sudah ada di
 * produk (ekspor mandiri, permintaan penghapusan, anonimisasi, jejak audit);
 * naskah hukumnya menunggu tinjauan penasihat. Pertanyaan TEMPAT PENYIMPANAN
 * (data residency) masih TERBUKA dan dokumen ini sengaja tidak menjawabnya —
 * docs/COMPLIANCE.md.
 *
 * Gaya & alasan tokennya sama persis dengan `/terms` — lihat catatan kepala di
 * sana (issue #200, diperbarui #203): server component tanpa kulit, warnanya
 * variabel token AntD `var(--ant-…)`, yang teratasi juga di luar pohon AntD
 * karena `<html>` memikul kelas `ANTD_CSS_VAR_KEY` sejak #227.
 */
import { WarningOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { PRIVACY_VERSION, isDraftLegalVersion } from "@/lib/legal";

export const dynamic = "force-static";

const PAGE: React.CSSProperties = {
  minHeight: "100vh",
  padding: "40px 16px",
  background: "var(--ant-color-bg-layout)",
};

const ARTICLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 24,
  maxWidth: 672,
  margin: "0 auto",
};

const H1: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  color: "var(--ant-color-text)",
};

const H2: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

const META: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "var(--ant-color-text-secondary)",
};

const CODE: React.CSSProperties = {
  borderRadius: 4,
  padding: "2px 6px",
  background: "var(--ant-color-fill-quaternary)",
};

const P: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.625,
  color: "var(--ant-color-text)",
};

const DRAFT_BANNER: React.CSSProperties = {
  display: "flex",
  gap: 12,
  padding: 16,
  borderRadius: 8,
  border: "1px solid var(--ant-color-warning-border)",
  background: "var(--ant-color-warning-bg)",
  fontSize: 14,
  color: "var(--ant-color-money-pending)",
};

const FOOTER: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  paddingTop: 24,
  borderTop: "1px solid var(--ant-color-border-secondary)",
};

export default function PrivacyPage() {
  return (
    <div style={PAGE}>
      <article style={ARTICLE}>
        <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={H1}>Kebijakan Privasi — {APP_NAME}</h1>
          <p style={META}>
            Versi dokumen: <code style={CODE}>{PRIVACY_VERSION}</code>
          </p>
        </header>

        {isDraftLegalVersion(PRIVACY_VERSION) && (
          <div role="status" style={DRAFT_BANNER}>
            <WarningOutlined aria-hidden="true" style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }} />
            <p style={{ margin: 0 }}>
              <strong>DRAF.</strong> Belum ditinjau penasihat hukum. Mekanisme yang disebut di
              bawah sudah berjalan di produk; naskah ini yang belum final.
            </p>
          </div>
        )}

        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={H2}>1. Data yang diproses</h2>
          <p style={P}>
            Data akun (nama, email, kata sandi ter-hash), data keanggotaan, dan data
            pembukuan yang Anda catat sendiri. Jejak audit menyimpan siapa melakukan apa —
            itu bagian dari fungsi produk pembukuan.
          </p>

          <h2 style={H2}>2. Dasar pemrosesan</h2>
          <p style={P}>
            Pelaksanaan perjanjian layanan (langganan Anda) dan kepatuhan pada kewajiban
            hukum (retensi pembukuan menurut UU KUP).
          </p>

          <h2 style={H2}>3. Hak Anda (UU PDP)</h2>
          <p style={P}>
            <strong>Akses &amp; portabilitas:</strong> unduh seluruh data dari Pengaturan
            Tenant, dalam format terbuka (CSV), kapan saja — termasuk saat langganan
            ditangguhkan. <strong>Penghapusan:</strong> ajukan dari Pengaturan Tenant; masa
            tenggang 30 hari, lalu akses ditutup dan data pribadi dianonimkan. Buku
            pembukuan disimpan 10 tahun sesuai UU KUP sebelum dapat dihancurkan — kewajiban
            hukum yang didahulukan atas permintaan penghapusan, sebagaimana diatur UU PDP.
          </p>

          <h2 style={H2}>4. Tempat penyimpanan</h2>
          <p style={P}>
            Lokasi pusat data akan dinyatakan di sini sebelum layanan menerima pelanggan
            umum. (Keputusan tempat penyimpanan — termasuk ketentuan penyimpanan di
            Indonesia — sedang dikonfirmasi dan belum dijawab dokumen ini.)
          </p>

          <h2 style={H2}>5. Pemberitahuan kebocoran</h2>
          <p style={P}>
            Bila terjadi kebocoran data pribadi, pemilik akun terdampak diberi tahu sesuai
            tenggat UU PDP melalui email terdaftar.
          </p>
        </section>

        <footer style={FOOTER}>
          {/* `href` LANGSUNG — lihat catatan kembarnya di `terms/page.tsx`:
              tombol yang membungkus tautannya harus membaca prop anaknya, dan
              dari server component anak itu bisa tiba sebagai simpul `lazy`
              tanpa prop. */}
          <Button href="/terms" variant="outline">
            Syarat &amp; Ketentuan
          </Button>
          <Button href="/register" variant="outline">
            Kembali ke pendaftaran
          </Button>
        </footer>
      </article>
    </div>
  );
}
