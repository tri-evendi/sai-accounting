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
      <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{t("dueDate.hint")}</span>
      </p>
    </div>
  );
}
