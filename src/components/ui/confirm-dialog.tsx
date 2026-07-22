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
 *     "besar" setelah isiannya dihitung.
 *
 * Sejak issue #51 dibangun di atas Radix `AlertDialog` (lihat
 * `alert-dialog.tsx`): focus trap sungguhan, body scroll-lock, Escape
 * menutup, fokus kembali ke pemicunya — semuanya dari Radix, bukan rakitan
 * tangan. Klik di luar sengaja TIDAK menutup (semantik alertdialog):
 * konfirmasi destruktif harus dijawab, bukan hilang karena salah klik.
 */

import { useCallback, useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { matchesConfirmPhrase } from "@/lib/form-guards";
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
  /**
   * Frasa yang HARUS diketik ulang sebelum tombol konfirmasi hidup — biasanya
   * nomor dokumennya. Dipakai untuk tindakan yang tak bisa dibatalkan sama
   * sekali (hapus kontrak/faktur beserta pembalikan jurnalnya): mengetik nomor
   * memaksa pengguna membaca dokumen mana yang sedang dihapus, sehingga salah
   * klik pada baris yang keliru tidak berakhir sebagai penghapusan.
   *
   * Perbandingannya diketatkan pada isi, bukan gaya penulisan: spasi di ujung
   * diabaikan dan huruf besar/kecil tidak dibedakan, karena tujuannya
   * memastikan pengguna sadar — bukan menguji ketelitian mengetik.
   */
  confirmPhrase?: string;
  /** Label di atas kotak ketik ulang; `confirmPhrase` disisipkan sebagai penebalan. */
  confirmPhraseLabel?: string;
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
  confirmPhrase,
  confirmPhraseLabel = "Ketik ulang untuk memastikan:",
}: ConfirmDialogProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const phraseRef = useRef<HTMLInputElement>(null);
  const phraseId = useId();
  const messageId = useId();

  /** Tanpa `confirmPhrase`, tidak ada gesekan tambahan — perilaku lama. */
  const phraseSatisfied = matchesConfirmPhrase(typed, confirmPhrase);

  const setOpen = useCallback(
    (next: boolean) => {
      // Kotak ketik ulang selalu mulai kosong setiap kali dialog dibuka.
      if (next) setTyped("");
      if (!isControlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  async function handleConfirm() {
    // Penjaga kedua: tombolnya memang sudah mati, tetapi Enter pada kotak ketik
    // tidak boleh menembus lewat jalur lain.
    if (!phraseSatisfied) return;
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

      <AlertDialog open={isOpen} onOpenChange={setOpen}>
        <AlertDialogContent
          // Dengan frasa, fokus jatuh ke kotak ketik — tombol konfirmasinya
          // masih mati, jadi memfokuskannya hanya akan menyesatkan.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (confirmPhrase) phraseRef.current?.focus();
            else confirmRef.current?.focus();
          }}
          onEscapeKeyDown={loading ? (event) => event.preventDefault() : undefined}
        >
          <div className="flex items-start gap-3">
            <span
              className={
                confirmVariant === "danger"
                  ? "mt-0.5 shrink-0 text-destructive"
                  : "mt-0.5 shrink-0 text-primary"
              }
            >
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            {/* `messageId` di pembungkus, BUKAN mengganti id milik Radix
                Description — id itu dipakai aria-describedby dialognya. */}
            <div className="min-w-0" id={messageId}>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-2">
                {message}
              </AlertDialogDescription>
            </div>
          </div>

          {confirmPhrase && (
            <div className="mt-4">
              <label htmlFor={phraseId} className="block text-sm text-gray-600">
                {confirmPhraseLabel}{" "}
                <span className="font-semibold text-gray-900">{confirmPhrase}</span>
              </label>
              <input
                id={phraseId}
                ref={phraseRef}
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && phraseSatisfied && !loading) {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                autoComplete="off"
                aria-describedby={messageId}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          )}

          <AlertDialogFooter>
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
              disabled={loading || !phraseSatisfied}
            >
              {loading ? "Memproses…" : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
