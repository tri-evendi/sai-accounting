"use client";

/**
 * EDITOR ISI HALAMAN DEPAN — satu bagian halaman, ketiga bahasa berdampingan,
 * disimpan sebagai DRAF.
 *
 * ══ YANG TERLIHAT PER ISIAN ═══════════════════════════════════════════════
 *   • status berteks (Bawaan / Diganti / Draf), bukan warna saja;
 *   • teks bawaan dari kamus, selalu terlihat (bukan hanya `placeholder`,
 *     yang lenyap begitu orang mengetik);
 *   • yang tayang sekarang, bila berbeda dari bawaan;
 *   • penghitung karakter terhadap batas isian (`contentFieldSpec`);
 *   • peringatan saat mengetik dari aturan yang SAMA dengan server
 *     (`contentValueProblem` + `describeContentProblem`);
 *   • "terjemahan tertinggal" per kunci: diganti di sebagian bahasa saja.
 *
 * Isian KOSONG = kembali ke teks bawaan saat diterbitkan. Isian yang sama
 * dengan yang tayang = tidak ada draf. Jadi "Batalkan perubahan" mengembalikan
 * isian ke yang tayang, dan "Pakai bawaan" mengosongkannya; keduanya bukan
 * tindakan destruktif (tidak ada yang tayang berubah sebelum diterbitkan),
 * jadi tanpa `ConfirmDialog`.
 *
 * ══ MESIN FORMULIRNYA RHF + ZOD ═══════════════════════════════════════════
 * Nama field `entries.<locale>.<nama>` dengan nama telanjang (`heroHeading`):
 * titik di dalam nama dibaca RHF sebagai jalur bersarang. Skemanya satu,
 * dipakai dua sisi (`siteContentDraftSchema`); galat per isian dari server
 * dipetakan ke `form.setError` (Konvensi Form aturan 7).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";
import { WarningOutlined } from "@ant-design/icons";

import { Badge } from "@sai/ui/badge";
import { Button } from "@sai/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import { LOCALES, type Locale } from "@sai/core/i18n/config";
import {
  contentCellState,
  contentLength,
  contentValueProblem,
  describeContentProblem,
  type ContentCell,
  type ContentCellState,
  type ContentFieldSpec,
} from "@sai/core/site-content";
import { siteContentDraftSchema, type SiteContentDraftFormInput } from "@op/lib/validations/operator";
import type { OperatorContentActionResult } from "@op/app/(operator)/content/actions";

/** Satu bahasa satu kunci — disusun di server, dioper apa adanya. */
export interface ContentEditorCell extends ContentCell {
  /** Siapa & kapan, sudah terformat di server. Kosong bila tidak ada. */
  publishedBy: string;
  publishedAt: string;
  draftBy: string;
  draftAt: string;
}

export interface ContentEditorRow {
  /** `landing.heroHeading`. */
  key: string;
  /** `heroHeading` — juga bagian nama field RHF. */
  name: string;
  spec: ContentFieldSpec;
  cells: Record<Locale, ContentEditorCell>;
  /** Bahasa yang masih bawaan padahal bahasa lain sudah diganti. */
  behind: Locale[];
}

interface ContentEditorProps {
  section: string;
  rows: ContentEditorRow[];
  /** Saat mencari lintas bagian: tampilkan nama bagian di setiap kunci. */
  showSection: boolean;
  sectionLabels: Record<string, string>;
  localeLabels: Record<Locale, string>;
  /** Server action — dioper, tidak diimpor langsung oleh berkas client ini. */
  save: (input: SiteContentDraftFormInput) => Promise<OperatorContentActionResult>;
}

/** Nilai awal isian: draf bila ada (draf `null` = kosong), selain itu yang tayang. */
function initialValue(cell: ContentCell): string {
  if (cell.draft !== undefined) return cell.draft ?? "";
  return cell.published ?? "";
}

const STATE_BADGE: Record<ContentCellState, "default" | "success" | "warning"> = {
  default: "default",
  overridden: "success",
  draft: "warning",
};

