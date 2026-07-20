import { requirePageSession } from "@/lib/page-auth";
import { listPeriods } from "@/lib/period-close";
import { PeriodManager } from "./period-manager";

export const dynamic = "force-dynamic";

export default async function PeriodsPage() {
  await requirePageSession(["bos"]);

  const periods = await listPeriods();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tutup Periode</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Menutup sebuah bulan akan mengunci seluruh transaksi bertanggal di bulan itu — tidak
          bisa dibuat, diubah, atau dihapus — sehingga laporan yang sudah terbit tidak berubah
          lagi di belakang layar. Tinjau dulu ringkasannya sebelum mengunci.
        </p>
      </div>

      <PeriodManager periods={periods} />
    </div>
  );
}
