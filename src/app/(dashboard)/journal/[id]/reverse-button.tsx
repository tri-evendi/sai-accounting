"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function ReverseButton({ journalId }: { journalId: number }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onConfirm() {
    setError("");
    const res = await fetch(`/api/journals/${journalId}/reverse`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Gagal membalik jurnal");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <ConfirmDialog
        title="Balik Jurnal"
        message="Ini membuat jurnal pembalikan. Jurnal asli tidak dihapus, hanya ditandai sudah dibalik. Lanjutkan?"
        confirmLabel="Balik Jurnal"
        confirmVariant="danger"
        onConfirm={onConfirm}
        trigger={<Button variant="danger" size="sm">Balik Jurnal</Button>}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
