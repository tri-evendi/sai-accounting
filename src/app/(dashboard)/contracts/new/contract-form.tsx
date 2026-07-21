"use client";

/**
 * Buat Kontrak — formulir ringkas dengan "Detail lengkap" yang dilipat (issue #4)
 * dan pencegahan salah-isi berbahasa manusia (issue #6).
 *
 * Yang terlihat sejak awal hanyalah yang membuat sebuah kontrak berarti: nomor,
 * tanggal, pembeli, mata uang/kurs, dan baris barang. Termin pembayaran,
 * kemasan, pengapalan, penerima barang, jatuh tempo, dan status pindah ke satu
 * bagian terlipat — isiannya TETAP ada di DOM (lihat `DisclosureSection`),
 * sehingga tetap ikut terkirim dan tetap bisa difokuskan bila server menolaknya.
 *
 * Semua penjaga di sini bersifat mendahului, bukan menggantikan: periode
 * tertutup tetap dijaga `assertPeriodOpen` di dalam transaksi penulisan, dan
 * seluruh aturan lain tetap milik `contractSchema`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DueDateField } from "@/components/shared/due-date-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisclosureSection, focusFormField } from "@/components/ui/disclosure-section";
import { TermTooltip } from "@/components/ui/term-tooltip";
import {
  CurrencyRateFields,
  baseUnknown,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { ConsigneeSelect } from "@/components/shared/consignee-select";
import { formatCurrency } from "@/lib/utils";
import { resolveSubmitFailure } from "@/lib/form-sections";
import {
  closedPeriodIssue,
  negativeValueIssue,
  type ClosedPeriodRef,
} from "@/lib/form-guards";
import { Trash2, Plus, AlertCircle, Lock } from "lucide-react";

interface ContractItem {
  itemName: string;
  bags: number;
  kgPerBag: number;
  pricePerKg: number;
}

const emptyItem = (): ContractItem => ({ itemName: "", bags: 0, kgPerBag: 0, pricePerKg: 0 });

/** Label status kontrak dalam bahasa tugas — dipakai pilihan & ringkasan lipatan. */
const STATUS_LABELS: Record<string, string> = {
  pending: "menunggu",
  signed: "sah (ditandatangani)",
  canceled: "dibatalkan",
};

