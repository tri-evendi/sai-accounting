/**
 * Dua angka untuk badge di navbar (issue #25): berapa yang menunggu keputusan
 * peran ini, dan berapa hasil keputusan atas pengajuan saya yang belum dibuka.
 *
 * Sengaja terpisah dari `/api/approvals`: badge dipanggil di setiap halaman,
 * jadi ia hanya boleh menghitung — bukan menarik seluruh daftar.
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { getApprovalCounts } from "@/lib/approval-queue";

export async function GET() {
  const result = await requireApiPermission("approval.view");
  if (!result.authorized) return result.response;

  const counts = await getApprovalCounts(
    parseInt(result.session.user.id, 10),
    result.session.user.role
  );
  return NextResponse.json(counts);
}
