"use client";

/**
 * ConfirmDialog — jeda satu ketukan sebelum tindakan yang sulit dibatalkan
 * (issue #6): menghapus dokumen, membalik jurnal, mengeluarkan stok dalam
 * jumlah besar.
 *
 * Dua cara pakai:
 *   • **dengan `trigger`** — pola lama: komponen ini yang membuka dialognya;
 *   • **terkendali** (`open` + `onOpenChange`) — untuk konfirmasi yang muncul di
 *     TENGAH alur lain, mis. tombol Simpan sebuah formulir yang baru ketahuan
 *     "besar" setelah isiannya dihitung. Tanpa mode ini, konfirmasi semacam itu
 *     hanya bisa memakai `window.confirm`, yang tidak bisa ditata, tidak
 *     berbahasa Indonesia, dan tidak bisa menjelaskan akibatnya.
 *
 * Aksesibilitas: `role="dialog"` + `aria-modal`, judul dilabeli lewat
 * `aria-labelledby`, Escape menutup, dan fokus dipindahkan ke tombol konfirmasi
 * saat dibuka lalu dikembalikan ke pemicunya saat ditutup.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
  /** Elemen pembuka. Boleh kosong pada mode terkendali. */
  trigger?: React.ReactNode;
  /** Mode terkendali — wajib berpasangan dengan `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Lanjutkan",
  cancelLabel = "Batal",
  confirmVariant = "danger",
  onConfirm,
  trigger,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;
  const [loading, setLoading] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus?.();
    };
  }, [isOpen, setOpen]);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      {trigger && (
        <span className="contents" onClick={() => setOpen(true)}>
          {trigger}
        </span>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />

          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            className="relative z-10 mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span
                className={
                  confirmVariant === "danger"
                    ? "mt-0.5 shrink-0 text-red-600"
                    : "mt-0.5 shrink-0 text-blue-700"
                }
              >
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 id={titleId} className="text-lg font-semibold text-gray-900">
                  {title}
                </h3>
                <p id={messageId} className="mt-2 text-sm leading-relaxed text-gray-600">
                  {message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                {cancelLabel}
              </Button>
              <Button
                ref={confirmRef}
                variant={confirmVariant}
                size="sm"
                className="cursor-pointer"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? "Memproses…" : confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
