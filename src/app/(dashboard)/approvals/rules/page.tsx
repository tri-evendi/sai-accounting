/**
 * Aturan Persetujuan — jenis dokumen + ambang nilai + peran penyetuju (#25).
 * bos-only, seperti permukaan kebijakan lain (Tutup Periode, Anggaran, Setup).
 */
import { requirePageSession } from "@/lib/page-auth";
import { listApprovalRules } from "@/lib/approval-queue";
import { ApprovalRules } from "./approval-rules-client";

export const dynamic = "force-dynamic";

export default async function ApprovalRulesPage() {
  await requirePageSession(["bos"]);
  const rules = await listApprovalRules({ includeInactive: true });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Aturan Persetujuan</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Tentukan mulai nilai berapa sebuah kontrak, faktur, atau pembayaran wajib disetujui,
          dan siapa yang menyetujuinya. Ambang dibandingkan dengan nilai <strong>rupiah</strong>{" "}
          dokumen (dokumen valas dikonversi lebih dulu dengan kursnya sendiri) dan bersifat{" "}
          <strong>inklusif</strong> — nilai yang persis sama dengan ambang tetap perlu
          persetujuan. Aturan baru hanya berlaku untuk dokumen yang dibuat setelahnya.
        </p>
      </div>

      <ApprovalRules rules={rules} />
    </div>
  );
}
