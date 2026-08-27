"use client";

/**
 * Customer + currency + rate + PPN block shared by the invoice create and edit
 * forms (issues #35, #16).
 *
 * Kept in one file on purpose: the rule "a non-IDR invoice must carry its own
 * rate" and the PPN DPP/PPN/Total breakdown have to read identically on both
 * screens, and the IDR base preview is the only place a user sees what will
 * actually hit the ledger. Mirrors the pattern already used by finance/new and
 * shared/payment-form.
 *
 * PPN (issue #16) is a first-class control here: a "Kena PPN" toggle plus a rate
 * (%) field, defaulting to 11% for domestic IDR invoices and to 0% (non-VAT) for
 * foreign/export invoices or a tax-exempt customer — all overridable. The form
 * sends `taxable` + `taxRate`; the server recomputes the PPN amount from them.
 *
 * BAGIAN-BAGIAN (issue #4). Progressive disclosure memisahkan blok ini: pelanggan
 * dan ringkasan nilai tetap terlihat, sedangkan mata uang/kurs/PPN/PEB masuk ke
 * "Detail lengkap" yang terlipat. Karena itu isinya dipecah jadi tiga komponen
 * kecil yang bisa ditempatkan terpisah, sementara `InvoiceFxFields` tetap ada
 * sebagai gabungan ketiganya — halaman Ubah Faktur memakainya tanpa perubahan,
 * jadi tidak ada dua salinan aturan PPN yang bisa saling menyimpang.
 */

