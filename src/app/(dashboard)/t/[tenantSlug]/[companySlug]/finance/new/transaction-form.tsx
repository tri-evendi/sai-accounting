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
import { Alert, Flex, theme, Typography } from "antd";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/components/ui/app-link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { AccountBookOutlined, ArrowDownOutlined, ArrowUpOutlined, InfoCircleOutlined, LockOutlined } from "@ant-design/icons";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { DisclosureSection, focusFormField } from "@/components/ui/disclosure-section";
import { CostCenterField, useCostCenters } from "@/components/shared/cost-center-field";
import type { CashType } from "@/lib/constants";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { resolveSubmitFailure } from "@/lib/form-sections";
import { closedPeriodIssue, negativeValueIssue, type ClosedPeriodRef } from "@/lib/form-guards";
import { useDictionary, useT } from "@/lib/i18n/client";
import { cashTypeLabels } from "@/lib/i18n/labels";
import { apiFetch } from "@/lib/api-fetch";

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
const ARAH_HEADING_KEYS = {
  masuk: { title: "finance.headingReceiveTitle", description: "finance.headingReceiveDesc" },
  keluar: { title: "finance.headingPayTitle", description: "finance.headingPayDesc" },
  default: { title: "finance.headingDefaultTitle", description: "finance.headingDefaultDesc" },
} as const;

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`. `max(280px, (100% − gutter)/2)` menahan jumlah kolomnya di
 * DUA, dan titik patahnya jatuh tepat di 576px (`sm` AntD).
 *
 * Tetap CSS grid, bukan `Row`/`Col`: `CostCenterField` membentang dengan
 * `gridColumn: "1 / -1"` yang diberikan pemanggilnya — di dalam `Col` flexbox
 * properti itu tak berarti apa-apa dan ia akan berhenti membentang tanpa satu
 * galat pun (pelajaran yang sama dengan `FULL_ROW` di #195).
 */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});
const FULL_ROW: React.CSSProperties = { gridColumn: "1 / -1" };

/** Satu baris pratinjau jurnal — bukan data tersimpan, hanya cermin mesinnya. */
interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

function NewTransactionForm({ closedPeriods }: { closedPeriods: ClosedPeriodRef[] }) {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const arahParam = searchParams.get("arah");
  const arah = arahParam === "masuk" || arahParam === "keluar" ? arahParam : null;
  const t = useT();
  const cashLabels = cashTypeLabels(useDictionary());
  const headingKeys = ARAH_HEADING_KEYS[arah ?? "default"];
  const heading = {
    title: t(headingKeys.title),
    description: t(headingKeys.description),
  };
  const { data: session } = useSession();
  const { token } = theme.useToken();
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
  // issue #91/#98 — pemilih bersama dengan faktur, pembelian dan gerakan stok.
  const costCenters = useCostCenters();
  const [costCenterId, setCostCenterId] = useState("");
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
  const periodIssue = closedPeriodIssue(date, closedPeriods, t("finance.dateGuardLabel"));

  // "Lihat jurnal" preview (issue #11) — mirrors buildCashTransactionLines
  // exactly (money in: D Kas/Bank, K akun lawan; money out: the reverse). It
  // RENDERS what the engine already computes; it introduces no posting rule.
  const counterAccount = accounts.find((a) => String(a.id) === counterAccountId);
  const isMoneyIn = Number(debit) > 0;
  const cashSideLabel = t("finance.cashSide", { type: cashLabels[type] });
  const journalPreview: JournalLine[] | null =
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
      const res = await apiFetch("/api/accounts");
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
          ? t("finance.errNeedOneAccountant")
          : t("finance.errNeedOnePlain"),
        "debit",
        false
      );
      return;
    }
    if (debitVal > 0 && creditVal > 0) {
      reportFailure(
        t("finance.errBothSides"),
        "debit",
        false
      );
      return;
    }

    const counterAccountIdVal = Number(formData.get("counterAccountId")) || 0;
    if (!counterAccountIdVal) {
      reportFailure(
        accountantOn
          ? t("finance.errPickCounterAccount")
          : t("finance.errPickCategory"),
        "counterAccountId",
        false
      );
      return;
    }
    if (isForeign && !(Number(formData.get("rate")) > 0)) {
      reportFailure(
        t("finance.errRateRequired", { currency }),
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
      // Tak dipilih = null = "belum ditetapkan / seluruh perusahaan" — nilai
      // yang SAH, bukan isian yang terlewat (issue #91).
      costCenterId: costCenterId ? Number(costCenterId) : null,
    };

    const res = await apiFetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const failure = resolveSubmitFailure("kas", data, t("finance.saveFailed"));
      setLoading(false);
      reportFailure(failure.message, failure.field, failure.section === "lanjutan");
    } else {
      router.push("/finance");
      router.refresh();
    }
  }

  /** Ringkasan isian lanjutan supaya nilainya tidak ikut hilang saat terlipat. */
  const advancedSummary = [
    isForeign
      ? t("finance.advCurrency", {
          currency,
          rate: Number(rate) > 0 ? rate : t("common.notEntered"),
        })
      : t("common.rupiahIdr"),
    note.trim() ? t("finance.advHasNote") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /** Isian nominal — rata kanan + `tabular-nums`, seperti kolom uang. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;
  /**
   * Isian yang ditonjolkan aksi cepat (`?arah=masuk`/`keluar`). Penandanya
   * BUKAN warna saja: isian itu juga yang mendapat `autoFocus`, dan kalimat
   * bantuan di bawahnya menyebut arahnya dengan kata + panah.
   */
  const highlight = (active: boolean, color: string): React.CSSProperties =>
    active ? { borderColor: color, boxShadow: `0 0 0 ${token.lineWidth}px ${color}` } : {};

  const journalColumns: SaiColumns<JournalLine> = [
    { key: "account", dataIndex: "account", title: t("common.account"), align: "left" },
    {
      key: "debit",
      dataIndex: "debit",
      title: t("common.debit"),
      align: "right",
      // Sisi yang tidak dipakai baris ini bukan "nol rupiah" melainkan bukan-nilai.
      render: (_v, line) => (line.debit > 0 ? <Money value={line.debit} currency="IDR" /> : "—"),
    },
    {
      key: "credit",
      dataIndex: "credit",
      title: t("common.credit"),
      align: "right",
      render: (_v, line) => (line.credit > 0 ? <Money value={line.credit} currency="IDR" /> : "—"),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("finance.title"), href: "/finance" }, { label: heading.title }]}
        title={<TermTooltip term="kas_bank">{heading.title}</TermTooltip>}
        description={heading.description}
      />
      <div style={{ marginBottom: token.marginLG }}>
        <LearnMore term="kas_bank" label={t("finance.learnMore")} />
      </div>

      {error && (
        /* `Alert` AntD: ikon + teks `colorText` di atas `colorErrorBg`, jadi
           maknanya tidak bergantung warna. `role="alert"` tetap milik kita. */
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle>{t("finance.detailsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={twoColumnGrid(token.margin)}>
              <Select
                id="type"
                name="type"
                label={t("finance.filterType")}
                value={type}
                onChange={(e) => setType(e.target.value as CashType)}
                options={[
                  { value: "bank", label: cashLabels.bank },
                  { value: "kas_besar", label: cashLabels.kas_besar },
                  { value: "kas_kecil", label: cashLabels.kas_kecil },
                ]}
              />
              <div>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  label={t("common.date")}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                {periodIssue && (
                  <Flex
                    align="flex-start"
                    gap={token.marginXXS}
                    role="alert"
                    style={{ marginTop: token.marginXXS }}
                  >
                    <LockOutlined aria-hidden="true" style={{ fontSize: token.fontSizeSM, flexShrink: 0, marginTop: 2 }} />
                    <Typography.Text style={{ fontSize: token.fontSizeSM }}>
                      {periodIssue}
                    </Typography.Text>
                  </Flex>
                )}
              </div>
              <div style={FULL_ROW}>
                <Input id="description" name="description" label={t("common.description")} required />
              </div>

              <div>
                <Input
                  id="debit"
                  name="debit"
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus={arah === "masuk"}
                  style={{
                    ...numberStyle,
                    ...highlight(arah === "masuk", token.colorMoneyPositive ?? token.colorSuccess),
                  }}
                  label={accountantOn ? t("finance.labelDebitAccountant") : t("finance.colMoneyIn")}
                  value={debit}
                  onChange={(e) => setDebit(e.target.value)}
                />
                <Flex align="center" gap={token.marginXXS} style={{ marginTop: token.marginXXS }}>
                  <ArrowDownOutlined aria-hidden="true" style={{ fontSize: token.fontSizeSM }} />
                  <Typography.Text style={{ fontSize: token.fontSizeSM }}>
                    {t("finance.hintIncrease")}
                  </Typography.Text>
                </Flex>
              </div>
              <div>
                <Input
                  id="credit"
                  name="credit"
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus={arah === "keluar"}
                  style={{
                    ...numberStyle,
                    ...highlight(arah === "keluar", token.colorMoneyNegative ?? token.colorError),
                  }}
                  label={accountantOn ? t("finance.labelCreditAccountant") : t("finance.colMoneyOut")}
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                />
                <Flex align="center" gap={token.marginXXS} style={{ marginTop: token.marginXXS }}>
                  <ArrowUpOutlined aria-hidden="true" style={{ fontSize: token.fontSizeSM }} />
                  <Typography.Text style={{ fontSize: token.fontSizeSM }}>
                    {t("finance.hintDecrease")}
                  </Typography.Text>
                </Flex>
              </div>

              <div style={FULL_ROW}>
                <Select
                  id="counterAccountId"
                  name="counterAccountId"
                  label={accountantOn ? t("finance.counterAccountLabel") : t("finance.categoryLabel")}
                  placeholder={
                    accountantOn ? t("finance.pickCounterAccount") : t("finance.pickCategory")
                  }
                  value={counterAccountId}
                  onChange={(e) => setCounterAccountId(e.target.value)}
                  options={accounts.map((a) => ({
                    value: String(a.id),
                    label: `${a.code} — ${a.name}`,
                  }))}
                  required
                />
                <Flex align="flex-start" gap={token.marginXXS} style={{ marginTop: token.marginXXS }}>
                  <InfoCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSizeSM, flexShrink: 0, marginTop: 2 }} />
                  <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {accountantOn ? (
                      <>
                        {t("finance.counterHintAccountant")} <em>{t("finance.exampleElectricity")}</em>,{" "}
                        <em>{t("finance.exampleReceivable")}</em>
                        {t("finance.exampleTail")}
                      </>
                    ) : (
                      <>
                        {t("finance.counterHintPlain")} <em>{t("finance.exampleElectricity")}</em>,{" "}
                        <em>{t("finance.exampleReceivable")}</em>
                        {t("finance.exampleTail")}
                      </>
                    )}
                  </Typography.Text>
                </Flex>
              </div>

              {/* `CostCenterField` tidak menerima gaya penempatan sama sekali
                  (propnya dicabut di #240), jadi rentang penuhnya dipasang
                  lewat pembungkus. */}
              <div style={FULL_ROW}>
                <CostCenterField
                  costCenters={costCenters}
                  value={costCenterId}
                  onChange={setCostCenterId}
                />
              </div>
            </div>

            {value > 0 && (
              <Flex
                align="center"
                justify="space-between"
                style={{
                  marginTop: token.margin,
                  padding: token.paddingXS,
                  borderRadius: token.borderRadius,
                  background: token.colorFillQuaternary,
                }}
              >
                <Typography.Text type="secondary">{t("finance.baseValueLabel")}</Typography.Text>
                {/* Valas tanpa kurs TIDAK punya nilai IDR: dikatakan dengan
                    kalimat, tidak pernah dirender sebagai Rp 0. */}
                {isForeign && !Number(rate) ? (
                  <Typography.Text style={{ fontWeight: token.fontWeightStrong }}>
                    {t("finance.fillRateFirst")}
                  </Typography.Text>
                ) : (
                  <Money
                    value={baseValue}
                    currency="IDR"
                    style={{ fontWeight: token.fontWeightStrong }}
                  />
                )}
              </Flex>
            )}

            {/* issue #11 — "Lihat jurnal": read-only preview of the entry the
                posting engine will create for this cash transaction. Shown only
                in Mode Akuntan; it renders the engine's own rule, changing
                nothing about what is posted. */}
            {accountantOn && journalPreview && (
              <div
                style={{
                  marginTop: token.margin,
                  borderRadius: token.borderRadius,
                  border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  overflow: "hidden",
                }}
              >
                <Flex
                  align="center"
                  gap={token.marginXS}
                  style={{
                    padding: token.paddingXS,
                    borderBottom: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                    fontWeight: token.fontWeightStrong,
                  }}
                >
                  <AccountBookOutlined aria-hidden="true" style={{ fontSize: token.fontSize }} />
                  {t("finance.journalPreviewTitle")}
                </Flex>
                {/* `StaticTable` `size="small"` — pratinjau ringkas; tak ada
                    sortir/filter yang dibeli dengan `DataTable` (#189). */}
                <StaticTable<JournalLine>
                  columns={journalColumns}
                  rows={journalPreview}
                  rowKey={(line) => line.account}
                  size="small"
                />
                <Typography.Paragraph
                  type="secondary"
                  style={{ margin: 0, padding: token.paddingXS, fontSize: token.fontSizeSM }}
                >
                  {t("finance.journalPreviewNote", { currency })}
                </Typography.Paragraph>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Detail lengkap (issue #4) — tertutup secara default ── */}
        <div style={{ marginBottom: token.marginLG }}>
          <DisclosureSection
            description={t("finance.advancedDescription")}
            summary={advancedSummary}
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            invalid={advancedInvalid}
          >
            <div style={twoColumnGrid(token.margin)}>
              <Select
                id="currency"
                name="currency"
                label={t("common.currency")}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: "IDR", label: t("finance.currencyIdrOption") },
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
                    style={numberStyle}
                    label={
                      <TermTooltip term="kurs">{t("finance.rateLabel", { currency })}</TermTooltip>
                    }
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    required
                  />
                  <Typography.Paragraph
                    type="secondary"
                    style={{ margin: 0, marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
                  >
                    {t("finance.rateHint")}
                  </Typography.Paragraph>
                </div>
              ) : (
                <div />
              )}
              <div style={FULL_ROW}>
                <Input
                  id="note"
                  name="note"
                  label={t("common.notesOptional")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          </DisclosureSection>
        </div>

        <Flex wrap gap={token.marginSM}>
          <Button type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("finance.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/finance")}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
    </div>
  );
}

/**
 * `useSearchParams` harus berada di dalam batas <Suspense> (lihat dokumen
 * Next.js `use-search-params`), jadi formulirnya dibungkus di sini.
 */
export function NewTransactionClient({ closedPeriods }: { closedPeriods: ClosedPeriodRef[] }) {
  const t = useT();
  return (
    <Suspense fallback={<PageLoader message={t("finance.preparingForm")} />}>
      <NewTransactionForm closedPeriods={closedPeriods} />
    </Suspense>
  );
}
