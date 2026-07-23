"use client";

/**
 * Uang Muka Pembelian on the supplier screen (issue #41).
 *
 * The purchase side of advances was complete in the backend since #26 — the
 * type, the endpoint, the compensation guard, the AP integration and their tests
 * all existed — with no way to reach any of it except by calling the API by
 * hand. This panel is that missing surface, and deliberately nothing more: every
 * write goes through the same two endpoints the sales side uses, so the journals
 * are the ones the API already produced. No accounting rule lives in this file.
 *
 * ── Why the target is PICKED here, unlike the invoice screen ─────────────────
 * On `/invoices/[id]` the document being settled is the page itself, so there is
 * nothing to choose. A supplier has many purchases, so the flow gains one step:
 * pick the purchase, then compensate into it. That step is also where the
 * issue's "show each purchase's outstanding" requirement is met — the picker
 * carries the remaining IDR of every option, so the choice is informed rather
 * than made blind and corrected by a server error.
 *
 * ── Currency discipline ─────────────────────────────────────────────────────
 * Every cross-document figure here is IDR base. An advance or purchase with no
 * usable rate has no IDR value at all, so it is excluded from the totals and
 * counted out loud (`Belum berkurs`) rather than folded in at 1:1 — the bug
 * fixed in #35/#36 and re-stated in the header of `receivables.ts`.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  AdvanceCompensationSection,
  type AdvanceOption,
  type AppliedAdvance,
} from "@/components/shared/advance-compensation";
import {
  AdvanceForm,
  type ContractOption,
} from "@/app/(dashboard)/advances/new/advance-form";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { ArrowUpFromLine, HandCoins, Info, Plus, X } from "lucide-react";

/** One purchase this supplier's advances can be compensated into. */
export interface PurchaseTargetView {
  id: number;
  label: string;
  date: string;
  currency: string;
  amount: number;
  /** Room left for compensation, IDR base. Never null here — see page.tsx. */
  remainingBase: number;
}

/** One advance paid to this supplier, with its balance already worked out. */
export interface SupplierAdvanceView {
  id: number;
  advanceNo: string;
  date: string;
  currency: string;
  amount: number;
  applied: number;
  remaining: number;
  remainingBase: number | null;
  unratedApplications: number;
  isFullyApplied: boolean;
  contractNo: string | null;
}

