"use client";

/**
 * Year + month selector for the Anggaran & Target surfaces (issue #29). Pushes
 * `?year=&month=` into the URL; the server pages read those and re-query. Month
 * "0" means the whole year (every monthly plan summed) — the same convention the
 * report and input pages share.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useDictionary, useT } from "@/lib/i18n/client";
import { monthNames } from "@/lib/i18n/labels";

export function PeriodPicker({
  year,
  month,
  yearsBack = 4,
  className,
}: {
  year: number;
  /** undefined = whole year. */
  month?: number;
  yearsBack?: number;
  className?: string;
}) {
  const t = useT();
  const months = monthNames(useDictionary());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= thisYear - yearsBack; y -= 1) years.push(y);

  function push(next: { year?: number; month?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.year !== undefined) params.set("year", String(next.year));
    if (next.month !== undefined) params.set("month", String(next.month));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={className ?? "flex flex-wrap items-end gap-3"}>
      <div className="w-40">
        <Select
          id="period-year"
          label={t("budget.yearField")}
          value={String(year)}
          onChange={(e) => push({ year: Number(e.target.value) })}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>
      <div className="w-48">
        <Select
          id="period-month"
          label={t("budget.monthField")}
          value={String(month ?? 0)}
          onChange={(e) => push({ month: Number(e.target.value) })}
          options={[
            { value: "0", label: t("budget.allMonths") },
            ...months.map((name, i) => ({ value: String(i + 1), label: name })),
          ]}
        />
      </div>
    </div>
  );
}
