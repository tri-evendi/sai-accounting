"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownLeft, ArrowUpRight, Info, BookText } from "lucide-react";
import { PageLoader } from "@/components/ui/loading";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { cn } from "@/lib/utils";
import { CASH_TYPE_LABELS, type CashType } from "@/lib/constants";
import { effectiveAccountantMode } from "@/lib/accountant-mode";

interface AccountOption {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

const BASE_CURRENCY = "IDR";

/**
 * Judul & fokus awal mengikuti aksi cepat yang mengantar ke sini (issue #2):
 * `?arah=masuk` datang dari "Terima Uang", `?arah=keluar` dari "Bayar".
 * Pengaruhnya MURNI tampilan — isian, muatan POST, dan mesin jurnal tidak
 * berubah sedikit pun; kedua kolom tetap bisa diisi seperti biasa.
 */
const ARAH_HEADINGS = {
  masuk: {
    title: "Terima Uang",
    description: "Catat uang yang masuk ke kas atau rekening bank.",
  },
  keluar: {
    title: "Bayar",
    description: "Catat uang yang keluar dari kas atau rekening bank.",
  },
  default: {
    title: "Catat Transaksi Kas & Bank",
    description: "Catat uang masuk atau uang keluar beserta kategorinya.",
  },
} as const;

function NewTransactionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const arahParam = searchParams.get("arah");
  const arah = arahParam === "masuk" || arahParam === "keluar" ? arahParam : null;
  const heading = ARAH_HEADINGS[arah ?? "default"];
  const { data: session } = useSession();
  // issue #11 — when Mode Akuntan is OFF we hide debit/kredit terminology; when
  // ON we keep it and add a read-only "Lihat jurnal" preview. Display-only: the
  // POST payload and posting engine are identical either way.
  const accountantOn = effectiveAccountantMode({
    role: session?.user?.role,
    accountantMode: session?.user?.accountantMode,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  // Drives which extra fields the accounting engine needs from the user.
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [type, setType] = useState<CashType>("bank");
  const [counterAccountId, setCounterAccountId] = useState("");
  const [debit, setDebit] = useState("0");
  const [credit, setCredit] = useState("0");
  const [rate, setRate] = useState("");

  const isForeign = currency !== BASE_CURRENCY;
  const value = Number(debit) > 0 ? Number(debit) : Number(credit);
  const baseValue = isForeign ? value * (Number(rate) || 0) : value;

  // "Lihat jurnal" preview (issue #11) — mirrors buildCashTransactionLines
  // exactly (money in: D Kas/Bank, K akun lawan; money out: the reverse). It
  // RENDERS what the engine already computes; it introduces no posting rule.
  const counterAccount = accounts.find((a) => String(a.id) === counterAccountId);
  const isMoneyIn = Number(debit) > 0;
  const cashSideLabel = `${CASH_TYPE_LABELS[type]} (Kas/Bank)`;
  const journalPreview =
    value > 0 && counterAccount
      ? isMoneyIn
        ? [
            { account: cashSideLabel, debit: value, credit: 0 },
            { account: `${counterAccount.code} — ${counterAccount.name}`, debit: 0, credit: value },
          ]
        : [
            { account: `${counterAccount.code} — ${counterAccount.name}`, debit: value, credit: 0 },
            { account: cashSideLabel, debit: 0, credit: value },
          ]
      : null;

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
      setError(
        accountantOn
          ? "Isi salah satu: Uang Masuk (debit) atau Uang Keluar (kredit)."
          : "Isi salah satu: Uang Masuk atau Uang Keluar."
      );
      setLoading(false);
      return;
    }

    const counterAccountIdVal = Number(formData.get("counterAccountId")) || 0;
    if (!counterAccountIdVal) {
      setError(
        accountantOn
          ? "Pilih akun lawan — jurnal otomatis membutuhkan sisi kedua transaksi."
          : "Pilih kategori — dari mana uang ini datang atau untuk apa dipakai."
      );
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
      counterAccountId: counterAccountIdVal,
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
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <TermTooltip term="kas_bank">{heading.title}</TermTooltip>
        </h1>
        <p className="mt-1 text-sm text-gray-500">{heading.description}</p>
        <LearnMore term="kas_bank" className="mt-1" label="Pelajari ini: kas & bank" />
      </header>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Rincian Transaksi</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="type" name="type" label="Jenis Kas"
                value={type}
                onChange={(e) => setType(e.target.value as CashType)}
                options={[
                  { value: "bank", label: "Bank" },
                  { value: "kas_besar", label: "Kas Besar" },
                  { value: "kas_kecil", label: "Kas Kecil" },
                ]}
              />
              <Input
                id="date"
                name="date"
                type="date"
                label="Tanggal"
                defaultValue={new Date().toISOString().split("T")[0]}
                required
              />
              <div className="sm:col-span-2">
                <Input id="description" name="description" label="Keterangan" required />
              </div>
              <Select
                id="currency" name="currency" label="Mata Uang"
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
                  autoFocus={arah === "masuk"}
                  className={cn(
                    "text-right tabular-nums",
                    arah === "masuk" && "border-green-500 ring-1 ring-green-500"
                  )}
                  label={accountantOn ? "Debit — Uang Masuk" : "Uang Masuk"}
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
                  autoFocus={arah === "keluar"}
                  className={cn(
                    "text-right tabular-nums",
                    arah === "keluar" && "border-red-500 ring-1 ring-red-500"
                  )}
                  label={accountantOn ? "Kredit — Uang Keluar" : "Uang Keluar"}
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
                  label={accountantOn ? "Akun Lawan (jurnal otomatis)" : "Kategori"}
                  placeholder={accountantOn ? "-- Pilih akun lawan --" : "-- Pilih kategori --"}
                  value={counterAccountId}
                  onChange={(e) => setCounterAccountId(e.target.value)}
                  options={accounts.map((a) => ({
                    value: String(a.id),
                    label: `${a.code} — ${a.name}`,
                  }))}
                  required
                />
                <p className="mt-1 flex items-start gap-1 text-xs text-gray-500">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {accountantOn ? (
                      <>
                        Sisi kedua dari jurnal otomatis: dari mana uang ini datang, atau untuk apa
                        uang ini dipakai (mis. <em>Beban Listrik</em>, <em>Piutang Usaha</em>).
                      </>
                    ) : (
                      <>
                        Dari mana uang ini datang, atau untuk apa uang ini dipakai (mis.{" "}
                        <em>Beban Listrik</em>, <em>Piutang Usaha</em>).
                      </>
                    )}
                  </span>
                </p>
              </div>

              <div className="sm:col-span-2">
                <Input id="note" name="note" label="Catatan (opsional)" />
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

            {/* issue #11 — "Lihat jurnal": read-only preview of the entry the
                posting engine will create for this cash transaction. Shown only
                in Mode Akuntan; it renders the engine's own rule, changing
                nothing about what is posted. */}
            {accountantOn && journalPreview && (
              <div className="mt-4 rounded-md border border-gray-200 bg-white">
                <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm font-medium text-gray-700">
                  <BookText className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  Lihat jurnal — pratinjau
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-1.5 text-left font-medium">Akun</th>
                      <th className="px-3 py-1.5 text-right font-medium">Debit</th>
                      <th className="px-3 py-1.5 text-right font-medium">Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalPreview.map((line, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-800">{line.account}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-800">
                          {line.debit > 0
                            ? new Intl.NumberFormat("id-ID").format(line.debit)
                            : "-"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-800">
                          {line.credit > 0
                            ? new Intl.NumberFormat("id-ID").format(line.credit)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-3 py-2 text-xs text-gray-500">
                  Jurnal dibuat otomatis saat transaksi disimpan. Nilai dalam {currency}.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" className="cursor-pointer" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Transaksi"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="cursor-pointer"
            onClick={() => router.push("/finance")}
          >
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * `useSearchParams` harus berada di dalam batas <Suspense> (lihat dokumen
 * Next.js `use-search-params`), jadi formulirnya dibungkus di sini.
 */
export default function NewTransactionPage() {
  return (
    <Suspense fallback={<PageLoader message="Menyiapkan formulir..." />}>
      <NewTransactionForm />
    </Suspense>
  );
}
