"use client";

/**
 * Catat Transaksi Kas & Bank — formulir ringkas (issue #4) + pencegahan
 * salah-isi berbahasa manusia (issue #6).
 *
 * Yang tampak sejak awal hanyalah pertanyaan yang selalu ada jawabannya: kas
 * mana, tanggal berapa, untuk apa, berapa masuk/keluar, dan masuk kategori apa.
 * Mata uang asing (+ kursnya) dan catatan pindah ke "Detail lengkap" yang
 * terlipat — mayoritas transaksi harian rupiah tidak pernah perlu menyentuhnya,
 * tetapi begitu mata uangnya diubah, kursnya WAJIB, dan penolakan server untuk
 * kurs kosong membuka kembali bagian itu lalu memfokuskan isiannya.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, BookText, Info, Lock } from "lucide-react";
import { PageLoader } from "@/components/ui/loading";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { DisclosureSection, focusFormField } from "@/components/ui/disclosure-section";
import { cn } from "@/lib/utils";
import { CASH_TYPE_LABELS, type CashType } from "@/lib/constants";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { resolveSubmitFailure } from "@/lib/form-sections";
import { closedPeriodIssue, negativeValueIssue, type ClosedPeriodRef } from "@/lib/form-guards";

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

function NewTransactionForm({ closedPeriods }: { closedPeriods: ClosedPeriodRef[] }) {
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
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedInvalid, setAdvancedInvalid] = useState(false);

  const isForeign = currency !== BASE_CURRENCY;
  const value = Number(debit) > 0 ? Number(debit) : Number(credit);
  const baseValue = isForeign ? value * (Number(rate) || 0) : value;
  const periodIssue = closedPeriodIssue(date, closedPeriods, "Tanggal transaksi");

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

  /** Tampilkan galat, buka bagian yang menyembunyikannya, lalu fokuskan isiannya. */
  function reportFailure(message: string, field: string | null, inAdvanced: boolean) {
    setError(message);
    setAdvancedInvalid(inAdvanced);
    if (inAdvanced) setAdvancedOpen(true);
    if (field) requestAnimationFrame(() => focusFormField(field));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setAdvancedInvalid(false);

    const formData = new FormData(e.currentTarget);
    const debitVal = Number(formData.get("debit")) || 0;
    const creditVal = Number(formData.get("credit")) || 0;

    // ── Penjaga sebelum kirim (cermin dari penjaga server) ──
    if (periodIssue) {
      reportFailure(periodIssue, "date", false);
      return;
    }
    const negative = negativeValueIssue([
      { field: "debit", value: debitVal },
      { field: "credit", value: creditVal },
      { field: "rate", value: Number(formData.get("rate")) },
    ]);
    if (negative) {
      reportFailure(negative.message, negative.field, negative.field === "rate");
      return;
    }
    if (debitVal === 0 && creditVal === 0) {
      reportFailure(
        accountantOn
          ? "Isi salah satu: Uang Masuk (debit) atau Uang Keluar (kredit). Salah satunya harus lebih dari 0."
          : "Isi salah satu: Uang Masuk atau Uang Keluar. Salah satunya harus lebih dari 0.",
        "debit",
        false
      );
      return;
    }
    if (debitVal > 0 && creditVal > 0) {
      reportFailure(
        "Satu transaksi hanya boleh satu arah: isi Uang Masuk saja, atau Uang Keluar saja. " +
          "Bila uang memang berpindah antar kas, catat dua transaksi terpisah.",
        "debit",
        false
      );
      return;
    }

    const counterAccountIdVal = Number(formData.get("counterAccountId")) || 0;
    if (!counterAccountIdVal) {
      reportFailure(
        accountantOn
          ? "Pilih akun lawan — jurnal otomatis membutuhkan sisi kedua transaksi."
          : "Pilih kategori — dari mana uang ini datang atau untuk apa dipakai.",
        "counterAccountId",
        false
      );
      return;
    }
    if (isForeign && !(Number(formData.get("rate")) > 0)) {
      reportFailure(
        `Kurs wajib diisi untuk transaksi ${currency}: tanpa kurs, nilai rupiah di buku besar tidak bisa dihitung.`,
        "rate",
        true
      );
      return;
    }

    setLoading(true);
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
      const data = await res.json().catch(() => null);
      const failure = resolveSubmitFailure("kas", data, "Transaksi belum bisa disimpan.");
      setLoading(false);
      reportFailure(failure.message, failure.field, failure.section === "lanjutan");
    } else {
      router.push("/finance");
      router.refresh();
    }
  }

  /** Ringkasan isian lanjutan supaya nilainya tidak ikut hilang saat terlipat. */
  const advancedSummary = [
    isForeign ? `${currency} · kurs ${Number(rate) > 0 ? rate : "belum diisi"}` : "Rupiah (IDR)",
    note.trim() ? "ada catatan" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          <TermTooltip term="kas_bank">{heading.title}</TermTooltip>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{heading.description}</p>
        <LearnMore term="kas_bank" className="mt-1" label="Pelajari ini: kas & bank" />
      </header>

      {error && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Rincian Transaksi</CardTitle>
          </CardHeader>
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
              <div>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  label="Tanggal"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                {periodIssue && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-destructive-strong" role="alert">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{periodIssue}</span>
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Input id="description" name="description" label="Keterangan" required />
              </div>

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
                    arah === "masuk" && "border-success ring-1 ring-success"
                  )}
                  label={accountantOn ? "Debit — Uang Masuk" : "Uang Masuk"}
                  value={debit}
                  onChange={(e) => setDebit(e.target.value)}
                />
                <p className="mt-1 flex items-center gap-1 text-xs text-success-strong">
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
                    arah === "keluar" && "border-destructive ring-1 ring-destructive"
                  )}
                  label={accountantOn ? "Kredit — Uang Keluar" : "Uang Keluar"}
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                />
                <p className="mt-1 flex items-center gap-1 text-xs text-destructive-strong">
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
                <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
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
            </div>

            {value > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Nilai dasar (IDR)</span>
                <span className="font-medium text-foreground tabular-nums">
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
              <div className="mt-4 rounded-md border border-border bg-white">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium text-foreground">
                  <BookText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Lihat jurnal — pratinjau
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-medium">Akun</th>
                      <th className="px-3 py-1.5 text-right font-medium">Debit</th>
                      <th className="px-3 py-1.5 text-right font-medium">Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalPreview.map((line, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 text-foreground">{line.account}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {line.debit > 0
                            ? new Intl.NumberFormat("id-ID").format(line.debit)
                            : "-"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {line.credit > 0
                            ? new Intl.NumberFormat("id-ID").format(line.credit)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Jurnal dibuat otomatis saat transaksi disimpan. Nilai dalam {currency}.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Detail lengkap (issue #4) — tertutup secara default ── */}
        <DisclosureSection
          className="mb-6"
          description="Mata uang selain rupiah (beserta kursnya) dan catatan tambahan. Transaksi rupiah biasa tidak perlu membukanya."
          summary={advancedSummary}
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          invalid={advancedInvalid}
        >
          <div className="grid gap-4 sm:grid-cols-2">
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
                  label={
                    <TermTooltip term="kurs">{`Kurs 1 ${currency} ke IDR`}</TermTooltip>
                  }
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Wajib untuk mata uang asing — nilai IDR di buku besar dihitung dari kurs ini.
                </p>
              </div>
            ) : (
              <div />
            )}
            <div className="sm:col-span-2">
              <Input
                id="note"
                name="note"
                label="Catatan (opsional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </DisclosureSection>

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
export function NewTransactionClient({ closedPeriods }: { closedPeriods: ClosedPeriodRef[] }) {
  return (
    <Suspense fallback={<PageLoader message="Menyiapkan formulir..." />}>
      <NewTransactionForm closedPeriods={closedPeriods} />
    </Suspense>
  );
}
