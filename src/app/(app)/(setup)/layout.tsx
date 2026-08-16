/**
 * Grup rute `(setup)` — kerangka FOKUS untuk wisaya penyiapan (issue #103).
 *
 * Grup rute TIDAK mengubah URL: halamannya tetap `/t/{tenant}/{company}/setup`,
 * semua tautan lama tetap benar. Yang berubah hanya kerangka yang membungkusnya.
 *
 * ══ SATU JALAN KE DEPAN, DAN KENAPA ITU DIPILIH LAGI (#341 → #352) ═════════
 * Rilis #341 memindahkan wisaya ke `PlatformShell` — kulit yang sama dengan
 * panel akun — dan alasannya benar sejauh yang diperiksanya: menu panel akun
 * TIDAK memantul. Butirnya (`/platform`, `/platform/team`, `/platform/billing`,
 * `/platform/privacy`, `/companies/new`) dijaga `requireTenantPagePermission`
 * (`lib/tenant-guard.ts`), yang tidak punya gerbang setup. Yang memantul adalah
 * menu DASBOR: halaman berlingkup perusahaan lewat `requirePagePermission`
 * (`lib/page-auth.ts`) → gerbang setup → kembali ke wisaya. Itu sebabnya
 * kerangka dasbor tidak pernah boleh dipakai di sini, dan itu tidak berubah.
 *
 * Yang berubah adalah penilaian atas PERTUKARANNYA. #341 menukar "satu jalan ke
 * depan" dengan keseragaman; #352 menukarnya kembali. Wisaya penyiapan dilewati
 * SEKALI seumur perusahaan, dan ia layar wajib pertama — menu samping di sana
 * menawarkan pekerjaan lain pada satu-satunya momen ketika pekerjaan lain belum
 * bisa dimulai. Alasan lengkapnya di kepala `components/setup/setup-shell.tsx`.
 *
 * ⚠ Yang TIDAK ikut dibalik: `/docs` dan `/companies/new` tetap `PlatformShell`.
 * Keduanya dibuka dari DALAM aplikasi oleh orang yang sudah bekerja, dan
 * melempar mereka keluar dari chrome-nya memang cacat (MASTER.md §"Satu
 * halaman, DUA kulit"). Wisaya ini tidak begitu — tidak ada chrome untuk
 * dilempar keluar darinya; ia mendahului chrome mana pun.
 *
 * ══ SERVER COMPONENT, meski kulitnya klien ════════════════════════════════
 * Versi lama berkas ini memikul `"use client"`. Tidak perlu: `SessionProvider`,
 * `ToastProvider`, dan `SetupShell` masing-masing sudah menjadi batas kliennya
 * sendiri, dan sebuah server component boleh merendernya selama `children`
 * hanya dioper. Menjadikan layout ini klien akan menyeret seluruh pohon
 * penyiapan ke sisi klien tanpa satu pun yang membutuhkannya — dan
 * `tests/rsc-boundary.test.ts` menghitung modul klien justru untuk mencegah itu
 * merayap.
 *
 * ══ PENJAGA ═══════════════════════════════════════════════════════════════
 * Layout ini TIDAK memanggil penjaga, dan itu bukan kelalaian: `SetupShell`
 * tidak butuh data tenant apa pun (identitas pemakainya datang dari sesi di
 * klien), jadi tidak ada yang perlu diambil di sini. Halamannya sendiri tetap
 * dijaga `requirePagePermission("setup.manage")`, dan
 * `tests/authz-coverage.test.ts` menelusuri grup ini persis seperti
 * `(dashboard)` — pindah kulit tidak pernah berarti pindah keluar dari penjaga.
 *
 * Provider-nya tetap dua — sesi (menu pengguna & keluar) dan toast (wisaya
 * melaporkan hasil simpan lewat toast). Tidak ada `GuidedTour`: tur adalah
 * lapisan penjelas untuk aplikasi yang sudah berjalan, dan memunculkannya di
 * atas layar wajib pertama justru menambah satu hal lagi yang harus ditutup
 * sebelum bisa bekerja.
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
