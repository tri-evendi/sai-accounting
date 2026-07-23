"use client";

/**
 * Checkbox (issue #73) — primitif shadcn/ui di atas Radix, token semantik.
 *
 * Dibuat untuk sel matriks Hak Akses (/permissions), tetapi generik: state
 * checked dikontrol pemanggil (`checked` + `onCheckedChange`). Dari Radix:
 * peran `checkbox` + `aria-checked` yang benar, toggle lewat Space, dan
 * dukungan label eksternal via `aria-label`/`aria-labelledby`. Fokus memakai
 * `focus-visible` (ring hanya saat navigasi keyboard), tinggi target sentuh
 * dicapai pemanggil lewat padding sel/label di sekitarnya.
 */

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-5 shrink-0 cursor-pointer rounded border border-border bg-card shadow-sm",
        "transition-colors duration-150 motion-reduce:transition-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
