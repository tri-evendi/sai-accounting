"use client";

/**
 * Setup wizard (issue #20) — company identity → base currency + fiscal year →
 * confirm the seeded COA → opening balances → review & post.
 *
 * The Modal/Ekuitas line is the BALANCING FIGURE: the user enters assets (kas,
 * piutang, persediaan) and liabilities (utang), and equity is derived so the
 * opening journal always balances (Σ debit = Σ credit in IDR base). The running
 * "Aset = Kewajiban + Modal" panel shows that figure live before saving, and the
 * server re-derives and re-checks it (`assertBalanced`) — the client preview is
 * never the authority. A foreign balance with no rate is refused, here and again
 * on the server, rather than valued 1:1.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Info, Plus, Trash2, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";

interface CashAccount {
  id: number;
  code: string;
  name: string;
  currency: string;
}
interface Party {
  id: number;
  name: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const baseOf = (amount: number, rate: number) => round2(round2(amount) * rate);

let uid = 0;
const nextId = () => ++uid;

interface CashRow {
  key: number;
  accountId: string;
  amount: string;
  rate: string;
}
interface PartnerRow {
  key: number;
  partnerId: string;
  currency: string;
  amount: string;
  rate: string;
}

const STEPS = ["Identitas", "Mata Uang & Tahun Buku", "Bagan Akun", "Saldo Awal", "Tinjau"];

export function SetupWizard({
  defaults,
  currencies,
  coaCount,
  cashAccounts,
  customers,
  suppliers,
}: {
  defaults: { name: string; address: string; baseCurrency: string };
  currencies: string[];
  coaCount: number;
  cashAccounts: CashAccount[];
  customers: Party[];
  suppliers: Party[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1–2: identity + settings
  const [name, setName] = useState(defaults.name);
  const [address, setAddress] = useState(defaults.address);
  // Seller NPWP for e-Faktur (issue #17) — optional at setup, editable later.
  const [npwp, setNpwp] = useState("");
  const [baseCurrency, setBaseCurrency] = useState(defaults.baseCurrency);
  const [fiscalYearStart, setFiscalYearStart] = useState(`${new Date().getFullYear()}-01-01`);

  // Step 4: opening balances
  const [cash, setCash] = useState<CashRow[]>([]);
  const [receivables, setReceivables] = useState<PartnerRow[]>([]);
  const [payables, setPayables] = useState<PartnerRow[]>([]);
  const [inventory, setInventory] = useState("");

  const cashById = useMemo(
    () => new Map(cashAccounts.map((a) => [String(a.id), a])),
    [cashAccounts]
  );

  // ── Live totals (IDR base) ──
  const totals = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    let unrated = 0; // foreign rows missing a rate

    for (const r of cash) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      const acc = cashById.get(r.accountId);
      const cur = acc?.currency ?? "IDR";
      if (cur === "IDR") assets = round2(assets + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) assets = round2(assets + baseOf(amt, rate));
        else unrated++;
      }
    }
    for (const r of receivables) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      if (r.currency === "IDR") assets = round2(assets + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) assets = round2(assets + baseOf(amt, rate));
        else unrated++;
      }
    }
    const inv = Number(inventory) || 0;
    if (inv > 0) assets = round2(assets + baseOf(inv, 1));

    for (const r of payables) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      if (r.currency === "IDR") liabilities = round2(liabilities + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) liabilities = round2(liabilities + baseOf(amt, rate));
        else unrated++;
      }
    }

    const equity = round2(assets - liabilities);
    const hasAny = assets > 0 || liabilities > 0;
    return { assets, liabilities, equity, unrated, hasAny };
  }, [cash, receivables, payables, inventory, cashById]);

  function updateCash(key: number, patch: Partial<CashRow>) {
    setCash((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function updatePartner(
    setter: React.Dispatch<React.SetStateAction<PartnerRow[]>>,
    key: number,
    patch: Partial<PartnerRow>
  ) {
    setter((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setError(null);
    if (!totals.hasAny) {
      setError("Isi minimal satu saldo awal (kas/bank, piutang, utang, atau persediaan).");
      return;
    }
    if (totals.unrated > 0) {
      setError("Ada saldo mata uang asing tanpa kurs. Isi kursnya agar nilai IDR tidak salah.");
      return;
    }
    setSaving(true);

    const payload = {
      company: {
        name,
        address: address || undefined,
        baseCurrency,
        fiscalYearStart,
        npwp: npwp || undefined,
      },
      cash: cash
        .filter((r) => r.accountId && (Number(r.amount) || 0) > 0)
        .map((r) => {
          const cur = cashById.get(r.accountId)?.currency ?? "IDR";
          return {
            accountId: Number(r.accountId),
            currency: cur,
            amount: Number(r.amount),
            ...(cur !== "IDR" ? { rate: Number(r.rate) } : {}),
          };
        }),
      receivables: receivables
        .filter((r) => r.partnerId && (Number(r.amount) || 0) > 0)
        .map((r) => ({
          partnerId: Number(r.partnerId),
          currency: r.currency,
          amount: Number(r.amount),
          ...(r.currency !== "IDR" ? { rate: Number(r.rate) } : {}),
        })),
      payables: payables
        .filter((r) => r.partnerId && (Number(r.amount) || 0) > 0)
        .map((r) => ({
          partnerId: Number(r.partnerId),
          currency: r.currency,
          amount: Number(r.amount),
          ...(r.currency !== "IDR" ? { rate: Number(r.rate) } : {}),
        })),
      inventory: Number(inventory) || 0,
    };

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors
          ? Object.values(fieldErrors).flat().find(Boolean)
          : undefined;
        setError(first ?? data?.error ?? "Gagal menyimpan saldo awal.");
        return;
      }
      toast("Setup selesai. Jurnal pembuka tersimpan dan seimbang.", "success");
      router.push("/reports");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && !!baseCurrency && !!fiscalYearStart) ||
    step === 2 ||
    step === 3;

  const currencyOptions = currencies.map((c) => ({ value: c, label: c }));

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Langkah setup">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              "flex items-center gap-2 rounded-md px-3 py-1.5 " +
              (i === step
                ? "bg-blue-600 text-white"
                : i < step
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-500")
            }
          >
            {i < step ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <span className="tabular-nums">{i + 1}.</span>
            )}
            {label}
          </li>
        ))}
      </ol>

      <Card className="p-6">
        {/* Step 0 — identity */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Identitas Perusahaan</h2>
            <Input
              id="name"
              label="Nama perusahaan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              required
            />
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                Alamat
              </label>
              <textarea
                id="address"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={1000}
              />
            </div>
            <Input
              id="npwp"
              label="NPWP (untuk e-Faktur)"
              value={npwp}
              onChange={(e) => setNpwp(e.target.value)}
              maxLength={30}
              placeholder="Opsional — bisa diisi nanti"
            />
          </div>
        )}

        {/* Step 1 — base currency + fiscal year */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Mata Uang &amp; Tahun Buku</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="baseCurrency"
                label="Mata uang dasar (pelaporan)"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                options={currencyOptions}
              />
              <Input
                id="fiscalYearStart"
                type="date"
                label="Awal tahun buku"
                value={fiscalYearStart}
                onChange={(e) => setFiscalYearStart(e.target.value)}
                required
              />
            </div>
            <p className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Buku besar dicatat dalam <strong>IDR</strong> sebagai mata uang dasar. Jurnal
                pembuka akan ditanggali pada awal tahun buku, sebelum transaksi pertama.
              </span>
            </p>
          </div>
        )}

        {/* Step 2 — confirm COA */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Bagan Akun (COA)</h2>
            <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <span>
                Bagan akun standar (trading/ekspor) sudah tersedia:{" "}
                <strong className="tabular-nums">{coaCount}</strong> akun aktif. Saldo awal
                di langkah berikutnya akan menggunakan akun-akun ini.
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Anda dapat meninjau atau menyesuaikan akun di menu Akun Perkiraan kapan saja.
            </p>
          </div>
        )}

        {/* Step 3 — opening balances */}
        {step === 3 && (
          <div className="space-y-8">
            <h2 className="text-lg font-semibold text-gray-900">Saldo Awal</h2>

            {/* Kas / Bank */}
            <Section
              title="Kas & Bank"
              hint="Saldo kas dan rekening bank per awal tahun buku."
              onAdd={() =>
                cashAccounts.length > 0 &&
                setCash((r) => [...r, { key: nextId(), accountId: "", amount: "", rate: "" }])
              }
              addLabel="Tambah kas/bank"
              empty={cashAccounts.length === 0 ? "Belum ada akun kas/bank di COA." : undefined}
            >
              {cash.map((row) => {
                const acc = cashById.get(row.accountId);
                const foreign = acc && acc.currency !== "IDR";
                return (
                  <div key={row.key} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-5">
                      <Select
                        id={`cash-acc-${row.key}`}
                        label="Akun"
                        value={row.accountId}
                        onChange={(e) => updateCash(row.key, { accountId: e.target.value })}
                        placeholder="Pilih akun"
                        options={cashAccounts.map((a) => ({
                          value: String(a.id),
                          label: `${a.code} · ${a.name} (${a.currency})`,
                        }))}
                      />
                    </div>
                    <div className={foreign ? "sm:col-span-3" : "sm:col-span-6"}>
                      <Input
                        id={`cash-amt-${row.key}`}
                        type="number"
                        step="0.01"
                        min="0"
                        className="text-right tabular-nums"
                        label={`Saldo${acc ? ` (${acc.currency})` : ""}`}
                        value={row.amount}
                        onChange={(e) => updateCash(row.key, { amount: e.target.value })}
                      />
                    </div>
                    {foreign && (
                      <div className="sm:col-span-3">
                        <Input
                          id={`cash-rate-${row.key}`}
                          type="number"
                          step="0.000001"
                          min="0"
                          className="text-right tabular-nums"
                          label="Kurs → IDR"
                          value={row.rate}
                          onChange={(e) => updateCash(row.key, { rate: e.target.value })}
                        />
                      </div>
                    )}
                    <div className="sm:col-span-1 flex justify-end">
                      <RemoveButton
                        onClick={() => setCash((r) => r.filter((x) => x.key !== row.key))}
                      />
                    </div>
                  </div>
                );
              })}
            </Section>

            {/* Piutang */}
            <PartnerSection
              title="Piutang Usaha (per pelanggan)"
              hint="Tagihan yang masih harus diterima dari tiap pelanggan."
              rows={receivables}
              setRows={setReceivables}
              parties={customers}
              partyLabel="Pelanggan"
              currencies={currencyOptions}
              onUpdate={(k, p) => updatePartner(setReceivables, k, p)}
            />

            {/* Persediaan */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Persediaan</h3>
              <p className="mb-2 text-xs text-gray-500">
                Nilai persediaan barang dagang (IDR) per awal tahun buku.
              </p>
              <div className="sm:w-1/2">
                <Input
                  id="inventory"
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right tabular-nums"
                  label="Nilai persediaan (IDR)"
                  value={inventory}
                  onChange={(e) => setInventory(e.target.value)}
                />
              </div>
            </div>

            {/* Utang */}
            <PartnerSection
              title="Hutang Usaha (per supplier)"
              hint="Kewajiban yang masih harus dibayar ke tiap supplier."
              rows={payables}
              setRows={setPayables}
              parties={suppliers}
              partyLabel="Supplier"
              currencies={currencyOptions}
              onUpdate={(k, p) => updatePartner(setPayables, k, p)}
            />

            <BalancePanel totals={totals} />
          </div>
        )}

        {/* Step 4 — review */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Tinjau &amp; Simpan</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-gray-500">Perusahaan</dt>
                <dd className="text-gray-900">{name}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Awal tahun buku</dt>
                <dd className="text-gray-900 tabular-nums">{fiscalYearStart}</dd>
              </div>
            </dl>
            <BalancePanel totals={totals} />
            <p className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Menyimpan akan membuat <strong>satu jurnal pembuka</strong> yang seimbang dan
                menandai perusahaan sudah disiapkan. Langkah ini tidak dapat diulang.
              </span>
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </Card>

      {/* Nav */}
      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          disabled={step === 0 || saving}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Kembali
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            className="cursor-pointer"
            disabled={!canNext}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          >
            Lanjut
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            className="cursor-pointer"
            disabled={saving || !totals.hasAny || totals.unrated > 0}
            onClick={handleSubmit}
          >
            {saving && (
              <Loader2
                className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            Simpan &amp; Selesai
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
  onAdd,
  addLabel,
  empty,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
  empty?: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mb-2 text-xs text-gray-500">{hint}</p>
      <div className="space-y-3">{children}</div>
      {empty ? (
        <p className="mt-2 text-xs text-gray-400">{empty}</p>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3 cursor-pointer"
          onClick={onAdd}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

function PartnerSection({
  title,
  hint,
  rows,
  setRows,
  parties,
  partyLabel,
  currencies,
  onUpdate,
}: {
  title: string;
  hint: string;
  rows: PartnerRow[];
  setRows: React.Dispatch<React.SetStateAction<PartnerRow[]>>;
  parties: Party[];
  partyLabel: string;
  currencies: { value: string; label: string }[];
  onUpdate: (key: number, patch: Partial<PartnerRow>) => void;
}) {
  return (
    <Section
      title={title}
      hint={hint}
      addLabel={`Tambah ${partyLabel.toLowerCase()}`}
      empty={parties.length === 0 ? `Belum ada ${partyLabel.toLowerCase()}.` : undefined}
      onAdd={() =>
        parties.length > 0 &&
        setRows((r) => [
          ...r,
          { key: nextId(), partnerId: "", currency: "IDR", amount: "", rate: "" },
        ])
      }
    >
      {rows.map((row) => {
        const foreign = row.currency !== "IDR";
        return (
          <div key={row.key} className="grid gap-2 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-4">
              <Select
                id={`p-${row.key}`}
                label={partyLabel}
                value={row.partnerId}
                onChange={(e) => onUpdate(row.key, { partnerId: e.target.value })}
                placeholder={`Pilih ${partyLabel.toLowerCase()}`}
                options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Select
                id={`c-${row.key}`}
                label="Mata uang"
                value={row.currency}
                onChange={(e) => onUpdate(row.key, { currency: e.target.value })}
                options={currencies}
              />
            </div>
            <div className={foreign ? "sm:col-span-3" : "sm:col-span-5"}>
              <Input
                id={`a-${row.key}`}
                type="number"
                step="0.01"
                min="0"
                className="text-right tabular-nums"
                label="Saldo"
                value={row.amount}
                onChange={(e) => onUpdate(row.key, { amount: e.target.value })}
              />
            </div>
            {foreign && (
              <div className="sm:col-span-2">
                <Input
                  id={`r-${row.key}`}
                  type="number"
                  step="0.000001"
                  min="0"
                  className="text-right tabular-nums"
                  label="Kurs → IDR"
                  value={row.rate}
                  onChange={(e) => onUpdate(row.key, { rate: e.target.value })}
                />
              </div>
            )}
            <div className="sm:col-span-1 flex justify-end">
              <RemoveButton onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))} />
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
      aria-label="Hapus baris"
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function BalancePanel({
  totals,
}: {
  totals: { assets: number; liabilities: number; equity: number; unrated: number; hasAny: boolean };
}) {
  const equityLabel = totals.equity >= 0 ? "Modal/Ekuitas (kredit)" : "Modal/Ekuitas (debit)";
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Total Aset (debit)" value={totals.assets} />
        <Figure label="Total Kewajiban (kredit)" value={totals.liabilities} />
        <Figure label={equityLabel} value={Math.abs(totals.equity)} />
      </div>
      <div className="mt-3 border-t border-gray-200 pt-3 text-sm">
        {totals.unrated > 0 ? (
          <p className="flex items-center gap-2 text-amber-700">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {totals.unrated} saldo mata uang asing belum berkurs — isi kursnya sebelum menyimpan.
            </span>
          </p>
        ) : totals.hasAny ? (
          <p className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="tabular-nums">
              Seimbang: Aset = Kewajiban + Modal/Ekuitas ({formatCurrency(totals.assets, "IDR")})
            </span>
          </p>
        ) : (
          <p className="text-gray-500">Belum ada saldo awal yang diisi.</p>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-gray-900 tabular-nums">
        {formatCurrency(value, "IDR")}
      </p>
    </div>
  );
}
