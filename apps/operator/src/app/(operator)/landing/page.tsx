/**
 * `/landing` — TAMPILAN HALAMAN DEPAN (migration platform 0014).
 *
 * Halaman SENDIRI, bukan tab di `/settings`: pengaturan situs memikul kanal
 * kontak dan gerbang uang; yang di sini hanya mengubah apa yang DIBACA calon
 * customer di `/` dan `/pricing`. Empat panel, empat formulir, empat
 * penulisan — menyimpan satu tidak pernah menulis ulang yang lain:
 *
 *   1. Seksi yang tampil (pahlawan & ajakan penutup selalu tampil; harga
 *      punya sakelarnya sendiri di pengaturan situs).
 *   2. Tautan pemesanan demo + kalimat pembuka WhatsApp.
 *   3. Bilah pengumuman.
 *   4. Daftar tanya-jawab.
 *
 * Tidak ada yang diatur = halaman publik persis seperti sebelum halaman ini
 * ada; layar ini mengatakannya per panel.
 */

import { ConsoleNotice, ConsolePanel } from "@op/components/operator/console-ui";
import { LandingAnnouncementForm } from "@op/components/operator/landing-announcement-form";
import { LandingContactForm } from "@op/components/operator/landing-contact-form";
import { LandingFaqForm } from "@op/components/operator/landing-faq-form";
import { LandingSectionsForm } from "@op/components/operator/landing-sections-form";
import { PageHeader } from "@sai/ui/page-header";
import { getT } from "@sai/platform/i18n/server";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import { landingSettingsForOperator } from "@sai/platform/landing-settings";
import { isoToWibLocal } from "@sai/core/landing-settings";
import {
  operatorClearLandingAnnouncement,
  operatorResetLandingFaq,
  operatorSaveLandingAnnouncement,
  operatorSaveLandingContact,
  operatorSaveLandingFaq,
  operatorSaveLandingSections,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function OperatorLandingPage() {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const data = await landingSettingsForOperator();

  const header = <PageHeader title={t("operator.landing.heading")} description={t("operator.landing.description")} />;

  if (data === "unreachable") {
    return (
      <div>
        {header}
        <ConsoleNotice>{t("operator.landing.unavailable")}</ConsoleNotice>
      </div>
    );
  }

  const s = data.settings;
  const bolehTerbit = operatorCan(operator.role, "site.publish");
  const bolehKontak = operatorCan(operator.role, "site.settings");
  const hanyaBaca = <ConsoleNotice>{t("operator.roleCannotEdit")}</ConsoleNotice>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin-lg)" }}>
      {header}

      <ConsolePanel title={t("operator.landing.sectionsHeading")} description={t("operator.landing.sectionsDescription")}>
        {bolehTerbit ? (
          <LandingSectionsForm initial={{ hidden: s.hiddenSections }} save={operatorSaveLandingSections} />
        ) : (
          hanyaBaca
        )}
      </ConsolePanel>

      <ConsolePanel title={t("operator.landing.contactHeading")} description={t("operator.landing.contactDescription")}>
        {bolehKontak ? (
          <LandingContactForm
            initial={{
              demoBookingUrl: s.demoBookingUrl ?? "",
              whatsappId: s.whatsappMessage?.id ?? "",
              whatsappEn: s.whatsappMessage?.en ?? "",
              whatsappZh: s.whatsappMessage?.zh ?? "",
            }}
            save={operatorSaveLandingContact}
          />
        ) : (
          hanyaBaca
        )}
      </ConsolePanel>

      <ConsolePanel
        title={t("operator.landing.announcementHeading")}
        description={t("operator.landing.announcementDescription")}
      >
        {bolehTerbit ? (
          <LandingAnnouncementForm
            exists={s.announcement !== null}
            initial={{
              enabled: s.announcement?.enabled ?? false,
              textId: s.announcement?.text.id ?? "",
              textEn: s.announcement?.text.en ?? "",
              textZh: s.announcement?.text.zh ?? "",
              href: s.announcement?.href ?? "",
              startsAt: isoToWibLocal(s.announcement?.startsAt ?? null),
              endsAt: isoToWibLocal(s.announcement?.endsAt ?? null),
            }}
            save={operatorSaveLandingAnnouncement}
            clear={operatorClearLandingAnnouncement}
          />
        ) : (
          hanyaBaca
        )}
      </ConsolePanel>

      <ConsolePanel title={t("operator.landing.faqHeading")} description={t("operator.landing.faqDescription")}>
        {bolehTerbit ? (
          <LandingFaqForm
            custom={s.faqItems !== null}
            initial={(s.faqItems ?? []).map((i) => ({
              key: i.key,
              questionId: i.question.id,
              questionEn: i.question.en ?? "",
              questionZh: i.question.zh ?? "",
              answerId: i.answer.id,
              answerEn: i.answer.en ?? "",
              answerZh: i.answer.zh ?? "",
            }))}
            save={operatorSaveLandingFaq}
            reset={operatorResetLandingFaq}
          />
        ) : (
          hanyaBaca
        )}
      </ConsolePanel>
    </div>
  );
}
