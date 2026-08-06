"use client";

/**
 * Form pusat biaya (issue #91) — dipakai halaman "baru" DAN "ubah".
 * Dikonversi ke token Ant Design pada issue #196.
 *
 * Satu komponen untuk keduanya karena isiannya identik dan perbedaannya hanya
 * dua hal yang memang berbeda: ke mana ia mengirim (`POST` vs `PUT`) dan siapa
 * yang tak boleh jadi induknya (dirinya sendiri). Menyalinnya menjadi dua form
 * berarti dua tempat yang bisa menyimpang dalam menerjemahkan aturan yang sama.
 *
 * Pola form MASTER.md: react-hook-form + `costCenterSchema` yang SAMA dipakai
 * route handler (diimpor, bukan disalin). Konversi ini **tidak menyentuh mesin
 * formulirnya sama sekali** — hanya kulitnya: kisi `sm:grid-cols-2` menjadi
 * `Row`/`Col`, jarak menjadi token, dan galat form menjadi `Alert` AntD.
 */

import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
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
import { apiFetch } from "@/lib/api-fetch";

export interface CostCenterFormValues extends CostCenterInput {
  id?: number;
}

interface ParentOption {
  id: number;
  code: string;
  name: string;
}

export function CostCenterForm({ initial }: { initial?: CostCenterFormValues }) {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();
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
    apiFetch("/api/cost-centers?activeOnly=1")
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
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("costCenters.breadcrumb"), href: "/cost-centers" },
          { label: editing ? t("costCenters.editTitle") : t("costCenters.newTitle") },
        ]}
        title={editing ? t("costCenters.editTitle") : t("costCenters.newTitle")}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Card style={{ marginBottom: token.marginLG }}>
            <CardHeader>
              <CardTitle>{t("costCenters.dataTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* `sm:grid-cols-2` → `Row` yang membungkus: satu kolom di 375px,
                  dua sejak `sm` (576px) AntD. */}
              <Row gutter={[token.margin, 0]}>
                <Col xs={24} sm={12}>
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
                </Col>
                <Col xs={24} sm={12}>
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
                </Col>
                <Col span={24}>
                  <FormField
                    control={form.control}
                    name="parentId"
                    render={({ field }) => (
                      <FormItem>
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
                </Col>
                <Col span={24}>
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem>
                        {/* Master data DINONAKTIFKAN, tidak dihapus — sakelar
                            ini satu-satunya jalan ke sana, jadi keterangannya
                            ikut di bawah katanya. */}
                        <label
                          htmlFor="isActive"
                          style={{
                            display: "flex",
                            cursor: "pointer",
                            alignItems: "flex-start",
                            gap: token.marginXS,
                          }}
                        >
                          <FormControl>
                            <Checkbox
                              id="isActive"
                              style={{ marginTop: token.marginXXS / 2 }}
                              checked={field.value}
                              onCheckedChange={(v) => field.onChange(v === true)}
                              onBlur={field.onBlur}
                            />
                          </FormControl>
                          <span>
                            {t("costCenters.activeField")}
                            <span
                              style={{
                                display: "block",
                                fontSize: token.fontSizeSM,
                                color: token.colorTextSecondary,
                              }}
                            >
                              {t("costCenters.activeHint")}
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
              {form.formState.isSubmitting ? t("common.saving") : t("costCenters.submit")}
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
