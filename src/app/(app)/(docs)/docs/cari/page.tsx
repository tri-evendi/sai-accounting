/**
 * `/docs/cari?q=…` — hasil pencarian dokumentasi, PUBLIK (issue #453).
 *
 * ══ SEGMEN STATIS DI SEBELAH CATCH-ALL ═════════════════════════════════════
 * Tetangganya `[...slug]`, dan Next memenangkan segmen STATIS atas catch-all —
 * jadi `/docs/cari` mendarat di sini, bukan menjadi permintaan halaman dokumen
 * bernama "cari" yang berakhir 404. Konsekuensinya satu, dan ia mengikat: tidak
 * boleh pernah ada halaman dokumen ber-slug `cari`. Dijaga `tests/docs.test.ts`.
 *
 * ══ TANPA PENJAGA, SAMA SEPERTI TETANGGANYA ════════════════════════════════
 * `isDocsPath` sudah melepaskan seluruh subpohon `/docs` di `proxy.ts`, dan
 * grup `(docs)` di `tests/authz-coverage` menuntut halaman di sini tidak
 * menyentuh sesi maupun basis data. Halaman ini tidak menyentuh keduanya: yang
 * dibacanya berkas sumber.
 *
 * ══ `robots: noindex`, DAN ITU DISENGAJA ═══════════════════════════════════
 * Halaman hasil pencarian adalah halaman yang isinya ditentukan pengunjung.
 * Membiarkannya terindeks berarti mengundang mesin pencari mengindeks ribuan
 * varian `?q=` dari satu halaman yang sama — dan yang paling merugikan, ia
 * membuat orang mendarat di HASIL PENCARIAN kita alih-alih di halaman yang
 * menjawab pertanyaannya. Halaman dokumennya sendiri tetap terindeks penuh.
 */

import type { Metadata } from "next";
import { SearchOutlined } from "@ant-design/icons";

import { DocsShell } from "@/components/docs/docs-shell";
import { Link } from "@/components/ui/app-link";
import { cariDokumentasi, type HasilCari } from "@/lib/docs-search";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("docs.searchTitle"), robots: { index: false, follow: true } };
}

/** Kueri dibaca sebagai SATU nilai; `?q=a&q=b` diambil yang pertama. */
function kueriDari(nilai: string | string[] | undefined): string {
  const mentah = Array.isArray(nilai) ? nilai[0] : nilai;
  return (mentah ?? "").trim().slice(0, 120);
}

const DAFTAR: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-sm)",
};

const KARTU: React.CSSProperties = {
  display: "block",
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  textDecoration: "none",
  color: "inherit",
};

const JUDUL_HASIL: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

const BAGIAN: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
};

const CUPLIKAN: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.7,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Sorotan kata yang cocok.
 *
 * `<mark>` bertoken, bukan kuning bawaan peramban: kuning mentah tidak lolos
 * penjaga warna dan tidak punya pasangan di tema gelap. Warna TIDAK sendirian
 * — `<mark>` sudah membawa arti "disorot" ke pembaca layar, dan bobot hurufnya
 * ikut naik untuk yang tidak membedakan warna.
 */
const SOROT: React.CSSProperties = {
  background: "var(--ant-color-warning-bg)",
  color: "var(--ant-color-text)",
  fontWeight: 600,
  padding: "0 2px",
  borderRadius: "var(--ant-border-radius-sm)",
};

const KOSONG: React.CSSProperties = {
  margin: 0,
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.7,
  color: "var(--ant-color-text-secondary)",
};

function Hasil({ hasil, labelBagian }: { hasil: HasilCari; labelBagian?: string }) {
  return (
    <li>
      <Link href={hasil.href} data-docs-hit="" style={KARTU}>
        <p data-docs-hit-title="" style={JUDUL_HASIL}>
          {hasil.judul}
        </p>
        {labelBagian && <p style={BAGIAN}>{labelBagian}</p>}
        <p style={CUPLIKAN}>
          {hasil.cuplikan.map((potongan, i) =>
            potongan.cocok ? (
              <mark key={i} style={SOROT}>
                {potongan.teks}
              </mark>
            ) : (
              <span key={i}>{potongan.teks}</span>
            )
          )}
        </p>
      </Link>
    </li>
  );
}

export default async function DocsSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getT();
  const kueri = kueriDari((await searchParams).q);
  const hasil = kueri.length > 0 ? cariDokumentasi(kueri) : [];

  return (
    <DocsShell
      judul={kueri.length > 0 ? t("docs.searchFor", { query: kueri }) : t("docs.searchTitle")}
      ringkas={kueri.length > 0 ? t("docs.searchCount", { count: hasil.length }) : undefined}
      kueri={kueri}
      konteks={
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--ant-margin-xxs)" }}>
          <SearchOutlined aria-hidden="true" style={{ fontSize: "var(--ant-font-size-sm)" }} />
          {t("docs.searchTitle")}
        </span>
      }
    >
      {kueri.length === 0 ? (
        <p style={KOSONG}>{t("docs.searchPrompt")}</p>
      ) : hasil.length === 0 ? (
        <p style={KOSONG}>{t("docs.searchEmpty")}</p>
      ) : (
        <ul style={DAFTAR}>
          {hasil.map((h) => (
            <Hasil
              key={h.href}
              hasil={h}
              labelBagian={h.bagian ? t("docs.searchIn", { section: h.bagian }) : undefined}
            />
          ))}
        </ul>
      )}
    </DocsShell>
  );
}