export function NewContractForm({ closedPeriods }: { closedPeriods: ClosedPeriodRef[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ContractItem[]>([emptyItem()]);
  // Stored on the contract since issue #36, so an edit no longer re-enters it.
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  // Master consignee link (issue #22); the free text stays a fallback.
  const [consigneeId, setConsigneeId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("pending");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedInvalid, setAdvancedInvalid] = useState(false);

  const subtotal = items.reduce((sum, i) => sum + i.bags * i.kgPerBag * i.pricePerKg, 0);
  // Periode terkunci diperlihatkan sambil mengetik, bukan hanya setelah ditolak.
  const periodIssue = closedPeriodIssue(date, closedPeriods, "Tanggal kontrak");

  function addItem() {
    setItems([...items, emptyItem()]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ContractItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  /** Tampilkan galat, buka bagian yang menyembunyikannya, lalu fokuskan isiannya. */
  function reportFailure(message: string, field: string | null, inAdvanced: boolean) {
    setError(message);
    setAdvancedInvalid(inAdvanced);
    if (inAdvanced) setAdvancedOpen(true);
    if (field) {
      // Panel baru bisa difokuskan setelah React menggambarnya kembali.
      requestAnimationFrame(() => focusFormField(field));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setAdvancedInvalid(false);

    // ── Penjaga sebelum kirim (cermin dari penjaga server) ──
    if (periodIssue) {
      reportFailure(periodIssue, "date", false);
      return;
    }
    const negative = negativeValueIssue([
      { field: "rate", value: Number(rate) },
      ...items.flatMap((item, i) => [
        { field: `bags-${i}`, value: item.bags, label: `Jumlah bags baris ${i + 1}` },
        { field: `kgPerBag-${i}`, value: item.kgPerBag, label: `Kg per bag baris ${i + 1}` },
        { field: `pricePerKg-${i}`, value: item.pricePerKg, label: `Harga per kg baris ${i + 1}` },
      ]),
    ]);
    if (negative) {
      reportFailure(negative.message, negative.field, false);
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const body = {
      contractNo: formData.get("contractNo"),
      date: formData.get("date"),
      dueDate: formData.get("dueDate"),
      buyer: formData.get("buyer"),
      consignee: formData.get("consignee"),
      consigneeId,
      packaging: formData.get("packaging"),
      shipment: formData.get("shipment"),
      top1: formData.get("top1"),
      top2: formData.get("top2"),
      ...currencyRatePayload(currency, rate),
      status: formData.get("status"),
      items,
    };

    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const failure = resolveSubmitFailure("kontrak", data, "Kontrak belum bisa disimpan.");
      setLoading(false);
      reportFailure(failure.message, failure.field, failure.section === "lanjutan");
    } else {
      router.push("/contracts");
      router.refresh();
    }
  }

  /** Ringkasan isian lanjutan supaya nilainya tidak ikut hilang saat terlipat. */
  const advancedSummary = [
    dueDate ? `Jatuh tempo ${dueDate}` : "Tanpa jatuh tempo",
    consigneeId != null ? "Penerima barang dipilih" : null,
    `Status ${STATUS_LABELS[status] ?? status}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Rincian Kontrak</CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            Isian yang wajib ada pada setiap kontrak. Sisanya ada di &ldquo;Detail
            lengkap&rdquo; di bawah.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="contractNo" name="contractNo" label="Nomor Kontrak" required />
            <div>
              <Input
                id="date"
                name="date"
                type="date"
                label="Tanggal Kontrak"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              {periodIssue && (
                <p className="mt-1 flex items-start gap-1 text-xs text-red-700" role="alert">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{periodIssue}</span>
                </p>
              )}
            </div>
            <Input id="buyer" name="buyer" label="Pembeli (buyer)" required />
            <div className="hidden sm:block" aria-hidden="true" />
            <CurrencyRateFields
              currency={currency}
              rate={rate}
              onCurrencyChange={setCurrency}
              onRateChange={setRate}
              currencyLabel="Mata Uang"
              rateHint="Wajib diisi — kurs disimpan pada kontrak dan dipakai untuk nilai IDR di buku besar."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Barang yang Dikontrakkan</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Tambah Barang
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="rounded-md border border-gray-200 p-3">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label
                      htmlFor={`itemName-${i}`}
                      className="mb-1 block text-xs font-medium text-gray-500"
                    >
                      Nama Barang
                    </label>
                    <input
                      id={`itemName-${i}`}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={item.itemName}
                      onChange={(e) => updateItem(i, "itemName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="w-20">
                    <label
                      htmlFor={`bags-${i}`}
                      className="mb-1 block text-xs font-medium text-gray-500"
                    >
                      Bags
                    </label>
                    <input
                      id={`bags-${i}`}
                      type="number"
                      min={0}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm tabular-nums"
                      value={item.bags}
                      onChange={(e) => updateItem(i, "bags", Number(e.target.value))}
                    />
                  </div>
                  <div className="w-24">
                    <label
                      htmlFor={`kgPerBag-${i}`}
                      className="mb-1 block text-xs font-medium text-gray-500"
                    >
                      Kg/Bag
                    </label>
                    <input
                      id={`kgPerBag-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm tabular-nums"
                      value={item.kgPerBag}
                      onChange={(e) => updateItem(i, "kgPerBag", Number(e.target.value))}
                    />
                  </div>
                  <div className="w-28">
                    <label
                      htmlFor={`pricePerKg-${i}`}
                      className="mb-1 block text-xs font-medium text-gray-500"
                    >
                      Harga/Kg
                    </label>
                    <input
                      id={`pricePerKg-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm tabular-nums"
                      value={item.pricePerKg}
                      onChange={(e) => updateItem(i, "pricePerKg", Number(e.target.value))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="cursor-pointer pb-2 text-red-400 transition-colors duration-150 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={items.length === 1}
                    aria-label={`Hapus baris barang ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-2 text-right text-xs tabular-nums text-gray-700">
                  = {formatCurrency(item.bags * item.kgPerBag * item.pricePerKg, currency)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Detail lengkap (issue #4) — tertutup secara default ── */}
      <DisclosureSection
        className="mb-6"
        description="Jatuh tempo, penerima barang, kemasan, pengapalan, termin pembayaran, dan status. Boleh dilewati — semuanya opsional."
        summary={advancedSummary}
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        invalid={advancedInvalid}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DueDateField value={dueDate} onChange={setDueDate} />
          <ConsigneeSelect consigneeId={consigneeId} onConsigneeIdChange={setConsigneeId} />
          <Input id="packaging" name="packaging" label="Kemasan" />
          <Input id="shipment" name="shipment" label="Pengapalan" />
          <div>
            <Input id="top1" name="top1" label="Termin Pembayaran 1" />
            <p className="mt-1 text-xs text-gray-500">
              Teks bebas kesepakatan, mis. &ldquo;30% uang muka&rdquo;. Bukan tanggal — untuk
              tanggal, pakai Jatuh Tempo di atas.
            </p>
          </div>
          <Input id="top2" name="top2" label="Termin Pembayaran 2" />
          <Select
            id="status"
            name="status"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "pending", label: "Menunggu" },
              { value: "signed", label: "Sah (ditandatangani)" },
              { value: "canceled", label: "Dibatalkan" },
            ]}
          />
        </div>
      </DisclosureSection>

      <Card className="mb-6">
        <CardContent className="py-3">
          <dl className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <dt className="font-medium text-gray-500">Perkiraan Nilai Kontrak ({currency})</dt>
              <dd className="text-lg font-bold tabular-nums text-gray-900">
                {formatCurrency(subtotal, currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">
                <TermTooltip term="buku_besar">Nilai dasar buku besar (IDR)</TermTooltip>
              </dt>
              <dd className="tabular-nums font-medium text-gray-900">
                {baseUnknown(currency, rate)
                  ? "— isi kurs dulu"
                  : formatCurrency(subtotal * (Number(rate) || 1), "IDR")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" className="cursor-pointer" disabled={loading}>
          {loading ? "Menyimpan…" : "Simpan Kontrak"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="cursor-pointer"
          onClick={() => router.back()}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
