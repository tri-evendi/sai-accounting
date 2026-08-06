/**
 * Syarat & Ketentuan (issue #142) — halaman PUBLIK yang ditautkan form
 * pendaftaran; versinya (`lib/legal.ts`) ikut tercatat pada setiap persetujuan.
 *
 * ⚠ ISINYA DRAF dan berspanduk begitu: kerangka yang menyebut mekanisme yang
 * SUDAH ada di produk (trial, suspensi hanya-baca, retensi, ekspor) — tetapi
 * belum ditinjau penasihat hukum, dan tidak boleh dijanjikan ke pelanggan
 * sebelum itu (docs/COMPLIANCE.md). Dokumen hukum bernaskah tunggal Bahasa
 * Indonesia dengan sengaja — terjemahan informatif menyusul bila diperlukan,
 * naskah mengikatnya tetap satu.
 *
 * ── Kenapa halaman ini TIDAK memakai token AntD (issue #200) ──────────────
 * Ia server component `force-static` yang berdiri sendiri: tidak ada kulit,
 * tidak ada satu pun komponen AntD di atas isinya selain dua tombol di kaki.
 * Variabel `--ant-…` karena itu tidak teratasi di sini (#227), dan `antd` tidak
 * boleh diimpor server component (`tests/rsc-boundary.test.ts`). Yang dipakai
 * adalah token `:root` aplikasi dari `globals.css` — sumber yang sama dengan
 * tabel palet MASTER.md, benar di kedua tema.
 *
 * Ia juga bukan permukaan pemasaran meski publik: tanpa hero, tanpa CTA, satu
 * kolom teks selebar 42rem. Yang boleh bergaya pendaratan hanyalah `/`, dan
 * aturannya ditulis terpisah di `design-system/sai-accounting/pages/landing.md`.
 */
import Link from "next/link";
import { WarningOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { TERMS_VERSION, isDraftLegalVersion } from "@/lib/legal";

export const dynamic = "force-static";

const PAGE: React.CSSProperties = {
  minHeight: "100vh",
  padding: "40px 16px",
  background: "var(--background)",
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
  color: "var(--foreground)",
};

const H2: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "var(--foreground)",
};

const META: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "var(--muted-foreground)",
};

const CODE: React.CSSProperties = {
  borderRadius: 4,
  padding: "2px 6px",
  background: "var(--muted)",
};

const P: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.625,
  color: "var(--foreground)",
};

/** Spanduk draf — ikon + kata "DRAF", bukan warna sendirian. */
const DRAFT_BANNER: React.CSSProperties = {
  display: "flex",
  gap: 12,
  padding: 16,
  borderRadius: 8,
  border: "1px solid var(--warning)",
  background: "var(--warning-soft)",
  fontSize: 14,
  color: "var(--warning-strong)",
};

const FOOTER: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  paddingTop: 24,
  borderTop: "1px solid var(--border)",
};

export default function TermsPage() {
  return (
    <div style={PAGE}>
      <article style={ARTICLE}>
        <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={H1}>Syarat &amp; Ketentuan — {APP_NAME}</h1>
          <p style={META}>
            Versi dokumen: <code style={CODE}>{TERMS_VERSION}</code>
          </p>
        </header>

        {isDraftLegalVersion(TERMS_VERSION) && (
          <div role="status" style={DRAFT_BANNER}>
            <WarningOutlined aria-hidden="true" style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }} />
            <p style={{ margin: 0 }}>
              <strong>DRAF.</strong> Dokumen ini belum ditinjau penasihat hukum dan belum
              mengikat sebagai perjanjian. Ia diterbitkan lebih awal supaya setiap
              persetujuan tercatat pada versi yang pasti.
            </p>
          </div>
        )}

        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={H2}>1. Layanan</h2>
          <p style={P}>
            {APP_NAME} adalah layanan pembukuan berlangganan. Setiap perusahaan (PT) yang Anda
            buat mendapat buku yang terpisah penuh dari perusahaan lain.
          </p>

          <h2 style={H2}>2. Akun &amp; langganan</h2>
          <p style={P}>
            Akun dibuat lewat pendaftaran dengan verifikasi email. Masa uji coba berlaku
            sesuai paket; langganan yang menunggak dapat ditangguhkan — dalam keadaan
            ditangguhkan, data Anda menjadi <em>hanya-baca</em> dan tetap dapat dibaca serta
            diunduh, tidak pernah dikunci total.
          </p>

          <h2 style={H2}>3. Data &amp; retensi</h2>
          <p style={P}>
            Data pembukuan adalah milik Anda. Anda dapat mengunduh seluruhnya kapan saja dari
            Pengaturan Tenant. Berhenti berlangganan TIDAK menghapus buku pembukuan:
            peraturan perpajakan Indonesia (UU KUP) mewajibkan buku, catatan, dan dokumen
            dasar pembukuan disimpan 10 (sepuluh) tahun. Penghapusan hanya berjalan atas
            permintaan eksplisit, dengan masa tenggang, dan penghancuran buku baru dapat
            dilakukan setelah masa retensi tersebut.
          </p>

          <h2 style={H2}>4. Tanggung jawab</h2>
          <p style={P}>
            Kebenaran isi pembukuan adalah tanggung jawab pemiliknya; layanan ini mencatat
            dan menghitung, tidak menggantikan penilaian akuntan atau kewajiban pelaporan
            Anda kepada otoritas.
          </p>

          <h2 style={H2}>5. Perubahan dokumen</h2>
          <p style={P}>
            Setiap perubahan syarat &amp; ketentuan menaikkan versi dokumen ini. Persetujuan
            Anda tercatat pada versi yang tampil saat Anda menyetujuinya.
          </p>
        </section>

        <footer style={FOOTER}>
          <Button asChild variant="outline">
            <Link href="/privacy">Kebijakan Privasi</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Kembali ke pendaftaran</Link>
          </Button>
        </footer>
      </article>
    </div>
  );
}
