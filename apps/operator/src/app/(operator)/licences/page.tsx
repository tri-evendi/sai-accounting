/**
 * `/licences` — REGISTER LISENSI ON-PREMISE (migration platform 0006;
 * keputusan pemilik 22 Okt 2026 "opsi a").
 *
 * Menggantikan tabel tangan di `docs/ONPREM-SERAH-TERIMA.md` §1. Alurnya satu
 * formulir → satu perintah yang disalin → satu unggahan. Penandatanganan
 * tetap LURING: kunci privat tidak pernah menyentuh konsol ini.
 *
 * ⚠ Register adalah ARSIP, bukan kewenangan — tidak ada yang membaca barisnya
 * untuk memutuskan status lisensi (rancangan §8). Karena itu "dicabut" di
 * sini hanya catatan, dan layar mengatakannya.
 *
 * Semua operator boleh melihat; menulis butuh izin `licence.register`.
 */
import { ConsoleNotice, ConsolePanel, CONSOLE_PAGE } from "@op/components/operator/console-ui";
import {
  LicenceRegisterPanel,
  type LicenceCustomerItem,
} from "@op/components/operator/licence-register-panel";
import { PageHeader } from "@sai/ui/page-header";
import { getT } from "@sai/platform/i18n/server";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import { licenceKeyInstalled } from "@sai/core/licence";
import { buildIssueCommand, formatModules } from "@sai/core/licence-register";
import { platformDb } from "@sai/platform/platform-db";
import { readLicenceRegister } from "@sai/platform/licence-register-store";

import {
  operatorCreateLicenceDraft,
  operatorDiscardLicenceDraft,
  operatorDownloadLicence,
  operatorRevokeLicence,
  operatorUploadLicenceFile,
} from "./actions";

export const dynamic = "force-dynamic";

const LANGKAH = [
  "operator.licences.steps.one",
  "operator.licences.steps.two",
  "operator.licences.steps.three",
  "operator.licences.steps.four",
  "operator.licences.steps.five",
] as const;

export default async function OperatorLicencesPage() {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const keyInstalled = licenceKeyInstalled();

  let customers: LicenceCustomerItem[] | null;
  try {
    const rows = await readLicenceRegister({ platform: platformDb });
    /* Diserialkan di server: tanggal jadi teks, perintah sudah dirakit — kulit
       client tidak perlu mengimpor perakitnya. */
    customers = rows.map((c) => ({
      id: c.id,
      name: c.name,
      contact: c.contact,
      sourceTenantId: c.sourceTenantId,
      entries: c.entries.map((e) => ({
        id: e.id,
        version: e.version,
        status: e.status,
        licenceId: e.terms.licenceId,
        customer: e.terms.customer,
        maxCompanies: e.terms.maxCompanies,
        maxUsers: e.terms.maxUsers,
        modules: formatModules(e.terms.modules),
        supportEndsOn: e.terms.supportEndsOn,
        maxVersion: e.terms.maxVersion,
        notes: e.notes,
        command: e.status === "draft" ? buildIssueCommand(e.terms) : null,
        fileSha256: e.fileSha256,
        uploadedBy: e.uploadedBy,
        uploadedAt: e.uploadedAt?.toISOString() ?? null,
        revokedBy: e.revokedBy,
        revokedAt: e.revokedAt?.toISOString() ?? null,
        revokeReason: e.revokeReason,
        createdBy: e.createdBy,
        createdAt: e.createdAt.toISOString(),
      })),
    }));
  } catch (error) {
    console.error("[operator-licences] register tak terbaca:", error);
    customers = null;
  }

  return (
    <div>
      <PageHeader title={t("operator.licences.heading")} description={t("operator.licences.description")} />
      <div style={CONSOLE_PAGE}>
        {!keyInstalled && <ConsoleNotice>{t("operator.licences.keyNotSet")}</ConsoleNotice>}

        <ConsolePanel title={t("operator.licences.stepsTitle")} footnote={t("operator.licences.archiveNote")}>
          <ol style={{ margin: 0, paddingInlineStart: "var(--ant-padding-lg)", lineHeight: 1.7 }}>
            {LANGKAH.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ol>
        </ConsolePanel>

        {customers === null ? (
          <ConsoleNotice>{t("operator.licences.unavailable")}</ConsoleNotice>
        ) : (
          <LicenceRegisterPanel
            customers={customers}
            canEdit={operatorCan(operator.role, "licence.register")}
            keyInstalled={keyInstalled}
            createDraft={operatorCreateLicenceDraft}
            upload={operatorUploadLicenceFile}
            download={operatorDownloadLicence}
            revoke={operatorRevokeLicence}
            discard={operatorDiscardLicenceDraft}
          />
        )}
      </div>
    </div>
  );
}
