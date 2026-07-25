import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VarianceStatus } from "@/lib/budget";
import { getT } from "@/lib/i18n/server";

/**
 * Over / under / on-target indicator for a budget or target row (issue #29).
 *
 * Deliberately NOT colour-only (design-system rule): every state carries a
 * lucide icon AND a text label, so the meaning survives greyscale, colour-blind
 * vision, and a screen reader. Colour is the third, redundant channel — and it
 * encodes *favourability*, not direction: an over-variance is green on a revenue
 * account (beat the target) but red on an expense account (overspent), which a
 * direction-only colour could never express.
 */
export async function VarianceBadge({
  status,
  favorable,
}: {
  status: VarianceStatus;
  favorable: boolean | null;
}) {
  const t = await getT();

  if (status === "on_target") {
    return (
      <Badge variant="default" className="gap-1">
        <Minus className="h-3 w-3" aria-hidden="true" />
        {t("budget.varianceOnTarget")}
      </Badge>
    );
  }

  const over = status === "over";
  const Icon = over ? ArrowUpRight : ArrowDownRight;
  const label = over ? t("budget.varianceOver") : t("budget.varianceUnder");
  // favorable: true → success, false → danger, null → default (should not occur here).
  const variant = favorable === null ? "default" : favorable ? "success" : "danger";

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label} {t("budget.varianceSuffix")}
    </Badge>
  );
}
