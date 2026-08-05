"use client";

/**
 * Perusahaan yang SEDANG DIBUKA, terpampang di top bar (issue #104).
 *
 * ══ KENAPA INI ADA ═════════════════════════════════════════════════════════
 * Sejak buku besar tiap PT hidup di basis datanya sendiri, satu pertanyaan
 * menjadi yang paling penting di seluruh aplikasi: **buku siapa yang sedang
 * saya tulis?** Sebelum ini jawabannya hanya muncul setelah pengguna membuka
 * menu avatar — sebuah klik yang tidak akan dilakukan orang yang tidak merasa
 * ragu. Padahal justru orang yang tidak ragu itulah yang salah mencatat.
 *
 * Kesalahan mencatat ke PT yang salah TIDAK BERBUNYI saat terjadi: tidak ada
 * galat, tidak ada peringatan, dan baru muncul berbulan-bulan kemudian sebagai
 * neraca yang tidak cocok. Satu-satunya pencegahnya adalah orientasi yang
 * selalu terlihat — sama seperti nama berkas perusahaan yang selalu tertulis di
 * bilah judul Accurate/MYOB, tempat pengguna app ini belajar model mentalnya.
 *
 * ══ KENAPA DARI SESI, BUKAN PERMINTAAN JARINGAN ════════════════════════════
 * Namanya dibawa token (lihat `companyName` di `lib/auth.ts`), jadi ia hadir
 * pada render pertama — bukan berkedip masuk beberapa ratus milidetik setelah
 * halaman terlihat siap. Jeda itu penting: yang paling mungkin salah baca
 * adalah orang yang sudah mulai mengetik sebelum indikatornya sempat muncul.
 *
 * ══ ORIENTASI DULU, KENDALI KEMUDIAN ═══════════════════════════════════════
 * Versi pertamanya sengaja tidak bisa ditekan: komponen ini tidak tahu apakah
 * ada perusahaan LAIN untuk dipilih, dan tombol yang mengembalikan sebagian
 * pengguna ke ruangan yang sama lebih buruk daripada teks biasa.
 *
 * Sesi kini membawa jumlahnya (`companyCount`), jadi pengetahuan itu ada tanpa
 * satu permintaan pun — dan nama perusahaan di bilah atas adalah tempat orang
 * pertama kali mencari cara berpindah (pola yang sama di Accurate, Xero,
 * QuickBooks). Jadi: SATU perusahaan → tetap teks biasa; LEBIH dari satu →
 * tautan ke pemilihnya.
 *
 * ══ TATA LETAK SETELAH MIGRASI AntD (issue #193) ═══════════════════════════
 * Yang dulu dikerjakan `truncate` + `text-sm` + `text-muted-foreground` kini
 * dikerjakan gaya sebaris bernilai TOKEN (`theme.useToken()`), bukan kelas.
 * Satu janji MASTER.md §Orientasi Perusahaan yang harus bertahan apa adanya:
 * **yang menyempit adalah NAMANYA** (`text-overflow: ellipsis` + `title`),
 * bukan target sentuh aksi di sebelah kanannya — karena itu `minWidth: 0` ada
 * di sini dan `flexShrink: 0` ada di aksi-aksi navbar.
 */

import { Flex, theme } from "antd";
import { Building2, ChevronsUpDown } from "lucide-react";

import { Link } from "@/components/ui/app-link";
import { useT } from "@/lib/i18n/client";

/**
 * Teks yang hanya dibacakan pembaca layar — pengganti kelas `sr-only`.
 *
 * Ditulis sebagai gaya, bukan kelas, karena berkas ini tidak lagi memakai
 * Tailwind (issue #193) dan AntD tidak mengekspor pembantu setara. Pola
 * `clip` + 1×1px adalah bentuk baku yang sama dengan yang dipakai `sr-only`:
 * `display: none` TIDAK bisa dipakai — ia mencabut teksnya dari pembaca layar
 * juga, yaitu satu-satunya pembaca yang dituju.
 */
const HANYA_PEMBACA_LAYAR: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0,
};

export function CompanyIndicator({
  companyName,
  companyCount = 0,
}: {
  companyName: string | null;
  /** Berapa perusahaan yang boleh dibuka pengguna ini (dari sesi). */
  companyCount?: number;
}) {
  const t = useT();
  const { token } = theme.useToken();

  // Tanpa perusahaan aktif tidak ada yang jujur untuk ditulis di sini. Tata
  // letak dashboard sudah menahan keadaan itu (ia menampilkan layar memuat
  // sementara penjaga memantulkan ke pemilih perusahaan), jadi ini sekadar
  // penjaga terakhir — bukan keadaan yang perlu dijelaskan ke pengguna.
  if (!companyName) return null;

  const label = `${t("navbar.activeCompany")}: ${companyName}`;
  const body = (
    <>
      <Building2
        size={16}
        style={{ flexShrink: 0, color: token.colorTextTertiary }}
        aria-hidden="true"
      />
      <span style={HANYA_PEMBACA_LAYAR}>{t("navbar.activeCompany")}:</span>
      {/* `title` menyelamatkan nama panjang yang terpotong di layar sempit —
          satu-satunya cara membacanya utuh tanpa membuka menu apa pun. */}
      <span
        title={companyName}
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: token.fontWeightStrong,
          color: token.colorText,
        }}
      >
        {companyName}
      </span>
    </>
  );

  if (companyCount < 2) {
    return (
      <Flex
        align="center"
        gap={token.marginXS}
        style={{ minWidth: 0, fontSize: token.fontSize }}
        aria-label={label}
      >
        {body}
      </Flex>
    );
  }

  return (
    <Link
      href="/select-company"
      // Namanya saja tidak memberi tahu bahwa ia BISA ditekan; kalimat penuh
      // inilah yang dibacakan pembaca layar.
      aria-label={`${label} — ${t("auth.selectCompany.switchLabel")}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: token.marginXS,
        minWidth: 0,
        // Target sentuh: setinggi kendali AntD (40px, MASTER.md), bukan
        // setinggi barisnya sendiri.
        minHeight: token.controlHeight,
        paddingInline: token.paddingXS,
        marginInline: -token.paddingXS,
        borderRadius: token.borderRadius,
        fontSize: token.fontSize,
        color: token.colorText,
        cursor: "pointer",
      }}
    >
      {body}
      <ChevronsUpDown
        size={14}
        style={{ flexShrink: 0, color: token.colorTextTertiary }}
        aria-hidden="true"
      />
    </Link>
  );
}
