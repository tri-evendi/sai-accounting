"use client";

/**
 * Optional payment due date, shared by the invoice and contract forms (issue #12).
 *
 * One component so the explanation reads identically everywhere: leaving it blank
 * is a legitimate answer, not a skipped field. The aging report treats a blank due
 * date as "unknown" and ages the document from its issue date instead of inventing
 * a deadline — the helper text says so, because a user who does not know that will
 * assume a blank field means "not overdue".
 */

import { Flex, theme, Typography } from "antd";
import { Input } from "@/components/ui/input";
import { CalendarClock } from "lucide-react";
import { useT } from "@/lib/i18n/client";

interface DueDateFieldProps {
  /** `YYYY-MM-DD`, or "" when unknown. Uncontrolled when omitted. */
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export function DueDateField({ defaultValue, value, onChange }: DueDateFieldProps) {
  const t = useT();
  const { token } = theme.useToken();
  return (
    <div>
      <Input
        id="dueDate"
        name="dueDate"
        type="date"
        label={t("dueDate.field")}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      {/* Kalimat bantuan berikon — bentuk yang sama dipakai `cost-center-field`,
          `invoice-fx-fields`, dan `consignee-select`. Jaraknya token
          (`marginXXS`), ukurannya `fontSizeSM`, warnanya `type="secondary"`
          (rgba(0,0,0,0.65) = 6,98:1, lolos AA meski 12px). */}
      <Flex
        align="flex-start"
        gap={token.marginXXS}
        style={{ marginTop: token.marginXXS }}
      >
        <CalendarClock size={token.fontSize} aria-hidden="true" style={{ flexShrink: 0 }} />
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {t("dueDate.hint")}
        </Typography.Text>
      </Flex>
    </div>
  );
}
