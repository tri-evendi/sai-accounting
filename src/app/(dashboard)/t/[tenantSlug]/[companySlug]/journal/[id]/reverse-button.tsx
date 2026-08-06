"use client";

/**
 * Tombol "Balik Jurnal" — dikonversi ke token Ant Design pada issue #196.
 * Hanya kulitnya: pesan galat kini `Alert` AntD, sehingga ikon dan warnanya
 * datang dari satu komponen dan bukan dari kelas warna tulis tangan.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, theme } from "antd";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function ReverseButton({ journalId }: { journalId: number }) {
  const router = useRouter();
  const t = useT();
  const { token } = theme.useToken();
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
      {error && (
        <div role="alert" style={{ marginTop: token.marginXS }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}
    </div>
  );
}
