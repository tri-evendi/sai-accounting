"use client";

/**
 * Re-allocate an existing supplier payment (issue #38).
 *
 * #37 let a user say which purchases a payment settles, but only while the
 * payment was being created. Getting it wrong — or recording a payment before
 * #37 existed at all — left no way back except deleting the payment and making
 * it again. This panel edits the allocation set directly: it PUTs the new set.
 *
 * For a PURE-IDR payment that write touches no journal — the allocation is
 * reporting data. For a FOREIGN-currency payment it is ledger-affecting (issue
 * #42): the allocation decides which slice of hutang is relieved at which
 * document rate, hence the realised selisih kurs, so the PUT reposts the payment
 * server-side. Either way the user just states the truth and the ledger follows.
 *
 * The set is always sent whole. Editing an amount, unticking a purchase and
 * allocating a payment that had nothing are then one operation with one
 * outcome, rather than three endpoints that can disagree.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Link2, Loader2 } from "lucide-react";

const BASE_CURRENCY = "IDR";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const EPSILON = 0.005;

interface EditablePurchase {
  id: number;
  date: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  totalBase: number | null;
  allocatedBase: number;
  /**
   * Room left, IDR, measured from recorded allocations only and with THIS
   * payment's own allocations excluded by the API — so re-stating an existing
   * allocation is never blocked by itself, and a FIFO guess never blocks it at
   * all.
   */
  remainingBase: number | null;
  note: string | null;
}

interface EditorPayload {
  payment: { id: number; amount: number; currency: string; rate: number | null };
  current: { purchaseId: number; amount: number }[];
  purchases: EditablePurchase[];
}

