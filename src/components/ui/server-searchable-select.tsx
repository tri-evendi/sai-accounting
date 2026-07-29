"use client";

/**
 * ServerSearchableSelect — saudara `SearchableSelect` untuk daftar yang terlalu
 * besar untuk dikirim ke klien (audit: pemilih dokumen terpotong `take: 300`).
 *
 * Bedanya satu: opsi TIDAK datang sebagai prop statis, melainkan dicari ke
 * server. Setiap ketikan menunggu ~300ms lalu memanggil `fetchUrl` dengan
 * `search=<q>&take=20` dan mengharapkan kontrak jawaban tunggal
 * `{ options: [{ value, label, hint? }] }` (lihat `src/lib/picker.ts`).
 * Muatan awal (pencarian kosong) berisi ±20 dokumen terbaru — dokumen lama
 * tetap terjangkau lewat pencarian, bukan hilang di balik potongan.
 *
 * Label pilihan aktif tetap tampil walau barisnya tidak ada di halaman hasil
 * saat ini: komponen mengingat opsi yang terakhir dipilih, dan pilihan awal
 * dari server dioper lewat `initialOption`.
 *
 * cmdk tetap dipakai untuk ARIA combobox + navigasi papan ketik, tetapi
 * `shouldFilter={false}` — menyaring adalah pekerjaan server sekarang.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Check, X, Loader2 } from "lucide-react";
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
import { useT } from "@/lib/i18n/client";
import type { PickerOption } from "@/lib/picker";

export type { PickerOption };

interface ServerSearchableSelectProps {
  /** Endpoint GET yang menjawab `{ options: [...] }`; boleh sudah membawa
   *  query string sendiri (mis. `/api/customers?active=1&picker=1`). */
  fetchUrl: string;
  /** Nama parameter pencarian. Bawaan `search`; `/api/returns/purchase`
   *  memakai `searchOrigin` agar tidak menabrak mode lamanya. */
  searchParam?: string;
  value: string | null;
  onChange: (value: string | null, option: PickerOption | null) => void;
  /** Opsi yang sudah terpilih saat halaman dirender server (mis. `?contractId=`)
   *  — supaya labelnya tampil tanpa menunggu halaman hasil memuatnya. */
  initialOption?: PickerOption | null;
  id?: string;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show a clear (×) button when a value is selected. Default true. */
  clearable?: boolean;
  disabled?: boolean;
}

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

export function ServerSearchableSelect({
  fetchUrl,
  searchParam = "search",
  value,
  onChange,
  initialOption,
  id,
  label,
  placeholder,
  searchPlaceholder,
  emptyText,
  clearable = true,
  disabled = false,
}: ServerSearchableSelectProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  /** Opsi yang terakhir dipilih pengguna — sumber label saat barisnya sudah
   *  tidak ada lagi di halaman hasil berikutnya. */
  const [picked, setPicked] = useState<PickerOption | null>(initialOption ?? null);
  /** Muatan pertama langsung; setelah itu tiap ketikan menunggu debounce. */
  const loadedOnce = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(
      async () => {
        try {
          const sep = fetchUrl.includes("?") ? "&" : "?";
          const res = await fetch(
            `${fetchUrl}${sep}${searchParam}=${encodeURIComponent(query.trim())}&take=${PAGE_SIZE}`,
            { signal: controller.signal }
          );
          if (res.ok) {
            const data = (await res.json()) as { options?: PickerOption[] };
            setOptions(Array.isArray(data.options) ? data.options : []);
            loadedOnce.current = true;
          } else {
            setOptions([]);
          }
        } catch {
          // Dibatalkan (ketikan berikutnya) atau jaringan putus — hasil
          // sebelumnya dibiarkan; `finally` di bawah tidak mematikan spinner
          // pada pembatalan karena permintaan penggantinya sedang berjalan.
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      loadedOnce.current ? DEBOUNCE_MS : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, fetchUrl, searchParam]);

  const selected = useMemo(() => {
    if (value == null) return null;
    if (picked?.value === value) return picked;
    const match = options.find((o) => o.value === value);
    if (match) return match;
    if (initialOption?.value === value) return initialOption;
    return null;
  }, [value, picked, options, initialOption]);

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
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
              "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            )}
          >
            <span className={cn("truncate", !selected && value == null && "text-muted-foreground")}>
              {selected
                ? selected.label
                : (value ?? placeholder ?? t("searchableSelect.placeholder"))}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              {clearable && value != null && !disabled && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={t("searchableSelect.clear")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPicked(null);
                    onChange(null, null);
                  }}
                  className="rounded p-0.5 hover:bg-muted hover:text-muted-foreground"
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
          {/* Server yang menyaring — cmdk hanya menampilkan apa adanya. */}
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder ?? t("searchableSelect.searchPlaceholder")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList id={listboxId}>
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  {t("common.loading")}
                </div>
              ) : (
                <>
                  <CommandEmpty>{emptyText ?? t("searchableSelect.empty")}</CommandEmpty>
                  {options.map((opt) => {
                    const isSelected = opt.value === value;
                    return (
                      <CommandItem
                        key={opt.value}
                        value={opt.value}
                        // Nilai dari closure, bukan argumen callback — cmdk
                        // menormalkan argumennya (trim/lowercase) dan itu bukan
                        // nilai yang boleh dikirim ke API.
                        onSelect={() => {
                          setPicked(opt);
                          onChange(opt.value, opt);
                          setOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-foreground">{opt.label}</span>
                          {opt.hint && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {opt.hint}
                            </span>
                          )}
                        </span>
                        {isSelected && (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        )}
                      </CommandItem>
                    );
                  })}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
