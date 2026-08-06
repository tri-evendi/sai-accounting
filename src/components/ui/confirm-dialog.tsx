"use client";

/**
 * ConfirmDialog — jeda satu ketukan sebelum tindakan yang sulit dibatalkan
 * (issue #6): menghapus dokumen, membalik jurnal, mengeluarkan stok dalam
 * jumlah besar.
 *
 * Dua cara pakai, dan KEDUANYA tetap berlaku setelah pindah ke Ant Design
 * (issue #190) — 21 pemanggilnya tidak berubah satu baris pun di fase B:
 *   • **dengan `trigger`** — komponen ini yang membuka dialognya;
 *   • **terkendali** (`open` + `onOpenChange`) — untuk konfirmasi yang muncul di
 *     TENGAH alur lain, mis. tombol Simpan sebuah formulir yang baru ketahuan
 *     "besar" setelah isiannya dihitung.
 *
 * Dibangun di atas `AlertDialog` (lihat berkas itu), yang sejak issue #190
 * adalah AntD `Modal` dengan tiga sifat dikunci: klik-luar tidak menutup,
 * `role="alertdialog"`, dan tanpa tombol X. Yang datang dari AntD dan tidak
 * dirakit di sini: fokus terkurung, badan halaman terkunci, Escape menutup, dan
 * fokus kembali ke elemen pemicunya setelah tertutup.
 *
 * Satu-satunya perilaku fokus yang tetap harus ditulis di sini adalah ke MANA
 * fokus jatuh saat dialog terbuka — dan itu bergantung pada isinya, bukan pada
 * pustakanya.
 */

import { useCallback, useId, useRef, useState } from "react";
import { WarningOutlined } from "@ant-design/icons";
import type { InputRef } from "antd";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { matchesConfirmPhrase } from "@/lib/form-guards";
import { useT } from "@/lib/i18n/client";

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
  confirmLabel,
  cancelLabel,
  confirmVariant = "danger",
  onConfirm,
  trigger,
  open,
  onOpenChange,
  confirmPhrase,
  confirmPhraseLabel,
}: ConfirmDialogProps) {
  // Label bawaan diambil dari kamus, bukan literal: dialog ini dipakai puluhan
  // permukaan yang tidak menyetel labelnya sendiri, jadi di sinilah bahasa
  // "Lanjutkan / Batal" ikut berganti untuk semuanya sekaligus.
  const t = useT();
  const confirmText = confirmLabel ?? t("common.continue");
  const cancelText = cancelLabel ?? t("common.cancel");
  const phraseLabel = confirmPhraseLabel ?? t("confirm.retypeLabel");
  const [uncontrolled, setUncontrolled] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const phraseRef = useRef<InputRef>(null);
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

  /**
   * Dengan frasa, fokus jatuh ke kotak ketik — tombol konfirmasinya masih mati,
   * jadi memfokuskannya hanya akan menyesatkan. Tanpa frasa, fokus jatuh ke
   * tombol konfirmasi supaya Enter menyelesaikan kalimat yang baru dibaca.
   *
   * Dijalankan setelah panel dialog terpasang; rc-dialog sendiri hanya
   * memfokuskan panelnya bila belum ada apa pun di dalamnya yang fokus, jadi
   * kedua jalur tidak saling merebut.
   */
  const focusFirstControl = useCallback(() => {
    if (confirmPhrase) phraseRef.current?.focus();
    else confirmRef.current?.focus();
  }, [confirmPhrase]);

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
          onOpenAutoFocus={focusFirstControl}
          /*
           * Escape dimatikan HANYA selama prosesnya berjalan. Menutup dialog di
           * tengah penghapusan tidak membatalkan apa pun di server — ia hanya
           * menyembunyikan bahwa penghapusan itu sedang terjadi.
           */
          keyboard={!loading}
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 shrink-0"
              style={{
                color:
                  confirmVariant === "danger"
                    ? "var(--ant-color-error)"
                    : "var(--ant-color-primary)",
              }}
            >
              <WarningOutlined aria-hidden="true" style={{ fontSize: 20 }} />
            </span>
            {/* `messageId` di pembungkus, BUKAN mengganti id milik
                `AlertDialogDescription` — id itu dipakai `aria-describedby`
                dialognya. */}
            <div className="min-w-0" id={messageId}>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription style={{ marginTop: 8 }}>
                {message}
              </AlertDialogDescription>
            </div>
          </div>

          {confirmPhrase && (
            <div className="mt-4">
              <label
                htmlFor={phraseId}
                className="block"
                style={{
                  fontSize: "var(--ant-font-size)",
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {phraseLabel}{" "}
                <span
                  style={{
                    fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
                    color: "var(--ant-color-text)",
                  }}
                >
                  {confirmPhrase}
                </span>
              </label>
              <TextInput
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
                /*
                 * `status="error"` bawaan `TextInput` mewarnai kotaknya merah.
                 * Di sini kotaknya BUKAN salah — ia hanya belum diisi — jadi
                 * ia dibiarkan netral sampai pengguna benar-benar mengetik
                 * sesuatu yang tidak cocok.
                 */
                invalid={typed.length > 0 && !phraseSatisfied}
                style={{ marginTop: 4 }}
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
              {cancelText}
            </Button>
            <Button
              ref={confirmRef}
              variant={confirmVariant}
              size="sm"
              className="cursor-pointer"
              onClick={handleConfirm}
              disabled={loading || !phraseSatisfied}
            >
              {loading ? t("common.processing") : confirmText}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
