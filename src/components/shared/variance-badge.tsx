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
 *
 * ── Kenapa TIDAK ada satu pun gaya di sini setelah #194 ────────────────────
 * `gap-1` dan `h-3 w-3` dulu ada karena `<svg>` lucide di dalam badge tidak
 * punya ukuran maupun jarak. Keduanya sekarang milik `Tag` AntD sendiri:
 * `.ant-tag > svg + span` mendapat `margin-inline-start: paddingInline`, dan
 * ikonnya diberi `size="1em"` sehingga ia mengikuti `fontSizeSM` (12px) milik
 * `Tag` — bukan angka tetap yang harus diubah kalau kerapatan tema bergeser.
 * Label WAJIB dibungkus `<span>`: selektor jarak AntD itu mencocokkan
 * `> svg + span`, dan teks telanjang tidak akan pernah cocok.
 *
 * Berkas ini TETAP server component. Ia tidak memanggil `theme.useToken()` —
 * satu-satunya token yang dibutuhkannya (warna teks `Tag`) sudah dipasang
 * `AntdProvider` lewat `components.Tag`, jadi tidak ada yang perlu dibaca.
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
      <Badge variant="default">
        <Minus size="1em" aria-hidden="true" />
        <span>{t("budget.varianceOnTarget")}</span>
      </Badge>
    );
  }

  const over = status === "over";
  const Icon = over ? ArrowUpRight : ArrowDownRight;
  const label = over ? t("budget.varianceOver") : t("budget.varianceUnder");
  // favorable: true → success, false → danger, null → default (should not occur here).
  const variant = favorable === null ? "default" : favorable ? "success" : "danger";

  return (
    <Badge variant={variant}>
      <Icon size="1em" aria-hidden="true" />
      <span>
        {label} {t("budget.varianceSuffix")}
      </span>
    </Badge>
  );
}
