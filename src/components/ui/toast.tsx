"use client";

/**
 * Toast — pemberitahuan sekilas di atas `message` Ant Design (issue #190,
 * fase B4). Sebelumnya `sonner`; sebelum itu rakitan sendiri (issue #51).
 *
 * API publiknya SENGAJA tidak berubah — `useToast()` mengembalikan
 * `{ toast(message, type?) }` dengan type `success | error | info` — supaya 32
 * berkas pemanggilnya tidak berubah satu baris pun. Yang berubah hanya
 * mesinnya.
 *
 * ── Kenapa `App.useApp()`, bukan `import { message } from "antd"` ───────────
 * Keduanya bekerja, dan hanya satu yang bertema. `message` statis membuat akar
 * React-nya SENDIRI di luar pohon aplikasi, sehingga ia tidak melihat
 * `ConfigProvider` — pesannya memakai token bawaan AntD, yaitu kotak putih
 * berteks gelap, juga saat pengguna sedang memakai tema gelap. Jalur konteks
 * (`App.useApp()`) mengambil instansi yang dibuat `<App>` DI DALAM
 * `ConfigProvider` (lihat `components/providers/antd-provider.tsx`), jadi ia
 * ikut berganti tema pada saat yang sama dengan sisa layar.
 *
 * ── Yang berubah dan pantas diketahui ──────────────────────────────────────
 *  • **Posisinya pindah** dari kanan-bawah (sonner) ke tengah-atas (bawaan
 *    AntD). Ini konsekuensi keputusan "pakai bawaan AntD" di epik #206.
 *  • **Tidak ada lagi tombol tutup.** `message` AntD tidak punya; yang
 *    menggantikannya adalah jeda-saat-disorot (`pauseOnHover`, didaftarkan di
 *    `AntdProvider`) — pesan tidak akan hilang selama kursor menahannya.
 *  • **Durasi tetap 4 detik**, bukan 3 detik bawaan AntD. Angkanya didaftarkan
 *    sekali di `AntdProvider`, bukan diulang di setiap pemanggilan.
 *
 * ── Yang HARUS ditambahkan sendiri: pengumuman pembaca layar ───────────────
 * Ini bukan detail kecil. `sonner` menaruh pesannya di dalam kawasan
 * `aria-live`; `message` AntD **tidak punya satu pun** `role="alert"`,
 * `role="status"`, atau `aria-live` — diperiksa di seluruh
 * `antd/es/message`, `antd/es/notification`, dan `@rc-component/notification`
 * pada versi yang benar-benar terpasang. Tanpa penambahan di bawah, satu-
 * satunya umpan balik setelah menyimpan faktur menjadi tak terdengar oleh
 * pengguna pembaca layar: layar bilang "tersimpan", perangkatnya diam.
 *
 * Karena itu isi pesannya dibungkus elemen ber-`role`, dan perannya dipilih
 * per jenis: `alert` (asertif — memotong bacaan yang sedang berjalan) hanya
 * untuk kegagalan, `status` (sopan — menunggu jeda) untuk keberhasilan dan
 * info. Menjadikan semuanya `alert` berarti setiap "Tersimpan" memotong
 * kalimat yang sedang dibaca pengguna.
 */

import { App } from "antd";
import { useMemo } from "react";

type ToastType = "success" | "error" | "info";

/**
 * Kegagalan memotong (asertif), keberhasilan menunggu giliran (sopan).
 * `role` dipakai, bukan `aria-live`, karena elemennya BARU disisipkan ke DOM
 * saat pesan muncul — dan elemen baru ber-`role="alert"`/`"status"` memang
 * bentuk yang dikenali pembaca layar untuk kasus ini.
 */
const LIVE_ROLE: Record<ToastType, "alert" | "status"> = {
  error: "alert",
  success: "status",
  info: "status",
};

export interface ToastApi {
  toast: (message: string, type?: ToastType) => void;
}

export function useToast(): ToastApi {
  const { message } = App.useApp();

  /*
   * Identitasnya distabilkan terhadap instansi `message` — sama seperti dulu
   * ia konstanta modul. Pemanggil yang menaruh `toast` di dependency array
   * sebuah `useEffect` karena itu tidak akan terus-menerus menjalankannya
   * ulang; instansi `message` sendiri sudah di-memo oleh `<App>`.
   */
  return useMemo(
    () => ({
      toast: (content: string, type: ToastType = "success") => {
        const announced = <span role={LIVE_ROLE[type]}>{content}</span>;
        if (type === "error") message.error(announced);
        else if (type === "info") message.info(announced);
        else message.success(announced);
      },
    }),
    [message]
  );
}

/**
 * Tetap diekspor dan tetap dipasang di dua layout (`(dashboard)`, `(setup)`),
 * tetapi kini hanya meneruskan anaknya: instansi toast lahir di `<App>` yang
 * membungkus SELURUH aplikasi di `AntdProvider`, bukan di sini.
 *
 * Perpindahan itu memperbaiki satu lubang yang sudah lama ada: `(tenant)`,
 * `(operator)`, dan `(auth)` tidak pernah memasang `ToastProvider`, sehingga
 * `toast()` di halaman tagihan `/platform` tidak memunculkan apa pun — tidak
 * gagal, tidak berbunyi, hanya tidak terjadi.
 *
 * Komponennya sendiri baru boleh dihapus bersama kedua pemanggilnya di fase C;
 * menghapusnya sekarang berarti menyentuh berkas di luar lapisan primitif.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
