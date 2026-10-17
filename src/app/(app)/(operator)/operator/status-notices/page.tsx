/**
 * `/operator/status-notices` — PENGUMUMAN STATUS (migration platform 0004).
 *
 * Menggantikan SSH untuk jendela pemeliharaan (`MAINTENANCE_FROM/UNTIL`, yang
 * tetap berlaku) dan menambahkan yang sebelumnya tidak ada sama sekali:
 * mengumumkan INSIDEN. Kalimatnya dari kamus, tidak pernah diketik.
 */
import { ConsoleNotice, ConsolePanel, CONSOLE_PAGE } from "@/components/operator/console-ui";
import { StatusNoticesPanel } from "@/components/operator/status-notices-panel";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { requireOperatorPage } from "@/lib/operator/guard";
import { operatorCan } from "@/lib/operator/roles";
import { platformDb } from "@/lib/platform-db";
import { readStatusNoticeRecords } from "@/lib/status-notices-store";
import { visibleOnStatusPage, type PublicStatusNotice } from "@/lib/status-notices";

import { operatorCreateStatusNotice, operatorSetStatusNoticePhase } from "./actions";

export const dynamic = "force-dynamic";

export default async function OperatorStatusNoticesPage() {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const now = new Date();

  let notices: PublicStatusNotice[] | null;
  try {
    /* Konsol melihat SEMUA yang terbaca 7 hari terakhir — bukan hanya jendela
       24 jam `/status`: operator perlu tahu apa yang baru saja ditutup. */
    const rows = await readStatusNoticeRecords({ platform: platformDb }, now);
    notices = visibleOnStatusPage(
      rows.map((r) => ({ ...r, resolvedAt: r.resolvedAt })),
      new Date(0)
    );
  } catch (error) {
    console.error("[operator-status] pengumuman tak terbaca:", error);
    notices = null;
  }

  return (
    <div>
      <PageHeader title={t("operator.statusNotices.heading")} description={t("operator.statusNotices.description")} />
      <div style={CONSOLE_PAGE}>
        {notices === null ? (
          <ConsoleNotice>{t("operator.statusNotices.unavailable")}</ConsoleNotice>
        ) : (
          <ConsolePanel footnote={t("operator.statusNotices.note")}>
            <StatusNoticesPanel
              notices={notices}
              canEdit={operatorCan(operator.role, "platform.status")}
              create={operatorCreateStatusNotice}
              setPhase={operatorSetStatusNoticePhase}
            />
          </ConsolePanel>
        )}
      </div>
    </div>
  );
}
