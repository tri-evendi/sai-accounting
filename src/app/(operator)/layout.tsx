/**
 * Kerangka grup `(operator)` (issue #154) — chrome KONSOL OPERATOR.
 *
 * SENGAJA bukan kerangka `(dashboard)` dan tanpa `SessionProvider` NextAuth:
 * bidang operator punya sesinya sendiri (`lib/operator/session.ts`), dan
 * modul-modulnya dijaga bersih dari impor kode pelanggan supaya ekstraksi
 * menjadi aplikasi kedua kelak tinggal memindahkan folder, bukan mengurai
 * jalinan.
 *
 * Kerangka ini TIDAK menjadi penjaga (pola grup lain: penjaga per halaman,
 * ditegakkan tests/authz-coverage) — ia hanya membaca sesi secara opsional
 * untuk chrome: tanpa sesi (halaman login) kepala tampil polos tanpa menu.
 *
 * Kepala GELAP di kedua tema (token permukaan-gelap `sidebar`, pola panel
 * brand AuthShell) — pembeda visual yang disengaja: satu pandangan cukup
 * untuk tahu Anda sedang di bidang operator, bukan di aplikasi pelanggan.
 */

import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OperatorNav } from "@/components/operator/operator-nav";
import { optionalOperatorSession } from "@/lib/operator/guard";
import { getT } from "@/lib/i18n/server";
import { operatorLogout } from "./operator/actions";

export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([optionalOperatorSession(), getT()]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary-foreground/90" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight">{t("operator.consoleTitle")}</span>
          {/* Sejak #155 konsol ini MENULIS — penandanya berganti dari
              "hanya-baca" menjadi peringatan bahwa setiap tindakan terekam
              atas nama operator yang sedang masuk. */}
          <Badge variant="warning">{t("operator.auditedBadge")}</Badge>
          {session && (
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-xs text-sidebar-foreground/70 sm:inline">
                {t("operator.signedInAs", { name: session.operator.name })}
              </span>
              <form action={operatorLogout}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="border-sidebar-foreground/30 bg-transparent text-sidebar-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                >
                  {t("operator.logout")}
                </Button>
              </form>
            </div>
          )}
        </div>
      </header>

      {session && (
        <div className="border-b border-border bg-card">
          <div className="mx-auto w-full max-w-6xl px-4">
            <OperatorNav
              ariaLabel={t("operator.consoleTitle")}
              items={[
                {
                  href: "/operator",
                  label: t("operator.nav.tenants"),
                  activePrefixes: ["/operator/tenants"],
                },
                {
                  href: "/operator/reconciliation",
                  label: t("operator.nav.reconciliation"),
                  activePrefixes: ["/operator/reconciliation"],
                },
                {
                  href: "/operator/scheduler",
                  label: t("operator.nav.scheduler"),
                  activePrefixes: ["/operator/scheduler"],
                },
              ]}
            />
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
