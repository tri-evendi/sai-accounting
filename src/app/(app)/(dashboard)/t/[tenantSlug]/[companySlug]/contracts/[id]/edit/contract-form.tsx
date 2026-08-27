"use client";

/**
 * Ubah Kontrak — dikonversi ke token Ant Design pada issue #195 (fase C3).
 *
 * Yang berubah hanya kulitnya: `className` Tailwind → `Row`/`Col`/`Flex` +
 * token `theme.useToken()`. Mesin formulirnya (state lokal + `FormData`) dan
 * `CurrencyRateFields` — satu-satunya tempat aturan "dokumen valas wajib
 * membawa kursnya sendiri" dinyatakan di layar — sengaja tidak disentuh.
 *
 * Satu perbaikan ikut karena konversinya memaksa menyebut idnya: label baris
 * barang dulu `<label>` TANPA `htmlFor`, jadi ia tidak tertaut ke isian mana
 * pun. Sekarang tertaut, sama seperti formulir Buat Kontrak.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CurrencyRateFields,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { ConsigneeSelect } from "@/components/shared/consignee-select";
import {
  CustomerSelect,
  type ContractCustomerRef,
} from "@/components/shared/customer-select";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { DueDateField } from "@/components/shared/due-date-field";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/** Lebar dasar kolom kuantitas pada baris barang (`w-20`/`w-24`/`w-28` lama). */
const QTY_COL_BASIS = 96;

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — dipakai untuk blok
 * yang WAJIB berupa CSS grid, yaitu `CurrencyRateFields` yang menaruh anaknya
 * dengan `gridColumn: "1 / -1"`. Penjelasan lengkap rumusnya ada di
 * `contracts/new/contract-form.tsx`; ringkasnya, `max(280px, (100% − gutter)/2)`
 * menahan jumlah kolomnya di dua dan membuat titik patahnya jatuh di 576px —
 * `sm` AntD.
 */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});

interface ContractItem {
  /** Barang dari master (#491). `null` pada baris kontrak lama yang tak tertaut. */
  itemId: number | null;
  itemName: string;
  bags: number;
  kgPerBag: number;
  pricePerKg: number;
}

interface ContractData {
  id: number;
  contractNo: string;
  date: string;
  dueDate: string | null;
  buyer: string;
  /** Tautan master pembeli (migrasi 0057). NULL pada kontrak warisan. */
  customerId: number | null;
  customerRef: ContractCustomerRef | null;
  consignee: string | null;
  consigneeId: number | null;
  consigneeRef: { id: number; name: string; country: string | null; contact: string | null } | null;
  packaging: string | null;
  shipment: string | null;
  top1: string | null;
  top2: string | null;
  currency: string;
  /** Stored since issue #36; null on contracts created before migration 0008. */
  rate: string | number | null;
  status: string;
  items: ContractItem[];
}

