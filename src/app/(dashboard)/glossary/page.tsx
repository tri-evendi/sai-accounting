/**
 * Kamus Istilah (issue #21).
 *
 * Isinya dibaca dari `src/lib/labels.ts` — kamus yang sama yang menyalakan
 * `<TermTooltip>` di seluruh aplikasi (issue #1) dan tautan "Pelajari ini".
 * Tidak ada definisi yang ditulis ulang di halaman ini.
 *
 * Terbuka untuk semua peran: memahami istilah bukan hak istimewa.
 */
import { requirePageSession } from "@/lib/page-auth";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { TERM_LIST } from "@/lib/labels";
import { GlossaryBrowser } from "./glossary-browser";

export const dynamic = "force-dynamic";

export default async function GlossaryPage() {
  await requirePageSession(["bos", "core", "ptg"]);

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: "Kamus Istilah" }]} />

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Kamus Istilah</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {TERM_LIST.length} istilah akuntansi yang dipakai aplikasi ini, dijelaskan dengan bahasa
          sehari-hari beserta contohnya. Istilah yang sama juga muncul sebagai ikon{" "}
          <span aria-hidden="true">“?”</span> di sebelah label pada layar lain.
        </p>
      </header>

      <GlossaryBrowser />
    </div>
  );
}