import { useEffect, useState } from "react";
import { Col, Flex, Row, theme, Typography } from "antd";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Money } from "@/components/ui/money";
import { TermTooltip } from "@/components/ui/term-tooltip";
import {
  BASE_CURRENCY,
  CurrencyRateFields,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { computeTax, defaultInvoiceTax } from "@/lib/tax";
import { useDefaultTaxRate } from "@/lib/tax-profile-client";
import { FileDoneOutlined, GlobalOutlined, InfoCircleOutlined, TeamOutlined } from "@ant-design/icons";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Blok ini dijatuhkan ke dalam grid formulir faktur, yang masih grid Tailwind
 * (`sm:grid-cols-2`, fase C #195). `1 / -1` = seluruh kolom yang ada, jadi ia
 * benar di satu kolom (375px) maupun dua — tanpa media query dan tanpa kelas.
 */
const FULL_ROW = { gridColumn: "1 / -1" } as const;

/** Lebar isian tarif PPN: dua digit + koma, tak perlu selebar kolom. */
const TAX_RATE_WIDTH = 140;

export interface CustomerOption {
  id: number;
  name: string;
  taxExempt?: boolean;
}

export interface InvoiceFxValues {
  customerId: string;
  currency: string;
  rate: string;
  /** Whether PPN Keluaran applies. */
  taxable: boolean;
  /** PPN rate in percent, as a form string (e.g. "11"). */
  taxRate: string;
  // ── Dokumen ekspor / PEB (issue #17) — only meaningful on an export/0% invoice.
  /** Nomor PEB (Pemberitahuan Ekspor Barang). */
  pebNumber: string;
  /** Tanggal PEB, as a `YYYY-MM-DD` string. */
  pebDate: string;
  /** Free-text export-document note. */
  exportNote: string;
}

type Patch = (patch: Partial<InvoiceFxValues>) => void;

/**
 * Daftar pelanggan aktif. Diekspor supaya halaman yang menempatkan bagian-bagian
 * blok ini terpisah tetap mengambilnya SEKALI, lalu meneruskannya ke tiap bagian.
 */
export function useInvoiceCustomers(): CustomerOption[] {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      // `active=1`: pelanggan yang dinonaktifkan tidak boleh muncul sebagai
      // pilihan untuk faktur BARU (issue #104). Faktur lama tetap menampilkan
      // namanya — relasinya tidak disentuh.
      const res = await apiFetch("/api/customers?active=1");
      if (!res.ok || cancelled) return;
      const data: CustomerOption[] = await res.json();
      if (!cancelled) setCustomers(data);
    }

    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  return customers;
}

/**
 * The PPN default (taxable + rate string) implied by a currency/customer.
 *
 * `companyRate` (issue #368) adalah tarif perusahaan pada tanggal dokumen — 0
 * untuk perusahaan non-PKP, yang lalu membuat `taxable` ikut mati. Ia WAJIB di
 * sini justru karena fungsi ini kecil dan mudah dipanggil dari tempat baru:
 * parameter opsional akan diam-diam jatuh ke 11% pada pemanggil berikutnya.
 */
function applyTaxDefault(
  current: InvoiceFxValues,
  next: { currency?: string; customerTaxExempt?: boolean },
  companyRate: number
) {
  const d = defaultInvoiceTax({
    currency: next.currency ?? current.currency,
    customerTaxExempt: next.customerTaxExempt,
    companyRate,
  });
  return { taxable: d.taxable, taxRate: String(d.taxRate) };
}

/** True when this invoice is an export / 0% document, where a PEB applies. */
export function isExportDocument(value: InvoiceFxValues): boolean {
  const effectiveRate = value.taxable ? Number(value.taxRate) || 0 : 0;
  return value.currency !== BASE_CURRENCY || !value.taxable || effectiveRate === 0;
}

// ────────────────────────────── Bagian: pelanggan ──────────────────────────────

/** Pemilih pelanggan — isian INTI faktur, tidak pernah disembunyikan. */
export function InvoiceCustomerField({
  customers,
  value,
  onChange,
  documentDate,
  lockedToContractNo,
}: {
  customers: CustomerOption[];
  value: InvoiceFxValues;
  onChange: Patch;
  /** Tanggal dokumen (`YYYY-MM-DD`) — lihat `InvoiceFxAdvancedFields`. */
  documentDate: string;
  /**
   * Nomor kontrak yang MENENTUKAN pelanggan faktur ini (migrasi 0057), atau
   * null bila pilihannya masih bebas.
   *
   * Dikunci, bukan sekadar diisi: sejak penjaga di `createInvoiceInTx`, faktur
   * yang pihaknya berbeda dari pembeli kontraknya DITOLAK server. Membiarkan
   * daftar ini bisa dibuka berarti menawarkan puluhan pilihan yang semuanya
   * berakhir sebagai penolakan — bentuk kebebasan yang tidak ada isinya.
   * Lepaskan kontraknya kalau memang perlu menagih pihak lain.
   */
  lockedToContractNo?: string | null;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const companyRate = useDefaultTaxRate(documentDate);

  function handleCustomerChange(id: string) {
    const picked = customers.find((c) => String(c.id) === id);
    onChange({
      customerId: id,
      ...applyTaxDefault(value, { customerTaxExempt: picked?.taxExempt }, companyRate),
    });
  }

  return (
    <div style={FULL_ROW}>
      <Select
        id="customerId"
        name="customerId"
        label={<TermTooltip term="pelanggan">{t("invoices.customerFieldFx")}</TermTooltip>}
        placeholder={t("invoices.customerPickPlaceholder")}
        value={value.customerId}
        disabled={Boolean(lockedToContractNo)}
        onChange={(e) => handleCustomerChange(e.target.value)}
        options={customers.map((c) => ({
          value: String(c.id),
          label: c.taxExempt
            ? t("invoices.customerTaxExemptSuffix", { name: c.name })
            : c.name,
        }))}
      />
      <Flex align="flex-start" gap={token.marginXXS} style={{ marginTop: token.marginXXS }}>
        <TeamOutlined aria-hidden="true" style={{ fontSize: token.fontSize, flexShrink: 0 }} />
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {lockedToContractNo
            ? t("invoices.customerFromContract", { contractNo: lockedToContractNo })
            : t("invoices.customerHint")}
        </Typography.Text>
      </Flex>
    </div>
  );
}

// ─────────────────────── Bagian: valas + PPN + dokumen ekspor ───────────────────────

/**
 * Mata uang, kurs, PPN, dan PEB — isian LANJUTAN. Faktur rupiah biasa memakai
 * seluruh nilai standarnya (IDR, PPN 11%), jadi bagian ini boleh tidak dibuka
 * sama sekali; kalau kursnya ternyata wajib, penolakan server membuka kembali
 * bagian ini dan memfokuskan isian `rate`.
 */
export function InvoiceFxAdvancedFields({
  customers,
  value,
  onChange,
  documentDate,
}: {
  customers: CustomerOption[];
  value: InvoiceFxValues;
  onChange: Patch;
  /**
   * Tanggal dokumen (`YYYY-MM-DD`) — menentukan TARIF MANA yang jadi bawaan
   * saat PPN dinyalakan (issue #368). Ia prop dan bukan bagian
   * `InvoiceFxValues` karena tanggal faktur dimiliki formulir induknya, bukan
   * blok valas ini.
   */
  documentDate: string;
}) {
  const t = useT();
  const { token } = theme.useToken();
  /* Tarif perusahaan PADA TANGGAL DOKUMEN, bukan konstanta kompilasi dan bukan
     tarif hari ini — faktur yang dicatat mundur mengikuti tarif bulannya. */
  const companyRate = useDefaultTaxRate(documentDate);
  const { customerId, currency, rate, taxable, taxRate, pebNumber, pebDate, exportNote } = value;
  const effectiveRate = taxable ? Number(taxRate) || 0 : 0;

  /** Kotak bagian — batas + sudut + padding, semuanya token (#208 untuk batasnya). */
  const sectionBox: React.CSSProperties = {
    ...FULL_ROW,
    padding: token.paddingSM,
    borderRadius: token.borderRadius,
    border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
  };

  /** Kalimat bantuan berikon — bentuk yang sama dipakai empat kali di sini. */
  const hint = (text: string, marginTop: number) => (
    <Flex align="flex-start" gap={token.marginXXS} style={{ marginTop }}>
      <InfoCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSize, flexShrink: 0 }} />
      <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {text}
      </Typography.Text>
    </Flex>
  );

  function handleCurrencyChange(c: string) {
    const picked = customers.find((cust) => String(cust.id) === customerId);
    onChange({
      currency: c,
      ...applyTaxDefault(value, { currency: c, customerTaxExempt: picked?.taxExempt }, companyRate),
    });
  }

  return (
    <>
      <CurrencyRateFields
        currency={currency}
        rate={rate}
        onCurrencyChange={handleCurrencyChange}
        onRateChange={(r) => onChange({ rate: r })}
      />

      {/* PPN control (issue #16) */}
      <div style={sectionBox}>
        {/*
         * Label PPN kini ANAK `Checkbox`, bukan `<label htmlFor>` kedua yang
         * membungkus `<label>` milik AntD. Selain menghapus sarang label yang
         * tak sah, `TermTooltip` di dalamnya tetap bisa dibuka — dulu ia berada
         * di dalam area klik label, sehingga membuka penjelasannya justru ikut
         * mencentang PPN.
         */}
        <Checkbox
          id="taxable"
          name="taxable"
          checked={taxable}
          onCheckedChange={(v) =>
            onChange({
              taxable: v === true,
              // Turning PPN on with no rate yet gives the company's own rate
              // for this document's date (issue #368) — 0 for a non-PKP company.
              taxRate: v === true && !(Number(taxRate) > 0) ? String(companyRate) : taxRate,
            })
          }
        >
          <Flex component="span" align="center" gap={token.marginXXS}>
            <FileDoneOutlined aria-hidden="true" style={{ fontSize: token.fontSize, color: token.colorTextSecondary }} />
            <TermTooltip term="ppn">{t("invoices.taxableLabel")}</TermTooltip>
          </Flex>
        </Checkbox>

        {taxable ? (
          <div style={{ marginTop: token.marginSM }}>
            <Input
              id="taxRate"
              name="taxRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              /* Tarif = angka: rata kanan + `tabular-nums` (MASTER.md §3). */
              style={{
                maxWidth: TAX_RATE_WIDTH,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
              label={t("common.taxRatePercent")}
              value={taxRate}
              onChange={(e) => onChange({ taxRate: e.target.value })}
            />
            {hint(t("invoices.taxRateHint"), token.marginXXS)}
          </div>
        ) : (
          hint(t("invoices.notTaxableHint"), token.marginXS)
        )}
      </div>

      {/* Dokumen ekspor / PEB (issue #17) — shown only for an export/0% invoice. */}
      {(currency !== BASE_CURRENCY || !taxable || effectiveRate === 0) && (
        <div style={sectionBox}>
          <Flex align="center" gap={token.marginXXS}>
            <GlobalOutlined aria-hidden="true" style={{ fontSize: token.fontSize, color: token.colorTextSecondary }} />
            <Typography.Text strong>{t("invoices.pebSectionTitle")}</Typography.Text>
          </Flex>
          {hint(t("invoices.pebHint"), token.marginXXS)}
          <Row gutter={[token.marginSM, token.marginSM]} style={{ marginTop: token.marginSM }}>
            <Col xs={24} sm={12}>
              <Input
                id="pebNumber"
                name="pebNumber"
                label={t("invoices.pebNumber")}
                value={pebNumber}
                onChange={(e) => onChange({ pebNumber: e.target.value })}
              />
            </Col>
            <Col xs={24} sm={12}>
              <Input
                id="pebDate"
                name="pebDate"
                type="date"
                label={t("invoices.pebDate")}
                value={pebDate}
                onChange={(e) => onChange({ pebDate: e.target.value })}
              />
            </Col>
            <Col span={24}>
              <Input
                id="exportNote"
                name="exportNote"
                label={t("invoices.exportNote")}
                value={exportNote}
                onChange={(e) => onChange({ exportNote: e.target.value })}
              />
            </Col>
          </Row>
        </div>
      )}
    </>
  );
}

// ─────────────────────────── Bagian: ringkasan nilai ───────────────────────────

/**
 * DPP / PPN / Total / nilai dasar IDR. Ini UANG-nya, jadi tidak pernah ikut
 * terlipat: apa pun yang disembunyikan di "Detail lengkap", akibatnya tetap
 * terbaca di sini.
 */
export function InvoiceTotalsSummary({
  value,
  subtotal,
}: {
  value: InvoiceFxValues;
  subtotal: number;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const { currency, rate, taxable, taxRate } = value;
  const isForeign = currency !== BASE_CURRENCY;
  const effectiveRate = taxable ? Number(taxRate) || 0 : 0;
  // Reuse the exact server-side computation for the preview so the figure shown
  // and the figure posted can never disagree.
  const { dpp, taxAmount, total } = computeTax(subtotal, effectiveRate);
  const rateValue = Number(rate) || 0;
  const baseTotal = isForeign ? total * rateValue : total;
  const baseUnknown = isForeign && rateValue <= 0;

  /** Satu baris DPP/PPN/Total: keterangan kiri, nominal kanan. */
  const line = (
    label: React.ReactNode,
    amount: React.ReactNode,
    options?: { strong?: boolean; ruled?: boolean }
  ) => (
    <Flex
      align="center"
      justify="space-between"
      gap={token.marginSM}
      style={
        options?.ruled
          ? {
              borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
              paddingTop: token.marginXXS,
            }
          : undefined
      }
    >
      <dt>
        {options?.strong ? (
          <Typography.Text strong>{label}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">{label}</Typography.Text>
        )}
      </dt>
      {/* `<dd>` bawaan browser punya `margin-inline-start: 40px` — dinolkan di
          sini supaya nominalnya benar-benar menempel di tepi kanan. */}
      <dd style={{ margin: 0, fontWeight: options?.strong ? token.fontWeightStrong : undefined }}>
        {amount}
      </dd>
    </Flex>
  );

  return (
    <div
      style={{
        ...FULL_ROW,
        paddingBlock: token.paddingXS,
        paddingInline: token.paddingSM,
        borderRadius: token.borderRadius,
        border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        background: token.colorFillAlter,
      }}
    >
      {/*
       * Nominal lewat `Money` (#186), bukan `formatCurrency` sendiri: dengan
       * begitu tabular-nums, format id-ID, dan mata uang eksplisit datang dari
       * satu tempat — dan angka pratinjau ini tak bisa berbeda bentuk dari
       * angka yang sama di tabel faktur.
       */}
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: token.marginXXS }}>
        {line(t("invoices.dppLine", { currency }), <Money value={dpp} currency={currency} />)}
        {line(
          t("invoices.vatLine", {
            rate: taxable ? `(${effectiveRate}%)` : t("invoices.vatNotTaxable"),
            currency,
          }),
          <Money value={taxAmount} currency={currency} />
        )}
        {line(
          t("invoices.totalLine", { currency }),
          <Money value={total} currency={currency} />,
          { strong: true, ruled: true }
        )}
        {/*
         * Nilai dasar IDR yang belum bisa dihitung tidak ditulis 0 dan tidak
         * ditulis "—" begitu saja: kalimatnya menyebutkan SEBABNYA (kursnya
         * belum diisi), yang justru tindakan yang harus diambil pengguna.
         */}
        {line(
          t("common.ledgerBaseIdr"),
          baseUnknown ? (
            <Typography.Text type="secondary">{t("invoices.baseUnknown")}</Typography.Text>
          ) : (
            <Money value={baseTotal} currency="IDR" />
          ),
          { strong: true }
        )}
      </dl>
    </div>
  );
}

// ──────────────────────────────── Gabungan ────────────────────────────────

interface InvoiceFxFieldsProps {
  value: InvoiceFxValues;
  onChange: Patch;
  /** Net line total (DPP), in the invoice's own currency. */
  subtotal: number;
  /** Tanggal dokumen (`YYYY-MM-DD`) — lihat `InvoiceFxAdvancedFields`. */
  documentDate: string;
}

/**
 * Ketiga bagian berurutan, seperti sebelum issue #4. Dipakai halaman Ubah
 * Faktur, yang formulirnya memang tidak dilipat.
 */
export function InvoiceFxFields({
  value,
  onChange,
  subtotal,
  documentDate,
}: InvoiceFxFieldsProps) {
  const customers = useInvoiceCustomers();

  return (
    <>
      <InvoiceCustomerField
        customers={customers}
        value={value}
        onChange={onChange}
        documentDate={documentDate}
      />
      <InvoiceFxAdvancedFields
        customers={customers}
        value={value}
        onChange={onChange}
        documentDate={documentDate}
      />
      <InvoiceTotalsSummary value={value} subtotal={subtotal} />
    </>
  );
}

/** Request body fields for the invoice API, from the form's string state. */
export function invoiceFxPayload(value: InvoiceFxValues) {
  // PEB only belongs on an export/0% document; a domestic taxable invoice clears
  // it so a value typed before switching modes is not persisted by accident.
  const exportDoc = isExportDocument(value);
  return {
    customerId: value.customerId ? Number(value.customerId) : null,
    ...currencyRatePayload(value.currency, value.rate),
    taxable: value.taxable,
    taxRate: value.taxable ? Number(value.taxRate) || 0 : 0,
    pebNumber: exportDoc ? value.pebNumber || null : null,
    pebDate: exportDoc ? value.pebDate || null : null,
    exportNote: exportDoc ? value.exportNote || null : null,
  };
}
