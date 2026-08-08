"use client";

/**
 * Form pembayaran (percontohan transaksi kompleks, issue #53).
 *
 * Dipakai untuk mencatat pembayaran kontrak maupun faktur — keduanya berbagi
 * `paymentFormSchema` yang SAMA dengan yang dipakai route handler
 * `/api/{contracts,invoices}/[id]/payments` (via `paymentFormFields`), jadi
 * validasi valas — "kurs wajib untuk mata uang asing" — dijalankan identik di
 * client dan server. Untuk app pembukuan ini penting: salah nominal/kurs yang
 * lolos berarti jurnal salah.
 *
 * Yang diperagakan:
 *   • react-hook-form + zodResolver, bukan `useState` + `FormData` manual;
 *   • `MoneyInput` — pengguna melihat `1.234.567`, payload menerima `1234567`;
 *   • progressive disclosure — field kurs baru muncul saat mata uang bukan IDR
 *     (aturan form MASTER.md), dan skema menuntutnya hanya di kondisi itu;
 *   • error inline `role="alert"` yang tertaut ARIA ke tiap field;
 *   • kegagalan validasi SERVER dipetakan kembali ke field-nya masing-masing
 *     (aturan 7), bukan diringkas menjadi satu pita merah di atas formulir.
 *
 * Sejak issue #192 primitif `Form` berdiri di atas `Form.Item` AntD. Berkas ini
 * tidak berubah karenanya — API primitifnya sama — kecuali dua hal yang memang
 * kurang sejak awal dan baru sekarang punya tempatnya: tanda wajib pada isian
 * yang dituntut skema, dan pemetaan galat server per field.
 */

