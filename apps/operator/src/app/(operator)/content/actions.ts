"use server";

/**
 * Server action ISI HALAMAN DEPAN (migration platform 0008): draf → pratinjau
 * → terbit, dan kembali ke versi lama lewat riwayat.
 *
 * SENGAJA server action, bukan route API: `tests/authz-coverage.test.ts`
 * menolak `route.ts` tulis di bawah grup `(operator)`.
 *
 * Setiap aksi: penjaga bidang + izin (`requireOperatorActionSession`), urai
 * ulang dengan skema yang sama dengan editor, saring kunci terhadap KAMUS
 * (hanya `landing.*` yang ada di ketiga bahasa), lalu panggil store dan catat
 * jejak audit operator. Jejak mencatat kunci dan panjang, tidak pernah
 * nilainya; nilainya ada di riwayat penerbitan.
 *
 * Izin: `site.content` menyunting draf, membuat pratinjau, membuang draf, dan
 * mengembalikan versi lama sebagai draf. `site.publish` (owner) menerbitkan
 * dan membersihkan kunci yatim, karena hanya dua itu yang mengubah halaman
 * publik.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LOCALES, type Locale } from "@sai/core/i18n/config";
import type { Dictionary } from "@sai/core/i18n/dictionary";
import { clientIpFrom } from "@sai/core/operator-plane";
import {
  SITE_CONTENT_PREFIX,
  SITE_CONTENT_PREVIEW_PARAM,
  contentFieldSpec,
  contentValueProblem,
  defaultsOf,
  describeContentProblem,
  isEditableInAll,
} from "@sai/core/site-content";
import { formatDateTime } from "@sai/core/utils";
import { getDictionary, getT } from "@sai/platform/i18n/server";
import {
  SITE_CONTENT_CACHE_SECONDS,
  createSiteContentPreview,
  discardSiteContentDrafts,
  draftsFromHistory,
  publishSiteContentDrafts,
  purgeSiteContentKeys,
  saveSiteContentDrafts,
  siteContentEntriesForOperator,
  type DraftInput,
} from "@sai/platform/site-content-store";
import { writeOperatorAuditLog } from "@op/lib/operator/audit";
import { customerOrigin } from "@op/lib/operator/customer-origin";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import {
  siteContentDraftSchema,
  siteContentHistorySchema,
  siteContentPublishSchema,
} from "@op/lib/validations/operator";

export interface OperatorContentActionResult {
  ok: boolean;
  /** Kalimat sukses/galat dalam bahasa operator. */
  message: string;
  /** `entries.<locale>.<nama>` → kalimat masalah, untuk `form.setError`. */
  fieldErrors?: Record<string, string>;
  /** Pratinjau: alamat di host customer, dan sampai kapan berlaku. */
  previewUrl?: string;
  previewUntil?: string;
}

async function allDictionaries(): Promise<Record<Locale, Dictionary>> {
  const list = await Promise.all(LOCALES.map((l) => getDictionary(l)));
  return Object.fromEntries(LOCALES.map((l, i) => [l, list[i]])) as Record<Locale, Dictionary>;
}

async function audit(
  operator: string,
  action: Parameters<typeof writeOperatorAuditLog>[0]["action"],
  details: Record<string, unknown>
) {
  await writeOperatorAuditLog({
    operator,
    action,
    ipAddress: clientIpFrom(await headers()),
    details,
  });
}

/* ──────────────────────────────── Simpan draf ─────────────────────────────── */

export async function operatorSaveContentDrafts(
  input: unknown
): Promise<OperatorContentActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.content");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = siteContentDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const { section, entries } = parsed.data;

  const dictionaries = await allDictionaries();
  const inputs: DraftInput[] = [];
  const fieldErrors: Record<string, string> = {};
  let rejected = 0;

  for (const locale of LOCALES) {
    for (const [name, value] of Object.entries(entries[locale])) {
      const key = `${SITE_CONTENT_PREFIX}${name}`;
      if (!isEditableInAll(dictionaries, key)) {
        rejected += 1;
        continue;
      }
      const defaults = defaultsOf(dictionaries, key);
      const spec = contentFieldSpec(Object.values(defaults));
      const problem = contentValueProblem(value, defaults[locale], spec);
      if (problem) {
        fieldErrors[`entries.${locale}.${name}`] = describeContentProblem(
          problem,
          { value, defaultValue: defaults[locale], spec },
          t
        );
        continue;
      }
      inputs.push({ locale, key, input: value });
    }
  }

  if (rejected > 0) {
    /* Kunci asing = kiriman yang tidak datang dari layar yang dirender server.
       Ditolak utuh, dan dicatat. */
    await audit(session.operator.name, "operator.content.rejected", { section, rejectedKeys: rejected });
    return { ok: false, message: t("validation.invalidInput") };
  }
  const problems = Object.keys(fieldErrors).length;
  if (problems > 0) {
    return { ok: false, message: t("operator.content.errFields", { count: problems }), fieldErrors };
  }

  let result;
  try {
    result = await saveSiteContentDrafts(inputs, session.operator.name);
  } catch (error) {
    console.error("[operator-content] draf gagal disimpan:", error);
    return { ok: false, message: t("operator.content.errSave") };
  }

  if (result.drafted.length > 0 || result.cleared.length > 0) {
    await audit(session.operator.name, "operator.content.draft", {
      section,
      drafted: result.drafted,
      cleared: result.cleared,
    });
  }
  revalidatePath("/content");

  return result.drafted.length === 0 && result.cleared.length === 0
    ? { ok: true, message: t("operator.content.draftNothing") }
    : { ok: true, message: t("operator.content.draftSaved", { count: result.drafted.length }) };
}

