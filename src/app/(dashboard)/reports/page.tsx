import { requirePageSession } from "@/lib/page-auth";
import { Card } from "@/components/ui/card";
import { Scale, TrendingUp, BookText, Waves } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/reports/trial-balance",
    icon: BookText,
    title: "Neraca Saldo",
    desc: "Saldo debit/kredit seluruh akun pada satu tanggal — harus seimbang.",
  },
  {
    href: "/reports/income-statement",
    icon: TrendingUp,
    title: "Laba / Rugi",
    desc: "Pendapatan dikurangi beban untuk suatu periode.",
  },
  {
    href: "/reports/balance-sheet",
    icon: Scale,
    title: "Neraca",
    desc: "Posisi Aset = Liabilitas + Ekuitas pada satu tanggal.",
  },
  {
    href: "/reports/cash-flow",
    icon: Waves,
    title: "Arus Kas",
    desc: "Kas masuk dan keluar per kategori: operasi, investasi, pendanaan.",
  },
];

export default async function ReportsPage() {
  await requirePageSession(["bos"]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Laporan Keuangan</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="p-5">
                <r.icon className="h-6 w-6 text-blue-600" />
                <h2 className="mt-3 font-semibold text-gray-900">{r.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{r.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
