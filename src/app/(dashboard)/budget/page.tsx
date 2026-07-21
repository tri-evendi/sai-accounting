/**
 * Anggaran & Target — hub (issue #29). Three surfaces: input anggaran per akun,
 * input target penjualan, and the Realisasi vs Anggaran report. bos-only, like
 * the other planning/reporting surfaces.
 */
import { requirePageSession } from "@/lib/page-auth";
import { Card } from "@/components/ui/card";
import { ClipboardList, Target, GaugeCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SURFACES = [
  {
    href: "/budget/report",
    icon: GaugeCircle,
    title: "Realisasi vs Anggaran",
    desc: "Bandingkan realisasi buku besar dengan anggaran per akun, lengkap dengan selisih & peringatan di atas/di bawah.",
  },
  {
    href: "/budget/accounts",
    icon: ClipboardList,
    title: "Anggaran Akun",
    desc: "Tetapkan nilai anggaran per akun pendapatan/beban untuk tiap bulan.",
  },
  {
    href: "/budget/targets",
    icon: Target,
    title: "Target Penjualan",
    desc: "Tetapkan target penjualan per periode — opsional per pelanggan atau komoditas.",
  },
];

export default async function BudgetHubPage() {
  await requirePageSession(["bos"]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Anggaran &amp; Target</h1>
      <p className="mb-6 text-sm text-gray-500">
        Rencana keuangan dibandingkan dengan realisasi buku besar. Menyusun anggaran tidak
        memposting jurnal apa pun.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SURFACES.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="p-5">
                <s.icon className="h-6 w-6 text-blue-600" aria-hidden="true" />
                <h2 className="mt-3 font-semibold text-gray-900">{s.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{s.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
