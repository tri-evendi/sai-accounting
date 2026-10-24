"use server";

/**
 * Server action BUKTI SOSIAL & GAMBAR halaman depan (konsol `/landing/media`,
 * migration platform 0015).
 *
 * Kewajiban yang sama dengan `../actions.ts` — penjaga + izin, skema yang
 * sama dengan formulir, tulisan sempit, jejak lama/baru — ditambah satu:
 * RUJUKAN GAMBAR diperiksa terhadap basis data. Formulir hanya mengirim id;
 * id yang tidak ada atau jenisnya lain (mis. logo klien yang menunjuk gambar
 * OG) menolak seluruh simpanan, dan sidik/ukuran selalu diambil dari baris
 * `landing_images`, tidak pernah dari kiriman.
 *
 * Izinnya `site.publish` untuk semuanya: semua yang di sini langsung tayang di
 * halaman publik (owner saja, seperti menerbitkan isi halaman depan).
 *
 * Unggahan memakai mekanisme logo produk (`/brand`): `FormData`, isi berkas
 * divalidasi dari kepalanya (PNG/JPEG/WebP; SVG ditolak), batas ukuran per
 * pemakaian, metadata dibuang sebelum disimpan. Jejaknya memuat sidik, format,
 * ukuran — bukan isi berkasnya.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { CACHE_SIGNAL_POLL_SECONDS } from "@sai/core/cache-signals";
import { clientIpFrom } from "@sai/core/operator-plane";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import {
  ALT_TEXT_MAX,
  LANDING_IMAGE_KINDS,
  LANDING_IMAGE_LIMITS,
  TESTIMONIAL_QUOTE_MAX,
  type LandingClientLogo,
  type LandingImageKind,
  type LandingImageRef,
  type LandingImageRejection,
  type LandingMedia,
  type LandingPartner,
  type LandingScreenshot,
  type LandingTestimonial,
} from "@sai/core/landing-media";
import { normalizeLocalizedText } from "@sai/core/landing-settings";
import { getT } from "@sai/platform/i18n/server";
import { createLandingImage, resolveLandingImageRefs } from "@sai/platform/landing-images";
import { landingSettingsForOperator, saveLandingSettings, type LandingSettingsPatch } from "@sai/platform/landing-settings";
import { platformDb } from "@sai/platform/platform-db";
import { writeOperatorAuditLog, type OperatorAuditAction } from "@op/lib/operator/audit";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import {
  landingClientLogosSchema,
  landingPartnersSchema,
  landingScreensSchema,
  landingTestimonialsSchema,
  type LandingActionResult,
  type LandingScreenshotFormInput,
  type LandingUploadResult,
} from "@op/lib/validations/landing";

/** Peta statis alasan → kunci kamus (penjaga kunci yatim membaca teks). */
const ALASAN: Record<LandingImageRejection, DictionaryKey> = {
  empty: "operator.landingMedia.err.empty",
  too_large: "operator.landingMedia.err.too_large",
  not_image: "operator.landingMedia.err.not_image",
  animated: "operator.landingMedia.err.animated",
  too_small: "operator.landingMedia.err.too_small",
  too_big_dimensions: "operator.landingMedia.err.too_big_dimensions",
  og_shape: "operator.landingMedia.err.og_shape",
};

async function mediaLama(): Promise<LandingMedia | null> {
  const lama = await landingSettingsForOperator();
  return lama === "unreachable" ? null : lama.media;
}

async function simpan(
  operator: string,
  patch: LandingSettingsPatch,
  action: OperatorAuditAction,
  details: Record<string, unknown>
): Promise<LandingActionResult> {
  const t = await getT();
  try {
    await saveLandingSettings(patch, operator);
  } catch (error) {
    console.error("[operator-landing-media] gagal disimpan:", error);
    return { ok: false, message: t("operator.landing.errSave") };
  }
  await writeOperatorAuditLog({ operator, action, ipAddress: clientIpFrom(await headers()), details });
  revalidatePath("/landing/media");
  return { ok: true, message: t("operator.landing.saved", { seconds: CACHE_SIGNAL_POLL_SECONDS }) };
}

/** Rujukan untuk setiap id yang diminta — `null` bila SATU saja tidak sah. */
async function rujukan(wanted: { id: number; kind: LandingImageKind }[]): Promise<Map<number, LandingImageRef> | null> {
  const peta = await resolveLandingImageRefs({ platform: platformDb }, wanted);
  return wanted.every((w) => peta.has(w.id)) ? peta : null;
}

const ringkas = <T extends { key: string; published: boolean; name: string }>(items: T[] | undefined) =>
  items ? items.map((i) => ({ key: i.key, name: i.name, published: i.published })) : null;

/* ── Unggah ────────────────────────────────────────────────────────────────── */

export async function operatorUploadLandingImage(formData: FormData): Promise<LandingUploadResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const kind = formData.get("kind");
  if (typeof kind !== "string" || !(LANDING_IMAGE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, message: t("validation.invalidInput") };
  }
  const jenis = kind as LandingImageKind;
  const file = formData.get("file");
  const bytes = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();

  let result;
  try {
    result = await createLandingImage({ platform: platformDb }, { bytes, kind: jenis, actor: session.operator.name });
  } catch (error) {
    console.error("[operator-landing-media] unggahan gagal disimpan:", error);
    return { ok: false, message: t("operator.landing.errSave") };
  }
  if (result.outcome !== "ok") {
    const lim = LANDING_IMAGE_LIMITS[jenis];
    return {
      ok: false,
      message: t(ALASAN[result.reason], { min: lim.minSide, max: lim.maxSide, kb: Math.round(lim.maxBytes / 1024) }),
    };
  }

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.landing.image",
    ipAddress: clientIpFrom(await headers()),
    details: {
      id: result.ref.id,
      kind: jenis,
      sha256: result.ref.sha256,
      mimeType: result.mimeType,
      width: result.ref.width,
      height: result.ref.height,
      bytesUploaded: bytes.length,
      bytesStored: result.bytes,
    },
  });
  return { ok: true, message: t("operator.landingMedia.uploaded"), image: result.ref };
}

