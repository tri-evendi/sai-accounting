"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Check, X, Search } from "lucide-react";
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

/**
 * Accessible, self-contained combobox (issue #22). No external deps — filters an
 * in-memory option list, keyboard-navigable, closes on outside click / Escape.
 * State-driven (not a native <select>), so the caller keeps the value in React
 * and adds it to its own submit payload.
 */
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
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false)
    );
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Focus the search box once the menu is open (external system — no setState).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  function toggleOpen() {
    // Reset the query/highlight in the event handler (not an effect) so opening
    // always starts from a clean search.
    if (!open) {
      setQuery("");
      setActive(0);
    }
    setOpen((o) => !o);
  }

  function choose(val: string) {
    onChange(val);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) choose(opt.value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          id={id}
          disabled={disabled}
          onClick={toggleOpen}
          aria-haspopup="listbox"
          aria-expanded={open}
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

        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm placeholder:text-gray-400 focus:outline-none"
              />
            </div>
            <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500">{emptyText}</li>
              ) : (
                filtered.map((opt, i) => {
                  const isSelected = opt.value === value;
                  return (
                    <li
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(opt.value);
                      }}
                      className={cn(
                        "flex cursor-pointer items-start justify-between gap-2 px-3 py-2 text-sm",
                        i === active ? "bg-blue-50" : "hover:bg-gray-50"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-gray-900">{opt.label}</span>
                        {opt.description && (
                          <span className="block truncate text-xs text-gray-500">
                            {opt.description}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
