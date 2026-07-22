"use client";

/**
 * Jalankan penyusutan bulanan (issue #28).
 *
 * Pick a month, post depreciation for every active asset that has not yet been
 * depreciated that period. Idempotent server-side, so re-running a posted month
 * is safe; a closed period is refused with the server's not-saved notice.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { CalendarClock, Loader2 } from "lucide-react";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function RunDepreciation() {
  const router = useRouter();
  const { toast } = useToast();
  const now = new Date();

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  async function run() {
    setError(null);
    setRunning(true);
    try {
      const res = await fetch("/api/fixed-assets/depreciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), month: Number(month) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Gagal menjalankan penyusutan.");
        return;
      }
      toast(
        data.postedCount > 0
          ? `Penyusutan diposting untuk ${data.postedCount} aset (${formatCurrency(data.totalAmount, "IDR")}).`
          : "Tidak ada aset yang perlu disusutkan untuk periode ini.",
        "success"
      );
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
          Jalankan penyusutan bulanan
        </div>
        <div className="w-36">
          <Select
            id="dep-month"
            label="Bulan"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
        </div>
        <div className="w-28">
          <Select
            id="dep-year"
            label="Tahun"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        <Button onClick={run} disabled={running} className="cursor-pointer">
          {running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          Jalankan
        </Button>
      </div>
      {error && (
        <p className="mt-3 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
