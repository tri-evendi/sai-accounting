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
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Info, Plus, Trash2, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import { ModulePicker } from "@/components/settings/module-picker";
import {
  BUSINESS_MODULES,
  modulesForCategory,
  normalizeEnabledModules,
  type BusinessCategory,
  type BusinessModule,
} from "@/lib/business-modules";

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
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();

  /**
   * Langkah dirujuk lewat NAMA, bukan angka (issue #99 menyisipkan satu langkah
   * baru di tengah). Angka yang tersebar di JSX membuat penyisipan berikutnya
   * jadi latihan menggeser indeks — dan satu indeks yang lupa digeser adalah
   * langkah yang hilang tanpa galat.
   */
  const STEP_KEYS = ["identity", "modules", "settings", "coa", "balances", "review"] as const;
  const steps = [
    t("setup.step1"),
    t("modules.stepTitle"),
    t("setup.step2"),
    t("setup.step3"),
    t("setup.step4"),
    t("setup.step5"),
  ];

  const [step, setStep] = useState(0);
  const current = STEP_KEYS[step];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1–2: identity + settings
  const [name, setName] = useState(defaults.name);
  const [address, setAddress] = useState(defaults.address);
  // Seller NPWP for e-Faktur (issue #17) — optional at setup, editable later.
  const [npwp, setNpwp] = useState("");
  const [baseCurrency, setBaseCurrency] = useState(defaults.baseCurrency);
  const [fiscalYearStart, setFiscalYearStart] = useState(`${new Date().getFullYear()}-01-01`);

  // Langkah modul (issue #99). Nilai awalnya SEMUA modul menyala: wizard yang
  // diklik lewat begitu saja meninggalkan aplikasi persis seperti sebelum fitur
  // ini ada — kolomnya tersimpan NULL (lihat `serializeEnabledModules`).
  const [category, setCategory] = useState<BusinessCategory | "">("");
  const [modules, setModules] = useState<ReadonlySet<BusinessModule>>(new Set(BUSINESS_MODULES));

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
      setError(t("setup.errNoBalance"));
      return;
    }
    if (totals.unrated > 0) {
      setError(t("setup.errUnrated"));
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
        // Modul usaha (issue #99). Kategori hanya dicatat; yang berlaku adalah
        // himpunan modulnya, dan server menormalkan + memvalidasinya lagi
        // (modul inti tak bisa dimatikan, bahkan dari sini).
        businessCategory: category || undefined,
        modules: normalizeEnabledModules(modules),
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
        setError(first ?? data?.error ?? t("setup.errSaveFailed"));
        return;
      }
      toast(t("setup.toastDone"), "success");
      router.push("/reports");
      router.refresh();
    } catch {
      setError(t("setup.errNetwork"));
    } finally {
      setSaving(false);
    }
  }

  const canNext =
    (current === "identity" && name.trim().length > 0) ||
    // Langkah modul tak pernah menghalangi: melewatinya berarti "semua aktif".
    current === "modules" ||
    (current === "settings" && !!baseCurrency && !!fiscalYearStart) ||
    current === "coa" ||
    current === "balances";

  const currencyOptions = currencies.map((c) => ({ value: c, label: c }));

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2 text-sm" aria-label={t("setup.stepsAria")}>
        {steps.map((label, i) => (
          <li
            key={label}
            className={
              "flex items-center gap-2 rounded-md px-3 py-1.5 " +
              (i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                ? "bg-success-soft text-success-strong"
                : "bg-muted text-muted-foreground")
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
        {current === "identity" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("setup.identityTitle")}</h2>
            <Input
              id="name"
              label={t("setup.nameField")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              required
            />
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-foreground">
                {t("common.address")}
              </label>
              <Textarea
                id="address"
                className="mt-1"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={1000}
              />
            </div>
            <Input
              id="npwp"
              label={t("setup.npwpField")}
              value={npwp}
              onChange={(e) => setNpwp(e.target.value)}
              maxLength={30}
              placeholder={t("setup.npwpPlaceholder")}
            />
          </div>
        )}

        {/* Modul usaha (issue #99) — kategori sebagai preset, modul tetap
            bisa diubah satu per satu. Melewatinya = semua modul aktif. */}
        {current === "modules" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("modules.stepHeading")}</h2>
            <p className="text-sm text-muted-foreground">{t("modules.stepHint")}</p>
            <ModulePicker
              category={category}
              modules={modules}
              onCategoryChange={(next) => {
                setCategory(next);
                setModules(new Set(modulesForCategory(next)));
              }}
              onToggleModule={(module, next) =>
                setModules((prev) => {
                  const draft = new Set(prev);
                  if (next) draft.add(module);
                  else draft.delete(module);
                  return draft;
                })
              }
              disabled={saving}
            />
          </div>
        )}

        {/* Step 1 — base currency + fiscal year */}
        {current === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("setup.step2")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="baseCurrency"
                label={t("setup.baseCurrencyField")}
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                options={currencyOptions}
              />
              <Input
                id="fiscalYearStart"
                type="date"
                label={t("setup.fiscalYearStartField")}
                value={fiscalYearStart}
                onChange={(e) => setFiscalYearStart(e.target.value)}
                required
              />
            </div>
            <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {t("setup.ledgerNoteBefore")} <strong>IDR</strong> {t("setup.ledgerNoteAfter")}
              </span>
            </p>
          </div>
        )}

        {/* Step 2 — confirm COA */}
        {current === "coa" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("setup.coaTitle")}</h2>
            <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success-strong">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <span>
                {t("setup.coaNoteBefore")}{" "}
                <strong className="tabular-nums">{coaCount}</strong> {t("setup.coaNoteAfter")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("setup.coaHint")}
            </p>
          </div>
        )}

        {/* Step 3 — opening balances */}
        {current === "balances" && (
          <div className="space-y-8">
            <h2 className="text-lg font-semibold text-foreground">{t("setup.step4")}</h2>

            {/* Kas / Bank */}
            <Section
              title={t("nav.groups.cash")}
              hint={t("setup.cashSectionHint")}
              onAdd={() =>
                cashAccounts.length > 0 &&
                setCash((r) => [...r, { key: nextId(), accountId: "", amount: "", rate: "" }])
              }
              addLabel={t("setup.cashAddLabel")}
              empty={cashAccounts.length === 0 ? t("setup.cashEmpty") : undefined}
            >
              {cash.map((row) => {
                const acc = cashById.get(row.accountId);
                const foreign = acc && acc.currency !== "IDR";
                return (
                  <div key={row.key} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-5">
                      <Select
                        id={`cash-acc-${row.key}`}
                        label={t("common.account")}
                        value={row.accountId}
                        onChange={(e) => updateCash(row.key, { accountId: e.target.value })}
                        placeholder={t("setup.accountPick")}
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
                        label={
                          acc
                            ? t("setup.balanceWithCurrency", { currency: acc.currency })
                            : t("common.balance")
                        }
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
                          label={t("setup.rateToIdr")}
                          value={row.rate}
                          onChange={(e) => updateCash(row.key, { rate: e.target.value })}
                        />
                      </div>
                    )}
                    <div className="sm:col-span-1 flex justify-end">
                      <RemoveButton
                        onClick={() => setCash((r) => r.filter((x) => x.key !== row.key))}
                        label={t("journal.removeRow")}
                      />
                    </div>
                  </div>
                );
              })}
            </Section>

            {/* Piutang */}
            <PartnerSection
              title={t("setup.receivablesTitle")}
              hint={t("setup.receivablesHint")}
              rows={receivables}
              setRows={setReceivables}
              parties={customers}
              partyLabel={t("common.customer")}
              addLabel={t("setup.addCustomer")}
              pickLabel={t("setup.pickCustomer")}
              emptyLabel={t("setup.emptyCustomers")}
              currencies={currencyOptions}
              t={t}
              onUpdate={(k, p) => updatePartner(setReceivables, k, p)}
            />

            {/* Persediaan */}
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t("accountType.inventory")}
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">{t("setup.inventoryHint")}</p>
              <div className="sm:w-1/2">
                <Input
                  id="inventory"
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right tabular-nums"
                  label={t("setup.inventoryField")}
                  value={inventory}
                  onChange={(e) => setInventory(e.target.value)}
                />
              </div>
            </div>

            {/* Utang */}
            <PartnerSection
              title={t("setup.payablesTitle")}
              hint={t("setup.payablesHint")}
              rows={payables}
              setRows={setPayables}
              parties={suppliers}
              partyLabel={t("payables.colSupplier")}
              addLabel={t("setup.addSupplier")}
              pickLabel={t("setup.pickSupplier")}
              emptyLabel={t("setup.emptySuppliers")}
              currencies={currencyOptions}
              t={t}
              onUpdate={(k, p) => updatePartner(setPayables, k, p)}
            />

            <BalancePanel totals={totals} t={t} />
          </div>
        )}

        {/* Step 4 — review */}
        {current === "review" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("setup.reviewTitle")}</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-muted-foreground">{t("setup.companyLabel")}</dt>
                <dd className="text-foreground">{name}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">
                  {t("setup.fiscalYearStartField")}
                </dt>
                <dd className="text-foreground tabular-nums">{fiscalYearStart}</dd>
              </div>
              {/* issue #99 — apa yang akan tampil di menu setelah wizard selesai. */}
              <div>
                <dt className="font-medium text-muted-foreground">
                  {t("modules.sectionTitle")}
                </dt>
                <dd className="text-foreground">
                  {t("modules.activeCount", {
                    count: normalizeEnabledModules(modules).length,
                    total: BUSINESS_MODULES.length,
                  })}
                </dd>
              </div>
            </dl>
            <BalancePanel totals={totals} t={t} />
            <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {t("setup.saveNoteBefore")} <strong>{t("setup.saveNoteStrong")}</strong>{" "}
                {t("setup.saveNoteAfter")}
              </span>
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
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
          {t("common.back")}
        </Button>

        {step < steps.length - 1 ? (
          <Button
            type="button"
            className="cursor-pointer"
            disabled={!canNext}
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
          >
            {t("setup.next")}
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
            {t("setup.finish")}
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
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <div className="space-y-3">{children}</div>
      {empty ? (
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
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
  addLabel,
  pickLabel,
  emptyLabel,
  currencies,
  t,
  onUpdate,
}: {
  title: string;
  hint: string;
  rows: PartnerRow[];
  setRows: React.Dispatch<React.SetStateAction<PartnerRow[]>>;
  parties: Party[];
  partyLabel: string;
  addLabel: string;
  pickLabel: string;
  emptyLabel: string;
  currencies: { value: string; label: string }[];
  t: TranslateFn;
  onUpdate: (key: number, patch: Partial<PartnerRow>) => void;
}) {
  return (
    <Section
      title={title}
      hint={hint}
      addLabel={addLabel}
      empty={parties.length === 0 ? emptyLabel : undefined}
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
                placeholder={pickLabel}
                options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Select
                id={`c-${row.key}`}
                label={t("common.currencyField")}
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
                label={t("common.balance")}
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
                  label={t("setup.rateToIdr")}
                  value={row.rate}
                  onChange={(e) => onUpdate(row.key, { rate: e.target.value })}
                />
              </div>
            )}
            <div className="sm:col-span-1 flex justify-end">
              <RemoveButton
              onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
              label={t("journal.removeRow")}
            />
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
      aria-label={label}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

function BalancePanel({
  totals,
  t,
}: {
  totals: { assets: number; liabilities: number; equity: number; unrated: number; hasAny: boolean };
  t: TranslateFn;
}) {
  const equityLabel = totals.equity >= 0 ? t("setup.equityCredit") : t("setup.equityDebit");
  return (
    <div className="rounded-lg border border-border bg-muted p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label={t("setup.totalAssets")} value={totals.assets} />
        <Figure label={t("setup.totalLiabilities")} value={totals.liabilities} />
        <Figure label={equityLabel} value={Math.abs(totals.equity)} />
      </div>
      <div className="mt-3 border-t border-border pt-3 text-sm">
        {totals.unrated > 0 ? (
          <p className="flex items-center gap-2 text-warning-strong">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("setup.unratedWarning", { count: totals.unrated })}</span>
          </p>
        ) : totals.hasAny ? (
          <p className="flex items-center gap-2 text-success-strong">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="tabular-nums">
              {t("setup.balanced", { amount: formatCurrency(totals.assets, "IDR") })}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">{t("setup.noBalancesYet")}</p>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-foreground tabular-nums">
        {formatCurrency(value, "IDR")}
      </p>
    </div>
  );
}