/* ── Testimoni ─────────────────────────────────────────────────────────────── */

export async function operatorSaveLandingTestimonials(input: unknown): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = landingTestimonialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const peta = await rujukan(
    parsed.data.items.flatMap((i) => (i.photoId ? [{ id: i.photoId, kind: "testimonial" as const }] : []))
  );
  if (!peta) return { ok: false, message: t("operator.landingMedia.errImageRef") };

  const items: LandingTestimonial[] = [];
  for (const i of parsed.data.items) {
    const quote = normalizeLocalizedText({ id: i.quoteId, en: i.quoteEn, zh: i.quoteZh }, TESTIMONIAL_QUOTE_MAX);
    if (!quote) return { ok: false, message: t("validation.invalidInput") };
    items.push({
      key: i.key,
      published: i.published,
      quote,
      name: i.name,
      role: i.role || null,
      photo: i.photoId ? (peta.get(i.photoId) ?? null) : null,
    });
  }
  const lama = await mediaLama();
  return simpan(session.operator.name, { testimonials: items }, "operator.landing.testimonials", {
    itemsFrom: ringkas(lama?.testimonials),
    itemsTo: ringkas(items),
  });
}

/* ── Logo klien ────────────────────────────────────────────────────────────── */

export async function operatorSaveLandingClientLogos(input: unknown): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = landingClientLogosSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const peta = await rujukan(parsed.data.items.map((i) => ({ id: i.logoId, kind: "client_logo" as const })));
  if (!peta) return { ok: false, message: t("operator.landingMedia.errImageRef") };

  const items: LandingClientLogo[] = parsed.data.items.map((i) => ({
    key: i.key,
    published: i.published,
    name: i.name,
    href: i.href || null,
    logo: peta.get(i.logoId) as LandingImageRef,
  }));
  const lama = await mediaLama();
  return simpan(session.operator.name, { clientLogos: items }, "operator.landing.client_logos", {
    itemsFrom: ringkas(lama?.clientLogos),
    itemsTo: ringkas(items),
  });
}

/* ── Mitra resmi ───────────────────────────────────────────────────────────── */

export async function operatorSaveLandingPartners(input: unknown): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = landingPartnersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const peta = await rujukan(
    parsed.data.items.flatMap((i) => (i.logoId ? [{ id: i.logoId, kind: "partner_logo" as const }] : []))
  );
  if (!peta) return { ok: false, message: t("operator.landingMedia.errImageRef") };

  const items: LandingPartner[] = parsed.data.items.map((i) => ({
    key: i.key,
    published: i.published,
    name: i.name,
    city: i.city,
    href: i.href || null,
    logo: i.logoId ? (peta.get(i.logoId) ?? null) : null,
  }));
  const lama = await mediaLama();
  return simpan(session.operator.name, { partners: items }, "operator.landing.partners", {
    itemsFrom: lama?.partners.map((p) => ({ key: p.key, name: p.name, city: p.city, published: p.published })) ?? null,
    itemsTo: items.map((p) => ({ key: p.key, name: p.name, city: p.city, published: p.published })),
  });
}

/* ── Tangkapan layar & gambar OG ───────────────────────────────────────────── */

export async function operatorSaveLandingScreens(input: unknown): Promise<LandingActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.publish");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = landingScreensSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const d = parsed.data;

  const peta = await rujukan([
    ...(d.hero ? [{ id: d.hero.imageId, kind: "hero" as const }] : []),
    ...d.gallery.map((g) => ({ id: g.imageId, kind: "gallery" as const })),
    ...(d.ogImageId ? [{ id: d.ogImageId, kind: "og" as const }] : []),
  ]);
  if (!peta) return { ok: false, message: t("operator.landingMedia.errImageRef") };

  const layar = (s: LandingScreenshotFormInput): LandingScreenshot | null => {
    const alt = normalizeLocalizedText({ id: s.altId, en: s.altEn, zh: s.altZh }, ALT_TEXT_MAX);
    const image = peta.get(s.imageId);
    return alt && image ? { image, alt } : null;
  };
  const heroImage = d.hero ? layar(d.hero) : null;
  const gallery = d.gallery.map(layar).filter((g): g is LandingScreenshot => g !== null);
  const ogImage = d.ogImageId ? (peta.get(d.ogImageId) ?? null) : null;

  const lama = await mediaLama();
  return simpan(session.operator.name, { heroImage, gallery, ogImage }, "operator.landing.screens", {
    heroFrom: lama?.heroImage?.image.id ?? null,
    heroTo: heroImage?.image.id ?? null,
    galleryFrom: lama?.gallery.map((g) => g.image.id) ?? null,
    galleryTo: gallery.map((g) => g.image.id),
    ogFrom: lama?.ogImage?.id ?? null,
    ogTo: ogImage?.id ?? null,
  });
}
