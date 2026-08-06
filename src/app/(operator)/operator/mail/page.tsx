/**
 * PENGATURAN SUREL — konsol operator (issue #169).
 *
 * Keluhan yang melahirkannya sederhana: mengganti server SMTP menuntut sesi
 * SSH, menyunting `.env`, lalu menggelar ulang. Layar ini memindahkannya ke
 * konsol yang memang sudah dijaga host + IP + MFA.
 *
 * Rumah datanya `sai_platform`, BUKAN `company_settings`: surel dipakai justru
 * saat tidak ada konteks perusahaan (verifikasi pendaftaran, undangan staf,
 * atur ulang kata sandi) — menaruhnya di basis data perusahaan berarti setiap
 * pelanggan mengonfigurasi server surel milik PENYEDIA.
 *
 * Halaman ini hanya MENYUSUN & MEMFORMAT; setiap tulisan lewat server action
 * (`./actions.ts`) — tidak ada `route.ts` di bawah `(operator)`, dan itu
 * ditegakkan `tests/authz-coverage.test.ts`.
 */

import { MailSettingsForm } from "@/components/operator/mail-settings-form";
import { requireOperatorPage } from "@/lib/operator/guard";
import { mailSettingsForOperator } from "@/lib/operator/store";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/*
 * Warna di berkas ini memakai token `:root` aplikasi, bukan `--ant-…` (#200):
 * konsol operator tidak menggambar satu pun komponen AntD di atas isinya, jadi
 * variabel AntD tidak akan teratasi di sini (#227). Formulirnya sendiri
 * (`MailSettingsForm`) adalah komponen client dan mewarnai dirinya.
 */
const H1: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  color: "var(--foreground)",
};

const LEAD: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.625,
  color: "var(--muted-foreground)",
};

export default async function OperatorMailPage() {
  await requireOperatorPage();
  const t = await getT();

  const data = await mailSettingsForOperator();

  const sourceLabel =
    data.effective.source === "database"
      ? t("operator.mail.sourceDatabase")
      : data.effective.source === "env"
        ? t("operator.mail.sourceEnv")
        : t("operator.mail.sourceDefault");

  const transportLabel =
    data.effective.transport === "smtp"
      ? t("operator.mail.transportSmtp")
      : t("operator.mail.transportFile");

  const settings = data.settings;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 style={H1}>{t("operator.mail.heading")}</h1>
        <p style={LEAD}>{t("operator.mail.description")}</p>
      </div>

      <MailSettingsForm
        available={data.available}
        encryptionKeyAvailable={data.encryptionKeyAvailable}
        effective={{
          sourceLabel,
          transportLabel,
          from: data.effective.from,
          /* Transport SMTP yang DIMINTA tetapi jatuh ke berkas = pengaman
             non-produksi sedang bekerja; katakan itu, jangan biarkan operator
             menebak kenapa surelnya tidak sampai. */
          downgraded:
            data.effective.requestedTransport === "smtp" && data.effective.transport !== "smtp",
        }}
        settings={
          settings
            ? {
                transport: settings.transport,
                host: settings.host,
                port: settings.port,
                username: settings.username,
                fromAddress: settings.fromAddress,
                hasPassword: settings.hasPassword,
                updatedByLabel: t("operator.mail.updatedBy", {
                  name: settings.updatedBy,
                  date: formatDateTime(settings.updatedAt),
                }),
                lastTest: settings.lastTest
                  ? {
                      ok: settings.lastTest.status === "ok",
                      line: t("operator.mail.lastTestLine", {
                        date: formatDateTime(settings.lastTest.at),
                        to: settings.lastTest.to ?? "—",
                      }),
                      message: settings.lastTest.message,
                    }
                  : null,
              }
            : null
        }
      />
    </div>
  );
}
