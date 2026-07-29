"use client";

/**
 * Pemilih periode Minggu / Bulan / Tahun / Rentang (issue #126).
 *
 * DIPAKAI BERSAMA oleh Riwayat Stok dan Riwayat Hitung Ulang Stok (issue #129):
 * dua halaman yang menanyakan rentang waktu dengan cara yang sama harus
 * MENAWARKANNYA dengan cara yang sama — pemilih kembar yang berperilaku beda
 * tipis justru lebih membingungkan daripada dua rancangan yang jelas berbeda.
 *
 * Satu ANCHOR, empat tampilan. Mengganti granularitas mengirim ulang tanggal
 * jangkar yang sama, jadi berpindah dari "Juli 2026" ke Minggu mendarat di
 * minggu yang memuat jangkar itu — bukan melempar pengguna kembali ke hari ini,
 * yang akan membuat penelusuran mundur harus diulang dari awal setiap kali.
 *
 * Panah ◀ ▶ hanya muncul untuk periode yang bisa dilangkahi. Rentang khusus
 * tidak punya "berikutnya" yang bermakna — panah yang tak jelas artinya lebih
 * buruk daripada tidak ada panah.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { StockPeriodGranularity } from "@/lib/stock-period";

export function StockPeriodFilter({
  basePath,
  granularity,
  anchorISO,
  fromISO,
  toISO,
  prevAnchorISO,
  nextAnchorISO,
  label,
}: {
  basePath: string;
  granularity: StockPeriodGranularity;
  anchorISO: string;
  fromISO: string;
  toISO: string;
  prevAnchorISO: string | null;
  nextAnchorISO: string | null;
  label: string;
}) {
  const router = useRouter();
  const t = useT();
  const [f, setF] = useState(fromISO);
  const [to, setTo] = useState(toISO);

  // Sinkron ulang saat URL berubah (panah ◀ ▶, tombol granularitas): useState
  // hanya membaca props sekali, jadi tanpa ini kolom rentang menampilkan
  // rentang lama — yang lalu diam-diam dikirim ulang saat "Tampilkan" ditekan.
  // Pola resmi React "adjusting state when props change": set saat render,
  // bukan lewat effect.
  const [prevRange, setPrevRange] = useState({ fromISO, toISO });
  if (prevRange.fromISO !== fromISO || prevRange.toISO !== toISO) {
    setPrevRange({ fromISO, toISO });
    setF(fromISO);
    setTo(toISO);
  }

  const go = (g: StockPeriodGranularity, anchor: string) => {
    const p = new URLSearchParams({ g, d: anchor });
    router.push(`${basePath}?${p.toString()}`);
  };

  const options: { value: StockPeriodGranularity; label: string }[] = [
    { value: "week", label: t("stockMovement.granularityWeek") },
    { value: "month", label: t("stockMovement.granularityMonth") },
    { value: "year", label: t("stockMovement.granularityYear") },
    { value: "custom", label: t("stockMovement.granularityCustom") },
  ];

  function submitCustom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams({ g: "custom" });
    if (f) p.set("from", f);
    if (to) p.set("to", to);
    router.push(`${basePath}?${p.toString()}`);
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("stockMovement.granularityLabel")}>
        {options.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={granularity === o.value ? "primary" : "outline"}
            aria-pressed={granularity === o.value}
            onClick={() => go(o.value, anchorISO)}
          >
            {o.label}
          </Button>
        ))}
      </div>

      {granularity === "custom" ? (
        <form onSubmit={submitCustom} className="flex flex-wrap items-end gap-3">
          <Input id="from" type="date" label={t("common.from")} value={f} onChange={(e) => setF(e.target.value)} />
          <Input id="to" type="date" label={t("common.to")} value={to} onChange={(e) => setTo(e.target.value)} />
          <Button type="submit">{t("common.show")}</Button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={t("stockMovement.previousPeriod")}
            disabled={!prevAnchorISO}
            onClick={() => prevAnchorISO && go(granularity, prevAnchorISO)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-[16rem] text-center text-sm font-medium text-foreground">{label}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={t("stockMovement.nextPeriod")}
            disabled={!nextAnchorISO}
            onClick={() => nextAnchorISO && go(granularity, nextAnchorISO)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
