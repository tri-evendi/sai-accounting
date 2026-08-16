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
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { PageHeader } from "@/components/ui/page-header";
import { TERM_LIST } from "@/lib/labels";
import { GlossaryBrowser } from "./glossary-browser";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Panjang baris nyaman untuk kalimat pembuka (`max-w-3xl` lama = 48rem). */
const DESCRIPTION_MAX_WIDTH = 768;

export default async function GlossaryPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("glossary.read", params);
  const t = await getT();

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        title={t("nav.items.glossary")}
        description={
          <span style={{ display: "block", maxWidth: DESCRIPTION_MAX_WIDTH }}>
            {t("glossary.descriptionBefore", { count: TERM_LIST.length })}{" "}
            <span aria-hidden="true">“?”</span> {t("glossary.descriptionAfter")}
          </span>
        }
      />

      <GlossaryBrowser />
    </div>
  );
}
