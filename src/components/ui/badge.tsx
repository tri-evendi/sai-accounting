/**
 * Badge (issue #50) — penanda status: CVA + token semantik.
 *
 * Varian domain `success|warning|danger` DIPERTAHANKAN (bukan diganti nama
 * shadcn) karena inilah bahasa statusnya di app akuntansi: Lunas = success,
 * Sebagian = warning, Jatuh Tempo = danger. `destructive` diterima sebagai
 * alias shadcn dari `danger`.
 *
 * **Badge selalu berteks** (aturan MASTER.md) — warna tidak pernah jadi
 * satu-satunya penanda; komponen ini hanya mewarnai, isinya wajib kata.
 *
 * **Kenapa token `-soft`/`-strong`, bukan `bg-success/10 text-success`.**
 * Issue #50 menyarankan pola `/10` itu, tetapi kombinasinya gagal kontras:
 * #16A34A di atas success/10 hanya **2,96:1**, warning 2,86:1, destructive
 * 4,13:1 — semuanya di bawah ambang 4.5:1 yang diwajibkan MASTER.md (dan
 * lebih buruk dari badge lama yang sudah 6,5:1). Jadi dipakai pasangan
 * `--*-soft` (latar) + `--*-strong` (teks) yang terverifikasi 6,4–6,8:1.
 */

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const DANGER = "bg-destructive-soft text-destructive-strong";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        success: "bg-success-soft text-success-strong",
        warning: "bg-warning-soft text-warning-strong",
        danger: DANGER,
        /** Alias shadcn dari `danger`. */
        destructive: DANGER,
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
export type { BadgeProps };
