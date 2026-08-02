"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function ReverseButton({ journalId }: { journalId: number }) {
  const router = useRouter();
  const t = useT();
  const [error, setError] = useState("");

  async function onConfirm() {
    setError("");
    const res = await apiFetch(`/api/journals/${journalId}/reverse`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("journal.reverseFailed"));
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <ConfirmDialog
        title={t("journal.reverseTitle")}
        message={t("journal.reverseMessage")}
        confirmLabel={t("journal.reverseTitle")}
        confirmVariant="danger"
        onConfirm={onConfirm}
        trigger={<Button variant="danger" size="sm">{t("journal.reverseTitle")}</Button>}
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
