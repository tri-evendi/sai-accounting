"use client";

import { Badge } from "@/components/ui/badge";
import { type ContractStatus } from "@/lib/constants";
import { useDictionary } from "@/lib/i18n/client";
import { contractStatusLabels } from "@/lib/i18n/labels";

const statusVariants: Record<ContractStatus, "success" | "warning" | "danger"> = {
  signed: "success",
  pending: "warning",
  canceled: "danger",
};

/**
 * Badge status dokumen. Selalu BERTEKS (bukan warna saja) dan mengikuti bahasa
 * pengguna (bawaan: Indonesia, issue #1); nilai mentah dari database dipakai
 * sebagai cadangan bila statusnya di luar tiga yang dikenal.
 */
export function StatusBadge({ status }: { status: string }) {
  const dictionary = useDictionary();
  const variant = statusVariants[status as ContractStatus] || "default";
  const label =
    contractStatusLabels(dictionary)[status as ContractStatus] ||
    status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge variant={variant}>{label}</Badge>;
}
