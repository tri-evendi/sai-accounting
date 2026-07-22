"use client";

/**
 * Recording an advance (issue #26).
 *
 * The direction is picked first and everything downstream follows from it —
 * which party list to show, and the plain-language explanation of where the
 * money will land. Accounting terms ("kewajiban", "Uang Muka Penjualan") appear
 * as supporting text next to a task-language label, per the MASTER.md rule about
 * not putting raw jargon on the surface.
 *
 * Issue #41 embeds this same form in the supplier screen, where the direction
 * and the party are already known. `locked` is what makes that possible: the two
 * questions the context has already answered are stated as fact instead of asked
 * again, and everything else — the currency/rate discipline, the ledger preview,
 * the error handling, the endpoint — is the one implementation. A second inline
 * "quick advance" form would be a second place for the FX rules to drift.
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

const PlainShell = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-border p-4">{children}</div>
);

const CardShell = ({ children }: { children: React.ReactNode }) => (
  <Card className="p-6">{children}</Card>
);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Direction and party already settled by the surrounding screen (issue #41).
 * Both or neither — a locked direction with a free party list would let a
 * supplier page record an advance against a customer.
 */
export interface LockedParty {
  type: "sales" | "purchase";
  party: PartyOption;
}

export function AdvanceForm({
  customers = [],
  suppliers = [],
  contracts,
  locked,
  onSaved,
  onCancel,
}: {
  customers?: PartyOption[];
  suppliers?: PartyOption[];
  contracts: ContractOption[];
  locked?: LockedParty;
  /** Called instead of navigating to /advances. Embedded callers close and refresh. */
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [type, setType] = useState<"sales" | "purchase">(locked?.type ?? "sales");
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
  // The one id the request must carry, wherever it came from.
  const effectivePartyId = locked ? locked.party.id : Number(partyId);
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
          customerId: isSales ? effectivePartyId : undefined,
          supplierId: isSales ? undefined : effectivePartyId,
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
      if (onSaved) {
        // Embedded: the user is mid-task on another screen, so stay put and let
        // the server component re-read the balances that just changed.
        setAmount("");
        setRate("");
        setNote("");
        onSaved();
      } else {
        router.push("/advances");
      }
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  // Embedded, the form already sits inside the host page's Card — nesting a
  // second one just draws a box in a box. Both shells are module-level so their
  // identity is stable across renders: a component defined inside the body is a
  // NEW type every keystroke, which remounts the whole subtree and takes the
  // focus out of the field being typed in.
  const Shell = locked ? PlainShell : CardShell;

  return (
    <form onSubmit={handleSubmit} className={locked ? "space-y-4" : "space-y-6"}>
      <Shell>
        <div className="grid gap-4 sm:grid-cols-2">
          {locked ? (
            /* Stated, not asked — but stated in full, so the user can see what
               they are about to record without leaving the page. */
            <div className="sm:col-span-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
              <span className="font-medium text-foreground">
                {isSales ? "Diterima dari pelanggan" : "Dibayar ke supplier"}
              </span>{" "}
              · {locked.party.name}
            </div>
          ) : (
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
          )}

          <Input
            id="date"
            type="date"
            label="Tanggal"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          {!locked && (
            <Select
              id="partyId"
              label={isSales ? "Pelanggan" : "Supplier"}
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              placeholder={isSales ? "Pilih pelanggan" : "Pilih supplier"}
              options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
              required
            />
          )}

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
            <p className="mt-1 text-xs text-muted-foreground">
              Menautkan uang muka ke kontrak hanya untuk penelusuran. Kompensasi tetap
              dilakukan ke {isSales ? "faktur saat faktur terbit" : "pembelian saat barang diterima"}.
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
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            Nilai di buku besar:{" "}
            <strong className="text-foreground">{formatCurrency(baseValue, "IDR")}</strong>
          </p>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
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
          <p className="mt-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
            {error}
          </p>
        )}
      </Shell>

      <div className="flex gap-2">
        <Button
          type="submit"
          size={locked ? "sm" : undefined}
          disabled={saving}
          className="cursor-pointer"
        >
          {saving && (
            <Loader2
              className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          Simpan Uang Muka
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={locked ? "sm" : undefined}
          className="cursor-pointer"
          onClick={() => (onCancel ? onCancel() : router.push("/advances"))}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
