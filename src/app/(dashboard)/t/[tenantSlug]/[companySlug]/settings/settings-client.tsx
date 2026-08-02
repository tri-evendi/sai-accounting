"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/app-link";
import { APP_NAME, type SystemRole } from "@/lib/constants";
import { useCompanyIdentity } from "@/lib/company-identity-client";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { ModuleSettingsPanel } from "@/components/settings/module-settings-panel";
import { PageHeader } from "@/components/ui/page-header";
import { GLOSSARY_PATH } from "@/lib/labels";
import { BookMarked, PackageX } from "lucide-react";
import { MODULE_META, type BusinessModule } from "@/lib/business-modules";
import { useDictionary, useT } from "@/lib/i18n/client";
import { roleLabels } from "@/lib/i18n/labels";

interface SettingsClientProps {
  /** issue #73 — dihitung server terhadap matriks EFEKTIF (page.tsx), bukan
   * dibaca client dari matriks bawaan di bundle. Tampilan saja: API audit
   * tetap ber-gate `audit.read`. */
  canReadAudit: boolean;
  /** issue #99 — kartu "Modul Usaha"; API-nya tetap ber-gate
   * `company_setting.manage`, jadi ini murni menyembunyikan permukaan. */
  canManageModules: boolean;
  /** issue #103 — modul yang sedang MATI, dihitung di server. Daftar kosong
   *  berarti semuanya menyala dan barisnya tidak muncul sama sekali. */
  inactiveModules: BusinessModule[];
}

export function SettingsClient({
  canReadAudit,
  canManageModules,
  inactiveModules,
}: SettingsClientProps) {
  const t = useT();
  const company = useCompanyIdentity();
  const dictionary = useDictionary();
  const { data: session } = useSession();

  if (!session) return null;

  // audit RBAC fase 4 — panel Audit Log tampil bila punya izin membacanya.
  const isManager = canReadAudit;

  return (
    <div className="w-full">
      <PageHeader title={t("nav.items.settings")} />

      {/*
       * "Apa yang sedang dimatikan" (issue #103).
       *
       * Diletakkan PALING ATAS, sebelum profil: yang membawa orang ke sini
       * seringkali pertanyaan "kenapa menu Kontrak tidak ada?", dan jawabannya
       * tidak boleh berada di bawah tiga kartu lain. Modulnya disebut NAMANYA,
       * bukan cuma jumlahnya — "3 modul tidak aktif" tidak menjawab pertanyaan
       * siapa pun.
       *
       * Muncul untuk SEMUA yang boleh membuka Pengaturan. Yang tidak berhak
       * mengubah modul justru paling perlu tahu bahwa fiturnya ada dan sedang
       * dimatikan; yang berhak mendapat tautan ke kartu pengelolanya di bawah.
       */}
      {inactiveModules.length > 0 && (
        <div className="mb-6 flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <PackageX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            {t("modules.inactiveSummary", {
              count: inactiveModules.length,
              list: inactiveModules.map((m) => t(MODULE_META[m].labelKey)).join(", "),
            })}{" "}
            {canManageModules ? (
              <a href="#modules" className="font-medium text-primary underline">
                {t("modules.inactiveSummaryManage")}
              </a>
            ) : (
              <span>{t("modules.inactiveSummaryAsk")}</span>
            )}
          </p>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("settings.profileTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("common.name")}</dt>
              <dd className="text-sm text-foreground">{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t("auth.login.username")}
              </dt>
              <dd className="text-sm text-foreground">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("users.role")}</dt>
              <dd className="text-sm text-foreground">
                {roleLabels(dictionary)[session.user.role as SystemRole] || session.user.role}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <Link href="/change-password">
              <Button variant="secondary" className="cursor-pointer">
                {t("settings.changePassword")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* issue #99 — modul usaha: fitur mana yang dipakai perusahaan ini. */}
      {canManageModules && (
        <div id="modules">
          <ModuleSettingsPanel />
        </div>
      )}

      {isManager && (
        <div className="mb-6">
          <AuditLogPanel />
        </div>
      )}

      {/* issue #21 — pintu masuk kedua ke Kamus Istilah, selain menu Bantuan. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("helpMenu.trigger")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("settings.helpDescription")}
          </p>
          <Link href={GLOSSARY_PATH} className="mt-3 inline-block">
            <Button variant="secondary" className="cursor-pointer">
              <BookMarked className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("settings.openGlossary")}
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.aboutTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground">{APP_NAME}</p>
          <p className="text-sm text-muted-foreground mt-1">{company.name}</p>
          <p className="text-sm text-muted-foreground mt-2">
            {t("settings.aboutTagline")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