export function ContentEditor({
  section,
  rows,
  showSection,
  sectionLabels,
  localeLabels,
  save,
}: ContentEditorProps) {
  const t = useT();
  const router = useRouter();
  const { token } = theme.useToken();
  const [result, setResult] = useState<OperatorContentActionResult | null>(null);

  const buildValues = (): SiteContentDraftFormInput => ({
    section,
    entries: Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        Object.fromEntries(rows.map((row) => [row.name, initialValue(row.cells[locale])])),
      ])
    ) as SiteContentDraftFormInput["entries"],
  });

  const form = useForm<SiteContentDraftFormInput>({
    resolver: zodResolver(siteContentDraftSchema),
    defaultValues: buildValues(),
  });
  const values = useWatch({ control: form.control, name: "entries" });

  const onSubmit = form.handleSubmit(async (submitted) => {
    setResult(null);
    const answer = await save(submitted);
    setResult(answer);
    if (answer.fieldErrors) {
      for (const [field, message] of Object.entries(answer.fieldErrors)) {
        form.setError(field as `entries.${Locale}.${string}`, { type: "server", message });
      }
    }
    if (answer.ok) {
      /* Yang baru tersimpan menjadi titik "bersih" baru, lalu status per isian
         (Draf / siapa / kapan) dibaca ulang dari server. */
      form.reset(submitted);
      router.refresh();
    }
  });

  /* Peringatan pekerjaan belum tersimpan: pemilih bagian & tab tampilan di
     halaman induk adalah navigasi biasa. Dipasang hanya selama ada isian kotor. */
  const dirty = form.formState.isDirty;
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);

  const cellBox: React.CSSProperties = {
    /* Kotak bersarang di dalam kartu: isian, tanpa tepi (MASTER.md §266). */
    background: token.colorFillQuaternary,
    borderRadius: token.borderRadiusLG,
    padding: token.paddingSM,
    minWidth: 0,
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: token.margin }}>
        {rows.map((row) => (
          <section
            key={row.key}
            aria-labelledby={`content-${row.name}`}
            style={{
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusLG,
              boxShadow: token.boxShadowTertiary,
              padding: token.paddingLG,
              display: "flex",
              flexDirection: "column",
              gap: token.marginSM,
            }}
          >
            <Flex wrap align="baseline" justify="space-between" gap={token.marginXS}>
              <h2
                id={`content-${row.name}`}
                style={{
                  margin: 0,
                  fontSize: token.fontSize,
                  fontWeight: token.fontWeightStrong,
                  fontFamily: token.fontFamilyCode,
                  overflowWrap: "anywhere",
                }}
              >
                {row.name}
              </h2>
              {showSection && (
                <span style={{ color: token.colorTextSecondary }}>{sectionLabels[row.key]}</span>
              )}
            </Flex>

            {row.behind.length > 0 && (
              <p style={{ margin: 0, color: token.colorTextSecondary }}>
                <WarningOutlined aria-hidden="true" style={{ color: token.colorWarning, marginInlineEnd: token.marginXXS }} />
                {t("operator.content.behind", {
                  done: LOCALES.filter((l) => !row.behind.includes(l))
                    .map((l) => localeLabels[l])
                    .join(", "),
                  missing: row.behind.map((l) => localeLabels[l]).join(", "),
                })}
              </p>
            )}

            <div
              style={{
                display: "grid",
                gap: token.marginSM,
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {LOCALES.map((locale) => {
                const cell = row.cells[locale];
                const state = contentCellState(cell);
                const current = values?.[locale]?.[row.name] ?? "";
                const live = cell.published ?? "";
                const length = contentLength(current.trim());
                const problem = contentValueProblem(current, cell.defaultValue, row.spec);
                const paragraph = row.spec.kind !== "label";
                return (
                  <div key={locale} style={cellBox}>
                    <FormField
                      control={form.control}
                      name={`entries.${locale}.${row.name}`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <span lang={locale}>{localeLabels[locale]}</span>{" "}
                            <Badge variant={STATE_BADGE[state]}>
                              {state === "draft"
                                ? t("operator.content.stateDraft")
                                : state === "overridden"
                                  ? t("operator.content.stateOverridden")
                                  : t("operator.content.stateDefault")}
                            </Badge>
                          </FormLabel>
                          <FormControl>
                            {paragraph ? (
                              <Textarea
                                {...field}
                                lang={locale}
                                rows={row.spec.kind === "paragraph" ? 5 : 2}
                                placeholder={cell.defaultValue}
                                spellCheck
                              />
                            ) : (
                              <TextInput {...field} lang={locale} placeholder={cell.defaultValue} spellCheck />
                            )}
                          </FormControl>
                          <FormDescription>
                            <span
                              aria-label={t("operator.content.charCountAria", {
                                count: length,
                                max: row.spec.maxLength,
                              })}
                              style={{
                                display: "block",
                                fontVariantNumeric: "tabular-nums",
                                color: length > row.spec.maxLength ? token.colorErrorText : token.colorTextTertiary,
                              }}
                            >
                              {t("operator.content.charCount", { count: length, max: row.spec.maxLength })}
                            </span>
                            <span lang={locale} style={{ display: "block", color: token.colorTextTertiary }}>
                              {t("operator.content.defaultIs", { text: cell.defaultValue })}
                            </span>
                            {cell.draft !== undefined && (
                              <span lang={locale} style={{ display: "block" }}>
                                {cell.published === null
                                  ? t("operator.content.liveIsDefault")
                                  : t("operator.content.liveIs", { text: cell.published })}
                              </span>
                            )}
                            {cell.draft === null && (
                              <span style={{ display: "block" }}>{t("operator.content.draftToDefault")}</span>
                            )}
                            {cell.draftBy ? (
                              <span style={{ display: "block" }}>
                                {t("operator.content.draftBy", { who: cell.draftBy, when: cell.draftAt })}
                              </span>
                            ) : cell.publishedBy ? (
                              <span style={{ display: "block" }}>
                                {t("operator.content.publishedBy", {
                                  who: cell.publishedBy,
                                  when: cell.publishedAt,
                                })}
                              </span>
                            ) : null}
                            {problem && !form.formState.errors.entries?.[locale]?.[row.name] && (
                              <span style={{ display: "block", color: token.colorWarningText }}>
                                {describeContentProblem(
                                  problem,
                                  { value: current, defaultValue: cell.defaultValue, spec: row.spec },
                                  t
                                )}
                              </span>
                            )}
                          </FormDescription>
                          <FormMessage />
                          <Flex wrap gap={token.marginXS} style={{ marginTop: token.marginXS }}>
                            {current !== live && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  form.setValue(`entries.${locale}.${row.name}`, live, { shouldDirty: true })
                                }
                              >
                                {t("operator.content.undoEdit")}
                              </Button>
                            )}
                            {current !== "" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  form.setValue(`entries.${locale}.${row.name}`, "", { shouldDirty: true })
                                }
                              >
                                {t("operator.content.useDefault")}
                              </Button>
                            )}
                          </Flex>
                        </FormItem>
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Bilah simpan menempel di bawah area gulir: bagian yang panjang
            tidak menuntut menggulung ke ujung untuk menyimpan. */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 1,
            background: token.colorBgLayout,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            paddingBlock: token.paddingSM,
            display: "flex",
            flexDirection: "column",
            gap: token.marginSM,
          }}
        >
          {/* `Alert` AntD selalu `role="alert"` (jangan oper `role`): hasil
              tindakan yang baru ditekan, dan kegagalan harus terdengar. */}
          {result && <Alert type={result.ok ? "success" : "error"} message={result.message} showIcon />}
          <Flex wrap align="center" gap={token.marginSM}>
            <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("operator.content.saveDraft")}
            </Button>
          </Flex>
        </div>
      </form>
    </Form>
  );
}
