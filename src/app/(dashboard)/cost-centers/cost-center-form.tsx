"use client";

/**
 * Form pusat biaya (issue #91) — dipakai halaman "baru" DAN "ubah".
 *
 * Satu komponen untuk keduanya karena isiannya identik dan perbedaannya hanya
 * dua hal yang memang berbeda: ke mana ia mengirim (`POST` vs `PUT`) dan siapa
 * yang tak boleh jadi induknya (dirinya sendiri). Menyalinnya menjadi dua form
 * berarti dua tempat yang bisa menyimpang dalam menerjemahkan aturan yang sama.
 *
 * Pola form MASTER.md: react-hook-form + `costCenterSchema` yang SAMA dipakai
 * route handler (diimpor, bukan disalin).
 */

import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeader } from "@/components/ui/page-header";
import { costCenterSchema, type CostCenterInput } from "@/lib/validations/cost-center";
import { useT } from "@/lib/i18n/client";

export interface CostCenterFormValues extends CostCenterInput {
  id?: number;
}

interface ParentOption {
  id: number;
  code: string;
  name: string;
}

export function CostCenterForm({ initial }: { initial?: CostCenterFormValues }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [parents, setParents] = useState<ParentOption[]>([]);
  const editing = initial?.id != null;

  const form = useForm<CostCenterInput>({
    // `isActive` punya `.default(true)`, jadi tipe INPUT skema (`isActive?`)
    // berbeda dari tipe OUTPUT-nya — pola & alasan yang sama dengan
    // `customer-form.tsx`: pilih tipe OUTPUT, cast resolvernya.
    resolver: zodResolver(costCenterSchema) as Resolver<CostCenterInput>,
    defaultValues: {
      code: initial?.code ?? "",
      name: initial?.name ?? "",
      parentId: initial?.parentId ?? null,
      isActive: initial?.isActive ?? true,
    },
  });

  useEffect(() => {
    // Hanya yang AKTIF yang boleh jadi induk baru — cabang yang sudah
    // dipensiunkan tidak menerima anak baru (pola journal-form).
    fetch("/api/cost-centers?activeOnly=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ParentOption[]) => setParents(data))
      .catch(() => setParents([]));
  }, []);

  async function onSubmit(values: CostCenterInput) {
    const res = await fetch(
      editing ? `/api/cost-centers/${initial!.id}` : "/api/cost-centers",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      form.setError("root", { message: data.error || t("costCenters.saveFailed") });
      return;
    }

    toast(t("costCenters.saved"));
    router.push("/cost-centers");
    router.refresh();
  }

  const parentOptions = [
    { value: "", label: t("costCenters.noParent") },
    // Dirinya sendiri dikeluarkan dari daftar: hierarki yang menunjuk diri
    // sendiri tak berujung. Server menolaknya juga (penjaga terakhir), tetapi
    // pilihan yang pasti ditolak sebaiknya tak pernah ditawarkan.
    ...parents
      .filter((p) => p.id !== initial?.id)
      .map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
  ];

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("costCenters.breadcrumb"), href: "/cost-centers" },
          { label: editing ? t("costCenters.editTitle") : t("costCenters.newTitle") },
        ]}
        title={editing ? t("costCenters.editTitle") : t("costCenters.newTitle")}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("costCenters.dataTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("costCenters.codeField")}</FormLabel>
                      <FormControl>
                        <TextInput
                          autoFocus
                          placeholder={t("costCenters.codePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("costCenters.nameField")}</FormLabel>
                      <FormControl>
                        <TextInput placeholder={t("costCenters.namePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="parentId"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("costCenters.parentField")}</FormLabel>
                      <FormControl>
                        <NativeSelect
                          options={parentOptions}
                          value={field.value == null ? "" : String(field.value)}
                          onChange={(e) =>
                            field.onChange(e.target.value ? Number(e.target.value) : null)
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                        />
                      </FormControl>
                      <FormDescription>{t("costCenters.parentHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <label htmlFor="isActive" className="flex cursor-pointer items-start gap-2">
                        <FormControl>
                          <Checkbox
                            id="isActive"
                            className="mt-0.5"
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(v === true)}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <span className="text-sm text-foreground">
                          {t("costCenters.activeField")}
                          <span className="block text-xs text-muted-foreground">
                            {t("costCenters.activeHint")}
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
            <p
              role="alert"
              className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong"
            >
              {form.formState.errors.root.message}
            </p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("costCenters.submit")}
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
