"use client";

/**
 * Label (issue #50) — primitif shadcn di atas Radix Label.
 *
 * Ditambahkan sebagai fondasi pola `Form` di issue #53. `Input`/`Select`
 * memakainya di dalam supaya gaya label seragam di seluruh app, dan Radix
 * ikut menangani hal kecil yang mudah terlewat: klik pada teks label
 * memfokuskan kontrolnya, termasuk saat labelnya berisi elemen lain
 * (mis. `TermTooltip`).
 */

import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-1 text-sm font-medium text-foreground select-none",
        "group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Label };
