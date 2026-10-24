"use client";

/**
 * KOLOM GAMBAR konsol `/landing/media` — unggah satu berkas, pratinjau, hapus.
 *
 * Unggahan langsung berjalan saat berkas dipilih (server action
 * `operatorUploadLandingImage`, mekanisme logo produk): yang kembali adalah
 * RUJUKAN baris `landing_images` baru, dan rujukan itulah nilai kolom ini.
 * Gambar baru belum tayang sampai formulirnya disimpan — unggahan tanpa
 * simpan hanya meninggalkan baris yang tidak dirujuk siapa pun.
 *
 * Batas ukuran diperiksa juga di sini (pesan cepat sebelum berkas besar
 * dikirim); yang memutuskan tetap server.
 */

import { useRef, useState } from "react";
import { Alert, Flex, theme } from "antd";
import { DeleteOutlined, UploadOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { useT } from "@sai/core/i18n/client";
import {
  LANDING_IMAGE_LIMITS,
  landingImageUrl,
  type LandingImageKind,
  type LandingImageRef,
} from "@sai/core/landing-media";
import type { LandingUploadResult } from "@op/lib/validations/landing";

export function LandingImageField({
  kind,
  label,
  value,
  onChange,
  upload,
  removable = true,
}: {
  kind: LandingImageKind;
  label: string;
  value: LandingImageRef | null;
  onChange: (next: LandingImageRef | null) => void;
  upload: (formData: FormData) => Promise<LandingUploadResult>;
  removable?: boolean;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lim = LANDING_IMAGE_LIMITS[kind];

  async function pilih(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > lim.maxBytes) {
      setError(t("operator.landingMedia.err.too_large", { kb: Math.round(lim.maxBytes / 1024) }));
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    const res = await upload(fd);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok || !res.image) {
      setError(res.message);
      return;
    }
    onChange(res.image);
  }

  return (
    <Flex vertical gap={token.marginXXS}>
      <span style={{ fontWeight: token.fontWeightStrong }}>{label}</span>
      <Flex gap={token.marginSM} align="center" wrap>
        {value && (
          // eslint-disable-next-line @next/next/no-img-element -- rute sendiri, pola `BrandMark`.
          <img
            src={landingImageUrl(value)}
            alt=""
            width={Math.round((value.width / value.height) * 56)}
            height={56}
            style={{
              height: 56,
              width: "auto",
              maxWidth: 200,
              objectFit: "contain",
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadius,
            }}
          />
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={label}
          style={{ display: "none" }}
          onChange={(e) => void pilih(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <UploadOutlined aria-hidden="true" />
          {value ? t("operator.landingMedia.replace") : t("operator.landingMedia.upload")}
        </Button>
        {value && removable && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <DeleteOutlined aria-hidden="true" />
            {t("operator.landingMedia.removeImage")}
          </Button>
        )}
      </Flex>
      <span style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
        {kind === "og"
          ? t("operator.landingMedia.hintOg")
          : t("operator.landingMedia.hint", { kb: Math.round(lim.maxBytes / 1024), min: lim.minSide })}
      </span>
      {error && <Alert type="error" showIcon message={error} />}
    </Flex>
  );
}
