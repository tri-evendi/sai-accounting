/**
 * Kerangka muat tingkat-rute untuk dashboard.
 *
 * Banyak halaman `force-dynamic` (mis. daftar, buku besar, laporan) menunggu
 * query server sebelum ada yang tampil — tanpa file ini layar kosong sampai
 * data siap. Kerangka ini menahan ruang (mengurangi CLS) dan memberi umpan
 * balik "sedang bekerja" sesuai MASTER.md (Motion halus, feedback bermakna).
 */
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/loading";

export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      {/* Kepala halaman */}
      <div className="mb-6 space-y-2">
        <div className="h-8 w-64 rounded bg-muted" />
        <div className="h-4 w-96 rounded bg-muted" />
      </div>
      {/* Isi utama */}
      <Card className="p-0">
        <TableSkeleton rows={6} cols={5} />
      </Card>
    </div>
  );
}
