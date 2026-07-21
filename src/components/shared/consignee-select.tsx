"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";

interface ConsigneeOption {
  id: number;
  name: string;
  country: string | null;
  contact: string | null;
  isActive: boolean;
}

interface ConsigneeSelectProps {
  /** Selected master id, or null when the contract has only the legacy text. */
  consigneeId: number | null;
  onConsigneeIdChange: (id: number | null) => void;
  /** Legacy free-text fallback; rendered as an uncontrolled input `name="consignee"`. */
  defaultText?: string;
  /**
   * The contract's current master row (from `consigneeRef`), if any. Injected so
   * a consignee that has since been DEACTIVATED still shows as the selection when
   * editing — the active-only fetch would otherwise drop it.
   */
  current?: { id: number; name: string; country: string | null; contact: string | null } | null;
}

function describe(c: { country: string | null; contact: string | null }): string | undefined {
  return [c.country, c.contact].filter(Boolean).join(" · ") || undefined;
}

/**
 * Consignee picker for the Contract form (issue #22): a searchable select over
 * the active master, plus the legacy free-text kept editable as a fallback for
 * rows that never resolved to a master. Picking a master is optional — a
 * contract may still carry only the text.
 */
export function ConsigneeSelect({
  consigneeId,
  onConsigneeIdChange,
  defaultText,
  current,
}: ConsigneeSelectProps) {
  const [consignees, setConsignees] = useState<ConsigneeOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/consignees?active=1")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ConsigneeOption[]) => {
        if (!cancelled) setConsignees(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setConsignees([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: SearchableOption[] = consignees.map((c) => ({
    value: String(c.id),
    label: c.name,
    description: describe(c),
  }));

  // Ensure the currently-linked master is always selectable, even if inactive
  // (deactivated after this contract was linked to it).
  if (current && !options.some((o) => o.value === String(current.id))) {
    options.unshift({
      value: String(current.id),
      label: `${current.name} (nonaktif)`,
      description: describe(current),
    });
  }

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <SearchableSelect
        id="consigneeId"
        label="Consignee (master)"
        placeholder="Pilih consignee dari master…"
        searchPlaceholder="Cari nama / negara / kontak…"
        emptyText="Tidak ada consignee cocok"
        options={options}
        value={consigneeId != null ? String(consigneeId) : null}
        onChange={(v) => onConsigneeIdChange(v == null ? null : Number(v))}
      />
      <p className="text-xs text-gray-500">
        Belum ada di master?{" "}
        <Link href="/consignees/new" target="_blank" className="text-blue-600 hover:underline">
          Tambah consignee
        </Link>
        , lalu pilih di sini.
      </p>
      <Input
        id="consignee"
        name="consignee"
        label="Consignee (teks lama — fallback)"
        defaultValue={defaultText ?? ""}
        placeholder="Dipakai bila belum dipilih dari master"
      />
    </div>
  );
}