export function EditContractForm() {
  const router = useAppRouter();
  const params = useParams();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [contract, setContract] = useState<ContractData | null>(null);
  const [items, setItems] = useState<ContractItem[]>([]);
  // Prefilled from the contract itself since issue #36 — an edit no longer has to
  // re-enter the rate. Legacy contracts stored none, so theirs comes up blank and
  // must be filled before the repost can value the journal.
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  // Master consignee link (issue #22); prefilled from the contract, free text kept.
  const [consigneeId, setConsigneeId] = useState<number | null>(null);
  /* Pembeli (migrasi 0057). TIDAK diwajibkan di layar ini: sebagian besar
     kontrak yang ada masuk ke sini dengan `customerId` NULL, dan memaksa
     tautannya sebelum menyimpan berarti sebuah perbaikan ejaan pun menuntut
     seseorang lebih dulu menebak pembelinya. Yang tertaut tetap tertaut. */
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [buyer, setBuyer] = useState("");
  /* Pilihan barang (#491). Dibaca di sini, bukan diserahkan ke server component:
     layar ini memang sudah menjemput kontraknya sendiri lewat `apiFetch`. */
  const [itemOptions, setItemOptions] = useState<
    { id: number; code: string; name: string; unit: string | null }[]
  >([]);

  useEffect(() => {
    apiFetch(`/api/contracts/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("contracts.loadFailed"));
        return res.json();
      })
      .then((data) => {
        setContract(data);
        setCurrency(data.currency);
        setRate(data.rate == null ? "" : String(data.rate));
        setConsigneeId(data.consigneeId ?? null);
        /* Dibawa PULANG apa adanya, alasan yang sama dengan `itemId` di bawah:
           menyunting kontrak tidak boleh diam-diam memutus tautan pembelinya. */
        setCustomerId(data.customerId ?? null);
        setBuyer(data.buyer ?? "");
        setItems(
          data.items.map((item: ContractItem & { id?: number }) => ({
            /* Dibawa PULANG apa adanya: menyunting kontrak tidak boleh diam-diam
               memutus tautan barangnya. Baris lama yang memang belum tertaut
               tetap `null`, dan perhitungan sisanya jatuh ke pencocokan nama —
               persis seperti sebelum #491. */
            itemId: item.itemId ?? null,
            itemName: item.itemName,
            bags: Number(item.bags),
            kgPerBag: Number(item.kgPerBag),
            pricePerKg: Number(item.pricePerKg),
          }))
        );
        setFetching(false);
      })
      .catch((err) => {
        setError(err.message);
        setFetching(false);
      });
  }, [params.id, t]);

  /* `active=1` — barang nonaktif tidak ditawarkan untuk baris BARU (#104);
     baris lama yang menyebutnya tetap terbaca lewat `itemName`-nya. */
  useEffect(() => {
    apiFetch("/api/inventory?active=1")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { id: number; code: string; name: string; unit: string | null }[]) =>
        setItemOptions(data.map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit })))
      )
      .catch(() => setItemOptions([]));
  }, []);

  function addItem() {
    setItems([...items, { itemId: null, itemName: "", bags: 0, kgPerBag: 0, pricePerKg: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ContractItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
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
      items,
    };

    const res = await apiFetch(`/api/contracts/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || t("contracts.updateFailed")));
      setLoading(false);
    } else {
      router.push(`/contracts/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) {
    return <PageLoader message={t("contracts.loadingContract")} />;
  }

  if (!contract) {
    return (
      <div role="alert">
        <Alert type="error" showIcon message={t("contracts.notFound")} />
      </div>
    );
  }

  const dateStr = new Date(contract.date).toISOString().split("T")[0];
  // Blank when null — an unknown due date must not default to the document date.
  const dueDateStr = contract.dueDate ? new Date(contract.dueDate).toISOString().split("T")[0] : "";

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

  /** Isian angka baris barang — rata kanan + `tabular-nums`. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("contracts.breadcrumb"), href: "/contracts" },
          { label: t("contracts.editTitle", { no: contract.contractNo }) },
        ]}
        title={t("contracts.editTitle", { no: contract.contractNo })}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader><CardTitle level={2}>{t("contracts.detailsTitle")}</CardTitle></CardHeader>
          <CardContent>
            <Row gutter={[token.margin, token.margin]}>
              <Col xs={24} sm={12}>
                <Input id="contractNo" name="contractNo" label={t("contracts.contractNo")} defaultValue={contract.contractNo} required />
              </Col>
              <Col xs={24} sm={12}>
                <Input id="date" name="date" type="date" label={t("contracts.contractDate")} defaultValue={dateStr} required />
              </Col>
              <Col xs={24} sm={12}>
                <DueDateField defaultValue={dueDateStr} />
              </Col>
              {/* Baris PENUH, sama dengan formulir kontrak baru: isian ini tiga
                  bagian (pemilih master, kalimat "belum ada di daftar?", nama
                  tercetak), bukan satu kotak teks seperti sebelum migrasi 0057. */}
              <Col span={24}>
                <CustomerSelect
                  customerId={customerId}
                  onCustomerIdChange={setCustomerId}
                  buyer={buyer}
                  onBuyerChange={setBuyer}
                  current={contract.customerRef}
                />
              </Col>
              <Col xs={24} sm={12}>
                <ConsigneeSelect
                  consigneeId={consigneeId}
                  onConsigneeIdChange={setConsigneeId}
                  defaultText={contract.consignee || ""}
                  current={contract.consigneeRef}
                />
              </Col>
              <Col xs={24} sm={12}>
                <Input id="packaging" name="packaging" label={t("contracts.packaging")} defaultValue={contract.packaging || ""} />
              </Col>
              <Col xs={24} sm={12}>
                <Input id="shipment" name="shipment" label={t("contracts.shipment")} defaultValue={contract.shipment || ""} />
              </Col>
              <Col xs={24} sm={12}>
                <Input id="top1" name="top1" label={t("contracts.top1")} defaultValue={contract.top1 || ""} />
              </Col>
              <Col xs={24} sm={12}>
                <Input id="top2" name="top2" label={t("contracts.top2")} defaultValue={contract.top2 || ""} />
              </Col>
              {/* Valas: isian kurs hanya muncul untuk mata uang bukan-IDR.
                  `CurrencyRateFields` memberi DUA sel kisi sekaligus sebagai
                  fragmen, jadi ia mendapat kisi dua kolomnya sendiri di sini —
                  bukan dua `Col`. Sel kurs tetap ada (kosong) untuk IDR supaya
                  kisinya tak melompat saat mata uang diganti. */}
              <Col span={24}>
                <div style={twoColumnGrid(token.margin)}>
                  <CurrencyRateFields
                    currency={currency}
                    rate={rate}
                    onCurrencyChange={setCurrency}
                    onRateChange={setRate}
                    currencyLabel={t("common.currency")}
                    rateHint={t("contracts.rateHintEdit")}
                  />
                </div>
              </Col>
              <Col xs={24} sm={12}>
                {/* Status lewat peta label bahasa tugas; nilai enum DB tidak
                    pernah tampil mentah. */}
                <Select
                  id="status" name="status" label={t("common.status")}
                  defaultValue={contract.status}
                  options={[
                    { value: "pending", label: t("status.contract.pending") },
                    { value: "signed", label: t("status.contract.signed") },
                    { value: "canceled", label: t("status.contract.canceled") },
                  ]}
                />
              </Col>
            </Row>
          </CardContent>
        </Card>

        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
              <CardTitle level={2}>{t("contracts.goodsTitle")}</CardTitle>
              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
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
                  {/* `Row` yang membungkus menggantikan satu baris flex kaku:
                      di 375px kelima kendali dulu saling menghimpit. */}
                  <Row gutter={[token.marginSM, token.marginSM]} align="bottom">
                    <Col xs={24} md={10} style={{ minWidth: 0 }}>
                      {itemLabel(`itemName-${i}`, t("common.itemName"))}
                      {/* Dipilih dari persediaan (#491) — cerminan layar Buat
                          Kontrak. Kalau layar ini tetap teks bebas, menyunting
                          kontrak yang sudah tertaut akan diam-diam memutus
                          tautannya, dan sisa kontraknya kembali dijodohkan
                          lewat nama. */}
                      <SelectField
                        id={`itemName-${i}`}
                        placeholder={t("inventory.pickItemPlaceholder")}
                        value={item.itemId == null ? "" : String(item.itemId)}
                        onChange={(e) => {
                          const picked = itemOptions.find(
                            (o) => String(o.id) === e.target.value
                          );
                          if (!picked) return;
                          setItems((prev) =>
                            prev.map((row, idx) =>
                              idx === i
                                ? { ...row, itemId: picked.id, itemName: picked.name }
                                : row
                            )
                          );
                        }}
                        options={itemOptions.map((o) => ({
                          value: String(o.id),
                          label: `${o.code} — ${o.name}${o.unit ? ` (${o.unit})` : ""}`,
                        }))}
                      />
                      {/* Baris LAMA yang belum tertaut: namanya tetap terbaca
                          meski pemilih di atasnya masih kosong. Menyembunyikannya
                          akan membuat kontrak lama tampak kehilangan barangnya. */}
                      {item.itemId == null && item.itemName && (
                        <p
                          style={{
                            margin: 0,
                            marginTop: token.marginXXS,
                            fontSize: token.fontSizeSM,
                            color: token.colorTextSecondary,
                          }}
                        >
                          {t("contracts.unlinkedItemName", { name: item.itemName })}
                        </p>
                      )}
                    </Col>
                    <Col flex={`1 1 ${QTY_COL_BASIS}px`}>
                      {itemLabel(`bags-${i}`, t("common.bags"))}
                      {/* KUANTITAS (`Decimal(15,3)`), bukan uang. */}
                      <TextInput
                        id={`bags-${i}`}
                        type="number"
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
                        step="0.01"
                        style={numberStyle}
                        value={item.pricePerKg}
                        onChange={(e) => updateItem(i, "pricePerKg", Number(e.target.value))}
                      />
                    </Col>
                    <Col flex="none">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(i)}
                        aria-label={t("common.removeItemRow", { n: i + 1 })}
                        style={{ color: token.colorError }}
                      >
                        <DeleteOutlined aria-hidden="true" />
                      </Button>
                    </Col>
                  </Row>
                </div>
              ))}
            </Flex>
          </CardContent>
        </Card>

        <Flex wrap gap={token.marginSM}>
          <Button variant="primary" type="submit" disabled={loading}>{loading ? t("common.saving") : t("common.saveChanges")}</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>{t("common.cancel")}</Button>
        </Flex>
      </form>
    </div>
  );
}
