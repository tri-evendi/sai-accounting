"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownLeft, ArrowUpRight, Info } from "lucide-react";

interface AccountOption {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

const BASE_CURRENCY = "IDR";

export default function NewTransactionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  // Drives which extra fields the accounting engine needs from the user.
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [debit, setDebit] = useState("0");
  const [credit, setCredit] = useState("0");
  const [rate, setRate] = useState("");

  const isForeign = currency !== BASE_CURRENCY;
  const value = Number(debit) > 0 ? Number(debit) : Number(credit);
  const baseValue = isForeign ? value * (Number(rate) || 0) : value;

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      const res = await fetch("/api/accounts");
      if (!res.ok || cancelled) return;
      const data: AccountOption[] = await res.json();
      setAccounts(data.filter((a) => a.isActive));
    }

    void loadAccounts();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const debitVal = Number(formData.get("debit")) || 0;
    const creditVal = Number(formData.get("credit")) || 0;

    if (debitVal === 0 && creditVal === 0) {
      setError("Isi salah satu: Uang Masuk (debit) atau Uang Keluar (kredit).");
      setLoading(false);
      return;
    }

    const counterAccountId = Number(formData.get("counterAccountId")) || 0;
    if (!counterAccountId) {
      setError("Pilih akun lawan — jurnal otomatis membutuhkan sisi kedua transaksi.");
      setLoading(false);
      return;
    }

    const body = {
      type: formData.get("type"),
      date: formData.get("date"),
      description: formData.get("description"),
      currency: formData.get("currency"),
      debit: debitVal,
      credit: creditVal,
      counterAccountId,
      rate: isForeign ? Number(formData.get("rate")) || undefined : undefined,
      note: formData.get("note") || undefined,
    };

    const res = await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const detail = data.details?.fieldErrors;
      const fieldMsg = detail
        ? Object.values(detail).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || "Gagal menyimpan transaksi"));
      setLoading(false);
    } else {
      router.push("/finance");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Transaction</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Transaction Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="type" name="type" label="Account Type"
                options={[
                  { value: "bank", label: "Bank" },
                  { value: "kas_besar", label: "Kas Besar (Large Cash)" },
                  { value: "kas_kecil", label: "Kas Kecil (Small Cash)" },
                ]}
              />
              <Input
                id="date"
                name="date"
                type="date"
                label="Date"
                defaultValue={new Date().toISOString().split("T")[0]}
                required
              />
              <div className="sm:col-span-2">
                <Input id="description" name="description" label="Description" required />
              </div>
              <Select
                id="currency" name="currency" label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: "IDR", label: "IDR (Rupiah)" },
                  { value: "USD", label: "USD" },
                  { value: "CNY", label: "CNY" },
                ]}
              />
              {isForeign ? (
                <div>
                  <Input
                    id="rate"
                    name="rate"
                    type="number"
                    step="0.000001"
                    min="0"
                    className="text-right tabular-nums"
                    label={`Kurs 1 ${currency} ke IDR`}
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Wajib untuk mata uang asing — nilai IDR di buku besar dihitung dari kurs ini.
                  </p>
                </div>
              ) : (
                <div />
              )}

              <div>
                <Input
                  id="debit"
                  name="debit"
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right tabular-nums"
                  label="Debit — Uang Masuk (In)"
                  value={debit}
                  onChange={(e) => setDebit(e.target.value)}
                />
                <p className="mt-1 flex items-center gap-1 text-xs text-green-700">
                  <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Menambah saldo kas/bank</span>
                </p>
              </div>
              <div>
                <Input
                  id="credit"
                  name="credit"
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right tabular-nums"
                  label="Credit — Uang Keluar (Out)"
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                />
                <p className="mt-1 flex items-center gap-1 text-xs text-red-700">
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Mengurangi saldo kas/bank</span>
                </p>
              </div>

              <div className="sm:col-span-2">
                <Select
                  id="counterAccountId"
                  name="counterAccountId"
                  label="Akun Lawan (Counter Account)"
                  placeholder="-- Pilih akun lawan --"
                  defaultValue=""
                  options={accounts.map((a) => ({
                    value: String(a.id),
                    label: `${a.code} — ${a.name}`,
                  }))}
                  required
                />
                <p className="mt-1 flex items-start gap-1 text-xs text-gray-500">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Sisi kedua dari jurnal otomatis: dari mana uang ini datang, atau untuk apa
                    uang ini dipakai (mis. <em>Beban Listrik</em>, <em>Piutang Usaha</em>).
                  </span>
                </p>
              </div>

              <div className="sm:col-span-2">
                <Input id="note" name="note" label="Note (optional)" />
              </div>
            </div>

            {value > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Nilai dasar (IDR)</span>
                <span className="font-medium text-gray-900 tabular-nums">
                  {isForeign && !Number(rate)
                    ? "— isi kurs dulu"
                    : new Intl.NumberFormat("id-ID", {
                        style: "currency",
                        currency: "IDR",
                        maximumFractionDigits: 0,
                      }).format(baseValue)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Create Transaction"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/finance")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
