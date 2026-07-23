import { requirePagePermission } from "@/lib/page-auth";
import { listPeriods } from "@/lib/period-close";
import { PeriodManager } from "./period-manager";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function PeriodsPage() {
  await requirePagePermission("period.manage");

  const periods = await listPeriods();

  return (
    <div>
      <PageHeader
        title="Tutup Periode"
        description={
          <span className="block max-w-3xl">
            Menutup sebuah bulan akan mengunci seluruh transaksi bertanggal di bulan itu — tidak
            bisa dibuat, diubah, atau dihapus — sehingga laporan yang sudah terbit tidak berubah
            lagi di belakang layar. Tinjau dulu ringkasannya sebelum mengunci.
          </span>
        }
      />

      <PeriodManager periods={periods} />
    </div>
  );
}
