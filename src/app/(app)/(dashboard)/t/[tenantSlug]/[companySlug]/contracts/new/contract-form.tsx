"use client";

/**
 * Buat Kontrak — formulir ringkas dengan "Detail lengkap" yang dilipat (issue #4)
 * dan pencegahan salah-isi berbahasa manusia (issue #6).
 *
 * Yang terlihat sejak awal hanyalah yang membuat sebuah kontrak berarti: nomor,
 * tanggal, pembeli, mata uang/kurs, dan baris barang. Termin pembayaran,
 * kemasan, pengapalan, penerima barang, jatuh tempo, dan status pindah ke satu
 * bagian terlipat — isiannya TETAP ada di DOM (lihat `DisclosureSection`),
 * sehingga tetap ikut terkirim dan tetap bisa difokuskan bila server menolaknya.
 *
 * Semua penjaga di sini bersifat mendahului, bukan menggantikan: periode
 * tertutup tetap dijaga `assertPeriodOpen` di dalam transaksi penulisan, dan
 * seluruh aturan lain tetap milik `contractSchema`.
 *
 * ── Konversi ke token Ant Design (issue #195, fase C3) ─────────────────────
 * Yang berubah HANYA kulitnya: `className` Tailwind → `Row`/`Col`/`Flex` +
 * token `theme.useToken()`. Mesin formulirnya sengaja TIDAK disentuh —
 * `useState` + `FormData`, penjaga sebelum-kirim, dan `CurrencyRateFields`
 * (yang memunculkan isian kurs hanya untuk mata uang asing) tetap persis
 * seperti sebelumnya. Menukar mesinnya ke react-hook-form di PR yang sama
 * dengan konversi gaya berarti tidak ada yang bisa membaca diff-nya.
 *
 * Dua akibat yang perlu diketahui:
 *  • **Titik patah berpindah** dari `sm` Tailwind (640px) ke `sm` AntD
 *    (576px). Disengaja: seluruh aplikasi berpindah ke satu tangga titik
 *    patah (lihat catatan sama di `shared/payment-form.tsx`).
 *  • **Baris barang kini `Row`/`Col` yang membungkus**, bukan satu baris
 *    flex yang memaksa lima kendali berdampingan. Di 375px kelima isian dulu
 *    saling menghimpit sampai kotak "Harga/kg" tinggal beberapa piksel;
 *    sekarang mereka turun ke baris berikutnya.
 */

