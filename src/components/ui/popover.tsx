"use client";

/**
 * Popover (issue #51) — primitif panel melayang di atas Radix UI, pola
 * shadcn/ui dengan palet aplikasi ini.
 *
 * Dipakai oleh `SearchableSelect` (combobox) dan `TermTooltip`. Radix
 * memberi positioning sadar-tabrakan (flip/shift saat mepet tepi layar),
 * Escape + klik-luar menutup, dan pengembalian fokus — semua yang dulu
 * dihitung manual.
 */

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
  className,
  align = "center",
  sideOffset = 8,
  collisionPadding = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 w-72 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none",
          "animate-panel-in motion-reduce:animate-none",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
