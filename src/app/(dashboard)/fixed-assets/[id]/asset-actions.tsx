"use client";

/**
 * Pelepasan & pindah lokasi aset (issue #28).
 *
 * Disposal posts the removal + laba/rugi pelepasan journal; the gain/loss is
 * previewed live against the current book value. A move posts no journal.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { ArrowRightLeft, Banknote, Loader2 } from "lucide-react";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function AssetActions({ assetId, bookValue }: { assetId: number; bookValue: number }) {
  const router = useRouter();
  const { toast } = useToast();

  // Disposal
  const [dDate, setDDate] = useState(todayISO());
  const [proceeds, setProceeds] = useState("");
  const [dNote, setDNote] = useState("");
  const [disposing, setDisposing] = useState(false);
  const [dError, setDError] = useState<string | null>(null);

  // Transfer
  const [tDate, setTDate] = useState(todayISO());
  const [toLocation, setToLocation] = useState("");
  const [tNote, setTNote] = useState("");
  const [moving, setMoving] = useState(false);
  const [tError, setTError] = useState<string | null>(null);

  const gainLoss = useMemo(() => {
    const p = Number(proceeds);
    if (!proceeds || Number.isNaN(p)) return null;
    return Math.round((p - bookValue) * 100) / 100;
  }, [proceeds, bookValue]);

  async function dispose(e: React.FormEvent) {
    e.preventDefault();
    setDError(null);
    setDisposing(true);
    try {
      const res = await fetch(`/api/fixed-assets/${assetId}/dispose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dDate, proceeds: Number(proceeds) || 0, note: dNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDError(data?.error ?? "Gagal mencatat pelepasan.");
        return;
      }
      toast("Pelepasan tercatat dan sudah dijurnal.", "success");
      router.refresh();
    } catch {
      setDError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setDisposing(false);
    }
  }

  async function transfer(e: React.FormEvent) {
    e.preventDefault();
    setTError(null);
    setMoving(true);
    try {
      const res = await fetch(`/api/fixed-assets/${assetId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: tDate, toLocation, note: tNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTError(data?.error ?? "Gagal memindahkan aset.");
        return;
      }
      toast("Lokasi aset diperbarui.", "success");
      setToLocation("");
      setTNote("");
      router.refresh();
    } catch {
      setTError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ArrowRightLeft className="h-5 w-5 text-blue-700" aria-hidden="true" />
          Pindah lokasi
        </h2>
        <p className="mb-4 text-xs text-gray-500">Mencatat perpindahan — tidak membuat jurnal.</p>
        <form onSubmit={transfer} className="space-y-3">
          <Input id="t-date" type="date" label="Tanggal" value={tDate} onChange={(e) => setTDate(e.target.value)} required />
          <Input
            id="t-loc"
            label="Lokasi tujuan"
            value={toLocation}
            onChange={(e) => setToLocation(e.target.value)}
            placeholder="mis. Gudang Cabang"
            required
          />
          <Input id="t-note" label="Catatan (opsional)" value={tNote} onChange={(e) => setTNote(e.target.value)} maxLength={500} />
          {tError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{tError}</p>}
          <Button type="submit" variant="secondary" disabled={moving} className="cursor-pointer">
            {moving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            Pindahkan
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Banknote className="h-5 w-5 text-blue-700" aria-hidden="true" />
          Pelepasan / penjualan
        </h2>
        <p className="mb-4 text-xs text-gray-500">
          Menghapus nilai aset &amp; akumulasi penyusutannya, mencatat hasil, dan menjurnal
          laba/rugi pelepasan.
        </p>
        <form onSubmit={dispose} className="space-y-3">
          <Input id="d-date" type="date" label="Tanggal pelepasan" value={dDate} onChange={(e) => setDDate(e.target.value)} required />
          <Input
            id="d-proceeds"
            type="number"
            step="0.01"
            min="0"
            className="text-right tabular-nums"
            label="Hasil pelepasan (IDR)"
            value={proceeds}
            onChange={(e) => setProceeds(e.target.value)}
            placeholder="0 jika dibuang / scrap"
          />
          <Input id="d-note" label="Catatan (opsional)" value={dNote} onChange={(e) => setDNote(e.target.value)} maxLength={500} />
          <p className="text-sm text-gray-600 tabular-nums">
            Nilai buku saat ini: <strong className="text-gray-900">{formatCurrency(bookValue, "IDR")}</strong>
          </p>
          {gainLoss != null && (
            <p className="text-sm tabular-nums">
              {gainLoss >= 0 ? (
                <span className="text-green-700">
                  Laba pelepasan: <strong>{formatCurrency(gainLoss, "IDR")}</strong>
                </span>
              ) : (
                <span className="text-red-700">
                  Rugi pelepasan: <strong>({formatCurrency(Math.abs(gainLoss), "IDR")})</strong>
                </span>
              )}
            </p>
          )}
          {dError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{dError}</p>}
          <Button type="submit" variant="danger" disabled={disposing} className="cursor-pointer">
            {disposing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            Catat Pelepasan
          </Button>
        </form>
      </Card>
    </div>
  );
}
