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
import { Flex, theme, Typography } from "antd";
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
  const { token } = theme.useToken();
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
    <form onSubmit={submit} style={{ marginBottom: token.marginLG }}>
      <Flex wrap align="flex-end" gap={token.margin}>
        <Input
          id="asOf"
          type="date"
          label={t("ledgerFilter.asOfField")}
          value={d}
          onChange={(e) => setD(e.target.value)}
        />
        {/*
         * Teksnya kini ANAK `Checkbox`, bukan `<label>` kedua yang membungkus
         * satu `<label>` AntD. Selain menghapus sarang label yang tak sah,
         * daerah tekannya jadi milik AntD sendiri: `.ant-checkbox-wrapper`
         * mencakup kotak DAN katanya. Tingginya disamakan dengan kendali di
         * sebelahnya lewat `controlHeight` (40px), bukan angka tetap.
         */}
        <Flex align="center" style={{ minHeight: token.controlHeight }}>
          <Checkbox checked={overdue} onCheckedChange={(v) => setOverdue(v === true)}>
            {t("ledgerFilter.overdueOnly")}
          </Checkbox>
        </Flex>
        <Button type="submit">{t("common.show")}</Button>
      </Flex>
      <Typography.Text
        type="secondary"
        style={{ display: "block", marginTop: token.marginXS, fontSize: token.fontSizeSM }}
      >
        {t("ledgerFilter.hint")}
      </Typography.Text>
    </form>
  );
}
