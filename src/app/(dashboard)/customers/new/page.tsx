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
import { customerSchema, type CustomerInput } from "@/lib/validations/finance";

export default function NewCustomerPage() {
  const router = useRouter();
  const { toast } = useToast();

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
        message: data.error || "Gagal menyimpan pelanggan. Coba lagi.",
      });
      return;
    }

    toast("Pelanggan berhasil disimpan");
    router.push("/customers");
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Pelanggan Baru</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Data Pelanggan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Pelanggan</FormLabel>
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
                    <FormItem>
                      <FormLabel>Alamat</FormLabel>
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
                      <FormLabel>Telepon</FormLabel>
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
                      <FormLabel>Email</FormLabel>
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
                      <FormLabel>Narahubung (PIC)</FormLabel>
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
                      <FormLabel>NPWP (untuk e-Faktur)</FormLabel>
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
                    <FormItem>
                      <label
                        htmlFor="taxExempt"
                        className="flex cursor-pointer items-start gap-2"
                      >
                        <input
                          id="taxExempt"
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          onBlur={field.onBlur}
                          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span className="text-sm text-foreground">
                          Bebas PPN (ekspor / non-PKP)
                          <span className="block text-xs text-muted-foreground">
                            Faktur untuk pelanggan ini otomatis default tanpa PPN (0%) — tetap bisa diubah.
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
              {form.formState.isSubmitting ? "Menyimpan…" : "Simpan Pelanggan"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Batal
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
