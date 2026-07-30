/**
 * "Perlu Persetujuan" — satu tempat untuk meninjau & memutuskan (issue #25).
 *
 * Terbuka untuk semua peran, tetapi isinya berbeda menurut peran:
 *   • penyetuju (peran yang disebut aturan) melihat ANTREAN yang harus ia putuskan;
 *   • pemohon melihat PENGAJUAN SAYA — daftar itulah notifikasi in-app-nya,
 *     lengkap dengan hasil keputusan & catatan penolakan.
 * Keduanya diturunkan dari sesi, bukan dari parameter URL, jadi tak ada yang
 * bisa mengintip antrean orang lain.
 */
import { requirePagePermission } from "@/lib/page-auth";
import {
  listDecidedApprovals,
  listMyApprovalRequests,
  listPendingApprovals,
} from "@/lib/approval-queue";
import { ApprovalQueue } from "./approval-queue-client";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await requirePagePermission("approval.view");
  const userId = parseInt(session.user.id, 10);
  const role = session.user.role;
  const t = await getT();

  const [inbox, mine, decided] = await Promise.all([
    listPendingApprovals(role),
    listMyApprovalRequests(userId),
    listDecidedApprovals(role, 25, userId),
  ]);

  return (
    <div>
      <PageHeader
        title={t("nav.items.approvals")}
        description={
          <span className="block max-w-3xl">
            {t("approvals.descriptionBefore")}{" "}
            <strong>{t("approvals.descriptionStrong")}</strong>
            {t("approvals.descriptionAfter")}
          </span>
        }
      />

      <ApprovalQueue inbox={inbox} mine={mine} decided={decided} currentUserId={userId} />
    </div>
  );
}
