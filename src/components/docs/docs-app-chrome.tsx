/**
 * KULIT APLIKASI dokumentasi — yang dilihat pembaca yang SEDANG BERSESI.
 *
 * Keputusan "kenapa `PlatformShell` dan bukan kerangka dasbor", beserta ketiga
 * keadaan yang harus dijawabnya, ditulis di kepala `src/lib/docs-chrome.tsx`.
 * Berkas ini hanya menggambar.
 *
 * ⚠ Ia satu-satunya berkas permukaan dokumentasi yang mengimpor chrome app
 * internal, dan `tests/docs.test.ts` menyebut namanya sebagai satu-satunya
 * pengecualian daftar-IZIN impornya. Bentuk itu disengaja: daftar izin yang
 * dilonggarkan untuk seluruh direktori akan membuka jalan bagi kode
 * ber-`auth()`/ber-Prisma masuk ke berkas-berkas yang justru dibaca TANPA sesi.
 *
 * Yang TIDAK dipasang di sini, dan sebabnya, supaya tidak ditambahkan
 * "untuk aman":
 *
 *  • **`SessionProvider`.** Terukur: tidak satu pun simpul di bawah ini
 *    memanggil `useSession` — `PlatformShell` dan `UserMenu` menerima nama &
 *    peran sebagai prop, dan `signOut()` milik `next-auth/react` bekerja dari
 *    modulnya sendiri tanpa konteks. Provider itu justru menambahkan
 *    pengambilan sesi berkala pada halaman yang isinya teks statis.
 *  • **`ToastProvider`.** Tidak ada yang melaporkan hasil simpan di sini;
 *    permukaan ini tidak menyimpan apa pun.
 *  • **`GuidedTour` / `CommandPalette`.** Keduanya milik kerangka dasbor dan
 *    keduanya menyusun isinya dari peran DI SEBUAH PT — yaitu justru yang tidak
 *    dimiliki keadaan 2.
 */

import { KOLOM_BACA } from "@/components/docs/docs-shell";
import { PlatformShell } from "@/components/tenant/platform-shell";
import { navDokumentasi, type PembacaDokumentasi } from "@/lib/docs-chrome";
import type { TranslateFn } from "@/lib/i18n/client";

export function DocsAppChrome({
  pembaca,
  t,
  children,
}: {
  pembaca: PembacaDokumentasi;
  t: TranslateFn;
  children: React.ReactNode;
}) {
  return (
    <PlatformShell
      tenantName={pembaca.tenantName}
      nav={navDokumentasi(pembaca, t)}
      userName={pembaca.userName}
      role={pembaca.tenantRole ?? ""}
    >
      {/*
       * Kolom baca 768px DI DALAM area kerja yang lebar penuh. MASTER.md
       * §Dokumentasi mengikat angka itu, dan ia mengikat justru di sini:
       * membiarkan prosa ikut melebar mengikuti `Layout.Content` akan merusak
       * persis yang sedang diperbaiki. Isian tepi TIDAK ditambahkan —
       * `Layout.Content` milik `PlatformShell` sudah mengisinya.
       *
       * `<main>` tidak ditulis di sini: `Layout.Content` AntD merendernya
       * sendiri, dan dua tengara "main" adalah markup tak sah.
       */}
      <div data-docs style={KOLOM_BACA}>
        {children}
      </div>
    </PlatformShell>
  );
}
