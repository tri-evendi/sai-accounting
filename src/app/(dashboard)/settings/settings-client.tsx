"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { APP_NAME, COMPANY_NAME, type SystemRole } from "@/lib/constants";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { PageHeader } from "@/components/ui/page-header";
import { GLOSSARY_PATH } from "@/lib/labels";
import { BookMarked } from "lucide-react";
import { useDictionary, useT } from "@/lib/i18n/client";
import { roleLabels } from "@/lib/i18n/labels";

interface SettingsClientProps {
  /** issue #73 — dihitung server terhadap matriks EFEKTIF (page.tsx), bukan
   * dibaca client dari matriks bawaan di bundle. Tampilan saja: API audit
   * tetap ber-gate `audit.read`. */
  canReadAudit: boolean;
}

export function SettingsClient({ canReadAudit }: SettingsClientProps) {
  const t = useT();
  const dictionary = useDictionary();
  const { data: session } = useSession();

  if (!session) return null;

  // audit RBAC fase 4 — panel Audit Log tampil bila punya izin membacanya.
  const isManager = canReadAudit;

  return (
    <div className="w-full">
      <PageHeader title={t("nav.items.settings")} />

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
          <p className="text-sm text-muted-foreground mt-1">{COMPANY_NAME}</p>
          <p className="text-sm text-muted-foreground mt-2">
            {t("settings.aboutTagline")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
