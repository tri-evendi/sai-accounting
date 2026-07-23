"use client";

/**
 * Tombol hapus dokumen + konfirmasi (issue #6).
 *
 * Menghapus kontrak atau faktur bukan sekadar menghapus satu baris: jurnal yang
 * terbentuk darinya (dan dari pembayarannya) ikut dibalik di dalam transaksi
 * yang sama. Itu benar, tetapi tidak bisa dibatalkan — jadi tindakannya selalu
 * lewat `ConfirmDialog` yang menyebut akibatnya dengan kalimat biasa, bukan
 * lewat satu klik.
 *
 * Penolakan dari server ditampilkan apa adanya: route DELETE kontrak sudah
 * menjelaskan dalam bahasa Indonesia mengapa sebuah kontrak yang sudah dipakai
 * faktur/surat jalan tidak boleh dihapus, dan penjelasan itu jauh lebih berguna
 * daripada kalimat generik. Wewenangnya tetap di server (izin `*.delete` via `requireApiPermission`);
 * menyembunyikan tombol ini hanyalah kerapian tampilan.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { humanizeFieldMessage } from "@/lib/form-guards";
import { Trash2 } from "lucide-react";

interface DeleteDocumentButtonProps {
  /** Endpoint DELETE, mis. `/api/contracts/12`. */
  endpoint: string;
  /** Teks tombol, mis. "Hapus Kontrak". */
  label: string;
  title: string;
  message: string;
  /** Ke mana pengguna dibawa setelah berhasil. */
  redirectTo: string;
  /**
   * Nomor dokumen yang harus diketik ulang sebelum tombol hapus hidup. Bukan
   * hiasan: penghapusan ini membalik jurnal dan tidak bisa dibatalkan, jadi
   * mengetik nomornya memaksa pengguna memastikan dokumen MANA yang dihapus —
   * salah klik dari daftar tidak lagi cukup untuk menghapus.
   */
  confirmPhrase: string;
}

export function DeleteDocumentButton({
  endpoint,
  label,
  title,
  message,
  redirectTo,
  confirmPhrase,
}: DeleteDocumentButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast(
          humanizeFieldMessage(null, data?.error ?? "Dokumen ini belum bisa dihapus."),
          "error"
        );
        return;
      }
      toast("Dokumen dihapus. Jurnalnya ikut dibalik.", "success");
      router.push(redirectTo);
      router.refresh();
    } catch {
      toast("Tidak dapat menghubungi server. Coba lagi.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      title={title}
      message={message}
      confirmLabel={label}
      confirmVariant="danger"
      confirmPhrase={confirmPhrase}
      confirmPhraseLabel="Ketik ulang nomor dokumennya untuk memastikan:"
      onConfirm={onConfirm}
      trigger={
        <Button variant="danger" className="cursor-pointer" disabled={busy}>
          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
          {label}
        </Button>
      }
    />
  );
}
