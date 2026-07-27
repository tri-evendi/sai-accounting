"use client";

/**
 * Grup rute `(setup)` — kerangka fokus untuk wizard penyiapan (issue #103).
 *
 * Grup rute TIDAK mengubah URL: halamannya tetap `/setup`, semua tautan lama
 * tetap benar. Yang berubah hanya kerangka yang membungkusnya.
 *
 * Provider-nya sengaja hanya dua — sesi (menu pengguna & keluar) dan toast
 * (wizard melaporkan hasil simpan lewat toast). Tidak ada `GuidedTour` di sini:
 * tur adalah lapisan penjelas untuk aplikasi yang sudah berjalan, dan
 * memunculkannya di atas layar wajib pertama justru menambah satu hal lagi yang
 * harus ditutup sebelum bisa bekerja.
 *
 * Halamannya sendiri TETAP dijaga `requirePagePermission("setup.manage")`, dan
 * `tests/authz-coverage.test.ts` ikut menelusuri grup ini persis seperti
 * `(dashboard)` — pindah grup tidak boleh berarti pindah keluar dari penjaga.
 */

import { SessionProvider } from "next-auth/react";

import { SetupShell } from "@/components/setup/setup-shell";
import { ToastProvider } from "@/components/ui/toast";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <SetupShell>{children}</SetupShell>
      </ToastProvider>
    </SessionProvider>
  );
}
