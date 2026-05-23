import { Badge } from "@/components/ui/badge";
import type { ContractStatus } from "@/lib/constants";

const statusVariants: Record<ContractStatus, "success" | "warning" | "danger"> = {
  signed: "success",
  pending: "warning",
  canceled: "danger",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariants[status as ContractStatus] || "default";
  return (
    <Badge variant={variant}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
