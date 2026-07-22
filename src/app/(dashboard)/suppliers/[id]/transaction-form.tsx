"use client";

import { useCallback, useState } from "react";
import { DueDateField } from "@/components/shared/due-date-field";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, Link2, Plus } from "lucide-react";

const BASE_CURRENCY = "IDR";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const EPSILON = 0.005;

/** An outstanding purchase offered to the allocation picker (issue #37). */
interface OutstandingPurchase {
  id: number;
  date: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  totalBase: number | null;
  allocatedBase: number;
  remainingBase: number | null;
  note: string | null;
}

/**
 * Records a supplier purchase or payment. Both auto-post:
 *   purchase → D: Persediaan (+ D: PPN Masukan) / K: Hutang Usaha
 *   payment  → D: Hutang Usaha / K: Kas & Bank
 */
export function SupplierTransactionForm({ supplierId }: { supplierId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState<"purchase" | "payment">("purchase");
  const [currency, setCurrency] = useState(BASE_CURRENCY);

  // Allocation state (issue #37). `alloc` maps purchase id → amount typed by the
  // user, in the PAYMENT's currency. Absent key = not allocated.
  const [purchases, setPurchases] = useState<OutstandingPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [alloc, setAlloc] = useState<Record<number, string>>({});

  const isForeign = currency !== BASE_CURRENCY;
  const isPurchase = type === "purchase";

  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/transactions?outstanding=1`);
      setPurchases(res.ok ? await res.json() : []);
    } catch {
      // A failed lookup must not block recording the payment — allocation is
      // optional, and an unallocated payment is still a correct payment.
      setPurchases([]);
    }
    setLoadingPurchases(false);
  }, [supplierId]);

  /**
   * Switching type is the only thing that decides whether allocation applies, so
   * the fetch hangs off that event rather than an effect: only a payment can
   * settle a purchase, and a purchase clears any allocation already picked.
   */
  function handleTypeChange(next: "purchase" | "payment") {
    setType(next);
    if (next === "payment") loadPurchases();
    else setAlloc({});
  }

  const allocEntries = Object.entries(alloc)
    .map(([id, v]) => ({ purchaseId: Number(id), amount: Number(v) }))
    .filter((a) => Number.isFinite(a.amount) && a.amount > EPSILON);
  const allocTotal = allocEntries.reduce((s, a) => s + a.amount, 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount"));

    // Caught here as well as server-side so the user sees it before a round trip.
    if (!isPurchase && allocTotal > amount + EPSILON) {
      setError(
        `Total alokasi (${formatCurrency(allocTotal, currency)}) melebihi jumlah pembayaran (${formatCurrency(amount, currency)}).`
      );
      setLoading(false);
      return;
    }

    const body = {
      date: formData.get("date"),
      // Only a purchase can fall due; the API ignores it for a payment anyway.
      dueDate: isPurchase ? formData.get("dueDate") : null,
      type,
      amount,
      currency,
      rate: isForeign ? Number(formData.get("rate")) || undefined : undefined,
      taxAmount: isPurchase ? Number(formData.get("taxAmount")) || 0 : 0,
      note: formData.get("note") || undefined,
      // Omitted entirely on a purchase, and when a payment settles nothing in
      // particular — an unallocated payment is valid and falls back to FIFO.
      allocations: !isPurchase && allocEntries.length > 0 ? allocEntries : undefined,
    };

    const res = await fetch(`/api/suppliers/${supplierId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || "Gagal menyimpan transaksi"));
      setLoading(false);
      return;
    }

    toast("Transaksi supplier tersimpan dan sudah dijurnal");
    setOpen(false);
    setLoading(false);
    setAlloc({});
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> Add Transaction
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted p-4 mt-4">
      <h4 className="text-sm font-semibold text-foreground mb-3">Record Supplier Transaction</h4>

      {error && (
        <div className="mb-3 rounded-md bg-destructive-soft p-2 text-xs text-destructive-strong" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Select
            id="trx-type"
            name="type"
            label="Jenis Transaksi"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as "purchase" | "payment")}
            options={[
              { value: "purchase", label: "Pembelian (Purchase)" },
              { value: "payment", label: "Pembayaran (Payment)" },
            ]}
          />
          {isPurchase ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-destructive-strong">
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Menambah Hutang Usaha</span>
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-xs text-success-strong">
              <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mengurangi Hutang Usaha & saldo kas</span>
            </p>
          )}
        </div>

        <Input
          id="trx-date"
          name="date"
          type="date"
          label="Tanggal"
          defaultValue={new Date().toISOString().split("T")[0]}
          required
        />

        {isPurchase && <DueDateField />}

        <Input
          id="trx-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          className="text-right tabular-nums"
          label={isPurchase ? "Nilai (sebelum PPN)" : "Jumlah Pembayaran"}
          required
        />

        <Select
          id="trx-currency"
          name="currency"
          label="Mata Uang"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={[
            { value: "IDR", label: "IDR (Rupiah)" },
            { value: "USD", label: "USD" },
            { value: "CNY", label: "CNY" },
          ]}
        />

        {isForeign && (
          <div>
            <Input
              id="trx-rate"
              name="rate"
              type="number"
              step="0.000001"
              min="0"
              className="text-right tabular-nums"
              label={`Kurs 1 ${currency} ke IDR`}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Wajib diisi — buku besar mencatat nilai IDR.
            </p>
          </div>
        )}

        {isPurchase && (
          <div>
            <Input
              id="trx-tax"
              name="taxAmount"
              type="number"
              step="0.01"
              min="0"
              className="text-right tabular-nums"
              label="PPN Masukan (opsional)"
              defaultValue="0"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Diposting terpisah ke akun PPN Masukan.
            </p>
          </div>
        )}

        {!isPurchase && (
          <fieldset className="sm:col-span-2 rounded-lg border border-border bg-white p-3">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-foreground">
              <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Lunasi Pembelian (opsional)
            </legend>

            <p className="mb-3 text-xs text-muted-foreground">
              Pilih pembelian yang dibayar oleh transaksi ini. Bila dikosongkan, sisa
              utang per dokumen hanya <strong>diperkirakan</strong> (pembelian terlama
              dilunasi lebih dulu).
            </p>

            {loadingPurchases ? (
              <p className="text-xs text-muted-foreground">Memuat daftar pembelian...</p>
            ) : purchases.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Tidak ada pembelian dengan sisa utang untuk supplier ini.
              </p>
            ) : (
              <ul className="space-y-2">
                {purchases.map((p) => {
                  const checked = alloc[p.id] !== undefined;
                  const noRate = p.remainingBase == null;
                  return (
                    <li
                      key={p.id}
                      className="rounded-md border border-border p-2.5 transition-colors duration-150 hover:border-border"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 cursor-pointer rounded border-border"
                            checked={checked}
                            disabled={noRate}
                            onChange={(e) =>
                              setAlloc((prev) => {
                                const next = { ...prev };
                                if (e.target.checked) {
                                  // Default to clearing the document in full when
                                  // the payment is in IDR; otherwise leave blank
                                  // rather than guess across currencies.
                                  next[p.id] =
                                    !isForeign && p.remainingBase != null
                                      ? String(p.remainingBase)
                                      : "";
                                } else delete next[p.id];
                                return next;
                              })
                            }
                          />
                          <span>
                            <span className="font-medium text-foreground">TRX-{p.id}</span>
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              {formatDateShort(p.date)}
                              {p.dueDate && <> · j.tempo {formatDateShort(p.dueDate)}</>}
                            </span>
                            {p.note && (
                              <span className="block max-w-64 truncate text-xs text-muted-foreground">
                                {p.note}
                              </span>
                            )}
                          </span>
                        </label>

                        <div className="text-right">
                          <span className="block text-xs text-muted-foreground">Sisa utang</span>
                          <span className="block text-sm font-medium text-foreground tabular-nums">
                            {noRate ? "Kurs belum diisi" : formatCurrency(p.remainingBase!, "IDR")}
                          </span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            Nilai {formatCurrency(p.amount, p.currency)}
                          </span>
                        </div>
                      </div>

                      {noRate && (
                        <p className="mt-1.5 text-xs text-warning-strong">
                          Pembelian valas tanpa kurs — sisa utang dalam IDR tidak
                          diketahui, jadi belum bisa dialokasikan.
                        </p>
                      )}

                      {checked && (
                        <div className="mt-2 flex items-center gap-2">
                          <label
                            htmlFor={`alloc-${p.id}`}
                            className="text-xs text-muted-foreground whitespace-nowrap"
                          >
                            Dibayar ({currency})
                          </label>
                          <input
                            id={`alloc-${p.id}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={alloc[p.id]}
                            onChange={(e) =>
                              setAlloc((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            className="w-40 rounded-md border border-border px-2 py-1 text-right text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-ring focus:outline-none"
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {allocEntries.length > 0 && (
              <p className="mt-3 flex justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">Total dialokasikan</span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatCurrency(allocTotal, currency)}
                </span>
              </p>
            )}
          </fieldset>
        )}

        <div className="sm:col-span-2">
          <Input id="trx-note" name="note" label="Catatan (opsional)" />
        </div>

        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Transaksi"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
