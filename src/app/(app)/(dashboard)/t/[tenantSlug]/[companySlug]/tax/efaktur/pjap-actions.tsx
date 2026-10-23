"use client";

/**
 * Tombol KIRIM / BATALKAN e-Faktur lewat PJAP (docs/EFAKTUR.md) — pulau client
 * kecil di halaman server `/tax/efaktur`.
 *
 * Semua `secondary`: aksi utama layar ini tetap "Unduh XML Coretax" (#267), dan
 * aksi baris yang berulang tidak pernah berisi penuh. Membatalkan faktur pajak
 * adalah tindakan hukum, jadi ia lewat `ConfirmDialog`.
 *
 * Tombol tidak menunggu DJP: ia hanya MENGANTREKAN. Statusnya berubah sendiri
 * begitu `svc-integrator` mendapat jawaban — halaman dimuat ulang untuk
 * melihatnya.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { useToast } from "@sai/ui/toast";
import { SendOutlined } from "@ant-design/icons";
import { useT } from "@sai/core/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

const ICON_SIZE = 16;

interface QueueResponse {
  queued: { invoiceNo: string }[];
  skipped: { invoiceNo: string | null; reason: string }[];
  error?: string;
}

function useQueue(basePath: string) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function send(invoiceIds: number[]) {
    setBusy(true);
    try {
      const res = await apiFetch(`${basePath}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds }),
      });
      const data = (await res.json().catch(() => ({}))) as QueueResponse;
      if (!res.ok) {
        toast(data.error || t("tax.pjap.sendFailed"), "error");
        return;
      }
      if (data.queued.length > 0) {
        toast(t("tax.pjap.queued", { count: data.queued.length }), "success");
      }
      if (data.skipped.length > 0) {
        toast(t("tax.pjap.skipped", { count: data.skipped.length }), "info");
      }
      router.refresh();
    } catch {
      toast(t("tax.networkFailed"), "error");
    } finally {
      setBusy(false);
    }
  }
  return { busy, send };
}

/** Kirim SEMUA faktur siap yang belum pernah/perlu dikirim ulang. */
export function PjapSendAll({ basePath, invoiceIds }: { basePath: string; invoiceIds: number[] }) {
  const t = useT();
  const { busy, send } = useQueue(basePath);
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={busy || invoiceIds.length === 0}
      onClick={() => send(invoiceIds)}
    >
      <SendOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 6 }} />
      {busy ? t("tax.pjap.sending") : t("tax.pjap.sendAll", { count: invoiceIds.length })}
    </Button>
  );
}

/** Aksi satu baris: kirim (lagi) atau batalkan, menurut status terakhirnya. */
export function PjapRowAction({
  basePath,
  invoiceId,
  submissionId,
  mode,
}: {
  basePath: string;
  invoiceId: number;
  submissionId: number | null;
  mode: "send" | "resend" | "cancel" | "none";
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const { busy, send } = useQueue(basePath);

  if (mode === "none") return null;
  if (mode === "cancel" && submissionId != null) {
    return (
      <ConfirmDialog
        title={t("tax.pjap.cancelTitle")}
        message={t("tax.pjap.cancelDescription")}
        confirmLabel={t("tax.pjap.cancelConfirm")}
        confirmVariant="danger"
        trigger={
          <Button type="button" variant="secondary">
            {t("tax.pjap.cancel")}
          </Button>
        }
        onConfirm={async () => {
          const res = await apiFetch(`${basePath}/submissions/${submissionId}/cancel`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast(data.error || t("tax.pjap.sendFailed"), "error");
            return;
          }
          toast(t("tax.pjap.cancelRequested"), "success");
          router.refresh();
        }}
      />
    );
  }
  return (
    <Button type="button" variant="secondary" disabled={busy} onClick={() => send([invoiceId])}>
      {mode === "resend" ? t("tax.pjap.resend") : t("tax.pjap.send")}
    </Button>
  );
}
