"use client";

/**
 * Jembatan tema & bahasa untuk Ant Design (issue #184 — fondasi migrasi AntD).
 *
 * AntD punya dua keadaan global yang HARUS mengikuti keadaan yang sudah ada di
 * aplikasi ini, bukan berdiri sendiri:
 *
 *   • terang/gelap — kalau AntD punya sumbernya sendiri, akan ada hari di mana
 *     kelas `.dark` menyala tapi tabel AntD tetap putih;
 *   • bahasa komponen (nama bulan DatePicker, "Sebelumnya/Berikutnya" pada
 *     Pagination, teks filter Table) — terpisah dari kamus aplikasi, tetapi
 *     harus berpindah BERSAMA kamus itu. Setengah layar berbahasa Indonesia
 *     dengan pemilih tanggal berbahasa Inggris terlihat seperti aplikasi yang
 *     bocor.
 *
 * ── Dari mana keduanya datang ──────────────────────────────────────────────
 * Cookie tetap dibaca SEKALI, di root layout (server): `getTheme()` dan
 * `getLocale()`. Komponen ini tidak menyentuh cookie sama sekali dan tidak
 * memanggil `matchMedia` sendiri — dua sumber kebenaran tema adalah persis
 * bug yang membuat toggle terlihat rusak.
 *
 * Bahasanya datang sebagai PROP dari server. Itu cukup karena pemilih bahasa
 * memang menempuh server: ia menulis cookie lalu `router.refresh()`, jadi root
 * layout merender ulang dan prop ini ikut berganti (lihat
 * `components/ui/locale-toggle.tsx`).
 *
 * Temanya TIDAK bisa memakai jalur yang sama, dan ini bagian yang mudah salah:
 * `changeTheme` sengaja tidak me-refresh server (lihat `lib/theme/client.tsx`)
 * — ia menyentuh `documentElement` supaya layar berubah seketika, dan cookie
 * hanya menyusul untuk pemuatan BERIKUTNYA. Kalau algoritma AntD dipilih dari
 * prop server, menekan toggle tema akan mengubah kelas `.dark` tapi meninggalkan
 * seluruh komponen AntD di tema lama sampai halaman dimuat ulang — persis yang
 * dilarang kriteria selesai issue #184. Karena itu temanya diambil dari
 * `useTheme()`, konteks yang NILAI AWALNYA justru prop server yang sama
 * (root layout menyemai `<ThemeProvider theme={theme}>`). Tetap satu sumber
 * kebenaran, satu pembacaan cookie — hanya saluran yang lebih hidup.
 *
 * `resolved`, bukan `theme`: pilihan "ikut sistem" harus sudah diselesaikan
 * menjadi terang/gelap sebelum sampai ke AntD, dan yang menyelesaikannya adalah
 * `ThemeProvider` (satu-satunya tempat `matchMedia` boleh dipanggil).
 */

import { useMemo } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import type { Locale as AntdLocale } from "antd/es/locale";
import enUS from "antd/locale/en_US";
import idID from "antd/locale/id_ID";
import zhCN from "antd/locale/zh_CN";

import type { Locale } from "@/lib/i18n/config";
import { useTheme } from "@/lib/theme/client";

/**
 * Ketiga locale diimpor STATIS, berbeda dari kamus aplikasi yang sengaja
 * dipilih di server supaya hanya satu bahasa menyeberang ke browser. Alasannya
 * beda ukuran: satu berkas locale AntD adalah beberapa puluh string (nama
 * bulan, label pagination), bukan ~2.500 kunci — sedangkan memuatnya lewat
 * `import()` berarti komponen tanggal sempat merender label bahasa Inggris
 * pada frame pertama setiap kali halaman dibuka.
 */
const ANTD_LOCALES: Record<Locale, AntdLocale> = {
  id: idID,
  en: enUS,
  zh: zhCN,
};

/**
 * Target sentuh minimum MASTER.md (≥ 40px). Bawaan AntD `controlHeight` adalah
 * 32px — nyaman untuk tetikus, terlalu kecil untuk jempol, dan aplikasi ini
 * dipakai orang di gudang lewat ponsel.
 *
 * Dipasang sebagai TOKEN, bukan `size="large"` per komponen: ukuran per
 * komponen adalah keputusan yang harus diulang di setiap tombol dan akan
 * terlupa di tombol ke-seratus. Token menaikkan seluruh keluarga kontrol
 * (Button, Input, Select, DatePicker) sekaligus, dan varian `small` tetap
 * tersedia untuk tempat yang memang bukan target sentuh.
 */
const CONTROL_HEIGHT = 40;

export function AntdProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const { resolved } = useTheme();

  // Objek tema distabilkan: setiap identitas objek baru membuat AntD menghitung
  // ulang turunan token dan seluruh pohon di bawahnya ikut render.
  const theme = useMemo(
    () => ({
      algorithm:
        resolved === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: { controlHeight: CONTROL_HEIGHT },
    }),
    [resolved]
  );

  return (
    <ConfigProvider locale={ANTD_LOCALES[locale]} theme={theme}>
      {children}
    </ConfigProvider>
  );
}
