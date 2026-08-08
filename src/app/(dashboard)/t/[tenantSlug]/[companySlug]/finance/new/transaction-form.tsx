"use client";

/**
 * Catat Transaksi Kas & Bank — formulir ringkas (issue #4) + pencegahan
 * salah-isi berbahasa manusia (issue #6).
 *
 * Yang tampak sejak awal hanyalah pertanyaan yang selalu ada jawabannya: kas
 * mana, tanggal berapa, untuk apa, berapa masuk/keluar, dan masuk kategori apa.
 * Mata uang asing (+ kursnya) dan catatan pindah ke "Detail lengkap" yang
 * terlipat — mayoritas transaksi harian rupiah tidak pernah perlu menyentuhnya,
 * tetapi begitu mata uangnya diubah, kursnya WAJIB, dan penolakan untuk kurs
 * kosong membuka kembali bagian itu lalu memfokuskan isiannya.
 *
 * ── issue #216: mesinnya react-hook-form + zod ─────────────────────────────
 * Formulir ini dulu membaca `FormData` sendiri lalu menjalankan penjaganya satu
 * per satu; isian pilihannya (kas mana, kategori/akun lawan, mata uang) dijaga
 * `required` peramban sampai `Select` berpindah ke AntD di #188 dan atribut itu
 * berhenti divalidasi. Sekarang `cashTransactionSchema` — skema yang SAMA
 * dengan yang diurai `/api/finance`, diimpor bukan disalin — menilai seluruh
 * muatan di client lebih dulu, termasuk dua aturan yang tak bisa dilihat satu
 * isian saja: "isi salah satu, masuk atau keluar" dan "valas wajib berkurs".
 * Yang TIDAK pindah ke skema adalah penjaga yang butuh data di luar muatan
 * (periode tertutup) dan satu aturan yang memang hanya milik layar ini
 * (mengisi kedua sisi sekaligus).
 */

import { Suspense, useEffect, useState } from "react";
import { Alert, Flex, theme, Typography } from "antd";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppRouter } from "@/components/ui/app-link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { isAdvancedField, orderedFields, resolveSubmitFailure } from "@/lib/form-sections";
import { closedPeriodIssue, type ClosedPeriodRef } from "@/lib/form-guards";
import { useDictionary, useT } from "@/lib/i18n/client";
import { cashTypeLabels } from "@/lib/i18n/labels";
import { vmsg } from "@/lib/i18n/validation";
import { apiFetch } from "@/lib/api-fetch";
import { cashTransactionSchema, type CashTransactionInput } from "@/lib/validations/finance";

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

/**
 * Isian sebagaimana DIKETIK/DIPILIH — string, seperti nilai kontrol HTML. Bukan
 * skema kedua: aturannya seluruhnya milik `cashTransactionSchema`.
 */
interface TransactionFormValues {
  type: CashType;
  date: string;
  description: string;
  debit: string;
  credit: string;
  counterAccountId: string;
  currency: string;
  /** `undefined` saat kosong: kurs yang tak diisi BUKAN kurs nol (#216). */
  rate?: string;
  note: string;
}

/**
 * Isian yang benar-benar ada di layar. Namanya sengaja sama dengan nama field
 * di muatan API, sehingga `details.fieldErrors` dari server (dan peta
 * inti/lanjutan di `FORM_LAYOUTS.kas`) menunjuk isian yang sama tanpa kamus
 * kedua.
 */
const FIELDS = [
  "type",
  "date",
  "description",
  "debit",
  "credit",
  "counterAccountId",
  "currency",
  "rate",
  "note",
] as const;

