/**
 * Button (issue #50) — primitif shadcn/ui: CVA + token semantik.
 *
 * **Nama varian.** Issue #50 memberi dua pilihan (alias di CVA, atau codemod
 * seluruh call-site); yang dipilih adalah **alias**, karena:
 *   • `variant="primary"` tidak pernah ditulis eksplisit di call-site mana pun
 *     — ia selalu jadi default — jadi codemod hanya akan menyentuh `danger`;
 *   • `danger` HARUS tetap ada di `Badge` (issue #50 mewajibkan varian domain
 *     `success|warning|danger` di sana). Membuat Button memakai `destructive`
 *     sementara Badge memakai `danger` justru lebih membingungkan, bukan
 *     kurang;
 *   • MASTER.md sendiri berbicara dalam istilah domain ("tombol primer",
 *     "destruktif = merah").
 * Jadi `primary`/`danger` adalah nama kanonik aplikasi ini, sedangkan
 * `default`/`destructive` diterima sebagai alias supaya komponen hasil
 * `shadcn add` (yang menulis `variant="destructive"`) tetap jalan. Keduanya
 * menunjuk string kelas yang sama persis — lihat konstanta di bawah.
 *
 * **Fokus.** `focus-visible` (bukan `focus`) — ring hanya muncul pada navigasi
 * keyboard, tidak saat diklik mouse.
 *
 * **Tinggi.** Default `md` = 40px, memenuhi "target sentuh ≥ 40px" MASTER.md.
 */

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/*
 * String kelas dibagikan antara nama domain dan alias shadcn supaya tidak ada
 * dua sumber kebenaran yang bisa berbeda diam-diam.
 */
const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";
const DESTRUCTIVE =
  "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    "transition-colors duration-150 motion-reduce:transition-none",
    // Ring hanya untuk keyboard; `focus:` gaya lama menyala juga saat diklik.
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: PRIMARY,
        /** Alias shadcn dari `primary`. */
        default: PRIMARY,
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        danger: DESTRUCTIVE,
        /** Alias shadcn dari `danger`. */
        destructive: DESTRUCTIVE,
        ghost: "hover:bg-accent hover:text-accent-foreground",
        outline:
          "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        /** Default — 40px, target sentuh minimum MASTER.md. */
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Merender elemen anak sebagai tombolnya — mis. membungkus `next/link`. */
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
