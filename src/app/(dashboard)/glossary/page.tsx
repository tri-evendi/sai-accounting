/**
 * Kamus Istilah (issue #21).
 *
 * Isinya dibaca dari `src/lib/labels.ts` — kamus yang sama yang menyalakan
 * `<TermTooltip>` di seluruh aplikasi (issue #1) dan tautan "Pelajari ini".
 * Tidak ada definisi yang ditulis ulang di halaman ini.
 *
 * Terbuka untuk semua peran: memahami istilah bukan hak istimewa.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { PageHeader } from "@/components/ui/page-header";
import { TERM_LIST } from "@/lib/labels";
import { GlossaryBrowser } from "./glossary-browser";

export const dynamic = "force-dynamic";

export default async function GlossaryPage() {
  await requirePagePermission("glossary.read");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Kamus Istilah"
        description={
          <span className="block max-w-3xl">
            {TERM_LIST.length} istilah akuntansi yang dipakai aplikasi ini, dijelaskan dengan bahasa
            sehari-hari beserta contohnya. Istilah yang sama juga muncul sebagai ikon{" "}
            <span aria-hidden="true">“?”</span> di sebelah label pada layar lain.
          </span>
        }
      />

      <GlossaryBrowser />
    </div>
  );
}