import { useState } from "react";
import { Alert, Col, Flex, Row, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { DueDateField } from "@/components/shared/due-date-field";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisclosureSection, focusFormField } from "@/components/ui/disclosure-section";
import { TermTooltip } from "@/components/ui/term-tooltip";
import {
  CurrencyRateFields,
  baseUnknown,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { ConsigneeSelect } from "@/components/shared/consignee-select";
import { CustomerSelect } from "@/components/shared/customer-select";
import { formatCurrency } from "@/lib/utils";
import { resolveSubmitFailure } from "@/lib/form-sections";
import {
  closedPeriodIssue,
  negativeValueIssue,
  type ClosedPeriodRef,
} from "@/lib/form-guards";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import { DeleteOutlined, LockOutlined, PlusOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";

interface ContractItem {
  /** Barang dari master (#491). `null` sampai dipilih. */
  itemId: number | null;
  /** Nama sebagaimana akan tercetak di kontrak — snapshot dari master. */
  itemName: string;
  bags: number;
  kgPerBag: number;
  pricePerKg: number;
}

/** Pilihan barang untuk pemilih — dibaca server, tanpa perjalanan tambahan. */
export interface ContractItemOption {
  id: number;
  code: string;
  name: string;
  unit: string | null;
}

const emptyItem = (): ContractItem => ({
  itemId: null,
  itemName: "",
  bags: 0,
  kgPerBag: 0,
  pricePerKg: 0,
});

/** Label status kontrak dalam bahasa tugas — dipakai pilihan & ringkasan lipatan. */
const statusLabels = (t: TranslateFn): Record<string, string> => ({
  pending: t("contracts.statusPendingLower"),
  signed: t("contracts.statusSignedLower"),
  canceled: t("contracts.statusCanceledLower"),
});

/** Lebar dasar kolom kuantitas pada baris barang (`w-20`/`w-24`/`w-28` lama). */
const QTY_COL_BASIS = 96;

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2` untuk blok yang WAJIB berupa CSS grid.
 *
 * Kenapa bukan `Row`/`Col`: `CurrencyRateFields` (dan kerabatnya di
 * `shared/invoice-fx-fields.tsx`) menaruh anaknya dengan `gridColumn: "1 / -1"`,
 * yang hanya berarti sesuatu di dalam CSS grid. Membungkusnya dengan `Col`
 * flexbox akan membuat blok-blok itu diam-diam berhenti membentang.
 *
 * `max(FIELD_MIN, (100% − gutter)/2)` menahan jumlah kolomnya di DUA: begitu
 * setengah lebar wadah melewati `FIELD_MIN`, lebar minimum satu track ikut
 * membesar sehingga kolom KETIGA tak pernah muat. Dengan `FIELD_MIN` 280 dan
 * gutter 16, dua kolom mulai tepat di 576px — titik patah `sm` AntD, tangga
 * yang sama dengan sisa aplikasi.
 */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});

export function NewContractForm({
  closedPeriods,
  itemOptions,
}: {
  closedPeriods: ClosedPeriodRef[];
  /** Barang aktif dari master (#491) — dibaca server, tanpa perjalanan tambahan. */
  itemOptions: ContractItemOption[];
}) {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ContractItem[]>([emptyItem()]);
  // Stored on the contract since issue #36, so an edit no longer re-enters it.
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  // Master consignee link (issue #22); the free text stays a fallback.
  const [consigneeId, setConsigneeId] = useState<number | null>(null);
  /* Pembeli (migrasi 0057). Tautan master + nama tercetak, dikendalikan di sini
     karena `SearchableSelect` sengaja TIDAK ikut `new FormData(form)` (#263). */
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [buyer, setBuyer] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("pending");
  /*
   * PPN kontrak (migrasi 0062). Disimpan sebagai STRING karena `<select>` hanya
   * mengenal string; skema server yang mengubahnya jadi boolean — dan ia
   * memakai `preprocess`, bukan `z.coerce.boolean()`, sebab `Boolean("false")`
   * bernilai true dan akan membalik jawaban "Non-PPN" tanpa satu pun galat.
   *
   * Bawaannya `""` = belum dinyatakan, dan itu bukan kemalasan: memilihkan
   * "Kena PPN" akan menyatakan sesuatu atas nama pengguna pada kontrak ekspor,
   * dan memilihkan "Non-PPN" akan mematikan PPN 11% pada kontrak rupiah biasa —
   * dua-duanya salah pada separuh kontrak. Selama `""`, fakturnya mengambil
   * bawaan dari mata uang & pelanggannya, persis seperti sebelum kolom ini ada.
   */
  const [taxable, setTaxable] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedInvalid, setAdvancedInvalid] = useState(false);

  const subtotal = items.reduce((sum, i) => sum + i.bags * i.kgPerBag * i.pricePerKg, 0);
  // Periode terkunci diperlihatkan sambil mengetik, bukan hanya setelah ditolak.
  const periodIssue = closedPeriodIssue(date, closedPeriods, t("contracts.dateGuardLabel"));

  function addItem() {
    setItems([...items, emptyItem()]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ContractItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  /** Tampilkan galat, buka bagian yang menyembunyikannya, lalu fokuskan isiannya. */
  function reportFailure(message: string, field: string | null, inAdvanced: boolean) {
    setError(message);
    setAdvancedInvalid(inAdvanced);
    if (inAdvanced) setAdvancedOpen(true);
    if (field) {
      // Panel baru bisa difokuskan setelah React menggambarnya kembali.
      requestAnimationFrame(() => focusFormField(field));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setAdvancedInvalid(false);

    // ── Penjaga sebelum kirim (cermin dari penjaga server) ──
    if (periodIssue) {
      reportFailure(periodIssue, "date", false);
      return;
    }
    /*
     * Pembeli WAJIB dari master pada kontrak BARU (migrasi 0057), dan penjaganya
     * di sini — bukan di `contractSchema`, yang dipakai bersama dengan jalur
     * SUNTING. Kontrak warisan yang belum tertaut harus tetap bisa disunting;
     * kontrak yang lahir hari ini tidak punya alasan untuk lahir tanpa tautan.
     *
     * Tanpa ini, rantai Kontrak → Faktur berhenti bekerja untuk setiap kontrak
     * baru: penjaga pihak membaca `customers.id`, dan NULL berarti tidak ada
     * yang bisa dibandingkan.
     */
    if (customerId == null) {
      reportFailure(t("contracts.buyerMasterRequired"), "customerId", false);
      return;
    }
    const negative = negativeValueIssue([
      { field: "rate", value: Number(rate) },
      ...items.flatMap((item, i) => [
        { field: `bags-${i}`, value: item.bags, label: t("contracts.bagsRowLabel", { n: i + 1 }) },
        { field: `kgPerBag-${i}`, value: item.kgPerBag, label: t("contracts.kgPerBagRowLabel", { n: i + 1 }) },
        { field: `pricePerKg-${i}`, value: item.pricePerKg, label: t("contracts.pricePerKgRowLabel", { n: i + 1 }) },
      ]),
    ]);
    if (negative) {
      reportFailure(negative.message, negative.field, false);
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const body = {
      contractNo: formData.get("contractNo"),
      date: formData.get("date"),
      dueDate: formData.get("dueDate"),
      buyer,
      customerId,
      consignee: formData.get("consignee"),
      consigneeId,
      packaging: formData.get("packaging"),
      shipment: formData.get("shipment"),
      top1: formData.get("top1"),
      top2: formData.get("top2"),
      ...currencyRatePayload(currency, rate),
      status: formData.get("status"),
      taxable,
      items,
    };

    const res = await apiFetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const failure = resolveSubmitFailure("kontrak", data, t("contracts.saveFailed"));
      setLoading(false);
      reportFailure(failure.message, failure.field, failure.section === "lanjutan");
    } else {
      router.push("/contracts");
      router.refresh();
    }
  }

  /** Ringkasan isian lanjutan supaya nilainya tidak ikut hilang saat terlipat. */
  const advancedSummary = [
    dueDate ? t("contracts.advDueDate", { date: dueDate }) : t("contracts.advNoDueDate"),
    consigneeId != null ? t("contracts.advConsignee") : null,
    t("contracts.advStatus", { status: statusLabels(t)[status] ?? status }),
  ]
    .filter(Boolean)
    .join(" · ");

  /** Label mikro di atas satu isian baris barang. */
  const itemLabel = (htmlFor: string, text: string) => (
    <Label
      htmlFor={htmlFor}
      style={{
        marginBottom: token.marginXXS,
        fontSize: token.fontSizeSM,
        color: token.colorTextSecondary,
      }}
    >
      {text}
    </Label>
  );

  /** Isian angka baris barang — rata kanan + `tabular-nums`, seperti kolom uang. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        /* Galat tingkat formulir kini `Alert` AntD: teks `colorText` di atas
           `colorErrorBg` (bukan merah di atas merah muda) dan ikon yang membuat
           maknanya tidak bergantung warna. `role="alert"` tetap milik kita —
           AntD tidak memasangnya, dan tanpa itu pesannya tidak diumumkan. */
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("contracts.detailsTitle")}</CardTitle>
          <Typography.Text
            type="secondary"
            style={{ display: "block", marginTop: token.marginXXS }}
          >
            {t("contracts.detailsHint")}
          </Typography.Text>
        </CardHeader>
        <CardContent>
          <Row gutter={[token.margin, token.margin]}>
            <Col xs={24} sm={12}>
              <Input id="contractNo" name="contractNo" label={t("contracts.contractNo")} required />
            </Col>
            <Col xs={24} sm={12}>
              <Input
                id="date"
                name="date"
                type="date"
                label={t("contracts.contractDate")}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              {periodIssue && (
                /* Periode terkunci: ikon gembok + kalimat. Warnanya
                   `colorError`; ikonnya penanda kedua supaya maknanya tidak
                   bergantung warna. */
                <Typography.Paragraph
                  role="alert"
                  style={{
                    margin: 0,
                    marginTop: token.marginXXS,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: token.marginXXS,
                    fontSize: token.fontSizeSM,
                    color: token.colorError,
                  }}
                >
                  <LockOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{periodIssue}</span>
                </Typography.Paragraph>
              )}
            </Col>
            {/* Pembeli menempati BARIS PENUH sejak migrasi 0057: ia bukan lagi
                satu kotak teks melainkan pemilih master + nama tercetak +
                kalimat "belum ada di daftar?". Memerasnya ke setengah lebar
                membuat ketiganya bertumpuk di 375px tanpa alasan — dan sel
                kosong yang dulu menyeimbangkan barisnya jadi tak diperlukan,
                sebab baris penuh sudah mengembalikan mata uang/kurs ke kolom
                kiri dengan sendirinya. */}
            <Col span={24}>
              <CustomerSelect
                customerId={customerId}
                onCustomerIdChange={setCustomerId}
                buyer={buyer}
                onBuyerChange={setBuyer}
                requireMaster
              />
            </Col>
            {/* Valas: `CurrencyRateFields` memunculkan isian kurs HANYA saat
                mata uangnya bukan IDR (pasangan client dari
                `requireRateForForeign` di skema server). Ia memberi DUA sel
                kisi berdampingan — itu kontraknya, dan kontrak itu dipenuhi di
                sini oleh satu kisi dua kolom, bukan oleh dua `Col`: keduanya
                datang sebagai fragmen dari satu komponen. Sel kurs tetap ada
                (kosong) untuk IDR, jadi kisinya tidak melompat saat mata uang
                diganti. */}
            <Col span={24}>
              <div style={twoColumnGrid(token.margin)}>
                <CurrencyRateFields
                  currency={currency}
                  rate={rate}
                  onCurrencyChange={setCurrency}
                  onRateChange={setRate}
                  currencyLabel={t("common.currency")}
                  rateHint={t("contracts.rateHintNew")}
                />
              </div>
            </Col>
            {/* PPN kontrak (migrasi 0062) — sebuah PILIHAN, bukan kotak centang.
                "Kena PPN / Non-PPN" adalah dua keadaan yang sama sahihnya dan
                sama-sama harus terbaca sekali lihat; kotak centang yang tidak
                tercentang tak pernah bisa dibedakan dari kotak centang yang
                belum sempat dibaca. Jurnal kontraknya TIDAK berubah karena
                pilihan ini — PPN Keluaran terbit di faktur. */}
            <Col xs={24} sm={12}>
              <Select
                id="taxable"
                name="taxable"
                label={t("contracts.taxableLabel")}
                value={taxable}
                onChange={(e) => setTaxable(e.target.value)}
                options={[
                  { value: "", label: t("contracts.taxableUnset") },
                  { value: "true", label: t("contracts.taxableYes") },
                  { value: "false", label: t("contracts.taxableNo") },
                ]}
              />
              <Typography.Text
                type="secondary"
                style={{
                  display: "block",
                  marginTop: token.marginXXS,
                  fontSize: token.fontSizeSM,
                }}
              >
                {t("contracts.taxableHint")}
              </Typography.Text>
            </Col>
          </Row>
        </CardContent>
      </Card>

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
            <CardTitle level={2}>{t("contracts.contractedGoodsTitle")}</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              {/* Jarak ikon–teks dari `iconGap` `.ant-btn`; ukurannya dari
                  primitif `Button`. */}
              <PlusOutlined aria-hidden="true" /> {t("common.addItem")}
            </Button>
          </Flex>
        </CardHeader>
        <CardContent>
          <Flex vertical gap={token.margin}>
            {items.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: token.paddingSM,
                  borderRadius: token.borderRadius,
                  border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                }}
              >
                {/* `Row` yang membungkus, bukan satu baris flex kaku: di
                    375px kelima kendali dulu saling menghimpit. Nama barang
                    memakai baris penuh di layar sempit, ketiga angka berbagi
                    baris berikutnya. */}
                <Row gutter={[token.marginSM, token.marginSM]} align="bottom">
                  <Col xs={24} md={10} style={{ minWidth: 0 }}>
                    {itemLabel(`itemName-${i}`, t("common.itemName"))}
                    {/*
                      Dipilih dari persediaan, tidak lagi diketik (#491).
                      Bukan sekadar kenyamanan: sejak #493 dua barang boleh
                      bernama sama persis selama kodenya berbeda, jadi teks
                      bebas tidak bisa lagi menyatakan barang MANA yang
                      dimaksud. Label menampilkan `kode — nama` karena itulah
                      satu-satunya yang membedakan keduanya di mata pengguna.

                      `itemName` ikut disimpan sebagai SNAPSHOT: kontrak yang
                      sudah ditandatangani tidak boleh berubah bunyinya karena
                      seseorang mengganti nama barang di master.
                    */}
                    <SelectField
                      id={`itemName-${i}`}
                      placeholder={t("inventory.pickItemPlaceholder")}
                      value={item.itemId == null ? "" : String(item.itemId)}
                      /* `SelectField` memulangkan event SINTETIS (agar cocok
                         dengan react-hook-form), bukan nilai mentah — lihat
                         `selectChangeEvent` di `components/ui/select.tsx`. */
                      onChange={(e) => {
                        const value = e.target.value;
                        const picked = itemOptions.find((o) => String(o.id) === value);
                        if (!picked) return;
                        setItems((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, itemId: picked.id, itemName: picked.name } : row
                          )
                        );
                      }}
                      options={itemOptions.map((o) => ({
                        value: String(o.id),
                        label: `${o.code} — ${o.name}${o.unit ? ` (${o.unit})` : ""}`,
                      }))}
                    />
                  </Col>
                  <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                    {itemLabel(`bags-${i}`, t("common.bags"))}
                    {/* KUANTITAS (`Decimal(15,3)`), bukan uang — tanpa topeng
                        rupiah, desimalnya utuh. */}
                    <TextInput
                      id={`bags-${i}`}
                      type="number"
                      min={0}
                      style={numberStyle}
                      value={item.bags}
                      onChange={(e) => updateItem(i, "bags", Number(e.target.value))}
                    />
                  </Col>
                  <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                    {itemLabel(`kgPerBag-${i}`, t("common.kgPerBag"))}
                    <TextInput
                      id={`kgPerBag-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      style={numberStyle}
                      value={item.kgPerBag}
                      onChange={(e) => updateItem(i, "kgPerBag", Number(e.target.value))}
                    />
                  </Col>
                  <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                    {itemLabel(`pricePerKg-${i}`, t("contracts.pricePerKg"))}
                    <TextInput
                      id={`pricePerKg-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      style={numberStyle}
                      value={item.pricePerKg}
                      onChange={(e) => updateItem(i, "pricePerKg", Number(e.target.value))}
                    />
                  </Col>
                  <Col flex="none">
                    {/* `variant="danger"` di sini akan menggambar tombol isian
                        merah pekat untuk sebuah aksi baris; yang dibutuhkan
                        hanya WARNA ikonnya, jadi ia lewat `style` dan tombolnya
                        tetap `ghost`. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(i)}
                      style={{ color: token.colorError }}
                      disabled={items.length === 1}
                      aria-label={t("common.removeItemRow", { n: i + 1 })}
                    >
                      <DeleteOutlined aria-hidden="true" />
                    </Button>
                  </Col>
                </Row>
                <Typography.Paragraph
                  style={{
                    margin: 0,
                    marginTop: token.marginXS,
                    textAlign: "right",
                    fontSize: token.fontSizeSM,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  = {formatCurrency(item.bags * item.kgPerBag * item.pricePerKg, currency)}
                </Typography.Paragraph>
              </div>
            ))}
          </Flex>
        </CardContent>
      </Card>

      {/* ── Detail lengkap (issue #4) — tertutup secara default ── */}
      <div style={{ marginBottom: token.marginLG }}>
        <DisclosureSection
          description={t("contracts.advancedDescription")}
          summary={advancedSummary}
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          invalid={advancedInvalid}
        >
          <Row gutter={[token.margin, token.margin]}>
            <Col xs={24} sm={12}>
              <DueDateField value={dueDate} onChange={setDueDate} />
            </Col>
            <Col xs={24} sm={12}>
              <ConsigneeSelect consigneeId={consigneeId} onConsigneeIdChange={setConsigneeId} />
            </Col>
            <Col xs={24} sm={12}>
              <Input id="packaging" name="packaging" label={t("contracts.packaging")} />
            </Col>
            <Col xs={24} sm={12}>
              <Input id="shipment" name="shipment" label={t("contracts.shipment")} />
            </Col>
            <Col xs={24} sm={12}>
              <Input id="top1" name="top1" label={t("contracts.top1")} />
              <Typography.Text
                type="secondary"
                style={{
                  display: "block",
                  marginTop: token.marginXXS,
                  fontSize: token.fontSizeSM,
                }}
              >
                {t("contracts.top1Hint")}
              </Typography.Text>
            </Col>
            <Col xs={24} sm={12}>
              <Input id="top2" name="top2" label={t("contracts.top2")} />
            </Col>
            <Col xs={24} sm={12}>
              {/* Status lewat peta label bahasa tugas — nilai enum DB
                  (`pending`/`signed`/`canceled`) tidak pernah tampil mentah. */}
              <Select
                id="status"
                name="status"
                label={t("common.status")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                  { value: "pending", label: t("status.contract.pending") },
                  { value: "signed", label: t("contracts.statusSignedLong") },
                  { value: "canceled", label: t("status.contract.canceled") },
                ]}
              />
            </Col>
          </Row>
        </DisclosureSection>
      </div>

      <Card style={{ marginBottom: token.marginLG }}>
        <CardContent style={{ paddingBlock: token.paddingSM }}>
          <dl style={{ margin: 0 }}>
            <Flex align="center" justify="space-between" gap={token.marginSM}>
              <dt style={{ color: token.colorTextSecondary, fontWeight: token.fontWeightStrong }}>
                {t("contracts.estimatedValue", { currency })}
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontSize: token.fontSizeLG,
                  fontWeight: token.fontWeightStrong,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatCurrency(subtotal, currency)}
              </dd>
            </Flex>
            <Flex
              align="center"
              justify="space-between"
              gap={token.marginSM}
              style={{ marginTop: token.marginXXS }}
            >
              <dt style={{ color: token.colorTextSecondary }}>
                <TermTooltip term="buku_besar">{t("common.ledgerBaseIdr")}</TermTooltip>
              </dt>
              {/* Tanpa kurs, nilai dasarnya BELUM DIKETAHUI — ditulis dengan
                  kalimat, tidak pernah Rp 0. */}
              <dd
                style={{
                  margin: 0,
                  fontWeight: token.fontWeightStrong,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {baseUnknown(currency, rate)
                  ? t("contracts.fillRateFirst")
                  : formatCurrency(subtotal * (Number(rate) || 1), "IDR")}
              </dd>
            </Flex>
          </dl>
        </CardContent>
      </Card>

      <Flex wrap gap={token.marginSM}>
        <Button variant="primary" type="submit" disabled={loading}>
          {loading ? t("common.saving") : t("contracts.submit")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
      </Flex>
    </form>
  );
}