export function AllocationEditor({
  supplierId,
  paymentId,
  paymentAmount,
  paymentCurrency,
  allocatedCount,
  autoOpen = false,
}: {
  supplierId: number;
  paymentId: number;
  paymentAmount: number;
  paymentCurrency: string;
  allocatedCount: number;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  // Arriving from the "Perkiraan" badge on /payables opens the panel straight
  // away, so the user lands on the fix rather than hunting for it. Seeded as
  // initial state rather than set from an effect — the panel is open from the
  // first render, with no flash of the collapsed button.
  const [open, setOpen] = useState(autoOpen);
  const [loading, setLoading] = useState(autoOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<EditorPayload | null>(null);
  /** purchase id → amount as typed, in the PAYMENT's currency. Absent = unallocated. */
  const [alloc, setAlloc] = useState<Record<number, string>>({});

  const isForeign = paymentCurrency !== BASE_CURRENCY;

  /**
   * Load the editor's data whenever the panel is open.
   *
   * The fetch is an effect because it synchronises with an external system (the
   * API), and every state update lands in a promise callback rather than the
   * effect body — a synchronous setState here would cascade renders. `alive`
   * drops the result of a request the user has already closed the panel on.
   */
  useEffect(() => {
    if (!open) return;
    let alive = true;

    fetch(`/api/suppliers/${supplierId}/transactions?allocations=1&paymentId=${paymentId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(String(body.error || "Gagal memuat daftar pembelian."));
        }
        return (await res.json()) as EditorPayload;
      })
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        // Pre-fill with what the payment says today: the user is correcting an
        // existing statement, not starting from a blank one.
        const initial: Record<number, string> = {};
        for (const c of payload.current) initial[c.purchaseId] = String(c.amount);
        setAlloc(initial);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message || "Gagal memuat daftar pembelian.");
        setData(null);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open, supplierId, paymentId]);

  function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError("");
  }

  const entries = Object.entries(alloc)
    .map(([id, v]) => ({ purchaseId: Number(id), amount: Number(v) }))
    .filter((a) => Number.isFinite(a.amount) && a.amount > EPSILON);
  const total = entries.reduce((s, a) => s + a.amount, 0);
  const overAllocated = total > paymentAmount + EPSILON;
  const unallocated = Math.max(0, paymentAmount - total);

  async function save(next: { purchaseId: number; amount: number }[]) {
    setSaving(true);
    setError("");

    const res = await fetch(`/api/suppliers/${supplierId}/transactions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: paymentId, allocations: next }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const fieldMsg = body.details?.fieldErrors
        ? Object.values(body.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || body.error || "Gagal menyimpan alokasi"));
      setSaving(false);
      return;
    }

    toast(
      next.length === 0
        ? "Alokasi dihapus — sisa utang per dokumen kembali diperkirakan"
        : "Alokasi tersimpan. Jurnal tidak berubah."
    );
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={handleOpen} className="cursor-pointer">
        <Link2 className="h-4 w-4 mr-1" aria-hidden="true" />
        {allocatedCount > 0 ? "Ubah alokasi" : "Alokasikan"}
      </Button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left">
      <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <Link2 className="h-4 w-4 text-gray-500" aria-hidden="true" />
        Pembelian yang dilunasi pembayaran ini
      </h4>
      <p className="mb-3 text-xs text-gray-600">
        Mengubah alokasi hanya memperbaiki laporan sisa utang per dokumen —{" "}
        <strong>tidak mengubah jurnal</strong> dan tidak memindahkan uang. Bila
        dikosongkan, sisa per dokumen kembali <strong>diperkirakan</strong>{" "}
        (pembelian terlama dilunasi lebih dulu).
      </p>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Memuat daftar pembelian...
        </p>
      ) : !data ? null : data.purchases.length === 0 ? (
        <p className="text-xs text-gray-500">
          Tidak ada pembelian dengan sisa utang untuk supplier ini, jadi tidak ada
          yang bisa dialokasikan.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.purchases.map((p) => {
            const checked = alloc[p.id] !== undefined;
            const noRate = p.remainingBase == null;
            const typed = Number(alloc[p.id]);
            // The API's own ceiling for this line, shown before the round trip.
            const overLine =
              checked &&
              p.remainingBase != null &&
              Number.isFinite(typed) &&
              typed * (isForeign && data.payment.rate ? data.payment.rate : 1) >
                p.remainingBase + EPSILON;

            return (
              <li
                key={p.id}
                className="rounded-md border border-gray-200 bg-white p-2.5 transition-colors duration-150 hover:border-gray-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 cursor-pointer rounded border-gray-300"
                      checked={checked}
                      disabled={noRate}
                      onChange={(e) =>
                        setAlloc((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) {
                            // Default to clearing the document in full when the
                            // payment is in IDR; otherwise leave blank rather
                            // than guess a figure across currencies.
                            next[p.id] =
                              !isForeign && p.remainingBase != null
                                ? String(Math.min(p.remainingBase, paymentAmount))
                                : "";
                          } else delete next[p.id];
                          return next;
                        })
                      }
                    />
                    <span>
                      <span className="font-medium text-gray-900">TRX-{p.id}</span>
                      <span className="block text-xs text-gray-500 tabular-nums">
                        {formatDateShort(p.date)}
                        {p.dueDate && <> · j.tempo {formatDateShort(p.dueDate)}</>}
                      </span>
                      {p.note && (
                        <span className="block max-w-64 truncate text-xs text-gray-400">
                          {p.note}
                        </span>
                      )}
                    </span>
                  </label>

                  <div className="text-right">
                    <span className="block text-xs text-gray-500">Sisa utang</span>
                    <span className="block text-sm font-medium text-gray-900 tabular-nums">
                      {noRate ? "Kurs belum diisi" : formatCurrency(p.remainingBase!, "IDR")}
                    </span>
                    <span className="block text-xs text-gray-400 tabular-nums">
                      Nilai {formatCurrency(p.amount, p.currency)}
                    </span>
                  </div>
                </div>

                {noRate && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Pembelian valas tanpa kurs — sisa utang dalam IDR tidak diketahui,
                    jadi belum bisa dialokasikan.
                  </p>
                )}

                {checked && (
                  <div className="mt-2 flex items-center gap-2">
                    <label
                      htmlFor={`realloc-${paymentId}-${p.id}`}
                      className="whitespace-nowrap text-xs text-gray-600"
                    >
                      Dibayar ({paymentCurrency})
                    </label>
                    <input
                      id={`realloc-${paymentId}-${p.id}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={alloc[p.id]}
                      onChange={(e) =>
                        setAlloc((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      className="w-40 rounded-md border border-gray-300 px-2 py-1 text-right text-sm tabular-nums transition-colors duration-150 focus:border-blue-700 focus:ring-1 focus:ring-blue-700 focus:outline-none"
                    />
                  </div>
                )}

                {overLine && (
                  <p className="mt-1.5 text-xs text-red-700" role="alert">
                    Melebihi sisa utang pembelian ini.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 space-y-1 border-t border-gray-200 pt-2 text-xs">
        <p className="flex justify-between">
          <span className="text-gray-600">Jumlah pembayaran</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatCurrency(paymentAmount, paymentCurrency)}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-gray-600">Total dialokasikan</span>
          <span
            className={`font-medium tabular-nums ${overAllocated ? "text-red-700" : "text-gray-900"}`}
          >
            {formatCurrency(total, paymentCurrency)}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-gray-600">Belum dialokasikan (diperkirakan)</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatCurrency(unallocated, paymentCurrency)}
          </span>
        </p>
      </div>

      {overAllocated && (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700" role="alert">
          Total alokasi melebihi jumlah pembayaran ini.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="cursor-pointer"
          disabled={saving || loading || overAllocated}
          onClick={() => save(entries)}
        >
          {saving ? "Menyimpan..." : "Simpan Alokasi"}
        </Button>
        {allocatedCount > 0 && (
          /* `window.confirm` diganti ConfirmDialog (issue #6): pesan bawaan
             peramban tidak bisa menjelaskan akibatnya dengan tenang, tidak
             mengikuti bahasa app, dan tidak bisa ditata. */
          <ConfirmDialog
            title="Hapus semua alokasi pembayaran ini?"
            message="Sisa utang per dokumen akan kembali diperkirakan dengan metode FIFO seperti sebelum alokasi dibuat. Jurnal dan nilai pembayarannya sendiri tidak berubah."
            confirmLabel="Hapus Alokasi"
            onConfirm={() => save([])}
            trigger={
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="cursor-pointer"
                disabled={saving || loading}
              >
                Hapus Alokasi
              </Button>
            }
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={() => setOpen(false)}
        >
          Batal
        </Button>
      </div>
    </div>
  );
}
