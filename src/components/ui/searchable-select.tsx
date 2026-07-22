"use client";

/**
 * SearchableSelect (issue #22, dirombak di issue #51) — combobox pola shadcn:
 * `Popover` + `Command` (cmdk).
 *
 * cmdk menyumbang apa yang dulu hilang dari rakitan tangan: `role="combobox"`
 * + `aria-activedescendant` (screen reader tahu opsi mana yang aktif),
 * navigasi panah/Enter/Escape, dan filter ketik. Filternya mencocokkan label
 * DAN baris deskripsi (mis. negara/kontak), sama seperti sebelumnya.
 *
 * State-driven (bukan <select> native): pemanggil menyimpan nilainya di React
 * dan memasukkannya sendiri ke payload submit.
 */

import { useId, useMemo, useState } from "react";
import { ChevronsUpDown, Check, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  /** Optional secondary line (e.g. country / contact) shown under the label. */
  description?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show a clear (×) button when a value is selected. Default true. */
  clearable?: boolean;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  id,
  label,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  clearable = true,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  /**
   * `aria-controls` wajib menyertai role="combobox": pembaca layar perlu tahu
   * daftar mana yang dikendalikan tombol ini. Daftarnya baru ada di DOM saat
   * popover terbuka — itu memang perilaku yang diharapkan untuk combobox.
   */
  const listboxId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="listbox"
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
            )}
          >
            <span className={cn("truncate", !selected && "text-gray-400")}>
              {selected ? selected.label : placeholder}
            </span>
            <span className="flex items-center gap-1 text-gray-400">
              {clearable && selected && !disabled && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Clear selection"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(null);
                  }}
                  className="rounded p-0.5 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </span>
              )}
              <ChevronsUpDown className="h-4 w-4" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList id={listboxId}>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    // cmdk memfilter pada value + keywords: label dan baris
                    // deskripsi dua-duanya bisa dicari, seperti sebelumnya.
                    keywords={
                      opt.description ? [opt.label, opt.description] : [opt.label]
                    }
                    // Nilai dari closure, bukan argumen callback — cmdk
                    // menormalkan argumennya (trim/lowercase) dan itu bukan
                    // nilai yang boleh dikirim ke API.
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-gray-900">{opt.label}</span>
                      {opt.description && (
                        <span className="block truncate text-xs text-gray-500">
                          {opt.description}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
