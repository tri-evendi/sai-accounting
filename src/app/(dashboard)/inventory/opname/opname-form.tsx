"use client";

/**
 * Formulir stok opname (issue #57) — hitung fisik → selisih → penyesuaian.
 *
 * Pengguna mengetik jumlah fisik per barang; selisih (fisik − sistem) dihitung
 * langsung di layar. Hanya barang yang diisi DAN berselisih yang dikirim.
 * Server menulis gerakan penyesuaian + jurnal ke akun Selisih Persediaan dalam
 * satu transaksi. Karena ini memposting jurnal, submit dikonfirmasi dulu.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

export interface OpnameItem {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

export function OpnameForm({ items }: { items: OpnameItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Barang yang diisi DAN berselisih dari sistem — hanya ini yang disesuaikan.
  const changed = useMemo(() => {
    return items
      .map((it) => {
        const raw = counts[it.id];
        if (raw === undefined || raw.trim() === "") return null;
        const physical = Number(raw);
        if (Number.isNaN(physical)) return null;
        const variance = physical - it.currentStock;
        if (variance === 0) return null;
        return { it, physical, variance };
      })
      .filter((x): x is { it: OpnameItem; physical: number; variance: number } => x !== null);
  }, [items, counts]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/opname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          counts: changed.map((c) => ({ itemId: c.it.id, physicalQty: c.physical })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const fieldMsg = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
          : null;
        toast(String(fieldMsg || data.error || "Gagal menyimpan opname. Coba lagi."), "error");
        return;
      }
      const data = await res.json();
      toast(`Opname tersimpan — ${data.adjustedCount} barang disesuaikan.`);
      setCounts({});
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Tanggal opname</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <p className="text-sm text-muted-foreground">
          Isi jumlah fisik yang dihitung. Barang yang dikosongkan tidak diubah.
        </p>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Barang</TableHead>
              <TableHead>Satuan</TableHead>
              <TableHead className="text-right">Stok Sistem</TableHead>
              <TableHead className="text-right">Hitung Fisik</TableHead>
              <TableHead className="text-right">Selisih</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              const raw = counts[it.id];
              const has = raw !== undefined && raw.trim() !== "" && !Number.isNaN(Number(raw));
              const variance = has ? Number(raw) - it.currentStock : null;
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-medium text-foreground">{it.name}</TableCell>
                  <TableCell className="text-muted-foreground">{it.unit || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(it.currentStock)}</TableCell>
                  <TableCell className="text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={raw ?? ""}
                      onChange={(e) =>
                        setCounts((c) => ({ ...c, [it.id]: e.target.value }))
                      }
                      placeholder={String(it.currentStock)}
                      aria-label={`Hitung fisik ${it.name}`}
                      className="h-9 w-28 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {variance === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : variance === 0 ? (
                      <span className="text-muted-foreground">cocok</span>
                    ) : (
                      <span className={variance > 0 ? "text-success" : "text-destructive"}>
                        {variance > 0 ? "+" : ""}
                        {formatNumber(variance)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {changed.length === 0
            ? "Belum ada selisih."
            : `${changed.length} barang berselisih akan disesuaikan (jurnal ke Selisih Persediaan).`}
        </p>
        <ConfirmDialog
          title="Simpan penyesuaian opname?"
          message={`${changed.length} barang akan disesuaikan pada ${date}. Tiap selisih membuat gerakan stok dan jurnal ke akun Selisih Persediaan, dinilai pada biaya rata-rata. Tindakan ini tidak bisa dibatalkan otomatis — koreksi lewat opname berikutnya bila salah.`}
          confirmLabel="Ya, simpan penyesuaian"
          confirmVariant="primary"
          onConfirm={submit}
          trigger={
            <Button disabled={changed.length === 0 || submitting}>
              {submitting ? "Menyimpan…" : "Simpan Penyesuaian"}
            </Button>
          }
        />
      </div>
    </div>
  );
}