function isFormField(name: string): name is (typeof FIELDS)[number] {
  return (FIELDS as readonly string[]).includes(name);
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
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  // issue #91/#98 — pemilih bersama dengan faktur, pembelian dan gerakan stok.
  const costCenters = useCostCenters();
  /*
   * Pusat biaya sengaja TIDAK ikut ke dalam state formulir: ia tidak pernah
   * wajib ("belum ditetapkan" adalah nilai yang SAH, issue #91), jadi tidak ada
   * aturan validasi yang bisa dilanggarnya. Nilainya disatukan saat dikirim.
   */
  const [costCenterId, setCostCenterId] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedInvalid, setAdvancedInvalid] = useState(false);

  const form = useForm<TransactionFormValues, unknown, CashTransactionInput>({
    // Cast HANYA menyelaraskan tipe statis; validasi runtime tetap milik skema.
    resolver: zodResolver(cashTransactionSchema) as unknown as Resolver<
      TransactionFormValues,
      unknown,
      CashTransactionInput
    >,
    defaultValues: {
      type: "bank",
      date: new Date().toISOString().split("T")[0],
      description: "",
      debit: "0",
      credit: "0",
      counterAccountId: "",
      // Drives which extra fields the accounting engine needs from the user.
      currency: BASE_CURRENCY,
      rate: undefined,
      note: "",
    },
  });

  /* `useWatch` (bukan `form.watch()`) supaya React Compiler tetap bisa
     memoisasi komponen ini. */
  const [type, currency, debit, credit, rate, note, date, counterAccountId] = useWatch({
    control: form.control,
    name: ["type", "currency", "debit", "credit", "rate", "note", "date", "counterAccountId"],
  });

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

  /**
   * Tempatkan galat, buka bagian yang menyembunyikannya, lalu fokuskan
   * isiannya. Galat yang menunjuk isian di layar mendarat DI isian itu (aturan
   * 7 Konvensi Form); yang tidak menunjuk apa pun naik menjadi galat formulir.
   */
  function reportFailure(message: string, field: string | null, inAdvanced: boolean) {
    if (field && isFormField(field)) {
      form.setError(field, { type: "server", message });
    } else {
      form.setError("root", { message });
    }
    setAdvancedInvalid(inAdvanced);
    if (inAdvanced) setAdvancedOpen(true);
    // `focusFormField` mencari `#id` lalu `[name=…]`; `FormControl` memberi id
    // yang dibangkitkan, tetapi `name` tetap nama field react-hook-form.
    if (field) requestAnimationFrame(() => focusFormField(field));
  }

  /**
   * Validasi client GAGAL. Dua hal yang harus terjadi dan tidak dikerjakan zod:
   *
   *  1. **Bagian yang terlipat harus terbuka.** Kurs hidup di "Detail lengkap";
   *     pesan galat untuk isian yang tidak ada di layar lebih buruk daripada
   *     formulir panjang (lihat `lib/form-sections.ts`).
   *  2. **Mode Akuntan memakai istilahnya sendiri.** Skema membawa kalimat awam
   *     ("Uang Masuk / Uang Keluar", "Akun lawan") karena ia juga dipakai server
   *     dan tidak tahu mode siapa pun. Di sini kalimatnya — BUKAN aturannya —
   *     ditukar dengan kalimat bermode, persis seperti sebelum #216.
   */
  function onInvalid(errors: FieldErrors<TransactionFormValues>) {
    if (errors.debit?.message === vmsg("validation.debitOrCredit")) {
      form.setError("debit", {
        message: accountantOn ? t("finance.errNeedOneAccountant") : t("finance.errNeedOnePlain"),
      });
    }
    if (errors.counterAccountId?.message === vmsg("validation.counterAccountRequired")) {
      form.setError("counterAccountId", {
        message: accountantOn
          ? t("finance.errPickCounterAccount")
          : t("finance.errPickCategory"),
      });
    }

    // Isian bermasalah PERTAMA menurut urutan tampil, bukan urutan kunci objek.
    const first = orderedFields("kas").find(
      (name) => isFormField(name) && errors[name] !== undefined
    );
    if (!first) return;
    const inAdvanced = isAdvancedField("kas", first);
    setAdvancedInvalid(inAdvanced);
    if (inAdvanced) setAdvancedOpen(true);
    requestAnimationFrame(() => focusFormField(first));
  }

  async function onSubmit(values: CashTransactionInput) {
    setAdvancedInvalid(false);

    // ── Penjaga yang TIDAK bisa hidup di skema ──
    // Periode tertutup butuh daftar periode, yang tidak ada di dalam muatan.
    if (periodIssue) {
      reportFailure(periodIssue, "date", false);
      return;
    }
    // Mengisi kedua sisi sekaligus: aturan layar ini saja — mesin posting
    // membaca sisi yang terisi, dan dua sisi terisi berarti niat yang ambigu.
    if (values.debit > 0 && values.credit > 0) {
      reportFailure(t("finance.errBothSides"), "debit", false);
      return;
    }

    setLoading(true);
    const body = {
      ...values,
      // IDR tidak membawa kurs — server memperlakukannya 1:1. Isian kursnya
      // memang tersembunyi untuk IDR, jadi nilai sisa dari mata uang sebelumnya
      // tidak boleh ikut berangkat.
      rate: values.currency === BASE_CURRENCY ? undefined : values.rate,
      note: values.note || undefined,
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
          // Kurs kosong (`undefined`) dikatakan dengan kalimat, tidak pernah
          // dirender sebagai angka nol.
          rate: Number(rate) > 0 ? String(rate) : t("common.notEntered"),
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

      {form.formState.errors.root && (
        /* `Alert` AntD: ikon + teks `colorText` di atas `colorErrorBg`, jadi
           maknanya tidak bergantung warna. `role="alert"` tetap milik kita. */
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={form.formState.errors.root.message} />
        </div>
      )}

      <Form {...form}>
      {/* `noValidate`: validasinya milik zod sekarang. */}
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle>{t("finance.detailsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={twoColumnGrid(token.margin)}>
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("finance.filterType")}</FormLabel>
                    <FormControl>
                      <NativeSelect
                        options={[
                          { value: "bank", label: cashLabels.bank },
                          { value: "kas_besar", label: cashLabels.kas_besar },
                          { value: "kas_kecil", label: cashLabels.kas_kecil },
                        ]}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("common.date")}</FormLabel>
                      <FormControl>
                        <TextInput type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
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
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("common.description")}</FormLabel>
                      <FormControl>
                        <TextInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <FormField
                  control={form.control}
                  name="debit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {accountantOn ? t("finance.labelDebitAccountant") : t("finance.colMoneyIn")}
                      </FormLabel>
                      <FormControl>
                        <TextInput
                          type="number"
                          step="0.01"
                          min="0"
                          autoFocus={arah === "masuk"}
                          style={{
                            ...numberStyle,
                            ...highlight(
                              arah === "masuk",
                              token.colorMoneyPositive ?? token.colorSuccess
                            ),
                          }}
                          {...field}
                        />
                      </FormControl>
                      {/* "Isi salah satu: masuk atau keluar" mendarat di sini —
                          skema menaruh galatnya pada `debit` (`path: ["debit"]`). */}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Flex align="center" gap={token.marginXXS} style={{ marginTop: token.marginXXS }}>
                  <ArrowDownOutlined aria-hidden="true" style={{ fontSize: token.fontSizeSM }} />
                  <Typography.Text style={{ fontSize: token.fontSizeSM }}>
                    {t("finance.hintIncrease")}
                  </Typography.Text>
                </Flex>
              </div>
              <div>
                <FormField
                  control={form.control}
                  name="credit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {accountantOn
                          ? t("finance.labelCreditAccountant")
                          : t("finance.colMoneyOut")}
                      </FormLabel>
                      <FormControl>
                        <TextInput
                          type="number"
                          step="0.01"
                          min="0"
                          autoFocus={arah === "keluar"}
                          style={{
                            ...numberStyle,
                            ...highlight(
                              arah === "keluar",
                              token.colorMoneyNegative ?? token.colorError
                            ),
                          }}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Flex align="center" gap={token.marginXXS} style={{ marginTop: token.marginXXS }}>
                  <ArrowUpOutlined aria-hidden="true" style={{ fontSize: token.fontSizeSM }} />
                  <Typography.Text style={{ fontSize: token.fontSizeSM }}>
                    {t("finance.hintDecrease")}
                  </Typography.Text>
                </Flex>
              </div>

              <div style={FULL_ROW}>
                <FormField
                  control={form.control}
                  name="counterAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>
                        {accountantOn
                          ? t("finance.counterAccountLabel")
                          : t("finance.categoryLabel")}
                      </FormLabel>
                      <FormControl>
                        <NativeSelect
                          placeholder={
                            accountantOn
                              ? t("finance.pickCounterAccount")
                              : t("finance.pickCategory")
                          }
                          options={accounts.map((a) => ({
                            value: String(a.id),
                            label: `${a.code} — ${a.name}`,
                          }))}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
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
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.currency")}</FormLabel>
                    <FormControl>
                      <NativeSelect
                        options={[
                          { value: "IDR", label: t("finance.currencyIdrOption") },
                          { value: "USD", label: "USD" },
                          { value: "CNY", label: "CNY" },
                        ]}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Progressive disclosure: kurs hanya muncul untuk mata uang
                  asing, dan skema hanya menuntutnya di kondisi itu
                  (`requireRateForForeign`). */}
              {isForeign ? (
                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>
                        <TermTooltip term="kurs">
                          {t("finance.rateLabel", { currency })}
                        </TermTooltip>
                      </FormLabel>
                      <FormControl>
                        <TextInput
                          type="number"
                          step="0.000001"
                          min="0"
                          style={numberStyle}
                          {...field}
                          value={field.value ?? ""}
                          /* Kosong = kurs TIDAK DIKETAHUI, bukan kurs nol. */
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? undefined : e.target.value)
                          }
                        />
                      </FormControl>
                      <FormDescription>{t("finance.rateHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div />
              )}
              <div style={FULL_ROW}>
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.notesOptional")}</FormLabel>
                      <FormControl>
                        <TextInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </DisclosureSection>
        </div>

        <Flex wrap gap={token.marginSM}>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? t("common.saving") : t("finance.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/finance")}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
      </Form>
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
