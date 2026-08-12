/**
 * `/docs/<slug>` — satu halaman dokumentasi, PUBLIK (issue #300).
 *
 * Isinya datang dari `lib/docs.ts` (berkas sumber di repo, bukan baris DB):
 * dokumentasi ikut ditinjau di PR yang mengubah perilakunya, dan tidak ada
 * jalan untuk mengubah penjelasan sebuah aturan tanpa diff yang bisa dibaca.
 *
 * `[...slug]` (catch-all) alih-alih `[slug]`: alamat berlapis (`/docs/stok/
 * opname`) akan lahir cepat atau lambat, dan mengganti bentuk segmen kelak
 * berarti mengganti alamat setiap halaman yang sudah ditautkan. Hari ini
 * lapisannya tepat satu, dan yang lebih dalam mendapat 404 — bukan halaman
 * pertama yang kebetulan cocok.
 *
 * Kenapa tidak ada penjaga di sini: lihat kepala `src/app/(docs)/docs/page.tsx`.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeftOutlined } from "@ant-design/icons";

import { DocBody } from "@/components/docs/doc-body";
import { DocPager } from "@/components/docs/doc-pager";
import { DocsShell } from "@/components/docs/docs-shell";
import { PermissionMatrix } from "@/components/docs/permission-matrix";
import { DOCS_ROOT, DOC_INDEX, docBranchAnchor, docBySlug, type DocBranch } from "@/lib/docs";
import { DOC_BLOCKS } from "@/lib/docs-content";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { Link } from "@/components/ui/app-link";

export const dynamic = "force-dynamic";

/** Jalur yang sah — dipakai `generateMetadata` maupun halamannya. */
function resolve(slug: string[] | undefined) {
  if (!slug || slug.length !== 1) return undefined;
  return docBySlug(slug[0]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const page = resolve((await params).slug);
  if (!page) return {};
  return { title: page.judul, description: page.ringkas };
}

/**
 * Daftar slug yang ada — supaya Next tahu rute ini berhingga. Halamannya tetap
 * dinamis (`dynamic`), karena kerangkanya mengikuti cookie bahasa.
 */
export function generateStaticParams() {
  return DOC_INDEX.map((page) => ({ slug: [page.slug] }));
}

/**
 * Nama cabang di kamus. Sengaja peta eksplisit dan bukan kunci yang dirakit
 * (`` `docs.branch${…}` ``): kunci rakitan tidak bisa diperiksa `tsc`, dan
 * penjaga kunci yatim (`tests/i18n-orphan-keys.test.ts`) juga tidak bisa
 * melihatnya — cabang yang namanya dihapus dari kamus akan lolos sampai ia
 * muncul sebagai kunci mentah di layar.
 */
const NAMA_CABANG: Record<DocBranch, DictionaryKey> = {
  pelanggan: "docs.branchCustomer",
  pengguna: "docs.branchUser",
};

const KONTEKS_TAUTAN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  color: "var(--ant-color-text-tertiary)",
};

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const page = resolve((await params).slug);
  if (!page) notFound();

  const t = await getT();

  return (
    <DocsShell
      judul={page.judul}
      ringkas={page.ringkas}
      /*
       * Kembali ke BAGIAN-nya di daftar isi, bukan ke puncak daftar isi:
       * pembaca yang datang dari mesin pencari mendarat di tengah tanpa tahu
       * ada cabang lain, dan tautan yang memulangkannya ke puncak daftar
       * membuatnya mencari sendiri di mana halaman ini tadi berdiri.
       */
      konteks={
        <Link href={`${DOCS_ROOT}#${docBranchAnchor(page.cabang)}`} style={KONTEKS_TAUTAN}>
          <LeftOutlined aria-hidden="true" style={{ fontSize: "var(--ant-font-size-sm)" }} />
          {t(NAMA_CABANG[page.cabang])}
        </Link>
      }
    >
      <DocBody blok={DOC_BLOCKS[page.slug]} matriks={<PermissionMatrix />} />
      <DocPager slug={page.slug} />
    </DocsShell>
  );
}

