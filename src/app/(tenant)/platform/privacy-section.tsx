"use client";

/**
 * Kartu "Data & Privasi" di Pengaturan Tenant (issue #142) — dua hak UU PDP:
 * ekspor seluruh data, dan permintaan penghapusan akun.
 *
 * Ekspor = tautan unduh biasa (`GET /api/tenant/export`) — server yang
 * menjaga izinnya dan mencatat auditnya. Permintaan penghapusan menyebut
 * KONSEKUENSINYA sebelum tombol ditekan (masa tenggang, anonimisasi, buku
 * yang TETAP tersimpan 10 tahun) dan menuntut konfirmasi eksplisit.
 *
 * ══ DUA TINDAKAN YANG TIDAK SEDERAJAT ══════════════════════════════════════
 * Keduanya dulu tampil sebagai dua kotak bertombol lebar penuh yang berurutan,
 * dan satu-satunya yang membedakan "unduh data saya" dari "hapus akun saya"
 * adalah warna tepi kotaknya. Yang kedua kini turun ke kaki kartu di atas
 * permukaan `destructive-soft` yang terpisah garis — bidang tersendiri yang
 * terbaca sebagai bidang tersendiri, bukan pilihan ketiga dalam satu daftar.
 * (Konfirmasinya tetap: `ConfirmDialog`, MASTER.md §Form — tombol destruktif
 * menuntut konfirmasi eksplisit.)
 *
 * Tombolnya `sm:w-auto`: tombol selebar kartu di layar 1024px adalah target
 * sentuh sepanjang 900px untuk satu tindakan yang tak bisa dibatalkan.
 */

import { useEffect, useState } from "react";
import { Download, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";
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

  /* Gaya "long" lewat helper bersama, bukan `Intl` yang dirakit di tempat:
   * tanggal ini menyebut hari akun sebuah badan usaha benar-benar ditutup, dan
   * satu-satunya tanggal di halaman yang gayanya ditentukan sendiri. */
  const graceDate = state?.pending ? formatDate(state.pending.graceEndsAt) : null;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-foreground">
          {t("tenantSettings.privacyHeading")}
        </h2>
      </CardHeader>

      {/* Ekspor — tetap tersedia saat suspended; itulah gunanya secara hukum. */}
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-muted-foreground sm:flex-1">
            {t("tenantSettings.exportBody")}
          </p>
          <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
            <a href="/api/tenant/export" download>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("tenantSettings.exportButton")}
            </a>
          </Button>
        </div>
      </CardContent>

      {canDelete && (
        <CardFooter className="flex-col items-stretch gap-3 bg-destructive-soft">
          <p className="text-sm leading-relaxed text-destructive-strong">
            {t("tenantSettings.deletionBody", { days: state?.graceDays ?? 30 })}
          </p>

          {/* ⚠ HASILNYA DIUMUMKAN, bukan sekadar dicetak.
           *
           * Kedua kalimat ini adalah SATU-SATUNYA umpan balik dari dua
           * permintaan jaringan yang tidak memindahkan halaman ke mana pun —
           * dan salah satunya menutup akses seluruh badan usaha. Sebagai `<p>`
           * telanjang, pembaca layar tidak mengumumkan apa pun ketika kalimat
           * itu muncul: yang menekan "Ajukan penghapusan" mendengar sunyi, lalu
           * menekan lagi. (Tetangganya, `billing-actions.tsx`, memakai toast
           * yang memang sudah punya live region; di sini kalimatnya harus
           * tinggal di tempat sebab ia menerangkan bidang di sekitarnya.)
           *
           * `alert` untuk galat (menyela — ada yang gagal dan perlu diketahui
           * sekarang), `status` untuk keberhasilan (sopan, tidak memotong). */}
          {message && (
            <p role="status" className="text-sm text-success-strong">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}

          {state?.pending ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-warning-strong">
                {t("tenantSettings.deletionPending", { date: graceDate ?? "" })}
              </p>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={cancelRequest}
              >
                {t("tenantSettings.deletionCancelButton")}
              </Button>
            </div>
          ) : (
            <Button
              variant="destructive"
              className="w-full sm:w-auto sm:self-start"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              {t("tenantSettings.deletionRequestButton")}
            </Button>
          )}
        </CardFooter>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("tenantSettings.deletionConfirmTitle")}
        message={t("tenantSettings.deletionConfirmBody", { days: state?.graceDays ?? 30 })}
        confirmLabel={t("tenantSettings.deletionRequestButton")}
        onConfirm={submitRequest}
      />
    </Card>
  );
}
