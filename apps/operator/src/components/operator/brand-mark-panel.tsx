"use client";

/**
 * Panel logo produk di konsol (`/brand`): pratinjau logo yang sedang dipakai
 * di tema terang & gelap pada tiga ukuran nyata, unggah pengganti, dan
 * kembali ke lambang bawaan.
 *
 * Pratinjau memakai `/apple-icon.png` — rute yang sama yang dipakai peramban,
 * yang menyajikan logo unggahan atau lambang bawaan — jadi yang terlihat di
 * sini persis yang dilihat pengguna. `?v=` berganti bersama logonya supaya
 * cache peramban tidak menahan gambar lama.
 *
 * Pemilih berkas mengikuti pola `accounts/import/import-form.tsx`: `<label>`
 * bergaris putus-putus untuk `<input type="file">` yang tersembunyi tetapi
 * tetap bisa difokuskan papan ketik (`data-sr-only`).
 */
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, Typography, theme } from "antd";
import { UploadOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { useT } from "@sai/core/i18n/client";
import { formatDateTime } from "@sai/core/utils";
import { SIDER_BG_DARK } from "@sai/ui/theme/antd-tokens";
import { LOGO_MAX_BYTES } from "@sai/core/image-file";
import type { BrandActionResult } from "@op/app/(operator)/brand/actions";

const { Text } = Typography;

/** Ukuran contoh: layar depan, sidebar, ikon tab. */
const UKURAN = [128, 40, 16] as const;

export interface BrandMarkPanelProps {
  active: { sha256: string; width: number; height: number; createdBy: string; createdAt: string } | null;
  canEdit: boolean;
  upload: (formData: FormData) => Promise<BrandActionResult>;
  reset: () => Promise<BrandActionResult>;
}

export function BrandMarkPanel({ active, canEdit, upload, reset }: BrandMarkPanelProps) {
  const t = useT();
  const router = useRouter();
  const { token } = theme.useToken();
  const inputId = useId();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BrandActionResult | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const src = `/apple-icon.png?v=${active ? active.sha256.slice(0, 16) : "bawaan"}`;

  function run(p: () => Promise<BrandActionResult>) {
    startTransition(async () => {
      const r = await p();
      setResult(r);
      if (r.ok) {
        setFile(null);
        router.refresh();
      }
    });
  }

  const ubin = (latar: string, label: string) => (
    <Flex vertical gap={token.marginXS} style={{ flex: "1 1 220px" }}>
      <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {label}
      </Text>
      <Flex
        align="center"
        gap={token.marginLG}
        style={{ background: latar, borderRadius: token.borderRadiusLG, padding: token.paddingLG, border: `${token.lineWidth}px solid ${token.colorBorderSecondary}` }}
      >
        {UKURAN.map((s) => (
          // eslint-disable-next-line @next/next/no-img-element -- rute ikon menyajikan berkasnya apa adanya.
          <img key={s} src={src} alt="" width={s} height={s} style={{ objectFit: "contain", borderRadius: Math.round(s * 0.22) }} />
        ))}
      </Flex>
    </Flex>
  );

  return (
    <Flex vertical gap={token.marginLG}>
      {result && <Alert type={result.ok ? "success" : "error"} showIcon message={result.message} />}

      <Flex vertical gap={token.marginXS}>
        <Text strong>{t("operator.brand.current")}</Text>
        <Text type="secondary">
          {active
            ? t("operator.brand.usingCustom", { by: active.createdBy, at: formatDateTime(active.createdAt) })
            : t("operator.brand.usingDefault")}
          {active ? ` · ${active.width} × ${active.height} px` : ""}
        </Text>
      </Flex>

      <Flex wrap gap={token.margin}>
        {ubin(token.colorBgContainer, t("operator.brand.previewLight"))}
        {ubin(SIDER_BG_DARK, t("operator.brand.previewDark"))}
      </Flex>
      <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {t("operator.brand.previewNote")}
      </Text>

      {!canEdit ? (
        <Text type="secondary">{t("operator.brand.readOnly")}</Text>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            const data = new FormData();
            data.set("file", file);
            run(() => upload(data));
          }}
          style={{ display: "flex", flexDirection: "column", gap: token.marginSM }}
        >
          <Text strong>{t("operator.brand.upload")}</Text>
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
              paddingBlock: token.paddingLG,
              textAlign: "center",
            }}
          >
            <UploadOutlined aria-hidden="true" style={{ fontSize: 20 }} />
            <Text>{file ? file.name : t("operator.brand.fileLabel")}</Text>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t("operator.brand.hint")}
            </Text>
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg"
              disabled={pending}
              data-sr-only
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setResult(null);
                // Periksa ukuran di peramban dulu: menolak 5 MB di server berarti mengunggahnya dulu.
                if (f && f.size > LOGO_MAX_BYTES) {
                  setFile(null);
                  setResult({ ok: false, message: t("operator.brand.err.too_large") });
                } else {
                  setFile(f);
                }
                e.target.value = "";
              }}
            />
          </label>
          <Flex wrap gap={token.marginSM}>
            <Button type="submit" variant="primary" disabled={pending || !file}>
              {t("operator.brand.submit")}
            </Button>
            {active && (
              <ConfirmDialog
                title={t("operator.brand.resetTitle")}
                message={t("operator.brand.resetDescription")}
                confirmLabel={t("operator.brand.reset")}
                onConfirm={() => run(reset)}
                trigger={
                  <Button variant="secondary" disabled={pending}>
                    {t("operator.brand.reset")}
                  </Button>
                }
              />
            )}
          </Flex>
        </form>
      )}
    </Flex>
  );
}
