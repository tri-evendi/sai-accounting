/**
 * `/landing/media` — GAMBAR & BUKTI SOSIAL halaman depan (migration platform
 * 0015). Saudara `/landing` (seksi, pengumuman, demo, FAQ), dipisah karena
 * isinya UNGGAHAN dan daftar bergambar.
 *
 *   1. Tangkapan layar (hero + galeri) dan gambar pratinjau tautan (OG).
 *   2. Testimoni.
 *   3. Logo klien.
 *   4. Mitra resmi — dengan daftar nama mitra yang tercatat di tenant sebagai
 *      PENGINGAT (hanya di konsol; halaman publik tidak pernah membacanya).
 *
 * Seksi bukti sosial di halaman publik hanya muncul bila ada ≥ 1 butir yang
 * ditampilkan; tanpa tangkapan layar, purwarupa yang digambar kode tetap.
 */

import { ConsoleNotice, ConsolePanel } from "@op/components/operator/console-ui";
import { LandingProofForm } from "@op/components/operator/landing-proof-form";
import { LandingScreensForm } from "@op/components/operator/landing-screens-form";
import { PageHeader } from "@sai/ui/page-header";
import { getT } from "@sai/platform/i18n/server";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import { partnerReferralCounts } from "@op/lib/operator/partner-referrals";
import { landingSettingsForOperator } from "@sai/platform/landing-settings";
import type { LandingImageRef, LandingMedia } from "@sai/core/landing-media";
import {
  operatorSaveLandingClientLogos,
  operatorSaveLandingPartners,
  operatorSaveLandingScreens,
  operatorSaveLandingTestimonials,
  operatorUploadLandingImage,
} from "./actions";

export const dynamic = "force-dynamic";

/** Semua rujukan gambar yang sudah dipakai — untuk pratinjau di formulir. */
function petaGambar(m: LandingMedia): Record<number, LandingImageRef> {
  const out: Record<number, LandingImageRef> = {};
  const tambah = (r: LandingImageRef | null) => {
    if (r) out[r.id] = r;
  };
  m.testimonials.forEach((i) => tambah(i.photo));
  m.clientLogos.forEach((i) => tambah(i.logo));
  m.partners.forEach((i) => tambah(i.logo));
  tambah(m.heroImage?.image ?? null);
  m.gallery.forEach((g) => tambah(g.image));
  tambah(m.ogImage);
  return out;
}

export default async function OperatorLandingMediaPage() {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const data = await landingSettingsForOperator();
  const header = (
    <PageHeader title={t("operator.landingMedia.heading")} description={t("operator.landingMedia.description")} />
  );

  if (data === "unreachable") {
    return (
      <div>
        {header}
        <ConsoleNotice>{t("operator.landing.unavailable")}</ConsoleNotice>
      </div>
    );
  }
  if (!operatorCan(operator.role, "site.publish")) {
    return (
      <div>
        {header}
        <ConsoleNotice>{t("operator.roleCannotEdit")}</ConsoleNotice>
      </div>
    );
  }

  const m = data.media;
  const refs = petaGambar(m);
  const rujukanMitra = await partnerReferralCounts();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin-lg)" }}>
      {header}

      <ConsolePanel title={t("operator.landingMedia.screensHeading")} description={t("operator.landingMedia.screensDescription")}>
        <LandingScreensForm
          refs={refs}
          initial={{
            hero: m.heroImage
              ? {
                  imageId: m.heroImage.image.id,
                  altId: m.heroImage.alt.id,
                  altEn: m.heroImage.alt.en ?? "",
                  altZh: m.heroImage.alt.zh ?? "",
                }
              : null,
            gallery: m.gallery.map((g) => ({
              imageId: g.image.id,
              altId: g.alt.id,
              altEn: g.alt.en ?? "",
              altZh: g.alt.zh ?? "",
            })),
            ogImageId: m.ogImage?.id ?? null,
          }}
          save={operatorSaveLandingScreens}
          upload={operatorUploadLandingImage}
        />
      </ConsolePanel>

      <ConsolePanel
        title={t("operator.landingMedia.testimonialsHeading")}
        description={t("operator.landingMedia.testimonialsDescription")}
      >
        <LandingProofForm
          variant="testimonials"
          refs={refs}
          initial={m.testimonials.map((i) => ({
            key: i.key,
            published: i.published,
            quoteId: i.quote.id,
            quoteEn: i.quote.en ?? "",
            quoteZh: i.quote.zh ?? "",
            name: i.name,
            role: i.role ?? "",
            photoId: i.photo?.id ?? null,
          }))}
          save={operatorSaveLandingTestimonials}
          upload={operatorUploadLandingImage}
        />
      </ConsolePanel>

      <ConsolePanel title={t("operator.landingMedia.logosHeading")} description={t("operator.landingMedia.logosDescription")}>
        <LandingProofForm
          variant="logos"
          refs={refs}
          initial={m.clientLogos.map((i) => ({
            key: i.key,
            published: i.published,
            name: i.name,
            href: i.href ?? "",
            logoId: i.logo.id,
          }))}
          save={operatorSaveLandingClientLogos}
          upload={operatorUploadLandingImage}
        />
      </ConsolePanel>

      <ConsolePanel
        title={t("operator.landingMedia.partnersHeading")}
        description={t("operator.landingMedia.partnersDescription")}
      >
        <LandingProofForm
          variant="partners"
          refs={refs}
          initial={m.partners.map((i) => ({
            key: i.key,
            published: i.published,
            name: i.name,
            city: i.city,
            href: i.href ?? "",
            logoId: i.logo?.id ?? null,
          }))}
          save={operatorSaveLandingPartners}
          upload={operatorUploadLandingImage}
        />
        <div style={{ marginTop: "var(--ant-margin)" }}>
          <strong>{t("operator.landingMedia.referralsHeading")}</strong>
          <p style={{ margin: 0, color: "var(--ant-color-text-secondary)", fontSize: "var(--ant-font-size-sm)" }}>
            {t("operator.landingMedia.referralsNote")}
          </p>
          {rujukanMitra === null ? (
            <ConsoleNotice>{t("operator.tenant.billingUnavailable")}</ConsoleNotice>
          ) : rujukanMitra.length === 0 ? (
            <p style={{ margin: 0 }}>{t("operator.landingMedia.referralsEmpty")}</p>
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: "var(--ant-padding-lg)" }}>
              {rujukanMitra.map((r) => (
                <li key={r.name}>{t("operator.landingMedia.referralsRow", { name: r.name, count: r.tenants })}</li>
              ))}
            </ul>
          )}
        </div>
      </ConsolePanel>
    </div>
  );
}
