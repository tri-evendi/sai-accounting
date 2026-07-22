"use client";

/**
 * Wizard "Pembelian Baru" (issue #5) — sisi peramban.
 *
 * Lima langkah: pemasok → barang & harga → (opsional) barang masuk gudang →
 * catat pembelian → ringkasan. Seperti sisi penjualan, tidak satu pun langkah
 * menyentuh server; seluruh isian dikirim SEKALI ke `POST /api/wizard/purchase`
 * yang menulisnya dalam satu `prisma.$transaction`.
 *
 * Dua hal yang sengaja TIDAK dikarang di sini:
 *  • Pembelian tetap satu baris `supplier_transactions` bertipe `purchase` —
 *    persis yang dicatat formulir di halaman pemasok. Tabel barisnya memang
 *    tidak ada, jadi rincian barang ikut ke catatan (`purchaseNote`).
 *  • Barang masuk gudang dicatat sebagai pergerakan stok `in`, yang tidak
 *    menghasilkan jurnal — persediaan sudah didebet oleh jurnal pembeliannya.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { DisclosureSection } from "@/components/ui/disclosure-section";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { DueDateField } from "@/components/shared/due-date-field";
import { Wizard, WizardSummaryRow } from "@/components/shared/wizard";
import { WizardPartnerStep } from "@/components/shared/wizard-partner-step";
import { useWizardDraft } from "@/components/shared/use-wizard-draft";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { humanizeFieldMessage, type ClosedPeriodRef } from "@/lib/form-guards";
import {
  PURCHASE_STEPS,
  buildPurchasePayload,
  emptyPurchaseDraft,
  emptyPurchaseLine,
  fillReceiptFromOrder,
  purchaseTotal,
  purchaseValue,
  validatePurchaseStep,
  type PurchaseDraft,
  type PurchaseLineDraft,
  type PurchaseStepId,
} from "@/lib/wizard";
import { CheckCircle2, PackagePlus, Plus, ShoppingCart, Trash2 } from "lucide-react";

export interface SupplierOption {
  id: number;
  name: string;
}
export interface ItemOption {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

interface PurchaseResult {
  supplierId: number;
  supplierName: string;
  purchase: { id: number; amount: number; currency: string };
  receiptCount: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function PurchaseWizard({
  suppliers,
  items,
  closedPeriods,
}: {
  suppliers: SupplierOption[];
  items: ItemOption[];
  closedPeriods: ClosedPeriodRef[];
}) {
  const router = useRouter();
  const { draft, setDraft, clear, ready, notice, dismissNotice } = useWizardDraft<PurchaseDraft>(
    "purchase",
    () => emptyPurchaseDraft(todayISO())
  );
  const [stepId, setStepId] = useState<PurchaseStepId>("pemasok");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const guardContext = useMemo(() => ({ closedPeriods }), [closedPeriods]);
  const blockers = validatePurchaseStep(draft, stepId, guardContext);

  const patch = useCallback(
    (updater: (prev: PurchaseDraft) => PurchaseDraft) => setDraft(updater),
    [setDraft]
  );
  const updateLine = useCallback(
    (index: number, values: Partial<PurchaseLineDraft>) =>
      patch((d) => ({
        ...d,
        lines: d.lines.map((l, i) => (i === index ? { ...l, ...values } : l)),
      })),
    [patch]
  );

  const supplierOptions: SearchableOption[] = suppliers.map((s) => ({
    value: String(s.id),
    label: s.name,
  }));
  const itemOptions: SearchableOption[] = items.map((i) => ({
    value: String(i.id),
    label: i.name,
    description: `Stok: ${formatNumber(i.currentStock)} ${i.unit || "kg"}`,
  }));

  const currency = draft.purchase.currency;

  async function finish() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/wizard/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPurchasePayload(draft)),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string; step?: PurchaseStepId }
        | null;
      setError(
        humanizeFieldMessage(null, data?.error ?? "Pembelian belum bisa disimpan.")
      );
      setBusy(false);
      if (data?.step) setStepId(data.step);
      return;
    }

    const created = (await res.json()) as PurchaseResult;
    clear();
    setResult(created);
    setBusy(false);
    router.refresh();
  }

  function cancel() {
    clear();
    router.push("/suppliers");
  }

  if (result) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success-strong" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">Pembelian tersimpan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Semuanya dicatat sekaligus dalam satu penyimpanan.
              </p>
              <dl className="mt-4 divide-y divide-border">
                <WizardSummaryRow label="Pemasok" value={result.supplierName} />
                <WizardSummaryRow
                  label="Nilai pembelian"
                  value={formatCurrency(result.purchase.amount, result.purchase.currency)}
                  strong
                />
                <WizardSummaryRow
                  label="Barang masuk gudang"
                  value={
                    result.receiptCount > 0 ? `${result.receiptCount} baris` : "Tidak dicatat"
                  }
                />
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/suppliers/${result.supplierId}`}>
                  <Button className="cursor-pointer">Lihat pemasok</Button>
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => {
                    setResult(null);
                    setStepId("pemasok");
                    setDraft(emptyPurchaseDraft(todayISO()));
                  }}
                >
                  Catat pembelian lagi
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Menyiapkan formulir…</p>;
  }

  return (
    <Wizard
      steps={PURCHASE_STEPS}
      currentId={stepId}
      onNavigate={(id) => {
        dismissNotice();
        setStepId(id as PurchaseStepId);
      }}
      blockers={blockers}
      onFinish={finish}
      onCancel={cancel}
      busy={busy}
      error={error}
      notice={notice}
      finishLabel="Selesai & Simpan"
    >
      {/* ── 1. Pemasok ────────────────────────────────────────────────── */}
      {stepId === "pemasok" && (
        <WizardPartnerStep
          noun="pemasok"
          options={supplierOptions}
          value={draft.supplier}
          manageHref="/suppliers"
          onChange={(values) =>
            patch((d) => ({ ...d, supplier: { ...d.supplier, ...values } }))
          }
        />
      )}

      {/* ── 2. Barang & harga ─────────────────────────────────────────── */}
      {stepId === "barang" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Barang yang dibeli</CardTitle>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => patch((d) => ({ ...d, lines: [...d.lines, emptyPurchaseLine()] }))}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Tambah barang
              </Button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Jumlah × harga beli di sini menjadi nilai pembelian yang dicatat sebagai{" "}
              <TermTooltip term="utang">utang</TermTooltip> ke pemasok.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {draft.lines.map((line, i) => (
              <div key={i} className="rounded-md border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SearchableSelect
                    label="Barang dari daftar stok"
                    placeholder="Pilih barang…"
                    searchPlaceholder="Cari barang…"
                    emptyText="Tidak ada barang cocok"
                    options={itemOptions}
                    value={line.itemId != null ? String(line.itemId) : null}
                    onChange={(v) => {
                      const master = v == null ? null : itemById.get(Number(v));
                      updateLine(i, {
                        itemId: master?.id ?? null,
                        itemName: master?.name ?? line.itemName,
                        unit: master?.unit || line.unit || "kg",
                      });
                    }}
                  />
                  <Input
                    id={`purchaseItemName-${i}`}
                    label="Nama barang di dokumen"
                    value={line.itemName}
                    onChange={(e) => updateLine(i, { itemName: e.target.value })}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="w-32">
                    <label
                      htmlFor={`purchaseQty-${i}`}
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      Jumlah ({line.unit || "kg"})
                    </label>
                    <input
                      id={`purchaseQty-${i}`}
                      type="number"
                      min={0}
                      step="0.001"
                      className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="w-40">
                    <label
                      htmlFor={`purchasePrice-${i}`}
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      Harga beli per {line.unit || "kg"} ({currency})
                    </label>
                    <input
                      id={`purchasePrice-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                      value={line.price}
                      onChange={(e) => updateLine(i, { price: Number(e.target.value) })}
                    />
                  </div>
                  <div className="ml-auto text-right">
                    <span className="block text-xs text-muted-foreground">Nilai baris</span>
                    <span className="block text-sm font-medium tabular-nums text-foreground">
                      {formatCurrency(line.quantity * line.price, currency)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patch((d) => ({
                        ...d,
                        lines: d.lines.length > 1 ? d.lines.filter((_, x) => x !== i) : d.lines,
                      }))
                    }
                    disabled={draft.lines.length === 1}
                    aria-label={`Hapus baris barang ${i + 1}`}
                    className="cursor-pointer pb-2 text-destructive transition-colors duration-150 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {line.itemId == null && (
                  <p className="mt-2 text-xs text-warning-strong">
                    Barang ini belum ada di daftar stok, jadi tidak bisa dicatat masuk gudang.
                    Nilai pembeliannya tetap tercatat.
                  </p>
                )}
              </div>
            ))}

            <dl className="border-t border-border pt-3">
              <WizardSummaryRow
                label="Nilai pembelian (sebelum PPN)"
                value={formatCurrency(purchaseValue(draft), currency)}
                strong
              />
            </dl>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Barang masuk (opsional) ────────────────────────────────── */}
      {stepId === "penerimaan" && (
        <Card>
          <CardContent className="space-y-4 py-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors duration-150 hover:bg-muted">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 cursor-pointer rounded border-border"
                checked={draft.receipt.include}
                onChange={(e) =>
                  patch((d) => {
                    const next = { ...d, receipt: { ...d.receipt, include: e.target.checked } };
                    return e.target.checked ? fillReceiptFromOrder(next) : next;
                  })
                }
              />
              <span className="text-sm">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <PackagePlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Barangnya sudah sampai gudang — tambahkan ke{" "}
                  <TermTooltip term="persediaan">stok</TermTooltip>
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  Stok bertambah beserta harga pokoknya, yang nanti dipakai menghitung{" "}
                  <TermTooltip term="hpp">HPP</TermTooltip> saat barang dijual. Tidak ada
                  jurnal tambahan — persediaan sudah masuk lewat jurnal pembeliannya.
                </span>
              </span>
            </label>

            {draft.receipt.include && (
              <>
                <Input
                  id="receiptDate"
                  type="date"
                  label="Tanggal barang masuk"
                  value={draft.receipt.date}
                  onChange={(e) =>
                    patch((d) => ({ ...d, receipt: { ...d.receipt, date: e.target.value } }))
                  }
                  required
                />

                <div className="space-y-3">
                  {draft.lines.map((line, i) => {
                    const master = line.itemId != null ? itemById.get(line.itemId) : null;
                    const over = line.receiveQuantity > line.quantity;
                    return (
                      <div key={i} className="rounded-md border border-border p-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-border"
                            checked={line.receive}
                            disabled={line.itemId == null}
                            onChange={(e) =>
                              updateLine(i, {
                                receive: e.target.checked,
                                receiveQuantity:
                                  line.receiveQuantity > 0 ? line.receiveQuantity : line.quantity,
                              })
                            }
                          />
                          <span className="font-medium text-foreground">
                            {line.itemName || `Baris ${i + 1}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            dibeli {formatNumber(line.quantity)} {line.unit || "kg"}
                          </span>
                          {line.itemId == null && (
                            <Badge variant="warning">Tidak ada di daftar stok</Badge>
                          )}
                        </label>

                        {line.receive && (
                          <div className="mt-3 flex flex-wrap items-end gap-3">
                            <div className="w-36">
                              <label
                                htmlFor={`receiveQty-${i}`}
                                className="mb-1 block text-xs font-medium text-muted-foreground"
                              >
                                Masuk ({line.unit || "kg"})
                              </label>
                              <input
                                id={`receiveQty-${i}`}
                                type="number"
                                min={0}
                                step="0.001"
                                className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                                value={line.receiveQuantity}
                                onChange={(e) =>
                                  updateLine(i, { receiveQuantity: Number(e.target.value) })
                                }
                              />
                            </div>
                            <div className="ml-auto text-right">
                              <span className="block text-xs text-muted-foreground">
                                Stok sekarang
                              </span>
                              <span className="block text-sm tabular-nums text-foreground">
                                {formatNumber(master?.currentStock ?? 0)} {line.unit || "kg"}
                              </span>
                            </div>
                          </div>
                        )}
                        {over && (
                          <p className="mt-2 text-xs font-medium text-destructive-strong">
                            Jumlah yang masuk melebihi jumlah yang dibeli.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {currency !== "IDR" && (
                  <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                    Harga pokok stok selalu dicatat dalam rupiah, jadi harga beli{" "}
                    {currency} dikalikan kurs yang Anda isi di langkah berikutnya. Isi kursnya
                    lebih dulu bila belum.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 4. Catat pembelian ────────────────────────────────────────── */}
      {stepId === "pembelian" && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                <TermTooltip term="pembelian">Detail pembelian</TermTooltip>
              </CardTitle>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Menambah <TermTooltip term="utang">Hutang Usaha</TermTooltip> ke pemasok —
                  uang keluar baru dicatat saat pembayarannya.
                </span>
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="purchaseDate"
                  type="date"
                  label="Tanggal pembelian"
                  value={draft.purchase.date}
                  onChange={(e) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, date: e.target.value } }))
                  }
                  required
                />
                <DueDateField
                  value={draft.purchase.dueDate}
                  onChange={(v) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, dueDate: v } }))
                  }
                />
              </div>

              <dl className="mt-4 border-t border-border pt-3">
                <WizardSummaryRow
                  label="Nilai sebelum PPN"
                  value={formatCurrency(purchaseValue(draft), currency)}
                />
                <WizardSummaryRow
                  label={<TermTooltip term="ppn">PPN Masukan</TermTooltip>}
                  value={formatCurrency(draft.purchase.taxAmount || 0, currency)}
                />
                <WizardSummaryRow
                  label="Total utang ke pemasok"
                  value={formatCurrency(purchaseTotal(draft), currency)}
                  strong
                />
              </dl>
            </CardContent>
          </Card>

          <DisclosureSection
            description="Mata uang & kurs, PPN Masukan, dan catatan pembelian."
            summary={[
              currency === "IDR"
                ? "Rupiah (IDR)"
                : `${currency} · kurs ${draft.purchase.rate > 0 ? draft.purchase.rate : "belum diisi"}`,
              `PPN Masukan ${formatNumber(draft.purchase.taxAmount || 0)}`,
            ].join(" · ")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="purchaseCurrency"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Mata uang
                </label>
                <select
                  id="purchaseCurrency"
                  className="block w-full cursor-pointer rounded-md border border-border px-3 py-2 text-sm"
                  value={currency}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      purchase: { ...d.purchase, currency: e.target.value },
                    }))
                  }
                >
                  <option value="IDR">IDR (Rupiah)</option>
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                </select>
              </div>
              {currency !== "IDR" && (
                <div>
                  <label
                    htmlFor="purchaseRate"
                    className="mb-1 block text-sm font-medium text-foreground"
                  >
                    <TermTooltip term="kurs">Kurs</TermTooltip> 1 {currency} ke IDR
                  </label>
                  <input
                    id="purchaseRate"
                    type="number"
                    min={0}
                    step="0.000001"
                    className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                    value={draft.purchase.rate || ""}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        purchase: { ...d.purchase, rate: Number(e.target.value) },
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Wajib diisi — buku besar mencatat nilai IDR.
                  </p>
                </div>
              )}
              <div>
                <label
                  htmlFor="taxAmount"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  PPN Masukan ({currency})
                </label>
                <input
                  id="taxAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  className="block w-full rounded-md border border-border px-3 py-2 text-right text-sm tabular-nums"
                  value={draft.purchase.taxAmount}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      purchase: { ...d.purchase, taxAmount: Number(e.target.value) },
                    }))
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Diposting terpisah ke akun PPN Masukan. Isi 0 bila tidak ada.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Input
                  id="purchaseNote"
                  label="Catatan (opsional)"
                  value={draft.purchase.note}
                  onChange={(e) =>
                    patch((d) => ({ ...d, purchase: { ...d.purchase, note: e.target.value } }))
                  }
                  maxLength={300}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Rincian barang di langkah 2 otomatis ikut ke catatan ini, karena satu
                  pembelian tersimpan sebagai satu nilai.
                </p>
              </div>
            </div>
          </DisclosureSection>
        </>
      )}

      {/* ── 5. Ringkasan ──────────────────────────────────────────────── */}
      {stepId === "ringkasan" && (
        <Card>
          <CardHeader>
            <CardTitle>Periksa sebelum disimpan</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Semua di bawah ini akan dicatat sekaligus. Bila salah satunya gagal, tidak ada
              satu pun yang tersimpan.
            </p>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <WizardSummaryRow
                label="Pemasok"
                value={
                  draft.supplier.mode === "new"
                    ? `${draft.supplier.name} (baru)`
                    : (suppliers.find((s) => s.id === draft.supplier.id)?.name ?? "—")
                }
              />
              <WizardSummaryRow
                label="Barang"
                value={`${draft.lines.filter((l) => l.itemName.trim()).length} baris`}
                hint={draft.lines
                  .filter((l) => l.itemName.trim())
                  .map((l) => `${l.itemName} ${formatNumber(l.quantity)} ${l.unit || "kg"}`)
                  .join(" · ")}
              />
              <WizardSummaryRow
                label="Barang masuk gudang"
                value={
                  draft.receipt.include
                    ? `${draft.lines.filter((l) => l.receive && l.receiveQuantity > 0).length} baris`
                    : "Tidak dicatat"
                }
                hint={
                  draft.receipt.include
                    ? `Tanggal ${draft.receipt.date} — stok bertambah, tanpa jurnal tambahan.`
                    : "Stok tidak berubah."
                }
              />
              <WizardSummaryRow
                label="Nilai pembelian"
                value={formatCurrency(purchaseValue(draft), currency)}
              />
              <WizardSummaryRow
                label={<TermTooltip term="ppn">PPN Masukan</TermTooltip>}
                value={formatCurrency(draft.purchase.taxAmount || 0, currency)}
              />
              <WizardSummaryRow
                label="Total utang ke pemasok"
                value={formatCurrency(purchaseTotal(draft), currency)}
                hint={`Tanggal ${draft.purchase.date}`}
                strong
              />
            </dl>
          </CardContent>
        </Card>
      )}
    </Wizard>
  );
}
