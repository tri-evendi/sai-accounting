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
 *   • error inline `role="alert"` yang tertaut ARIA ke tiap field.
 */

import { useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
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
import { paymentFormSchema, type PaymentFormInput } from "@/lib/validations/payment";
import { BASE_CURRENCY, CURRENCY_VALUES } from "@/lib/validations/fx";
import { DollarSign } from "lucide-react";

interface PaymentFormProps {
  entityType: "contracts" | "invoices";
  entityId: number;
  onSuccess?: () => void;
}

export function PaymentForm({ entityType, entityId, onSuccess }: PaymentFormProps) {
  const [open, setOpen] = useState(false);
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
    const res = await fetch(`/api/${entityType}/${entityId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        // Untuk IDR kurs tidak dikirim — server memperlakukannya 1:1.
        rate: isForeign ? values.rate : undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      form.setError("root", {
        message: String(fieldMsg || data.error || "Gagal mencatat pembayaran. Coba lagi."),
      });
      return;
    }

    toast("Pembayaran berhasil dicatat");
    form.reset();
    setOpen(false);
    onSuccess?.();
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <DollarSign className="mr-1 h-4 w-4" /> Tambah Pembayaran
      </Button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
      <h4 className="mb-3 text-sm font-semibold text-foreground">Catat Pembayaran</h4>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tanggal</FormLabel>
                <FormControl>
                  <TextInput type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Jumlah</FormLabel>
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

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mata Uang</FormLabel>
                <FormControl>
                  <NativeSelect
                    options={CURRENCY_VALUES.map((c) => ({ value: c, label: c }))}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Progressive disclosure: kurs hanya muncul untuk mata uang asing. */}
          {isForeign && (
            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kurs 1 {currency} ke IDR</FormLabel>
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
                    Wajib diisi — jurnal penerimaan dicatat dalam IDR memakai kurs ini.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Catatan (opsional)</FormLabel>
                <FormControl>
                  <TextInput {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.formState.errors.root && (
            <p
              role="alert"
              className="sm:col-span-2 rounded-md bg-destructive-soft p-2 text-xs text-destructive-strong"
            >
              {form.formState.errors.root.message}
            </p>
          )}

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Menyimpan…" : "Simpan Pembayaran"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Batal
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
