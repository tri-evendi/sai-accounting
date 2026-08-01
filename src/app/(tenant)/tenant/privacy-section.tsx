"use client";

/**
 * Kartu "Data & Privasi" di Pengaturan Tenant (issue #142) — dua hak UU PDP:
 * ekspor seluruh data, dan permintaan penghapusan akun.
 *
 * Ekspor = tautan unduh biasa (`GET /api/tenant/export`) — server yang
 * menjaga izinnya dan mencatat auditnya. Permintaan penghapusan menyebut
 * KONSEKUENSINYA sebelum tombol ditekan (masa tenggang, anonimisasi, buku
 * yang TETAP tersimpan 10 tahun) dan menuntut konfirmasi eksplisit.
 */

import { useEffect, useState } from "react";
import { Download, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";

interface DeletionState {
  pending: { graceEndsAt: string; createdAt: string } | null;
  graceDays: number;
}

export function PrivacySection({ canDelete }: { canDelete: boolean }) {
  const t = useT();
  const [state, setState] = useState<DeletionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canDelete) return;
    let cancelled = false;
    fetch("/api/tenant/deletion-request")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DeletionState | null) => {
        if (!cancelled && data) setState(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canDelete]);

  async function submitRequest() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/tenant/deletion-request", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? t("tenantSettings.deletionFailed"));
        return;
      }
      setState((prev) => ({
        pending: { graceEndsAt: data.graceEndsAt, createdAt: new Date().toISOString() },
        graceDays: prev?.graceDays ?? data.graceDays,
      }));
      setMessage(t("tenantSettings.deletionRequested"));
    } catch {
      setError(t("tenantSettings.deletionFailed"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function cancelRequest() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/tenant/deletion-request", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("tenantSettings.deletionFailed"));
        return;
      }
      setState((prev) => (prev ? { ...prev, pending: null } : prev));
      setMessage(t("tenantSettings.deletionCancelled"));
    } catch {
      setError(t("tenantSettings.deletionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const graceDate = state?.pending
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(
        new Date(state.pending.graceEndsAt)
      )
    : null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        {t("tenantSettings.privacyHeading")}
      </h2>

      {/* Ekspor — tetap tersedia saat suspended; itulah gunanya secara hukum. */}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("tenantSettings.exportBody")}
        </p>
        <Button asChild variant="outline" className="w-full">
          <a href="/api/tenant/export" download>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("tenantSettings.exportButton")}
          </a>
        </Button>
      </div>

      {canDelete && (
        <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("tenantSettings.deletionBody", { days: state?.graceDays ?? 30 })}
          </p>

          {message && <p className="text-sm text-success-strong">{message}</p>}
          {error && <p className="text-sm text-destructive-strong">{error}</p>}

          {state?.pending ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-warning-strong">
                {t("tenantSettings.deletionPending", { date: graceDate ?? "" })}
              </p>
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={cancelRequest}
              >
                {t("tenantSettings.deletionCancelButton")}
              </Button>
            </div>
          ) : (
            <Button
              variant="destructive"
              className="w-full"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              {t("tenantSettings.deletionRequestButton")}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("tenantSettings.deletionConfirmTitle")}
        message={t("tenantSettings.deletionConfirmBody", { days: state?.graceDays ?? 30 })}
        confirmLabel={t("tenantSettings.deletionRequestButton")}
        onConfirm={submitRequest}
      />
    </section>
  );
}
