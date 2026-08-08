/**
 * Bilah atas halaman pendaratan publik.
 *
 * KENAPA BUKAN `AuthShell`. Kulit pra-aplikasi menaruh isinya di kolom
 * `max-w-md` dan mengasumsikan satu formulir di tengah layar — bentuk yang
 * benar untuk masuk/daftar dan salah untuk halaman yang harus menjelaskan
 * produk sebelum orang punya alasan mengisi apa pun. Yang DIPINJAM dari sana
 * adalah keputusannya, bukan tata letaknya: identitas PRODUK saja, tanpa nama
 * PT — pada pemasangan multi-PT aplikasi belum bisa tahu tenant mana yang
 * sedang datang, dan nilai cadangannya adalah nama pemasang pertama (lihat
 * komentar kepala `auth-shell.tsx`).
 *
 * Pemilih bahasa dan tema ikut di sini, bukan hanya di dalam aplikasi: orang
 * yang belum punya akun tidak bisa membuka menu akun, dan halaman inilah satu-
 * satunya tempat ia bisa memilih membaca dalam bahasanya sendiri.
 *
 * "Daftar" berisi penuh, "Masuk" `ghost`: bilah ini MENEMPEL, jadi tombolnya
 * ikut ke seluruh gulungan halaman dan bertemu ajakan yang sama di hero, di
 * tiap kartu paket, dan di penutup. Empat kali ajakan yang SAMA adalah cara
 * halaman pendaratan bekerja, bukan pelanggaran #267 — lihat MASTER.md §Aksi
 * utama per layar → "Pendaratan `/` dikecualikan", dan batasnya (semua primer
 * menuju `/register`) di `tests/button-emphasis.test.ts`.
 */
import Link from "next/link";

import { LANDING_NAV_HEIGHT } from "@/components/landing/landing-scale";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

export async function LandingNav() {
  const t = await getT();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        /* Di atas isi halaman, di bawah overlay AntD (`zIndexPopupBase` 1000)
           dan di bawah tautan lewati-ke-isi yang harus menutupi bilah ini saat
           difokuskan. */
        zIndex: 40,
        borderBottom: "1px solid var(--ant-color-border-secondary)",
        /* Nyaris pekat, bukan pekat: isi yang lewat di baliknya terbaca sebagai
           gulungan, bukan sebagai lompatan. `backdrop-filter` hanya penyedap —
           peramban yang tak mendukungnya tetap mendapat latar 92%. */
        background: "color-mix(in srgb, var(--ant-color-bg-container) 92%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      <nav
        aria-label={APP_NAME}
        style={{
          display: "flex",
          height: LANDING_NAV_HEIGHT,
          width: "100%",
          maxWidth: "var(--sai-landing-measure)",
          marginInline: "auto",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--ant-margin)",
          paddingInline: "var(--sai-landing-gutter)",
        }}
      >
        <Link
          href="/"
          data-landing-brand=""
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--ant-margin-xs)",
            color: "var(--ant-color-text)",
            textDecoration: "none",
          }}
        >
          <BrandMark size="sm" />
          <span
            style={{
              fontSize: "var(--ant-font-size-lg)",
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            {APP_NAME}
          </span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--ant-margin-xs)" }}>
          {/* Di layar sempit dua sakelar ini disembunyikan agar tombol MASUK
              dan DAFTAR — satu-satunya hal yang benar-benar dituju orang di
              sini — tidak menyusut di bawah target sentuh 40px. Gantinya
              dirender di KAKI halaman oleh `[data-landing-chrome-narrow]`,
              pasangan yang saling meniadakan di titik patah yang sama, jadi
              tidak pernah ada ukuran layar yang kehilangan keduanya:
              pengunjung ponsel yang belum punya akun tidak punya menu akun
              untuk mengganti bahasa. */}
          <div data-landing-chrome="">
            <LocaleToggle />
            <ThemeToggle />
          </div>
          <Button href="/login" variant="ghost">
            {t("landing.signIn")}
          </Button>
          <Button href="/register" variant="primary">
            {t("landing.signUp")}
          </Button>
        </div>
      </nav>
    </header>
  );
}
