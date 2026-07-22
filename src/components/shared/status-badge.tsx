import { Badge } from "@/components/ui/badge";
import { CONTRACT_STATUS_LABELS, type ContractStatus } from "@/lib/constants";

const statusVariants: Record<ContractStatus, "success" | "warning" | "danger"> = {
  signed: "success",
  pending: "warning",
  canceled: "danger",
};

/**
 * Badge status dokumen. Selalu BERTEKS (bukan warna saja) dan berbahasa
 * Indonesia (issue #1); nilai mentah dari database dipakai sebagai cadangan
 * bila statusnya di luar tiga yang dikenal.
 */
export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariants[status as ContractStatus] || "default";
  const label =
    CONTRACT_STATUS_LABELS[status as ContractStatus] ||
    status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge variant={variant}>{label}</Badge>;
}
