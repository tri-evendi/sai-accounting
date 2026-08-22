/**
 * "Di halaman ini" — daftar isi SATU halaman (issue #453).
 *
 * ══ DIBANGKITKAN DARI BLOK YANG SAMA ═══════════════════════════════════════
 * Butirnya datang dari blok `sub` halaman itu, dan jangkarnya dari `docAnchor`
 * — fungsi yang SAMA yang dipakai perendernya untuk memasang `id`. Sebuah
 * daftar isi yang jangkarnya ditulis terpisah adalah daftar isi yang, pada
 * penyuntingan judul berikutnya, mendarat di puncak halaman tanpa berbunyi.
 *
 * ══ TANPA SOROTAN "BAGIAN YANG SEDANG DIBACA" ══════════════════════════════
 * Sorotan itu menuntut `IntersectionObserver`, yaitu modul klien PERTAMA di
 * permukaan yang hari ini nol JavaScript — hidrasi untuk sebuah penanda yang
 * tidak mengubah apa pun yang bisa dilakukan pembaca. Batas ini dinyatakan di
 * issue #453 sebagai keputusan, bukan sebagai pekerjaan yang terlupa.
 *
 * ══ TEMPATNYA BERGESER, MARKUPNYA TIDAK ════════════════════════════════════
 * Satu simpul DOM untuk ketiga bentuk (kolom kanan lengket ≥1200, di ATAS isi
 * 992–1199, di atas isi tanpa kolom kiri di bawah itu). Yang berpindah adalah
 * `grid-area`-nya di blok gaya `docs-shell.tsx` — bukan dua salinan yang
 * disembunyikan bergantian, yang berarti dua daftar bagi pembaca layar.
 */

import { docAnchor } from "@/lib/docs";
import type { TranslateFn } from "@/lib/i18n/client";

const KOTAK: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xs)",
  minWidth: 0,
};

const JUDUL: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--ant-color-text-tertiary)",
};

const DAFTAR: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xxs)",
};

const TAUTAN: React.CSSProperties = {
  color: "var(--ant-color-text-secondary)",
  textDecoration: "none",
  fontSize: "var(--ant-font-size-sm)",
  lineHeight: 1.5,
};

export function DocsToc({ judul, t }: { judul: readonly string[]; t: TranslateFn }) {
  if (judul.length === 0) return null;

  return (
    <nav aria-label={t("docs.onThisPage")} style={KOTAK}>
      <p style={JUDUL}>{t("docs.onThisPage")}</p>
      <ul style={DAFTAR}>
        {judul.map((j) => (
          <li key={j}>
            {/* `<a>` biasa, bukan `Link`: ini gulungan DALAM dokumen yang sama.
                Navigasi sisi-klien untuk sebuah jangkar adalah pekerjaan yang
                dilakukan peramban lebih baik, dan gratis. */}
            <a href={`#${docAnchor(j)}`} data-docs-toc-item="" style={TAUTAN}>
              {j}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
