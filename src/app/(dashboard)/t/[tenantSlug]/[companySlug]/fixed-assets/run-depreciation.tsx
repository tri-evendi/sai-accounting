"use client";

/**
 * Jalankan penyusutan bulanan (issue #28).
 *
 * Pick a month, post depreciation for every active asset that has not yet been
 * depreciated that period. Idempotent server-side, so re-running a posted month
 * is safe; a closed period is refused with the server's not-saved notice.
 *
 * Dikonversi ke token Ant Design pada issue #197 — kulitnya saja.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, Spin, theme } from "antd";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { CalendarClock } from "lucide-react";
import { useDictionary, useT } from "@/lib/i18n/client";
import { monthNames } from "@/lib/i18n/labels";
import { apiFetch } from "@/lib/api-fetch";

/** Lebar pemilih bulan & tahun (`w-36` / `w-28` lama). */
const MONTH_WIDTH = 144;
const YEAR_WIDTH = 112;

export function RunDepreciation() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();
  const months = monthNames(useDictionary());
  const now = new Date();

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  async function run() {
    setError(null);
    setRunning(true);
    try {
      const res = await apiFetch("/api/fixed-assets/depreciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), month: Number(month) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? t("fixedAssets.runFailed"));
        return;
      }
      toast(
        data.postedCount > 0
          ? t("fixedAssets.runPosted", {
              count: data.postedCount,
              amount: formatCurrency(data.totalAmount, "IDR"),
            })
          : t("fixedAssets.runNothing"),
        "success"
      );
      router.refresh();
    } catch {
      setError(t("fixedAssets.networkFailed"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <div style={{ padding: token.padding }}>
        <Flex wrap align="flex-end" gap={token.marginSM}>
          <Flex
            align="center"
            gap={token.marginXS}
            style={{ minHeight: token.controlHeight, fontWeight: token.fontWeightStrong }}
          >
            <CalendarClock size={token.fontSizeLG} aria-hidden="true" />
            {t("fixedAssets.runTitle")}
          </Flex>
          <div style={{ width: MONTH_WIDTH }}>
            <Select
              id="dep-month"
              label={t("fixedAssets.monthField")}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={months.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </div>
          <div style={{ width: YEAR_WIDTH }}>
            <Select
              id="dep-year"
              label={t("fixedAssets.yearField")}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
            />
          </div>
          <Button onClick={run} disabled={running}>
            {running && <Spin size="small" />}
            {t("fixedAssets.runAction")}
          </Button>
        </Flex>
        {error && (
          <div role="alert" style={{ marginTop: token.marginSM }}>
            <Alert type="error" showIcon message={error} />
          </div>
        )}
      </div>
    </Card>
  );
}
