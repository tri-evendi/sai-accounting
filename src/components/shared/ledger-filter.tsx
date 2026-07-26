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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export function LedgerFilter({
  basePath,
  asOf,
  overdueOnly,
}: {
  basePath: string;
  asOf: string;
  overdueOnly: boolean;
}) {
  const t = useT();
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
          label={t("ledgerFilter.asOfField")}
          value={d}
          onChange={(e) => setD(e.target.value)}
        />
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={overdue}
            onCheckedChange={(v) => setOverdue(v === true)}
          />
          {t("ledgerFilter.overdueOnly")}
        </label>
        <Button type="submit" className="cursor-pointer">
          {t("common.show")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("ledgerFilter.hint")}
      </p>
    </form>
  );
}
