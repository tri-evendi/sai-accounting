"use client";

/**
 * Year + month selector for the Anggaran & Target surfaces (issue #29). Pushes
 * `?year=&month=` into the URL; the server pages read those and re-query. Month
 * "0" means the whole year (every monthly plan summed) — the same convention the
 * report and input pages share.
 */
import { Flex, theme } from "antd";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useDictionary, useT } from "@/lib/i18n/client";
import { monthNames } from "@/lib/i18n/labels";

/**
 * Lebar kedua isian. Bukan token — tidak ada token AntD yang berarti "selebar
 * satu tahun" — tetapi juga bukan kelas: keduanya kotak isian yang isinya
 * SUDAH diketahui panjangnya ("2026", "September"), dan membiarkannya melar
 * mengikuti kolom membuat baris saringan bergoyang tiap kali bulannya berganti.
 */
const YEAR_WIDTH = 160;
const MONTH_WIDTH = 192;

/**
 * `className` dicabut, tidak dipindahkan: ketiga pemanggil (Anggaran per Akun,
 * Target Penjualan, Laporan Anggaran) memanggilnya tanpa kelas apa pun, dan
 * nilai bawaannya dulu justru kelas Tailwind — sebuah tata letak yang
 * bersembunyi di dalam nilai default sebuah prop.
 */
export function PeriodPicker({
  year,
  month,
  yearsBack = 4,
}: {
  year: number;
  /** undefined = whole year. */
  month?: number;
  yearsBack?: number;
}) {
  const t = useT();
  const { token } = theme.useToken();
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
    <Flex wrap align="flex-end" gap={token.marginSM}>
      <div style={{ width: YEAR_WIDTH }}>
        <Select
          id="period-year"
          label={t("budget.yearField")}
          value={String(year)}
          onChange={(e) => push({ year: Number(e.target.value) })}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>
      <div style={{ width: MONTH_WIDTH }}>
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
    </Flex>
  );
}
