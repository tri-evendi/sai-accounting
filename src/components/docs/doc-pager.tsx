/**
 * Pengalih halaman di kaki sebuah halaman dokumen (issue #300, penataan).
 *
 * ══ Masalah yang diperbaikinya ═════════════════════════════════════════════
 * Sebelum ini satu-satunya jalan keluar dari sebuah halaman dokumen adalah
 * "Semua dokumentasi" di kakinya. Artinya pembaca yang selesai membaca satu
 * halaman harus kembali ke daftar isi, mencari kembali posisinya di sana, lalu
 * masuk lagi — tiga langkah untuk sesuatu yang urutannya SUDAH diketahui
 * aplikasi: `DOC_INDEX` disusun sebagai urutan baca, bukan abjad.
 *
 * ══ Kenapa DI SINI kartu justru bentuk yang benar ══════════════════════════
 * Daftar isi baru saja meninggalkan kartu karena sepuluh kotak seragam tidak
 * bisa dipindai (lihat kepala `app/(docs)/docs/page.tsx`). Di kaki halaman
 * jumlahnya paling banyak DUA, dan keduanya pilihan setara yang berdiri
 * bersebelahan — persis keadaan yang membuat kotak bertepi berguna: ia yang
 * memisahkan "mundur" dari "maju" tanpa satu kata tambahan.
 *
 * ══ Tidak melintasi cabang ═════════════════════════════════════════════════
 * `docNeighbours` berhenti di batas cabang, dan alasannya ada di sana. Yang
 * perlu diketahui di berkas ini: halaman pertama sebuah cabang memang TIDAK
 * punya "sebelumnya", dan sisi itu dibiarkan kosong — bukan diisi halaman
 * cabang sebelah, dan bukan pula membuat pengalihnya melebar menjadi satu
 * kotak yang menipu (yang tersisa harus tetap berdiri di sisinya sendiri
 * supaya "maju" selalu ada di kanan).
 */

import { LeftOutlined, RightOutlined } from "@ant-design/icons";

import { Link } from "@/components/ui/app-link";
import { docNeighbours, docsPath } from "@/lib/docs";
import { getT } from "@/lib/i18n/server";

/**
 * `display:grid` sebaris, `grid-template-columns` TIDAK — kolomnya berubah di
 * breakpoint, dan gaya sebaris mengalahkan blok `<style>` yang memuat
 * `@media`-nya. Aturannya di `docs-shell.tsx`.
 */
const KISI: React.CSSProperties = {
  display: "grid",
  gap: "var(--ant-margin-sm)",
};

const KOTAK: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin-sm)",
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  color: "inherit",
  textDecoration: "none",
};

const IKON: React.CSSProperties = {
  flex: "none",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
};

const ARAH: React.CSSProperties = {
  display: "block",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
};

const JUDUL: React.CSSProperties = {
  display: "block",
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  fontWeight: 600,
  lineHeight: 1.5,
  color: "var(--ant-color-text)",
};

export async function DocPager({ slug }: { slug: string }) {
  const { sebelum, sesudah } = docNeighbours(slug);
  if (!sebelum && !sesudah) return null;

  const t = await getT();

  return (
    <nav data-docs-pager-grid style={KISI} aria-label={t("docs.pagerLabel")}>
      {sebelum && (
        <Link data-docs-pager href={docsPath(sebelum.slug)} style={KOTAK}>
          <LeftOutlined aria-hidden="true" style={IKON} />
          <span>
            <span style={ARAH}>{t("docs.prev")}</span>
            <span data-docs-pager-title style={JUDUL}>
              {sebelum.judul}
            </span>
          </span>
        </Link>
      )}
      {sesudah && (
        <Link
          data-docs-pager
          /*
           * Penanda kolom, BUKAN `gridColumn` sebaris. Halaman pertama sebuah
           * cabang tidak punya "sebelumnya", dan tanpa penempatan eksplisit
           * "berikutnya" jatuh ke kolom KIRI — arah maju yang menunjuk mundur.
           * Penempatannya hidup di CSS karena di layar sempit kisinya satu
           * kolom, dan `gridColumn:2` sebaris akan memaksa kolom kedua yang
           * tidak ada di sana (dan tidak bisa dibatalkan `@media`, yang selalu
           * kalah melawan gaya sebaris).
           */
          data-docs-pager-next
          href={docsPath(sesudah.slug)}
          style={{ ...KOTAK, justifyContent: "flex-end", textAlign: "end" }}
        >
          <span>
            <span style={ARAH}>{t("docs.next")}</span>
            <span data-docs-pager-title style={JUDUL}>
              {sesudah.judul}
            </span>
          </span>
          <RightOutlined aria-hidden="true" style={IKON} />
        </Link>
      )}
    </nav>
  );
}
