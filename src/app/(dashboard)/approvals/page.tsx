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
import { requirePageSession } from "@/lib/page-auth";
import {
  listDecidedApprovals,
  listMyApprovalRequests,
  listPendingApprovals,
} from "@/lib/approval-queue";
import { ApprovalQueue } from "./approval-queue-client";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await requirePageSession();
  const userId = parseInt(session.user.id, 10);
  const role = session.user.role;

  const [inbox, mine, decided] = await Promise.all([
    listPendingApprovals(role),
    listMyApprovalRequests(userId),
    listDecidedApprovals(role),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Perlu Persetujuan</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Transaksi yang nilainya mencapai ambang persetujuan disimpan lebih dulu, tetapi{" "}
          <strong>belum masuk jurnal</strong>. Setelah disetujui, jurnalnya langsung terbit;
          bila ditolak, dokumen tetap tersimpan tanpa jurnal dan bisa diperbaiki lalu
          diajukan ulang.
        </p>
      </div>

      <ApprovalQueue inbox={inbox} mine={mine} decided={decided} currentUserId={userId} />
    </div>
  );
}
