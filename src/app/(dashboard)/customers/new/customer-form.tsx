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
 */

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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

export function NewCustomerForm() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();

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
    const res = await fetch("/api/customers", {
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
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("customers.breadcrumb"), href: "/customers" },
          { label: t("customers.newTitle") },
        ]}
        title={t("customers.newTitle")}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("customers.dataTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Grid responsif: 1 kolom di ponsel, 2 kolom di layar lebar —
                  mengisi lebar penuh tanpa merentang satu input melebar sendiri.
                  Field panjang (nama, alamat, checkbox) menjangkau 2 kolom. */}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel required>{t("customers.nameField")}</FormLabel>
                      <FormControl>
                        <TextInput autoFocus {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("common.address")}</FormLabel>
                      <FormControl>
                        <TextInput {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                <FormField
                  control={form.control}
                  name="taxExempt"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <label
                        htmlFor="taxExempt"
                        className="flex cursor-pointer items-start gap-2"
                      >
                        <FormControl>
                          <Checkbox
                            id="taxExempt"
                            className="mt-0.5"
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(v === true)}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <span className="text-sm text-foreground">
                          {t("customers.taxExemptLabel")}
                          <span className="block text-xs text-muted-foreground">
                            {t("customers.taxExemptHint")}
                          </span>
                        </span>
                      </label>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {form.formState.errors.root && (
            <p role="alert" className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">
              {form.formState.errors.root.message}
            </p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("customers.submit")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
