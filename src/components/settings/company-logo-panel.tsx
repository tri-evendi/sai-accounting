"use client";

/**
 * Kartu "Logo perusahaan" di Pengaturan (migration company 0002).
 *
 * Hanya tampil untuk pemilik PT (`company_setting.manage`, page.tsx); API-nya
 * di `/api/t/{tenant}/{company}/company-logo` ber-gate izin yang sama, jadi
 * kartu ini murni permukaan. Logo dicetak di kepala setiap dokumen PDF
 * (faktur, kontrak, surat jalan, retur, laporan).
 *
 * Alamatnya BERLINGKUP JALUR, bukan header `apiFetch()`: pratinjaunya
 * `<img src>`, yang tidak melewati satu pun kode kita (pola
 * `accounts/import/import-form.tsx`). Unggah & hapus memakai alamat yang sama.
 *
 * Sesudah menyimpan, `useReloadCompanyIdentity()` memuat ulang identitas,
 * jadi PDF berikutnya langsung memakai logo baru tanpa muat ulang halaman.
 */
import { useId, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Alert, Flex, Typography, theme } from "antd";
import { UploadOutlined } from "@ant-design/icons";

import { Card, CardContent, CardHeader, CardTitle } from "@sai/ui/card";
import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { apiFetch } from "@/lib/api-fetch";
import { companyLogoUrl, useCompanyIdentity, useReloadCompanyIdentity } from "@/lib/company-identity-client";
import { useT } from "@sai/core/i18n/client";
import { LOGO_MAX_BYTES } from "@sai/core/image-file";
import { parseTenantPath } from "@sai/core/tenant-routes";

const { Text } = Typography;

export function CompanyLogoPanel() {
  const t = useT();
  const { token } = theme.useToken();
  const company = useCompanyIdentity();
  const reload = useReloadCompanyIdentity();
  const pathname = usePathname();
  const parsed = pathname ? parseTenantPath(pathname) : null;
  const scope = parsed ? `${parsed.tenantSlug}/${parsed.companySlug}` : "";
  const endpoint = scope ? `/api/t/${scope}/company-logo` : "";

  const inputId = useId();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const logo = company.logoInfo;

  function send(init: RequestInit, okMessage: string) {
    if (!endpoint) return;
    startTransition(async () => {
      try {
        const res = await apiFetch(endpoint, init);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setNotice({ ok: false, message: body?.error || t("settings.companyLogo.err.generic") });
          return;
        }
        setFile(null);
        setNotice({ ok: true, message: okMessage });
        reload();
      } catch {
        setNotice({ ok: false, message: t("settings.companyLogo.err.generic") });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>{t("settings.companyLogo.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Flex vertical gap={token.margin}>
          <Text type="secondary">{t("settings.companyLogo.description")}</Text>
          {notice && <Alert type={notice.ok ? "success" : "error"} showIcon message={notice.message} />}

          <Flex align="center" gap={token.margin} wrap>
            <div
              style={{
                width: 160,
                height: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: token.borderRadiusLG,
                border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                background: token.colorBgContainer,
                padding: token.paddingXS,
              }}
            >
              {logo && scope ? (
                // eslint-disable-next-line @next/next/no-img-element -- rute logo menyajikan berkasnya apa adanya, di balik sesi.
                <img
                  src={companyLogoUrl(scope, logo.version)}
                  alt={t("settings.companyLogo.previewAlt", { name: company.name })}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              ) : (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {t("settings.companyLogo.none")}
                </Text>
              )}
            </div>
            {logo && (
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {logo.width} × {logo.height} px
              </Text>
            )}
          </Flex>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!file) return;
              const data = new FormData();
              data.set("file", file);
              send({ method: "POST", body: data }, t("settings.companyLogo.saved"));
            }}
            style={{ display: "flex", flexDirection: "column", gap: token.marginSM }}
          >
            <label
              htmlFor={inputId}
              data-disabled={pending || undefined}
              style={{
                display: "flex",
                cursor: "pointer",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: token.marginXS,
                borderRadius: token.borderRadiusLG,
                border: `${token.lineWidth}px dashed ${token.colorBorder}`,
                background: token.colorFillQuaternary,
                paddingInline: token.paddingLG,
                paddingBlock: token.padding,
                textAlign: "center",
              }}
            >
              <UploadOutlined aria-hidden="true" style={{ fontSize: 20 }} />
              <Text>{file ? file.name : t("settings.companyLogo.choose")}</Text>
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {t("settings.companyLogo.hint")}
              </Text>
              <input
                id={inputId}
                type="file"
                accept="image/png,image/jpeg"
                disabled={pending}
                data-sr-only
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setNotice(null);
                  if (f && f.size > LOGO_MAX_BYTES) {
                    setFile(null);
                    setNotice({ ok: false, message: t("settings.companyLogo.err.too_large") });
                  } else {
                    setFile(f);
                  }
                  e.target.value = "";
                }}
              />
            </label>
            <Flex wrap gap={token.marginSM}>
              <Button type="submit" variant="primary" disabled={pending || !file || !endpoint}>
                {t("settings.companyLogo.submit")}
              </Button>
              {logo && (
                <ConfirmDialog
                  title={t("settings.companyLogo.removeTitle")}
                  message={t("settings.companyLogo.removeDescription")}
                  confirmLabel={t("settings.companyLogo.remove")}
                  confirmVariant="danger"
                  onConfirm={() => send({ method: "DELETE" }, t("settings.companyLogo.removed"))}
                  trigger={
                    <Button variant="secondary" disabled={pending}>
                      {t("settings.companyLogo.remove")}
                    </Button>
                  }
                />
              )}
            </Flex>
          </form>
        </Flex>
      </CardContent>
    </Card>
  );
}