export function SupplierAdvancePanel({
  supplier,
  contracts,
  advances,
  outstandingBase,
  unratedAdvanceCount,
  purchases,
  unratedPurchaseCount,
  appliedByPurchase,
}: {
  supplier: { id: number; name: string };
  contracts: ContractOption[];
  advances: SupplierAdvanceView[];
  /** Σ remaining of every advance that HAS an IDR value. */
  outstandingBase: number;
  /** Advances excluded from that sum because they carry no rate. */
  unratedAdvanceCount: number;
  purchases: PurchaseTargetView[];
  /** Purchases dropped from the picker because they carry no rate. */
  unratedPurchaseCount: number;
  appliedByPurchase: Record<number, AppliedAdvance[]>;
}) {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [targetId, setTargetId] = useState<string>("");

  const open = advances.filter((a) => !a.isFullyApplied);
  const selected = purchases.find((p) => String(p.id) === targetId) ?? null;

  // Only advances with balance left can be compensated, and only ones with a
  // usable IDR value can be checked against the target — the API rejects the
  // rest with an explanatory error, so they are listed above but not offered.
  const options: AdvanceOption[] = open.map((a) => ({
    id: a.id,
    advanceNo: a.advanceNo,
    date: a.date,
    currency: a.currency,
    remaining: a.remaining,
    remainingBase: a.remainingBase,
    partyName: supplier.name,
  }));

  return (
    <div className="space-y-5">
      {/* What this money IS. Direction is carried by an icon and by the words
          "Uang keluar", never by colour alone. */}
      <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden="true" />
            Uang keluar
          </span>{" "}
          ke supplier <strong>sebelum</strong> barangnya diterima, dicatat sebagai{" "}
          <strong>Uang Muka Pembelian</strong> — sebuah <em>aset</em>, <strong>bukan</strong>{" "}
          beban. Beban baru diakui saat pembeliannya dicatat; uang muka ini lalu
          dikompensasikan ke pembelian tersebut untuk mengurangi sisa utangnya.
        </span>
      </p>

      {/* Balance tiles — the number the panel exists to answer. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Sisa uang muka belum dikompensasi</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {formatCurrency(outstandingBase, "IDR")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nilai dasar IDR dari {open.length} uang muka yang masih bersisa.
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Belum berkurs</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {unratedAdvanceCount}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Uang muka valas tanpa kurs — <strong>tidak</strong> ikut dijumlahkan di
            total IDR sebelah kiri.
          </p>
        </div>
      </div>

      {/* Record a new advance — progressive disclosure, closed by default so the
          panel reads as a balance first and a form second. */}
      {recording ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Catat uang muka ke {supplier.name}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => setRecording(false)}
            >
              <X className="mr-1 h-4 w-4" aria-hidden="true" />
              Tutup
            </Button>
          </div>
          <AdvanceForm
            contracts={contracts}
            locked={{ type: "purchase", party: supplier }}
            onSaved={() => {
              setRecording(false);
              router.refresh();
            }}
            onCancel={() => setRecording(false)}
          />
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          className="cursor-pointer"
          onClick={() => setRecording(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Catat Uang Muka
        </Button>
      )}

      {/* Advances paid to this supplier */}
      {advances.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Belum ada uang muka ke supplier ini. Catat pembayaran di muka lewat tombol
          di atas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2 font-medium text-muted-foreground">Nomor</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Tanggal</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Kontrak</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Nilai</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Sudah dikompensasi
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Sisa</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Sisa (IDR)</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{a.advanceNo}</span>
                    {/* Badge always carries text — colour is never the only signal. */}
                    <span className="mt-0.5 block">
                      <Badge variant={a.isFullyApplied ? "default" : "warning"}>
                        {a.isFullyApplied ? "Habis" : "Bersisa"}
                      </Badge>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-foreground tabular-nums">
                    {formatDateShort(new Date(a.date))}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{a.contractNo ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {formatCurrency(a.amount, a.currency)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {formatCurrency(a.applied, a.currency)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums text-foreground">
                    {formatCurrency(a.remaining, a.currency)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {a.remainingBase != null ? (
                      formatCurrency(a.remainingBase, "IDR")
                    ) : (
                      <span className="text-xs text-warning-strong">Kurs belum diisi</span>
                    )}
                    {a.unratedApplications > 0 && (
                      <span className="mt-0.5 block text-xs text-warning-strong">
                        {a.unratedApplications} kompensasi belum berkurs
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compensate into a purchase */}
      <div className="border-t border-border pt-4">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <HandCoins className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Kompensasi ke pembelian
        </h4>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          Pilih pembelian yang mau dikurangi, lalu isi berapa dari tiap uang muka
          yang dipakai. Kompensasi <strong>memindahkan</strong> nilai dari Uang Muka
          Pembelian ke utang supplier — tidak ada uang yang berpindah lagi.
        </p>

        {purchases.length === 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Tidak ada pembelian dengan sisa utang untuk supplier ini, jadi belum ada
              yang bisa dikompensasi.
              {unratedPurchaseCount > 0 && (
                <>
                  {" "}
                  <strong>{unratedPurchaseCount} pembelian</strong> valas belum berkurs —
                  sisa utangnya dalam IDR tidak diketahui, jadi belum bisa jadi sasaran
                  kompensasi. Isi kursnya lebih dulu.
                </>
              )}
            </span>
          </p>
        ) : (
          <div className="space-y-4">
            <div className="max-w-md">
              <Select
                id="advance-target"
                label="Pembelian yang dikurangi"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="Pilih pembelian"
                options={purchases.map((p) => ({
                  value: String(p.id),
                  label: `${p.label} · ${formatDateShort(new Date(p.date))} · sisa ${formatCurrency(
                    p.remainingBase,
                    "IDR"
                  )}`,
                }))}
              />
              {unratedPurchaseCount > 0 && (
                <p className="mt-1 text-xs text-warning-strong">
                  {unratedPurchaseCount} pembelian valas belum berkurs dan tidak
                  ditampilkan di sini. Isi kursnya lebih dulu agar bisa dikompensasi.
                </p>
              )}
            </div>

            {selected && (
              <div className="rounded-md border border-border p-3">
                <p className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{selected.label}</span>
                  <span className="text-xs text-muted-foreground">
                    Nilai {formatCurrency(selected.amount, selected.currency)} · sisa
                    utang{" "}
                    <strong className="tabular-nums text-foreground">
                      {formatCurrency(selected.remainingBase, "IDR")}
                    </strong>
                  </span>
                </p>
                <AdvanceCompensationSection
                  targetKind="purchase"
                  targetId={selected.id}
                  targetCurrency={selected.currency}
                  outstandingBase={selected.remainingBase}
                  advances={options}
                  applied={appliedByPurchase[selected.id] ?? []}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
