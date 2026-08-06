"use client";

/**
 * Form pelanggan baru — percontohan pola form (issue #53): react-hook-form +
 * zodResolver dengan `customerSchema` yang SAMA dipakai route handler
 * `/api/customers` (diimpor, bukan disalin), jadi validasi client dan server
 * tidak bisa menyimpang.
 *
 * Yang berubah dari versi lama: dulu `useState` + `FormData` manual, error
 * server hanya muncul sebagai satu pita merah di atas form tanpa tahu field
 * mana yang salah. Kini tiap field memvalidasi inline dengan `aria-invalid` +
 * pesan `role="alert"` yang tertaut, dan teksnya berbahasa Indonesia.
 *
 * ── Catatan issue #192 ─────────────────────────────────────────────────────
 * Sejak #192 primitif `Form` berdiri di atas `Form.Item` Ant Design. Berkas ini
 * TIDAK berubah satu baris pun karenanya, dan justru itulah buktinya: mesin
 * formulir (react-hook-form + `customerSchema`) tidak ikut berpindah tangan,
 * hanya kulitnya. Acuan yang berpasangan dengan berkas ini —
 * `components/shared/payment-form.tsx` — memikul kasus yang sulit (valas,
 * kurs bersyarat, galat server per field).
 *
 * ── Catatan issue #196 ─────────────────────────────────────────────────────
 * Konversi C4 menyentuh KULITNYA saja: `grid gap-4 sm:grid-cols-2` menjadi
 * `Row`/`Col`, jarak menjadi token, dan galat formulir menjadi `Alert` AntD.
 * Satu hal yang TIDAK bisa dilakukan dan perlu diketahui penyunting berikutnya:
 * `FormItem` tidak menerima prop tata letak apa pun selain gaya simpul
 * terluarnya — jadi field yang harus membentang penuh dibungkus `Col
 * span={24}`, bukan diberi `gridColumn` sendiri.
 */

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/ui/page-header";
import { customerSchema, type CustomerInput } from "@/lib/validations/finance";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function NewCustomerForm() {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();

  const form = useForm<CustomerInput>({
    // `customerSchema` punya `taxExempt: z.boolean().default(false)`, jadi tipe
    // INPUT-nya (`taxExempt?`) berbeda dari tipe OUTPUT (`taxExempt: boolean`).
    // `useForm` menyatukan keduanya ke satu generik; kita memilih tipe OUTPUT
    // agar `field.value` bertipe konkret (boolean, bukan boolean|undefined),
    // lalu resolver di-cast. Validasi runtime tetap dijalankan `zodResolver`
    // apa adanya — hanya static type yang diselaraskan.
    resolver: zodResolver(customerSchema) as Resolver<CustomerInput>,
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
      pic: "",
      npwp: "",
      taxExempt: false,
    },
  });

  async function onSubmit(values: CustomerInput) {
    const res = await apiFetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // Server tetap penjaga terakhir; jika sesuatu lolos validasi client
      // (mis. nama sudah dipakai), tampilkan pesannya di field atau sebagai
      // error form.
      form.setError("root", {
        message: data.error || t("customers.saveFailed"),
      });
      return;
    }

    toast(t("customers.saved"));
    router.push("/customers");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("customers.breadcrumb"), href: "/customers" },
          { label: t("customers.newTitle") },
        ]}
        title={t("customers.newTitle")}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Card style={{ marginBottom: token.marginLG }}>
            <CardHeader>
              <CardTitle>{t("customers.dataTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Baris yang membungkus: 1 kolom di ponsel, 2 sejak `sm` (576px).
                  Field panjang (nama, alamat, centang pajak) mengambil baris
                  penuh lewat `Col span={24}`. */}
              <Row gutter={[token.margin, 0]}>
                <Col span={24}>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("customers.nameField")}</FormLabel>
                        <FormControl>
                          <TextInput autoFocus {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col span={24}>
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.address")}</FormLabel>
                        <FormControl>
                          <TextInput {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.phone")}</FormLabel>
                        <FormControl>
                          <TextInput {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.email")}</FormLabel>
                        <FormControl>
                          <TextInput type="email" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="pic"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("customers.pic")}</FormLabel>
                        <FormControl>
                          <TextInput {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FormField
                    control={form.control}
                    name="npwp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("customers.npwp")}</FormLabel>
                        <FormControl>
                          <TextInput {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Col>
                <Col span={24}>
                  <FormField
                    control={form.control}
                    name="taxExempt"
                    render={({ field }) => (
                      <FormItem>
                        <label
                          htmlFor="taxExempt"
                          style={{
                            display: "flex",
                            cursor: "pointer",
                            alignItems: "flex-start",
                            gap: token.marginXS,
                          }}
                        >
                          <FormControl>
                            <Checkbox
                              id="taxExempt"
                              style={{ marginTop: token.marginXXS / 2 }}
                              checked={field.value}
                              onCheckedChange={(v) => field.onChange(v === true)}
                              onBlur={field.onBlur}
                            />
                          </FormControl>
                          <span>
                            {t("customers.taxExemptLabel")}
                            <span
                              style={{
                                display: "block",
                                fontSize: token.fontSizeSM,
                                color: token.colorTextSecondary,
                              }}
                            >
                              {t("customers.taxExemptHint")}
                            </span>
                          </span>
                        </label>
                      </FormItem>
                    )}
                  />
                </Col>
              </Row>
            </CardContent>
          </Card>

          {form.formState.errors.root && (
            <div role="alert" style={{ marginBottom: token.margin }}>
              <Alert type="error" showIcon message={form.formState.errors.root.message} />
            </div>
          )}

          <Flex wrap gap={token.marginSM}>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("customers.submit")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              {t("common.cancel")}
            </Button>
          </Flex>
        </form>
      </Form>
    </div>
  );
}