import { useState } from "react";
import { Alert, Col, Flex, Row, theme, Typography } from "antd";
import { useForm, useWatch, type Resolver, type UseFormSetError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import { paymentFormSchema, type PaymentFormInput } from "@/lib/validations/payment";
import { BASE_CURRENCY, CURRENCY_VALUES } from "@/lib/validations/fx";
import { DollarOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

interface PaymentFormProps {
  entityType: "contracts" | "invoices";
  entityId: number;
  onSuccess?: () => void;
}

/** Bentuk jawaban 400 baku route handler (lihat MASTER.md §Konvensi Form). */
interface ServerErrorBody {
  error?: string;
  details?: { fieldErrors?: Record<string, string[] | undefined> };
}

/**
 * Field yang benar-benar diketik di formulir ini. Skema server menambah
 * `contractId`/`invoiceId` dari URL, jadi `fieldErrors` bisa memuat nama yang
 * TIDAK punya isian di layar — dan menaruh galatnya di sana berarti pesan yang
 * tak pernah terlihat siapa pun.
 */
const PAYMENT_FIELDS = ["date", "amount", "currency", "rate", "note"] as const;

function isPaymentField(name: string): name is (typeof PAYMENT_FIELDS)[number] {
  return (PAYMENT_FIELDS as readonly string[]).includes(name);
}

/**
 * Kegagalan validasi server → `form.setError` (aturan 7 Konvensi Form).
 *
 * Pesannya sudah berbahasa pengguna saat tiba di sini (`translateFieldErrors`
 * di route handler), jadi `FormMessage` meneruskannya apa adanya — itulah
 * cabang "bukan kunci" di `translateMessage`.
 *
 * Diekspor untuk diuji: inilah satu-satunya bagian formulir ini yang berjalan
 * SETELAH jaringan, yaitu bagian yang tidak pernah tersentuh saat seseorang
 * mencoba formulirnya dengan tangan.
 */
export function applyPaymentServerErrors(
  setError: UseFormSetError<PaymentFormInput>,
  body: ServerErrorBody,
  fallback: string
): void {
  const fieldErrors = body.details?.fieldErrors ?? {};
  /* Galat yang menunjuk field di luar layar tidak boleh ditelan — ia naik
   * menjadi galat formulir, tempat pengguna masih bisa membacanya. */
  const offscreen: string[] = [];
  let placed = false;

  for (const [name, messages] of Object.entries(fieldErrors)) {
    const message = messages?.[0];
    if (!message) continue;
    if (isPaymentField(name)) {
      setError(name, { type: "server", message });
      placed = true;
    } else {
      offscreen.push(message);
    }
  }

  if (offscreen.length > 0 || !placed) {
    setError("root", { message: String(offscreen[0] || body.error || fallback) });
  }
}

export function PaymentForm({ entityType, entityId, onSuccess }: PaymentFormProps) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();

  const form = useForm<PaymentFormInput>({
    // `currency` punya default dan `amount`/`rate` memakai coerce, jadi tipe
    // INPUT skema berbeda dari OUTPUT; kita pakai tipe OUTPUT untuk field
    // (amount: number, dsb.) lalu cast resolver — lihat catatan sama di form
    // pelanggan. Runtime validation tetap utuh, ini murni penyelarasan tipe.
    resolver: zodResolver(paymentFormSchema) as Resolver<PaymentFormInput>,
    defaultValues: {
      date: "",
      amount: undefined,
      currency: "USD",
      rate: undefined,
      note: "",
    },
  });

  // Field kurs hanya relevan (dan hanya divalidasi) untuk mata uang asing.
  // `useWatch` (bukan `form.watch()`) supaya React Compiler tetap bisa
  // memoisasi komponen ini.
  const currency = useWatch({ control: form.control, name: "currency" });
  const isForeign = currency !== BASE_CURRENCY;

  async function onSubmit(values: PaymentFormInput) {
    const res = await apiFetch(`/api/${entityType}/${entityId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        // Untuk IDR kurs tidak dikirim — server memperlakukannya 1:1.
        rate: isForeign ? values.rate : undefined,
      }),
    });

    if (!res.ok) {
      const data: ServerErrorBody = await res.json().catch(() => ({}));
      applyPaymentServerErrors(form.setError, data, t("payments.errSave"));
      return;
    }

    toast(t("payments.saved"));
    form.reset();
    setOpen(false);
    onSuccess?.();
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <DollarOutlined aria-hidden="true" /> {t("payments.addPayment")}
      </Button>
    );
  }

  return (
    /*
     * Panel bawahan, bukan `Card`: `Card` menggambar permukaan `colorBgContainer`
     * yang sewarna dengan halaman di sekelilingnya di sini. Yang dibutuhkan
     * justru kebalikannya — bidang yang sedikit lebih pekat dari wadahnya,
     * yaitu peran `colorFillAlter` (padanan `bg-muted/40` lama). Batasnya
     * `colorBorderSecondary` (#208, 3,08:1), jadi ia tetap terlihat di tema
     * gelap tempat panel dan halaman nyaris sewarna.
     */
    <div
      style={{
        marginTop: token.margin,
        padding: token.padding,
        borderRadius: token.borderRadiusLG,
        border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        background: token.colorFillAlter,
      }}
    >
      <Typography.Title
        level={4}
        style={{ fontSize: token.fontSize, marginTop: 0, marginBottom: token.marginSM }}
      >
        {t("payments.formTitle")}
      </Typography.Title>

      <Form {...form}>
        {/*
         * `Row`/`Col` menggantikan `grid gap-3 sm:grid-cols-2`. Titik patahnya
         * kini `sm` AntD (576px), bukan `sm` Tailwind (640px) — pergeseran yang
         * disengaja: seluruh aplikasi berpindah ke satu tangga titik patah, dan
         * dua tangga yang berbeda 64px adalah persis jenis selisih yang tak
         * terlihat sampai satu layar 600px memperlihatkannya.
         */}
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Row gutter={[token.marginSM, token.marginSM]}>
            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    {/* Tanda wajib mengikuti SKEMA, bukan selera: ketiga isian ini
                        dituntut `paymentFormFields`, jadi tandanya ada di sini dan
                        `aria-required` ikut terpasang otomatis lewat `FormControl`. */}
                    <FormLabel required>{t("common.date")}</FormLabel>
                    <FormControl>
                      <TextInput type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>

            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("common.amount")}</FormLabel>
                    <FormControl>
                      <MoneyInput
                        // Rupiah tanpa desimal; valas 2 desimal.
                        decimals={isForeign ? 2 : 0}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>

            <Col xs={24} sm={12}>
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("common.currency")}</FormLabel>
                    <FormControl>
                      <SelectField
                        options={CURRENCY_VALUES.map((c) => ({ value: c, label: c }))}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Col>

            {/* Progressive disclosure: kurs hanya muncul untuk mata uang asing.
                Kolomnya ikut hilang bersamanya — `Row` menutup celahnya sendiri,
                jadi tidak ada sel kosong yang tertinggal di 768px ke atas. */}
            {isForeign && (
              <Col xs={24} sm={12}>
                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      {/* Wajib HANYA di kondisi ini — sama persis dengan yang
                          dituntut `requireRateForForeign` di skema. Tanda `*` yang
                          muncul-hilang bersama isiannya adalah bentuk paling jujur
                          dari progressive disclosure. */}
                      <FormLabel required>{t("fx.rateToIdr", { currency })}</FormLabel>
                      <FormControl>
                        <MoneyInput
                          decimals={2}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                        />
                      </FormControl>
                      <FormDescription>
                        {t("payments.rateHint")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Col>
            )}

            <Col span={24}>
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
            </Col>

            {form.formState.errors.root && (
              <Col span={24}>
                {/*
                 * Galat TINGKAT FORMULIR (aturan 7 Konvensi Form) — kegagalan
                 * server yang tidak menunjuk satu isian pun. Kini `Alert` AntD:
                 * teksnya `colorText` di atas `colorErrorBg`, bukan merah di
                 * atas merah muda, dan ikonnya membuat maknanya tidak
                 * bergantung warna. `role="alert"` tetap milik kita — AntD
                 * tidak memasangnya, dan tanpa itu pesannya tidak diumumkan.
                 *
                 * Ini blok yang, menurut catatan #192, ditulis sendiri-sendiri
                 * di enam berkas. Belum diangkat jadi primitif `FormRootError`
                 * di sini — tempatnya `components/ui/form.tsx`, di luar
                 * ruang lingkup issue ini.
                 */}
                <div role="alert">
                  <Alert type="error" showIcon message={form.formState.errors.root.message} />
                </div>
              </Col>
            )}

            <Col span={24}>
              <Flex gap={token.marginXS}>
                {/* Aksi utama layar detail faktur/kontrak (#267): ia MENGIKAT
                    — satu baris pembayaran masuk ke buku. Pemicunya (baris 166)
                    `secondary`, jadi selama formulir tertutup layarnya tidak
                    memikul satu pun primer; yang membuka formulir ini sudah
                    memutuskan hendak mencatat. */}
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? t("common.saving") : t("payments.submit")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
              </Flex>
            </Col>
          </Row>
        </form>
      </Form>
    </div>
  );
}
