"use client";

/**
 * Draf wizard di peramban (issue #5) — satu-satunya tempat draf disimpan.
 *
 * `sessionStorage`, BUKAN `localStorage`, dan bukan pula sebuah tabel draft di
 * database. Tiga alasannya, berurutan dari yang paling penting:
 *
 *  1. **Membatalkan tidak boleh menyisakan apa pun.** Draf yang hidup di
 *     database berarti menutup tab di langkah 3 meninggalkan baris yatim yang
 *     harus dibersihkan seseorang. Draf di peramban tidak punya masalah itu:
 *     tidak ada yang perlu dibersihkan karena tidak ada yang pernah ditulis.
 *  2. **Refresh tidak boleh menghapus pekerjaan.** `sessionStorage` bertahan
 *     melewati muat ulang halaman, jadi salah tekan F5 di langkah 4 tidak
 *     memulangkan pengguna ke langkah 1.
 *  3. **Draf basi tidak boleh bangkit.** `sessionStorage` mati bersama tabnya,
 *     dan `parseDraft` tetap membuang draf yang lewat 12 jam atau berbeda versi
 *     — selalu dengan pemberitahuan, tidak pernah diam-diam.
 *
 * Penulisan pertama sengaja ditunda sampai draf tersimpan selesai dibaca
 * (`ready`), supaya render pertama tidak menimpa draf yang baru mau dipulihkan.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  draftRejectionMessage,
  draftStorageKey,
  parseDraft,
  serializeDraft,
  type WizardKind,
} from "@/lib/wizard";

export interface WizardDraftState<T> {
  draft: T;
  setDraft: (updater: T | ((prev: T) => T)) => void;
  /** Buang draf tersimpan (dipakai tombol Batal dan setelah berhasil simpan). */
  clear: () => void;
  /** Sudah selesai membaca draf tersimpan? Sebelum ini, jangan menulis apa pun. */
  ready: boolean;
  /** Kalimat penjelasan bila draf tersimpan dibuang. */
  notice: string | null;
  dismissNotice: () => void;
}

export function useWizardDraft<T>(kind: WizardKind, initial: () => T): WizardDraftState<T> {
  const [draft, setDraftState] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const key = draftStorageKey(kind);
  // Setelah Batal / berhasil simpan, jangan tulis ulang draf yang baru dibuang.
  const stopped = useRef(false);

  // Pulihkan sekali saat mount. Harus di dalam effect: `sessionStorage` tidak
  // ada di server, dan membacanya saat render akan membuat HTML server dan
  // klien berbeda.
  //
  // Pembacaannya ditunda ke frame berikutnya — pola yang sama dengan
  // `GuidedTour` (#21) — supaya render pertama identik dengan hasil server
  // (draf kosong) sebelum penyimpanan peramban dibaca, dan supaya setState tidak
  // dipanggil langsung di badan efek.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let raw: string | null = null;
      try {
        raw = window.sessionStorage.getItem(key);
      } catch {
        raw = null;
      }
      const result = parseDraft<T>(kind, raw);
      if (result.draft) {
        setDraftState(result.draft);
      } else if (result.reason && result.reason !== "empty") {
        setNotice(draftRejectionMessage(result.reason));
        try {
          window.sessionStorage.removeItem(key);
        } catch {
          // Peramban yang menolak penyimpanan tetap boleh memakai wizard.
        }
      }
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [kind, key]);

  // Simpan setiap perubahan, tetapi hanya setelah pemulihan selesai.
  useEffect(() => {
    if (!ready || stopped.current) return;
    try {
      window.sessionStorage.setItem(key, serializeDraft(kind, draft));
    } catch {
      // Kuota penuh / mode privat: draf tetap hidup di memori komponen.
    }
  }, [draft, ready, kind, key]);

  const setDraft = useCallback((updater: T | ((prev: T) => T)) => {
    setDraftState((prev) =>
      typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater
    );
  }, []);

  const clear = useCallback(() => {
    stopped.current = true;
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // sama seperti di atas — tidak ada yang perlu dibersihkan di server.
    }
  }, [key]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { draft, setDraft, clear, ready, notice, dismissNotice };
}
