"use client";

/**
 * Badge — penanda status di atas Ant Design **`Tag`** (issue #187, fase B1).
 *
 * ── Kenapa `Tag`, dan bukan `Badge` milik AntD ────────────────────────────
 * Nama yang sama, komponen yang sama sekali berbeda. `Badge` AntD adalah TITIK
 * NOTIFIKASI: bulatan merah kecil yang menempel di pojok sesuatu, isinya angka
 * atau tidak ada isinya sama sekali. Yang dibutuhkan 52 berkas di aplikasi ini
 * adalah LABEL BERTEKS — "Lunas", "Menunggu", "Jatuh Tempo" — dan itu `Tag`.
 * Memilih berdasarkan kesamaan nama akan menukar kata dengan bulatan merah, dan
 * bersamanya menghapus satu-satunya penanda yang bukan warna.
 *
 * ── Aturan yang tetap dipikul primitif ini ────────────────────────────────
 * **Badge selalu berteks** (MASTER.md): warna tidak pernah jadi satu-satunya
 * penanda. Komponen ini hanya mewarnai; isinya wajib kata, dan itu dikunci
 * `tests/ui-controls-antd.test.tsx`.
 *
 * ── Warnanya ──────────────────────────────────────────────────────────────
 * Latar dan batas dibiarkan bawaan AntD. Yang diganti hanya warna TEKS-nya,
 * lewat token komponen `Tag` di `AntdProvider` — karena bawaannya meletakkan
 * teks 12px pada 2,21:1 (success, tema terang), sementara badge lama yang
 * digantikannya berada di 6,4–6,8:1. Angka, alasan, dan penggantinya ada di
 * `lib/theme/antd-tokens.ts` (`tagStatusTokens`); berkas ini sengaja tidak
 * menyebut satu warna pun.
 *
 * ── `variant="filled"`, bukan bawaan ──────────────────────────────────────
 * `Tag` bawaan bergaris (`outlined`). Dengan `colorBorder` yang dinaikkan
 * issue #208 menjadi 3,62:1, setiap label status akan mendapat bingkai abu
 * pekat yang tidak pernah dimiliki badge lama — dan garis sepekat itu di
 * belasan sel tabel membuat kolom status terbaca lebih berisik daripada
 * angkanya. Yang bergaris hanya `variant="outline"`, satu-satunya varian yang
 * memang meminta garis.
 */

import { Tag } from "antd";
import type { TagProps } from "antd";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "destructive"
  | "outline";

type TagLook = Pick<TagProps, "color" | "variant">;

/** `destructive` adalah alias shadcn dari `danger` — objek yang sama, bukan salinan. */
const DANGER: TagLook = { color: "error", variant: "filled" };

const VARIANTS: Record<BadgeVariant, TagLook> = {
  default: { variant: "filled" },
  success: { color: "success", variant: "filled" },
  warning: { color: "warning", variant: "filled" },
  danger: DANGER,
  destructive: DANGER,
  outline: { variant: "outlined" },
};

type BadgeProps = React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
};

function Badge({ variant = "default", ...props }: BadgeProps) {
  return <Tag {...VARIANTS[variant]} {...props} />;
}

export { Badge };
export type { BadgeProps, BadgeVariant };
