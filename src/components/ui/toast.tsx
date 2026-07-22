"use client";

/**
 * Toast (dirombak di issue #51) — pembungkus tipis di atas `sonner`,
 * rekomendasi shadcn/ui saat ini.
 *
 * API publiknya SENGAJA dipertahankan persis — `useToast()` mengembalikan
 * `toast(message, type?)` dengan type success|error|info — supaya 21 file
 * pemanggil tidak berubah satu baris pun. Yang berubah hanyalah mesinnya:
 *
 *   • notifikasi kini DIUMUMKAN ke screen reader (`aria-live` bawaan sonner);
 *   • hover menahan timeout (pause-on-hover) — dulu 4 detik mati begitu saja;
 *   • ikon + teks tetap ada (`richColors`), tidak pernah warna-saja;
 *   • `prefers-reduced-motion` dihormati oleh sonner.
 *
 * `ToastProvider` tetap diekspor dan tetap dipasang di layout dashboard;
 * kini isinya hanya `<Toaster/>` milik sonner (tanpa context sendiri).
 */

import { Toaster, toast as sonnerToast } from "sonner";

type ToastType = "success" | "error" | "info";

function showToast(message: string, type: ToastType = "success") {
  if (type === "error") sonnerToast.error(message);
  else if (type === "info") sonnerToast.info(message);
  else sonnerToast.success(message);
}

/**
 * Identitas objeknya stabil (konstanta modul), jadi aman dipakai di dependency
 * array pemanggil — sama seperti nilai context yang dulu.
 */
const toastApi = { toast: showToast };

export function useToast() {
  return toastApi;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        duration={4000}
        toastOptions={{ className: "text-sm" }}
      />
    </>
  );
}
