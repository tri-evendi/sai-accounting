"use client";

/**
 * Pengaturan — profil pengguna, modul usaha, jejak audit, kamus istilah, dan
 * kartu "Tentang" yang menyebut identitas perusahaan aktif.
 *
 * ── Yang TIDAK boleh berubah di sini ──────────────────────────────────────
 * Nama perusahaan datang dari `useCompanyIdentity()`, dan urutan sumbernya
 * (setting perusahaan → nama di registry kendali → konstanta) hidup di
 * `lib/company-identity-client.tsx`. Ia sengaja TIDAK di-inline ke berkas ini:
 * memundurkannya ke konstanta lebih awal berarti mencetak nama pemasang pertama
 * di dokumen PT lain — surat yang terlihat sah padahal salah badan hukum
 * (MASTER.md §Orientasi Perusahaan). Migrasi tampilan tidak menyentuhnya.
 *
 * ── Setelah migrasi AntD (issue #199) ─────────────────────────────────────
 * Tanpa kelas Tailwind: jarak & warna lewat `theme.useToken()`, pita "modul
 * dimatikan" menjadi `Alert` AntD, dan kedua tombol tautan memakai
 * `<Button href>` — bukan lagi `<Link><Button/></Link>`, yang menyarangkan
 * sebuah tombol di dalam anchor: HTML tak sah, dan pembaca layar
 * mengumumkannya dua kali (lihat catatan `href` di `ui/button.tsx`, #187/#250).
 */

import { useSession } from "next-auth/react";
import { Alert, Flex, theme, Typography } from "antd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { APP_NAME, type SystemRole } from "@/lib/constants";
import { useCompanyIdentity } from "@/lib/company-identity-client";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { ModuleSettingsPanel } from "@/components/settings/module-settings-panel";
import { PageHeader } from "@/components/ui/page-header";
import { GLOSSARY_PATH } from "@/lib/labels";
import { CloseSquareOutlined, ReadOutlined } from "@ant-design/icons";
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
  const { token } = theme.useToken();
  const { data: session } = useSession();

  if (!session) return null;

  // audit RBAC fase 4 — panel Audit Log tampil bila punya izin membacanya.
  const isManager = canReadAudit;

  /** Jarak antar-kartu halaman — bekas `mb-6`. */
  const blockGap: React.CSSProperties = { marginBottom: token.marginLG };

  /** Satu baris profil: istilah di atas, nilainya di bawah. */
  const term = (label: string, value: React.ReactNode) => (
    <div>
      <dt style={{ color: token.colorTextSecondary, fontWeight: token.fontWeightStrong }}>
        {label}
      </dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );

  return (
    <div>
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
        <Alert
          type="info"
          showIcon
          icon={<CloseSquareOutlined aria-hidden="true" style={{ fontSize: token.fontSizeLG }} />}
          style={blockGap}
          message={
            <>
              {t("modules.inactiveSummary", {
                count: inactiveModules.length,
                list: inactiveModules.map((m) => t(MODULE_META[m].labelKey)).join(", "),
              })}{" "}
              {canManageModules ? (
                <a
                  href="#modules"
                  style={{
                    color: token.colorLink,
                    fontWeight: token.fontWeightStrong,
                    textDecoration: "underline",
                  }}
                >
                  {t("modules.inactiveSummaryManage")}
                </a>
              ) : (
                <span>{t("modules.inactiveSummaryAsk")}</span>
              )}
            </>
          }
        />
      )}

      <Card style={blockGap}>
        <CardHeader>
          <CardTitle level={2}>{t("settings.profileTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Flex vertical gap={token.marginSM}>
            <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: token.marginSM }}>
              {term(t("common.name"), session.user.name)}
              {term(t("auth.login.username"), session.user.email)}
              {term(
                t("users.role"),
                roleLabels(dictionary)[session.user.role as SystemRole] || session.user.role
              )}
            </dl>
            <div>
              <Button href="/change-password" variant="secondary">
                {t("settings.changePassword")}
              </Button>
            </div>
          </Flex>
        </CardContent>
      </Card>

      {/* issue #99 — modul usaha: fitur mana yang dipakai perusahaan ini. */}
      {canManageModules && (
        <div id="modules">
          <ModuleSettingsPanel />
        </div>
      )}

      {isManager && (
        <div style={blockGap}>
          <AuditLogPanel />
        </div>
      )}

      {/* issue #21 — pintu masuk kedua ke Kamus Istilah, selain menu Bantuan. */}
      <Card style={blockGap}>
        <CardHeader>
          <CardTitle level={2}>{t("helpMenu.trigger")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Flex vertical align="flex-start" gap={token.marginSM}>
            <Typography.Text type="secondary">{t("settings.helpDescription")}</Typography.Text>
            <Button href={GLOSSARY_PATH} variant="secondary">
              <ReadOutlined aria-hidden="true" />
              {t("settings.openGlossary")}
            </Button>
          </Flex>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle level={2}>{t("settings.aboutTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Flex vertical gap={token.marginXXS}>
            {/* Nama produk lewat `APP_NAME`, nama PT lewat `useCompanyIdentity()`
                — dua sumber yang berbeda, dan menukarnya berarti mencetak
                identitas yang salah (lihat kepala berkas). */}
            <Typography.Text>{APP_NAME}</Typography.Text>
            <Typography.Text type="secondary">{company.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ marginTop: token.marginXXS }}>
              {t("settings.aboutTagline")}
            </Typography.Text>
          </Flex>
        </CardContent>
      </Card>
    </div>
  );
}