/* ───────────────────────────────── Terbitkan ──────────────────────────────── */

export async function operatorPublishContent(input: unknown): Promise<OperatorContentActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = siteContentPublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const dictionaries = await allDictionaries();
  let result;
  try {
    result = await publishSiteContentDrafts({
      actor: session.operator.name,
      note: parsed.data.note ? parsed.data.note : null,
      isEditable: (key) => isEditableInAll(dictionaries, key),
    });
  } catch (error) {
    console.error("[operator-content] penerbitan gagal:", error);
    return { ok: false, message: t("operator.content.errSave") };
  }

  if (result.publicationId !== null) {
    await audit(session.operator.name, "operator.content.publish", {
      publicationId: result.publicationId,
      changed: result.changes.map((c) => `${c.locale}:${c.key}`),
      lengths: Object.fromEntries(
        result.changes.map((c) => [`${c.locale}:${c.key}`, c.value?.length ?? 0])
      ),
    });
  }
  revalidatePath("/content");

  return result.changes.length === 0
    ? { ok: true, message: t("operator.content.publishedNothing") }
    : {
        ok: true,
        message: t("operator.content.published", {
          count: result.changes.length,
          seconds: SITE_CONTENT_CACHE_SECONDS,
        }),
      };
}

/* ─────────────────────────────── Buang draf ──────────────────────────────── */

export async function operatorDiscardContentDrafts(): Promise<OperatorContentActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.content");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  let count;
  try {
    count = await discardSiteContentDrafts();
  } catch (error) {
    console.error("[operator-content] draf gagal dibuang:", error);
    return { ok: false, message: t("operator.content.errSave") };
  }
  if (count > 0) await audit(session.operator.name, "operator.content.discard", { count });
  revalidatePath("/content");
  return { ok: true, message: t("operator.content.discarded", { count }) };
}

/* ──────────────────────────────── Pratinjau ──────────────────────────────── */

export async function operatorCreateContentPreview(): Promise<OperatorContentActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.content");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const origin = customerOrigin();
  if (!origin) return { ok: false, message: t("operator.content.previewNoUrl") };

  let preview;
  try {
    preview = await createSiteContentPreview(session.operator.name);
  } catch (error) {
    console.error("[operator-content] pratinjau gagal dibuat:", error);
    return { ok: false, message: t("operator.content.errSave") };
  }
  await audit(session.operator.name, "operator.content.preview", {
    expiresAt: preview.expiresAt.toISOString(),
  });

  const url = new URL("/", origin);
  url.searchParams.set(SITE_CONTENT_PREVIEW_PARAM, preview.token);
  const until = formatDateTime(preview.expiresAt);
  return {
    ok: true,
    message: t("operator.content.previewReady", { time: until }),
    previewUrl: url.toString(),
    previewUntil: until,
  };
}

/* ─────────────────────────── Kembalikan dari riwayat ────────────────────────── */

/**
 * Dipanggil dari `<form action>` di halaman riwayat (server component, tanpa
 * JS): membuat draf dari riwayat, lalu memindahkan operator ke tampilan
 * Tinjau supaya ia langsung melihat draf yang dihasilkan.
 */
export async function operatorRevertContent(formData: FormData): Promise<void> {
  const session = await requireOperatorActionSession("site.content");
  if (!session) redirect("/content?view=history");

  const mode = formData.get("mode");
  const id = Number(formData.get("id"));
  const parsed = siteContentHistorySchema.safeParse(
    mode === "undo" ? { mode, publicationId: id } : { mode, revisionId: id }
  );
  if (!parsed.success) redirect("/content?view=history");

  const dictionaries = await allDictionaries();
  let drafted = 0;
  try {
    const result = await draftsFromHistory(parsed.data, session.operator.name, (key) =>
      isEditableInAll(dictionaries, key)
    );
    drafted = result.drafted.length;
    await audit(session.operator.name, "operator.content.revert", {
      ...parsed.data,
      drafted: result.drafted,
      cleared: result.cleared,
    });
  } catch (error) {
    console.error("[operator-content] versi lama gagal dikembalikan:", error);
    redirect("/content?view=history&reverted=error");
  }
  revalidatePath("/content");
  redirect(`/content?view=review&reverted=${drafted}`);
}

/* ─────────────────────────────── Kunci yatim ─────────────────────────────── */

export async function operatorPurgeOrphanContent(): Promise<OperatorContentActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const [dictionaries, rows] = await Promise.all([allDictionaries(), siteContentEntriesForOperator()]);
  if (rows === null) return { ok: false, message: t("operator.content.errSave") };
  /* Daftarnya dihitung ULANG di server dari kamus, tidak diterima dari layar. */
  const orphans = [...new Set(rows.map((r) => r.key))].filter((k) => !isEditableInAll(dictionaries, k));

  let result;
  try {
    result = await purgeSiteContentKeys(orphans, session.operator.name);
  } catch (error) {
    console.error("[operator-content] kunci yatim gagal dihapus:", error);
    return { ok: false, message: t("operator.content.errSave") };
  }
  await audit(session.operator.name, "operator.content.purge", {
    keys: orphans,
    publicationId: result.publicationId,
  });
  revalidatePath("/content");
  return { ok: true, message: t("operator.content.purged", { count: orphans.length }) };
}
