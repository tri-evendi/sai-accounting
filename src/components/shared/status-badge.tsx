"use client";

import { Badge } from "@sai/ui/badge";
import { type ContractStatus } from "@sai/core/constants";
import { useDictionary } from "@sai/core/i18n/client";
import { contractStatusLabels } from "@/lib/i18n/labels";

/*
 * `completed` NETRAL, bukan hijau: "selesai" bukan "lunas" (di buku `pt-sai`
 * hanya 4 dari 101 kontrak selesai yang terbayar penuh), dan hijau di aplikasi
 * ini berarti uang masuk / sehat. Labelnya yang membawa arti, bukan warnanya.
 */
const statusVariants: Record<ContractStatus, "success" | "warning" | "danger" | "default"> = {
  signed: "success",
  pending: "warning",
  canceled: "danger",
  completed: "default",
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
