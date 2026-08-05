"use client";

/**
 * AlertDialog — dialog KONFIRMASI di atas Ant Design `Modal` (issue #190,
 * fase B4). Sebelumnya Radix UI, pola shadcn.
 *
 * Ia bukan komponen tersendiri melainkan `Dialog` (`components/ui/dialog.tsx`)
 * dengan tiga sifat dikunci. Menyatukannya disengaja: keduanya butuh pelabelan
 * `aria-*` yang dirakit tangan (alasannya panjang, ditulis di kepala
 * `dialog.tsx`), dan dua salinan mekanisme itu akan menyimpang pada perbaikan
 * pertama yang hanya menyentuh salah satunya.
 *
 * Ketiga sifat yang membedakannya:
 *
 *  1. **Klik di luar TIDAK menutup** (`mask.closable: false`). Ini alasan
 *     komponen ini ada: konfirmasi destruktif — menghapus faktur, membalik
 *     jurnal — harus DIJAWAB, bukan hilang karena salah klik di sebelahnya.
 *     Escape tetap menutup; itu isyarat "batal" yang disengaja, bukan
 *     kecelakaan tangan.
 *  2. **`role="alertdialog"`**, bukan `dialog`. Bedanya nyata bagi pembaca
 *     layar: `alertdialog` membuat isinya diumumkan saat dialognya muncul,
 *     sehingga pertanyaan "yakin menghapus?" terdengar tanpa pengguna harus
 *     menjelajahi panelnya lebih dulu. rc-dialog menulis `role="dialog"` mati
 *     di markupnya, jadi peran ini dipasang lewat jalur yang sama dengan
 *     pelabelan — lihat `dialog.tsx`.
 *  3. **Padding badan bawaan AntD dipakai** (24px). Dialog umum sengaja tanpa
 *     padding karena pemanggilnya menggambar kepala/badan/kaki sendiri;
 *     konfirmasi adalah satu blok teks pendek dan tidak menggambar apa pun.
 *
 * Yang tetap datang gratis dari AntD dan TIDAK boleh dirakit ulang: fokus
 * terkurung selama terbuka, badan halaman terkunci dari gulir, Escape menutup
 * yang paling atas saja, dan fokus kembali ke pemicunya setelah ditutup.
 */

import * as React from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  type DialogContentProps,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const AlertDialog = Dialog;
const AlertDialogTrigger = DialogTrigger;
const AlertDialogCancel = DialogClose;
const AlertDialogAction = DialogClose;

/**
 * Dulu dua komponen Radix yang harus dirakit sendiri (portal + tirai). AntD
 * menggambar keduanya di dalam `Modal`, jadi ekspornya tinggal meneruskan
 * anaknya — dipertahankan supaya tak ada impor yang patah selama fase B.
 */
function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function AlertDialogOverlay() {
  return null;
}

type AlertDialogContentProps = Omit<
  DialogContentProps,
  "role" | "padded" | "maskClosable" | "showClose"
>;

function AlertDialogContent({ className, ...props }: AlertDialogContentProps) {
  return (
    <DialogContent
      role="alertdialog"
      maskClosable={false}
      padded
      /*
       * Tanpa tombol X: satu-satunya jalan keluar adalah dua tombol di
       * kakinya (atau Escape). Menambah X ketiga hanya membuat "batal" punya
       * tiga rupa berbeda di dialog yang justru menuntut jawaban jelas.
       */
      showClose={false}
      className={cn("max-w-md", className)}
      {...props}
    />
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-6 flex justify-end gap-3", className)} {...props} />;
}

/**
 * Gaya judul & deskripsi diambil dari VARIABEL CSS milik AntD, bukan dari kelas
 * Tailwind dan bukan dari hex.
 *
 * Ini bentuk yang sama dengan `moneyTokens` di `lib/theme/antd-tokens.ts`, satu
 * lapisan lebih rendah: `ConfigProvider` sudah menuliskan setiap token sebagai
 * `--ant-*` pada akar komponennya (AntD v6 memakai variabel CSS secara bawaan),
 * jadi merujuknya berarti judul dan deskripsi ikut berganti bersama tema tanpa
 * satu pun nilai disalin ke berkas ini. `colorTextSecondary` — bukan tersier —
 * karena tersier sudah dinaikkan ke nilai yang sama di issue #207; memakai
 * namanya yang benar membuat kalimat ini tetap benar kalau kelak dipisah lagi.
 */
const TITLE_STYLE: React.CSSProperties = {
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
  margin: 0,
};

const DESCRIPTION_STYLE: React.CSSProperties = {
  fontSize: "var(--ant-font-size)",
  lineHeight: "var(--ant-line-height)",
  color: "var(--ant-color-text-secondary)",
  margin: 0,
};

function AlertDialogTitle({ className, style, ...props }: React.ComponentProps<"h2">) {
  return (
    <DialogTitle className={className} style={{ ...TITLE_STYLE, ...style }} {...props} />
  );
}

function AlertDialogDescription({ className, style, ...props }: React.ComponentProps<"p">) {
  return (
    <DialogDescription
      className={className}
      style={{ ...DESCRIPTION_STYLE, ...style }}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
export type { AlertDialogContentProps };
