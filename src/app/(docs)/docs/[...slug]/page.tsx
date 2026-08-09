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

import { DocBody } from "@/components/docs/doc-body";
import { DocsShell } from "@/components/docs/docs-shell";
import { PermissionMatrix } from "@/components/docs/permission-matrix";
import { DOC_INDEX, docBySlug } from "@/lib/docs";
import { DOC_BLOCKS } from "@/lib/docs-content";

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

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const page = resolve((await params).slug);
  if (!page) notFound();

  return (
    <DocsShell judul={page.judul} ringkas={page.ringkas}>
      <DocBody blok={DOC_BLOCKS[page.slug]} matriks={<PermissionMatrix />} />
    </DocsShell>
  );
}
