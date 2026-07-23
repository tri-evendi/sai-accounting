"use client";

/**
 * Command (issue #51) — daftar perintah/opsi terfilter di atas `cmdk`,
 * pola shadcn/ui dengan palet aplikasi ini.
 *
 * Dipakai oleh `SearchableSelect` sebagai mesin combobox: cmdk memberi
 * ARIA combobox yang benar (`aria-activedescendant`, `role="listbox"`),
 * navigasi panah + Enter, dan filter ketik — perilaku yang dulu dirakit
 * tangan tanpa ARIA-nya.
 */

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground",
        className
      )}
      {...props}
    />
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <CommandPrimitive.Input
        className={cn(
          "w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-60 overflow-y-auto overflow-x-hidden py-1", className)}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      className={cn("px-3 py-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        "overflow-hidden [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-start justify-between gap-2 px-3 py-2 text-sm outline-none",
        "data-[selected=true]:bg-primary/10",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
};
