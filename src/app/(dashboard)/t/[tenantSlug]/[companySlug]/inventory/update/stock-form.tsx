"use client";

/**
 * Tambah / Kurangi Stok — validasi anti-salah (issue #6).
 *
 * Layar ini adalah satu-satunya tempat stok berubah dengan tangan, dan
 * konsekuensinya besar: barang keluar langsung membentuk jurnal HPP dengan
 * harga pokok rata-rata tertimbang. Karena itu tiga larangan server ditampilkan
 * lebih dulu di sini — periode yang sudah ditutup, jumlah negatif, dan
 * pengeluaran melebihi saldo — ditambah satu ketukan konfirmasi untuk
 * pengeluaran besar. Tidak satu pun menggantikan penjaga di `/api/inventory`,
 * yang tetap menolak hal yang sama di dalam transaksinya sendiri.
 *
 * ── issue #216: mesinnya react-hook-form + zod ─────────────────────────────
 * Sampai #188 pemilih barang adalah `<select required>`, jadi "pilih barang"
 * muncul sebagai gelembung peramban seketika, tanpa jaringan. `Select` AntD
 * bukan kontrol native dan kehilangan itu; yang tersisa hanyalah `FormData`
 * yang dibaca sendiri lalu satu perjalanan bolak-balik ke server. Sekarang
 * `stockUpdateSchema` — skema yang SAMA dengan yang diurai `/api/inventory`,
 * diimpor bukan disalin — menolak barang/kuantitas/tanggal yang kosong di
 * client, dengan pesan inline berbahasa pengguna. Penjaga khas layar ini
 * (periode tertutup, saldo tak cukup, konfirmasi pengeluaran besar) berjalan
 * SESUDAHNYA, karena ketiganya butuh data yang tidak ada di dalam muatan.
 */

import { useState } from "react";
import { Flex } from "antd";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ContainerOutlined, ExclamationCircleOutlined, InfoCircleOutlined, LockOutlined } from "@ant-design/icons";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";
import {
  CostCenterField,
  costCenterPayload,
  useCostCenters,
} from "@/components/shared/cost-center-field";
import { formatNumber } from "@/lib/utils";
import {
  closedPeriodIssue,
  isLargeStockOut,
  largeStockOutMessage,
  stockShortfallMessage,
  type ClosedPeriodRef,
} from "@/lib/form-guards";
import { findStockShortfalls } from "@/lib/delivery-orders";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { applyServerFieldErrors } from "@/lib/form-server-errors";
import {
  itemSchema,
  stockUpdateSchema,
  type ItemInput,
  type StockUpdateInput,
} from "@/lib/validations/inventory";

/** `marginLG` 24 · `margin` 16 · `marginSM` 12 — token AntD sebagai angka. */
const SECTION_GAP = 24;
const FIELD_GAP = 16;
const CONTROL_GAP = 12;
/** `w-28` lama — lebar kotak satuan pada formulir barang baru. */
const UNIT_WIDTH = 112;
const EMPTY_ICON_SIZE = 48;
const ICON_SIZE = 16;
const SMALL_ICON_SIZE = 14;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

/** Kotak pesan sebaris — satu bentuk untuk galat, sukses, dan catatan. */
const NOTICE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  margin: 0,
  marginBottom: FIELD_GAP,
  padding: 12,
  borderRadius: "var(--ant-border-radius)",
};

/** Peringatan kecil di bawah isian — ikon + kalimat, warna uang negatif. */
const FIELD_WARNING: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
  margin: 0,
  marginTop: 4,
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-money-negative)",
};

const HINT: React.CSSProperties = {
  margin: 0,
  marginTop: 4,
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-secondary)",
};

