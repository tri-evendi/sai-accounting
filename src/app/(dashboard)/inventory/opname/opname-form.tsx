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
import { TextInput } from "@/components/ui/input";
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
import { OpnameSheetPDFButton } from "@/components/shared/pdf-export-buttons";
import { useT } from "@/lib/i18n/client";

export interface OpnameItem {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

export function OpnameForm({ items }: { items: OpnameItem[] }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [query, setQuery] = useState("");
  const [showSystemQty, setShowSystemQty] = useState(false);

  /**
   * Penyaring nama barang (issue #129).
   *
   * MURNI TAMPILAN: yang disembunyikan tidak ikut terhapus dari `counts`, karena
   * state-nya berkunci id barang, bukan posisi baris. Mengetik 40 hitungan lalu
   * mencari satu nama tidak boleh membuang 39 di antaranya.
   */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, query]);

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

  /** Selisih yang sudah diketik tetapi sedang tersembunyi oleh penyaring. */
  const hiddenChanged = useMemo(() => {
    const shown = new Set(visible.map((it) => it.id));
    return changed.filter((c) => !shown.has(c.it.id)).length;
  }, [changed, visible]);

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
        toast(String(fieldMsg || data.error || t("inventory.opnameFailed")), "error");
        return;
      }
      const data = await res.json();
      toast(t("inventory.opnameSaved", { count: data.adjustedCount }));
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
          <span className="mb-1 block font-medium text-foreground">
            {t("inventory.opnameDateField")}
          </span>
          {/* Tak bisa menghitung fisik di masa depan; hitungan mundur sah —
              server membandingkannya dengan saldo buku per tanggal itu. */}
          <TextInput
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">
            {t("inventory.opnameSearchLabel")}
          </span>
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("inventory.opnameSearchPlaceholder")}
            className="w-56"
          />
        </label>
        {/* Cetak DULU, hitung, baru ketik — urutan itulah alasan tombolnya ada
            di sebelah tanggalnya, bukan di kepala halaman. */}
        <div className="flex flex-col gap-1">
          <OpnameSheetPDFButton items={items} date={date} showSystemQty={showSystemQty} />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showSystemQty}
              onChange={(e) => setShowSystemQty(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {t("inventory.opnameSheetIncludeSystem")}
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("inventory.opnameHint")}
        </p>
      </div>

      {/* Angka yang sudah diketik tapi kini tersembunyi penyaring TETAP ikut
          terkirim. Mengirim nilai yang tak terlihat di layar adalah cara
          termudah membuat penyesuaian yang tak seorang pun merasa membuatnya —
          jadi jumlahnya disebutkan, bukan didiamkan. */}
      {hiddenChanged > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-strong">
          {t("inventory.opnameHiddenCounts", { count: hiddenChanged })}
        </p>
      )}

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.item")}</TableHead>
              <TableHead>{t("common.unit")}</TableHead>
              <TableHead className="text-right">{t("inventory.colSystemStock")}</TableHead>
              <TableHead className="text-right">{t("inventory.colPhysicalCount")}</TableHead>
              <TableHead className="text-right">{t("inventory.colVariance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  {t("inventory.opnameNoMatch", { query })}
                </TableCell>
              </TableRow>
            )}
            {visible.map((it) => {
              const raw = counts[it.id];
              const has = raw !== undefined && raw.trim() !== "" && !Number.isNaN(Number(raw));
              const variance = has ? Number(raw) - it.currentStock : null;
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-medium text-foreground">{it.name}</TableCell>
                  <TableCell className="text-muted-foreground">{it.unit || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(it.currentStock)}</TableCell>
                  <TableCell className="text-right">
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={raw ?? ""}
                      onChange={(e) =>
                        setCounts((c) => ({ ...c, [it.id]: e.target.value }))
                      }
                      placeholder={String(it.currentStock)}
                      aria-label={t("inventory.physicalCountAria", { name: it.name })}
                      className="w-28 text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {variance === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : variance === 0 ? (
                      <span className="text-muted-foreground">{t("inventory.varianceMatch")}</span>
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
            ? t("inventory.noVariance")
            : t("inventory.varianceCount", { count: changed.length })}
        </p>
        <ConfirmDialog
          title={t("inventory.opnameConfirmTitle")}
          message={t("inventory.opnameConfirmMessage", { count: changed.length, date })}
          confirmLabel={t("inventory.opnameConfirmLabel")}
          confirmVariant="primary"
          onConfirm={submit}
          trigger={
            <Button disabled={changed.length === 0 || submitting}>
              {submitting ? t("common.saving") : t("inventory.opnameSubmit")}
            </Button>
          }
        />
      </div>
    </div>
  );
}
