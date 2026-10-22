/**
 * Gambar QR authenticator — SVG sebaris dari geometri yang dikodekan server
 * (`lib/operator/qr.ts`).
 *
 * Tanpa `"use client"` dan tanpa hook: dipakai dari server component maupun
 * dari layar client (kotak kredensial `/accounts`, langkah `/accounts/
 * authenticator`), dan di keduanya ia hanya menggambar satu `<path>`. Tidak
 * ada `<img src>`, tidak ada URL — teks URI-nya tidak pernah sampai ke sini.
 *
 * Warnanya mutlak hitam-di-atas-putih di kedua tema (alasannya di
 * `QR_MODULE_HEX`), dengan zona tenangnya sendiri sebagai latar.
 */
import { QR_MODULE_HEX, QR_QUIET_ZONE_HEX } from "@sai/ui/theme/antd-tokens";
import type { QrSvgData } from "@op/lib/operator/qr";

export function QrCode({ qr, label, size = 208 }: { qr: QrSvgData; label: string; size?: number }) {
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      style={{
        display: "block",
        maxWidth: "100%",
        height: "auto",
        borderRadius: "var(--ant-border-radius)",
        border: "1px solid var(--ant-color-border-secondary)",
      }}
    >
      <rect width={qr.size} height={qr.size} fill={QR_QUIET_ZONE_HEX} />
      <path d={qr.path} fill={QR_MODULE_HEX} />
    </svg>
  );
}
