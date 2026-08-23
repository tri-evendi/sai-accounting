"use client";

/**
 * Form templat berulang — dipakai halaman "baru" DAN "ubah" (issue #469).
 *
 * Satu komponen untuk keduanya: isiannya identik, dan yang berbeda hanya ke
 * mana ia mengirim. Menyalinnya menjadi dua form berarti dua tempat yang bisa
 * menyimpang dalam menerjemahkan aturan yang sama.
 *
 * ══ DUA ISIAN YANG SENGAJA TIDAK BISA DIUBAH SAAT MENYUNTING ════════════════
 * `kind` dan dokumen sumbernya. Mengganti sumber sebuah templat yang sudah
 * berjalan membuat riwayat kejadiannya menunjuk dua dokumen berbeda dengan satu
 * nama — dan orang yang membaca riwayat itu tidak punya cara mengetahuinya.
 * Yang benar adalah membuat templat baru; route PUT pun menolak mengubahnya.
 *
 * Pola form MASTER.md: react-hook-form + skema yang SAMA dengan route handler
 * (diimpor, bukan disalin).
 */

import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Col, Flex, Row, theme } from "antd";

import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
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
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import {
  recurringTemplateSchema,
  type RecurringTemplateInput,
} from "@/lib/validations/recurring";

export interface RecurringFormValues extends RecurringTemplateInput {
  id?: number;
}

export function RecurringForm({ initial }: { initial: RecurringFormValues }) {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();
  const [formError, setFormError] = useState("");

  const form = useForm<RecurringTemplateInput>({
    resolver: zodResolver(recurringTemplateSchema) as Resolver<RecurringTemplateInput>,
    defaultValues: initial,
  });

  const editing = initial.id != null;

  async function onSubmit(values: RecurringTemplateInput) {
    setFormError("");
    const res = await apiFetch(editing ? `/api/recurring/${initial.id}` : "/api/recurring", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data?.details?.fieldErrors;
      const first = detail ? Object.values(detail).flat().filter(Boolean)[0] : null;
      setFormError(String(first || data?.error || t("recurring.errSave")));
      return;
    }
    toast(t("recurring.saved"));
    router.push("/recurring");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("recurring.title"), href: "/recurring" },
          { label: editing ? t("recurring.editTitle") : t("recurring.newTitle") },
        ]}
        title={editing ? t("recurring.editTitle") : t("recurring.newTitle")}
      />

      <Card>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <Flex vertical gap={token.marginSM}>
                {formError && <Alert type="error" showIcon message={formError} />}

                {/* Sumbernya disebut, bukan dipilih: templat selalu lahir DARI
                    sebuah dokumen yang sudah ada, lewat tombol di halamannya. */}
                <Alert type="info" showIcon message={t("recurring.sourceHint")} />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("recurring.fieldName")}</FormLabel>
                      <FormControl>
                        <TextInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Row gutter={[token.margin, token.margin]}>
                  <Col xs={24} sm={12}>
                    <FormField
                      control={form.control}
                      name="frequency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("recurring.fieldFrequency")}</FormLabel>
                          <FormControl>
                            <SelectField
                              {...field}
                              options={[
                                { value: "weekly", label: t("recurring.freqWeekly") },
                                { value: "monthly", label: t("recurring.freqMonthly") },
                                { value: "yearly", label: t("recurring.freqYearly") },
                              ]}
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
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("recurring.fieldStart")}</FormLabel>
                          <FormControl>
                            <TextInput type="date" {...field} />
                          </FormControl>
                          <FormDescription>{t("recurring.startHint")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </Col>
                </Row>

                <Row gutter={[token.margin, token.margin]}>
                  <Col xs={24} sm={12}>
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("recurring.fieldEnd")}</FormLabel>
                          <FormControl>
                            <TextInput
                              type="date"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                            />
                          </FormControl>
                          <FormDescription>{t("recurring.endHint")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <FormField
                      control={form.control}
                      name="maxOccurrences"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("recurring.fieldMax")}</FormLabel>
                          <FormControl>
                            <TextInput
                              type="number"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value === "" ? null : Number(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormDescription>{t("recurring.maxHint")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </Col>
                </Row>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange}>
                          {t("recurring.fieldActive")}
                        </Checkbox>
                      </FormControl>
                      <FormDescription>{t("recurring.activeHint")}</FormDescription>
                    </FormItem>
                  )}
                />

                <Alert type="info" showIcon message={t("recurring.approvalNote")} />

                <Flex wrap gap={token.marginXS}>
                  <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? t("common.processing") : t("recurring.save")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push("/recurring")}
                  >
                    {t("common.back")}
                  </Button>
                </Flex>
              </Flex>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