const NUMERIC_FIELD: React.CSSProperties = {
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

export interface StockItemOption {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

interface StockPayload {
  itemId: number;
  quantity: number;
  type: "in" | "out";
  date: string;
  unitCost?: number;
  note: string;
  /** issue #98 — dimensi HPP gerakan ini. `null` = belum ditetapkan. */
  costCenterId: number | null;
}

/**
 * Isian sebagaimana DIKETIK/DIPILIH — string, seperti nilai kontrol HTML. Bukan
 * skema kedua: aturannya seluruhnya milik `stockUpdateSchema`.
 */
interface StockFormValues {
  itemId: string;
  type: "in" | "out";
  quantity: string;
  /** `undefined` saat kosong: harga pokok yang tak diisi BUKAN harga nol. */
  unitCost?: string;
  date: string;
  note: string;
}

/** Isian gerakan stok yang ada di layar — sisanya naik jadi galat formulir. */
const STOCK_FIELDS = ["itemId", "type", "quantity", "unitCost", "date", "note"] as const;
/** Isian barang baru yang ada di layar. */
const ITEM_FIELDS = ["name", "unit"] as const;

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function StockUpdateForm({
  items: initialItems,
  closedPeriods,
}: {
  items: StockItemOption[];
  closedPeriods: ClosedPeriodRef[];
}) {
  const t = useT();
  const router = useAppRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [items, setItems] = useState<StockItemOption[]>(initialItems);
  const [pending, setPending] = useState<StockPayload | null>(null);
  // issue #98 — pengeluaran stok MANUAL adalah satu-satunya jalur HPP tanpa
  // dokumen sumber untuk diwarisi, jadi dimensinya hanya bisa datang dari sini.
  const costCenters = useCostCenters();
  /*
   * Pusat biaya sengaja TIDAK ikut ke dalam state formulir: ia tidak pernah
   * wajib ("belum ditetapkan" adalah nilai yang sah, lihat `cost-center-field`),
   * jadi tidak ada satu pun aturan validasi yang bisa dilanggarnya. Nilainya
   * disatukan ke muatan saat dikirim.
   */
  const [costCenterId, setCostCenterId] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");

  // New item form
  const [showNewItem, setShowNewItem] = useState(false);

  const form = useForm<StockFormValues, unknown, StockUpdateInput>({
    // Cast HANYA menyelaraskan tipe statis; validasi runtime tetap milik skema.
    resolver: zodResolver(stockUpdateSchema) as unknown as Resolver<
      StockFormValues,
      unknown,
      StockUpdateInput
    >,
    defaultValues: {
      itemId: "",
      // Cost is captured on the way in; on the way out it is derived (weighted
      // average) and posted as HPP, so the field only applies to `in`.
      type: "in",
      quantity: "",
      unitCost: undefined,
      date: todayISO(),
      note: "",
    },
  });

  const itemForm = useForm<ItemInput>({
    resolver: zodResolver(itemSchema) as Resolver<ItemInput>,
    defaultValues: { name: "", unit: "kg" },
  });

  /* `useWatch` (bukan `form.watch()`) supaya React Compiler tetap bisa
     memoisasi komponen ini. */
  const [itemId, movementType, quantity, date] = useWatch({
    control: form.control,
    name: ["itemId", "type", "quantity", "date"],
  });

  const selected = items.find((i) => String(i.id) === itemId) ?? null;
  const periodIssue = closedPeriodIssue(date, closedPeriods, "Tanggal pergerakan stok");
  const qtyValue = Number(quantity) || 0;
  const overStock =
    movementType === "out" && selected != null && qtyValue > selected.currentStock;

  async function refreshItems() {
    // `active=1`: barang yang dinonaktifkan tidak ditawarkan untuk gerakan BARU
    // (issue #104); saldo & riwayatnya tetap tampil di laporan stok.
    const res = await apiFetch("/api/inventory?active=1");
    if (!res.ok) return;
    const data: { id: number; name: string; unit: string | null; currentStock: number }[] =
      await res.json();
    setItems(
      data.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        currentStock: i.currentStock ?? 0,
      }))
    );
  }

  async function onCreateItem(values: ItemInput) {
    const res = await apiFetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_item", ...values }),
    });

    if (res.ok) {
      itemForm.reset();
      setShowNewItem(false);
      await refreshItems();
      setSuccess(t("inventory.itemSaved"));
      setTimeout(() => setSuccess(""), 3000);
    } else {
      const data = await res.json().catch(() => null);
      applyServerFieldErrors(itemForm.setError, data ?? {}, ITEM_FIELDS, t("inventory.itemSaveFailed"));
    }
  }

  async function send(body: StockPayload) {
    setLoading(true);
    const res = await apiFetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      applyServerFieldErrors(
        form.setError,
        data ?? {},
        STOCK_FIELDS,
        t("inventory.movementSaveFailed")
      );
      setLoading(false);
    } else {
      setSuccess(t("inventory.movementSaved"));
      setLoading(false);
      form.resetField("quantity");
      await refreshItems();
      router.refresh();
      setTimeout(() => setSuccess(""), 3000);
    }
  }

  /**
   * Dijalankan HANYA setelah `stockUpdateSchema` menerima isiannya. Yang tersisa
   * di sini adalah tiga penjaga yang tidak bisa dilihat dari muatan saja: apakah
   * periodenya sudah ditutup, apakah saldonya cukup, dan apakah pengeluarannya
   * cukup besar untuk perlu dikonfirmasi.
   */
  function onSubmit(values: StockUpdateInput) {
    setSuccess("");

    if (periodIssue) {
      form.setError("date", { type: "guard", message: periodIssue });
      return;
    }

    const item = items.find((i) => i.id === values.itemId);
    if (values.type === "out" && item) {
      // Penjaga yang sama dengan surat jalan & `/api/inventory`: stok tidak
      // pernah boleh negatif.
      const shortfall = stockShortfallMessage(
        findStockShortfalls(
          [{ itemId: item.id, itemName: item.name, kg: values.quantity }],
          new Map([[item.id, item.currentStock]])
        )
      );
      if (shortfall) {
        form.setError("quantity", { type: "guard", message: shortfall });
        return;
      }
    }

    const body: StockPayload = {
      itemId: values.itemId,
      quantity: values.quantity,
      type: values.type,
      date: values.date,
      unitCost: values.type === "in" ? values.unitCost : undefined,
      note: values.note ?? "",
      costCenterId: costCenterPayload(costCenterId),
    };

    if (values.type === "out" && item && isLargeStockOut(values.quantity, item.currentStock)) {
      setConfirmMessage(
        largeStockOutMessage(item.name, values.quantity, item.currentStock, item.unit || "kg")
      );
      setPending(body);
      return;
    }

    void send(body);
  }

  /* Kedua formulir di layar ini menaruh galat non-field di kotak yang sama —
     hanya satu di antaranya yang bisa terisi pada satu waktu. */
  const noticeError =
    form.formState.errors.root?.message ?? itemForm.formState.errors.root?.message ?? "";

  return (
    <div style={{ width: "100%" }}>
      {/* `mb-1` lama tidak pernah berlaku: `PageHeader` menulis `marginBottom`
          sebaris, dan gaya sebaris selalu menang atas kelas. */}
      <PageHeader
        // Sub-halaman Stok tanpa remah roti memaksa pengguna kembali lewat menu
        // samping — satu-satunya jalan pulang sebelum ini.
        breadcrumbs={[
          { label: t("nav.items.inventory"), href: "/inventory" },
          { label: t("common.addRemoveStock") },
        ]}
        title={<TermTooltip term="persediaan">{t("common.addRemoveStock")}</TermTooltip>}
        description={t("inventory.updateDescription")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            style={{ flexShrink: 0 }}
            onClick={() => setShowNewItem(!showNewItem)}
          >
            {showNewItem ? t("common.cancel") : t("inventory.newItemToggle")}
          </Button>
        }
      />
      <div style={{ marginBottom: SECTION_GAP }}>
        <LearnMore term="hpp" label={t("inventory.learnMoreCogs")} />
      </div>

      {/* Galat TINGKAT FORMULIR: kegagalan yang tidak menunjuk satu isian pun
          (jaringan, mesin posting). Yang menunjuk isian mendarat di isiannya. */}
      {noticeError && (
        <div
          style={{
            ...NOTICE,
            background: "var(--ant-color-error-bg)",
            color: "var(--ant-color-money-negative)",
          }}
          role="alert"
        >
          <ExclamationCircleOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, flexShrink: 0, marginTop: 2 }} />
          <span>{noticeError}</span>
        </div>
      )}
      {success && (
        <div
          style={{
            ...NOTICE,
            background: "var(--ant-color-success-bg)",
            color: "var(--ant-color-money-positive)",
          }}
          role="status"
        >
          {success}
        </div>
      )}

      {/* New Item Form */}
      {showNewItem && (
        <Card style={{ marginBottom: SECTION_GAP }}>
          <div
            style={{
              padding: "var(--ant-padding-lg)",
              borderBottom: "1px solid var(--ant-color-border-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: STRONG }}>
              {t("inventory.newItemTitle")}
            </h2>
          </div>
          <div style={{ padding: "var(--ant-padding-lg)" }}>
            <Form {...itemForm}>
              {/* `noValidate`: validasinya milik `itemSchema` sekarang. */}
              {/* `<form>` biasa, bukan `Flex component="form"`: tipe `Flex`
                  tidak mengenal atribut `<form>` (`noValidate`), dan
                  memaksakannya lewat cast akan menyembunyikan atribut lain yang
                  memang perlu. Tata letaknya tetap flex sebaris. */}
              <form
                onSubmit={itemForm.handleSubmit(onCreateItem)}
                noValidate
                style={{ display: "flex", alignItems: "flex-end", gap: CONTROL_GAP }}
              >
                <div style={{ flex: 1 }}>
                  <FormField
                    control={itemForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("common.itemName")}</FormLabel>
                        <FormControl>
                          <TextInput {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div style={{ width: UNIT_WIDTH }}>
                  <FormField
                    control={itemForm.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.unit")}</FormLabel>
                        <FormControl>
                          <TextInput {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Aksi SAMPINGAN (#267): membuat barang master di sini
                    memang mengikat, tetapi tugas layar ini adalah mencatat
                    PERGERAKAN stok — panel ini hanya jalan pintas supaya
                    barang yang belum terdaftar tidak memaksa keluar halaman.
                    Bentuknya sama dengan `shared/advance-compensation.tsx`
                    di potongan 2: memposting, tapi bukan maksud layarnya. */}
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={itemForm.formState.isSubmitting}
                >
                  {t("common.save")}
                </Button>
              </form>
            </Form>
          </div>
        </Card>
      )}

      {/* Stock Update Form */}
      <Card>
        <div
          style={{
            padding: "var(--ant-padding-lg)",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: STRONG }}>
            {t("inventory.movementTitle")}
          </h2>
        </div>
        <div style={{ padding: "var(--ant-padding-lg)" }}>
          {items.length === 0 ? (
            <EmptyState
              icon={<ContainerOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("inventory.emptyFormTitle")}
              description={t("inventory.emptyFormDescription")}
            />
          ) : (
            <Form {...form}>
              {/* `noValidate`: validasinya milik zod sekarang, dan gelembung
                  peramban di samping pesan inline adalah dua bahasa galat di
                  satu layar. */}
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                noValidate
                style={{ display: "flex", flexDirection: "column", gap: FIELD_GAP }}
              >
                <div>
                  <FormField
                    control={form.control}
                    name="itemId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("common.item")}</FormLabel>
                        <FormControl>
                          <SelectField
                            placeholder={t("inventory.pickItemPlaceholder")}
                            options={items.map((item) => ({
                              value: String(item.id),
                              label: `${item.name}${item.unit ? ` (${item.unit})` : ""}`,
                            }))}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {selected && (
                    <p style={{ ...HINT, fontVariantNumeric: "tabular-nums" }}>
                      {t("inventory.currentStockHint", {
                        qty: formatNumber(selected.currentStock),
                        unit: selected.unit || "kg",
                      })}
                    </p>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.movementTypeLabel")}</FormLabel>
                      <FormControl>
                        <SelectField
                          options={[
                            { value: "in", label: t("inventory.movementIn") },
                            { value: "out", label: t("inventory.movementOut") },
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
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("common.quantity")}</FormLabel>
                        <FormControl>
                          <TextInput
                            type="number"
                            step="0.01"
                            min="0"
                            style={NUMERIC_FIELD}
                            {...field}
                          />
                        </FormControl>
                        {/* Saldo tak cukup mendarat di sini juga — penjaganya
                            berjalan setelah skema, tetapi galatnya milik isian
                            yang sama. */}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {overStock && selected && (
                    <p style={FIELD_WARNING} role="alert">
                      <ExclamationCircleOutlined aria-hidden="true" style={{ fontSize: SMALL_ICON_SIZE, flexShrink: 0, marginTop: 2 }} />
                      <span>
                        {t("inventory.overStockWarning", {
                          qty: formatNumber(selected.currentStock),
                          unit: selected.unit || "kg",
                        })}
                      </span>
                    </p>
                  )}
                </div>
                {movementType === "in" ? (
                  /* Wajib HANYA di arah ini — sama persis dengan yang dituntut
                     `superRefine` pada `stockUpdateSchema`. */
                  <FormField
                    control={form.control}
                    name="unitCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>
                          <TermTooltip term="hpp">{t("inventory.unitCostLabel")}</TermTooltip>
                        </FormLabel>
                        <FormControl>
                          <TextInput
                            type="number"
                            step="0.01"
                            min="0"
                            style={NUMERIC_FIELD}
                            {...field}
                            value={field.value ?? ""}
                            /* Kosong = harga pokok TIDAK DIISI, bukan harga nol:
                               `""` akan ter-coerce menjadi 0 dan mengeluh
                               "harus lebih besar dari 0" alih-alih "wajib
                               diisi untuk barang masuk". */
                            onChange={(e) =>
                              field.onChange(e.target.value === "" ? undefined : e.target.value)
                            }
                          />
                        </FormControl>
                        <FormDescription>{t("inventory.unitCostHint")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <p
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                      margin: 0,
                      padding: "8px 12px",
                      borderRadius: "var(--ant-border-radius)",
                      background: "var(--ant-color-fill-quaternary)",
                      fontSize: "var(--ant-font-size-sm)",
                      color: "var(--ant-color-text-secondary)",
                    }}
                  >
                    <InfoCircleOutlined aria-hidden="true" style={{ fontSize: SMALL_ICON_SIZE, flexShrink: 0, marginTop: 2 }} />
                    <span>{t("inventory.cogsAutoHint")}</span>
                  </p>
                )}
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
                    <p style={FIELD_WARNING} role="alert">
                      <LockOutlined aria-hidden="true" style={{ fontSize: SMALL_ICON_SIZE, flexShrink: 0, marginTop: 2 }} />
                      <span>{periodIssue}</span>
                    </p>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.notesOptional")}</FormLabel>
                      <FormControl>
                        <TextInput {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Di luar state formulir dengan sengaja — lihat catatan pada
                    `costCenterId` di atas. */}
                <CostCenterField
                  costCenters={costCenters}
                  value={costCenterId}
                  onChange={setCostCenterId}
                  hint={t("costCenters.stockPickerHint")}
                />

                <Flex gap={CONTROL_GAP}>
                  {/* Aksi utama layar ini (#267): pergerakan stok masuk buku. */}
                  <Button type="submit" variant="primary" disabled={loading}>
                    {loading ? t("common.saving") : t("inventory.submitMovement")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => router.push("/inventory")}
                  >
                    {t("inventory.backToInventory")}
                  </Button>
                </Flex>
              </form>
            </Form>
          )}
        </div>
      </Card>

      {/* Konfirmasi pengeluaran stok besar (issue #6). */}
      <ConfirmDialog
        title={t("inventory.largeOutTitle")}
        message={confirmMessage}
        confirmLabel={t("inventory.largeOutConfirm")}
        confirmVariant="danger"
        open={pending != null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        onConfirm={async () => {
          if (pending) await send(pending);
        }}
      />
    </div>
  );
}
