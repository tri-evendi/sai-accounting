"use client";

/**
 * As-of date + overdue-only filter for the AR/AP screens (issue #12).
 *
 * The overdue toggle is honest about its own limits: it can only match documents
 * that actually carry a due date, because "jatuh tempo" is undefined without one.
 * The helper text says so rather than letting a user conclude that an empty
 * result means nothing is overdue.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LedgerFilter({
  basePath,
  asOf,
  overdueOnly,
}: {
  basePath: string;
  asOf: string;
  overdueOnly: boolean;
}) {
  const router = useRouter();
  const [d, setD] = useState(asOf);
  const [overdue, setOverdue] = useState(overdueOnly);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (d) p.set("asOf", d);
    if (overdue) p.set("overdue", "1");
    router.push(`${basePath}?${p.toString()}`);
  }

  return (
    <form onSubmit={submit} className="mb-6">
      <div className="flex flex-wrap items-end gap-4">
        <Input
          id="asOf"
          type="date"
          label="Per Tanggal"
          value={d}
          onChange={(e) => setD(e.target.value)}
        />
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-700 focus:ring-2 focus:ring-blue-700"
          />
          Hanya yang sudah jatuh tempo
        </label>
        <Button type="submit" className="cursor-pointer">
          Tampilkan
        </Button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Filter jatuh tempo hanya mencakup dokumen yang punya tanggal jatuh tempo. Dokumen
        tanpa tanggal jatuh tempo tidak bisa dinilai terlambat, jadi tidak pernah muncul di
        sini — isi kolom Jatuh Tempo pada dokumen agar ikut terpantau.
      </p>
    </form>
  );
}
