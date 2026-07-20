"use client";

/**
 * Recording an advance (issue #26).
 *
 * The direction is picked first and everything downstream follows from it —
 * which party list to show, and the plain-language explanation of where the
 * money will land. Accounting terms ("kewajiban", "Uang Muka Penjualan") appear
 * as supporting text next to a task-language label, per the MASTER.md rule about
 * not putting raw jargon on the surface.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CurrencyRateFields,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Info } from "lucide-react";

export interface PartyOption {
  id: number;
  name: string;
}

export interface ContractOption {
  id: number;
  contractNo: string;
  buyer: string;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function AdvanceForm({
  customers,
  suppliers,
  contracts,
}: {
  customers: PartyOption[];
  suppliers: PartyOption[];
  contracts: ContractOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [type, setType] = useState<"sales" | "purchase">("sales");
  const [date, setDate] = useState(todayISO());
  const [partyId, setPartyId] = useState("");
  const [contractId, setContractId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSales = type === "sales";
  const parties = isSales ? customers : suppliers;
  const amountNum = Number(amount) || 0;
  const rateNum = Number(rate) || 0;
  // Shown live so the user sees the ledger value before saving, not after.
  const baseValue =
    currency === "IDR" ? amountNum : rateNum > 0 ? amountNum * rateNum : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          date,
          customerId: isSales ? Number(partyId) : undefined,
          supplierId: isSales ? undefined : Number(partyId),
          contractId: contractId ? Number(contractId) : undefined,
          amount: amountNum,
          note: note || undefined,
          ...currencyRatePayload(currency, rate),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        // Field errors first — they name the input to fix; fall back to the
        // posting-engine message, which already explains nothing was saved.
        const fieldErrors = data?.details?.fieldErrors as
          | Record<string, string[]>
          | undefined;
        const first = fieldErrors
          ? Object.values(fieldErrors).flat().find(Boolean)
          : undefined;
        setError(first ?? data?.error ?? "Gagal menyimpan uang muka.");
        return;
      }

      toast("Uang muka tersimpan dan sudah dijurnal.", "success");
      router.push("/advances");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="type"
            label="Jenis uang muka"
            value={type}
            onChange={(e) => {
              setType(e.target.value as "sales" | "purchase");
              setPartyId("");
              setContractId("");
            }}
            options={[
              { value: "sales", label: "Diterima dari pelanggan" },
              { value: "purchase", label: "Dibayar ke supplier" },
            ]}
          />

          <Input
            id="date"
            type="date"
            label="Tanggal"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          <Select
            id="partyId"
            label={isSales ? "Pelanggan" : "Supplier"}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            placeholder={isSales ? "Pilih pelanggan" : "Pilih supplier"}
            options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
            required
          />

          <div>
            <Select
              id="contractId"
              label="Kontrak (opsional)"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              options={[
                { value: "", label: "— Tidak ditautkan —" },
                ...contracts.map((c) => ({
                  value: String(c.id),
                  label: `${c.contractNo} · ${c.buyer}`,
                })),
              ]}
            />
            <p className="mt-1 text-xs text-gray-500">
              Menautkan uang muka ke kontrak hanya untuk penelusuran. Kompensasi tetap
              dilakukan ke faktur saat faktur terbit.
            </p>
          </div>

          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            className="text-right tabular-nums"
            label="Jumlah"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <div />

          <CurrencyRateFields
            currency={currency}
            rate={rate}
            onCurrencyChange={setCurrency}
            onRateChange={setRate}
            rateHint="Wajib untuk mata uang asing. Uang muka dicatat di buku besar dengan kurs ini, dan selisihnya terhadap kurs faktur nanti menjadi laba/rugi selisih kurs."
          />

          <div className="sm:col-span-2">
            <Input
              id="note"
              label="Catatan (opsional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        {baseValue != null && currency !== "IDR" && (
          <p className="mt-4 text-sm text-gray-600 tabular-nums">
            Nilai di buku besar:{" "}
            <strong className="text-gray-900">{formatCurrency(baseValue, "IDR")}</strong>
          </p>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {isSales ? (
              <>
                Uang masuk ke kas/bank dan dicatat sebagai{" "}
                <strong>Uang Muka Penjualan</strong> — sebuah <em>kewajiban</em>, karena
                barangnya belum dikirim. <strong>Belum</strong> dihitung sebagai
                penjualan.
              </>
            ) : (
              <>
                Uang keluar dari kas/bank dan dicatat sebagai{" "}
                <strong>Uang Muka Pembelian</strong> — sebuah <em>aset</em>, karena
                barangnya belum diterima. <strong>Belum</strong> dihitung sebagai beban.
              </>
            )}
          </span>
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="cursor-pointer">
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
          Simpan Uang Muka
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => router.push("/advances")}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
