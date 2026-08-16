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
 *
 * ══ MENU PONSEL: `<details>`, TANPA JAVASCRIPT (#398) ══════════════════════
 * Di bawah `LANDING_NAV_LINKS_BREAKPOINT` tautan seksi disembunyikan, dan
 * sampai perubahan ini TIDAK ADA penggantinya: pengunjung ponsel kehilangan
 * jalan ke harga/FAQ/dokumentasi, dan pemilih bahasa hanya ada di KAKI —
 * pengunjung berbahasa Mandarin membaca ID/EN sampai menggulung ke bawah.
 *
 * Penggantinya `<details><summary>` — pola FAQ yang sudah ada — sebab halaman
 * ini sengaja nol JavaScript sisi klien (`AMBANG_KLIEN`): sebuah menu
 * ber-`useState` akan menyeret bilah ini menjadi komponen klien. Panelnya
 * `position:absolute` di bawah bilah (tidak mendorong isi, tidak mengubah
 * tinggi bilah yang dipakai `scroll-margin-top`), berisi tautan seksi yang
 * SAMA dengan bilah lebar + `#kontak` (di bilah lebar ia sengaja tidak ada —
 * terukur mendorong bilah melewati 768px; di panel ponsel lebar bukan
 * kendala) + pemilih bahasa untuk <576px (di 576–768 sakelar di bilah sudah
 * tampil, jadi yang di panel disembunyikan lewat pasangan
 * `data-landing-chrome-narrow` yang sama dengan kaki).
 *
 * ⚠ Batas yang jujur: tanpa skrip, panel TIDAK menutup sendiri saat sebuah
 * tautan seksi ditekan — peramban menggulung ke jangkarnya, dan panel tetap
 * terbuka di bawah bilah menempel sampai tombolnya ditekan lagi (ikonnya
 * berubah menjadi X saat terbuka supaya jalan menutupnya jelas). Menutupnya
 * otomatis menuntut JavaScript, dan itu harga yang lebih mahal daripada satu
 * ketukan tambahan.
 *
 * ══ MEREK DI BAWAH 576px: LAMBANG SAJA ═════════════════════════════════════
 * Terukur di 390px teks merek patah dua baris: kisi bilah membagi ruang sisa
 * ke kolom merek, dan dengan tombol menu ditambahkan ke kolom aksi, ruang itu
 * habis. Di bawah `LANDING_BREAKPOINT` teks merek karena itu disembunyikan
 * secara VISUAL (tetap di DOM untuk pembaca layar — `<a>` merek harus tetap
 * punya nama), lambangnya tetap. Bukan titik patah baru di 400px: `landing.md`
 * melarang titik patah ketiga tanpa pengukuran, dan yang tersedia (576px)
 * sudah cukup — di 576–768 teks merek muat bersama tombol menu.
 */
import { CloseOutlined, MenuOutlined } from "@ant-design/icons";
import Link from "next/link";

import { LANDING_NAV_HEIGHT } from "@/components/landing/landing-scale";
import { BrandMark } from "@/components/ui/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { APP_NAME } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

/**
 * Tautan seksi: warna sekunder, penuh + bergaris saat hover (aturan hover ada
 * di `[data-landing-link]`, blok gaya `landing-scale.ts`). Ukurannya token isi,
 * bukan `sm` — bilah ini memikul target sentuh.
 */
const NAV_LINK: React.CSSProperties = {
  /* Target sentuh: teks 14px sendirian hanya setinggi 17px, jauh di bawah
     lantai 40px MASTER.md. Bilah ini 64px, jadi ruangnya ada — yang kurang
     hanya padding vertikalnya. Diukur sesudahnya: 40px. */
  display: "inline-flex",
  alignItems: "center",
  minHeight: 40,
  paddingInline: "var(--ant-padding-xxs)",
  color: "var(--ant-color-text-secondary)",
  fontSize: "var(--ant-font-size)",
  textDecoration: "none",
};

/**
 * Tautan di panel menu ponsel: blok penuh, 44px — jari, bukan kursor. Ukuran
 * teksnya `lg` (16px) sebab di panel tidak ada baris yang harus dihemat.
 */
const MENU_LINK: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: 44,
  paddingInline: "var(--ant-padding-xs)",
  color: "var(--ant-color-text)",
  fontSize: "var(--ant-font-size-lg)",
  textDecoration: "none",
};

interface NavLinkItem {
  href: string;
  label: string;
  /** Rute di dalam app (`/docs`) → `<Link>`; jangkar seksi → `<a>`. */
  internal?: boolean;
  /**
   * Hanya di panel ponsel. `#kontak` sengaja TIDAK di bilah lebar: terukur
   * tautan kelima mendorong bilah melewati 768px (`landing.md` §Formulir
   * kontak). Di panel yang bertumpuk ke bawah, lebar bukan kendala.
   */
  menuOnly?: boolean;
}

function NavLink({
  link,
  style,
}: {
  link: NavLinkItem;
  style: React.CSSProperties;
}) {
  return link.internal ? (
    <Link href={link.href} data-landing-link="" style={style}>
      {link.label}
    </Link>
  ) : (
    <a href={link.href} data-landing-link="" style={style}>
      {link.label}
    </a>
  );
}

export async function LandingNav() {
  const t = await getT();

  /* SATU daftar untuk bilah lebar dan panel ponsel — dua daftar yang ditulis
     terpisah akan berbeda pada hari salah satunya mendapat tautan baru. */
  const links: NavLinkItem[] = [
    { href: "#modul", label: t("landing.navModules") },
    { href: "#harga", label: t("landing.navPricing") },
    { href: "#tanya", label: t("landing.navFaq") },
    { href: "#kontak", label: t("landing.navContact"), menuOnly: true },
    { href: "/docs", label: t("landing.navDocs"), internal: true },
  ];

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        /* Di atas isi halaman, di bawah overlay AntD (`zIndexPopupBase` 1000)
           dan di bawah tautan lewati-ke-isi yang harus menutupi bilah ini saat
           difokuskan. */
        zIndex: 40,
        /* Nyaris pekat, bukan pekat: isi yang lewat di baliknya terbaca sebagai
           gulungan, bukan sebagai lompatan. `backdrop-filter` hanya penyedap —
           peramban yang tak mendukungnya tetap mendapat latar 92%.

           Latarnya kini nada merek pendaratan, bukan `colorBgContainer`
           telanjang: bilah ini MENEMPEL, jadi ia satu-satunya bidang yang
           menemani pembaca sepanjang gulungan — dan sebelumnya ia bidang putih
           yang berpindah dari hero berwarna ke seksi berwarna tanpa pernah ikut
           berwarna sendiri. Isian tombol primer di atasnya tetap 3,29:1 di tema
           gelap, di atas ambang 3:1. */
        background:
          "color-mix(in srgb, var(--sai-landing-band-brand) 92%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Kisi tiga kolom, bukan `space-between` — alasannya (dan angkanya) di
          `[data-landing-nav]`, `landing-scale.ts`. Garis bawah bilah juga
          hidup di sana sebagai `::after` bergradien, bukan `border-bottom`
          selebar layar: bilah ini menempel sepanjang gulungan, jadi garisnya
          yang paling lama dilihat orang. */}
      <nav
        aria-label={APP_NAME}
        data-landing-nav=""
        style={{
          height: LANDING_NAV_HEIGHT,
          width: "100%",
          maxWidth: "var(--sai-landing-measure)",
          marginInline: "auto",
          alignItems: "center",
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
          {/* Disembunyikan visual di <576px, `nowrap` di atasnya — keduanya
              di `[data-landing-brand-name]`, blok gaya `landing-scale.ts`. */}
          <span
            data-landing-brand-name=""
            style={{
              fontSize: "var(--ant-font-size-lg)",
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            {APP_NAME}
          </span>
        </Link>

        {/* ══ TAUTAN SEKSI — mesin yang sudah dibangun, akhirnya dipasang ═══
            `LandingSection` menerima `id` "untuk tautan bilah atas", memasang
            `scroll-margin-top` seukuran bilah ini, dan `landing-scale.ts`
            menjelaskan panjang lebar kenapa jarak jangkar itu harus sama
            dengan `LANDING_NAV_HEIGHT`. Ketiga jangkarnya sudah terpasang
            (`#modul`, `#harga`, `#tanya`) — tetapi TIDAK ADA satu pun tautan
            yang menujunya sampai perubahan ini, sehingga seluruh perkakas itu
            kode mati dan pengunjung di layar lebar tidak punya jalan ke harga
            selain menggulung melewati sepuluh kartu modul.

            `/docs` ikut di sini karena ia memang publik (`proxy.ts`
            melepaskannya tanpa penjaga) dan ia satu-satunya tempat calon
            pelanggan bisa memeriksa produk ini lebih dalam sebelum membuat
            akun. Ia `<Link>`, bukan `<a>`: rute di dalam app. */}
        <ul data-landing-links="">
          {links
            .filter((link) => !link.menuOnly)
            .map((link) => (
              <li key={link.href}>
                <NavLink link={link} style={NAV_LINK} />
              </li>
            ))}
        </ul>

        <div
          data-landing-nav-actions=""
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--ant-margin-xs)",
          }}
        >
          {/* Di layar sempit sakelar ini disembunyikan agar tombol MASUK dan
              DAFTAR — satu-satunya hal yang benar-benar dituju orang di sini —
              tidak menyusut di bawah target sentuh 40px. Gantinya dirender di
              KAKI halaman oleh `[data-landing-chrome-narrow]`, pasangan yang
              saling meniadakan di titik patah yang sama, jadi tidak pernah ada
              ukuran layar yang kehilangan bahasanya: pengunjung ponsel yang
              belum punya akun tidak punya menu akun untuk menggantinya.

              ⚠ HANYA bahasa di sini; sakelar TEMA pindah ke kaki halaman.
              Sebelumnya bilah ini memikul enam kendali (tiga bahasa + tiga
              tema) tepat di sebelah kiri dua tombol yang menjadi satu-satunya
              alasan halaman ini ada — enam kotak abu-abu yang bersaing dengan
              ajakan utama di permukaan yang paling lama terlihat pembaca.

              Yang dipertahankan dipilih menurut PERANNYA, bukan dibagi rata:
              bahasa menentukan apakah halaman ini bisa DIPAHAMI, dan pengunjung
              tanpa akun tidak punya menu akun untuk menggantinya. Tema hanya
              kenyamanan, dan halaman ini light-first — pembaca yang
              menginginkannya akan mencarinya, dan menemukannya di kaki. */}
          <div data-landing-chrome="">
            <LocaleToggle />
          </div>
          {/* `ButtonLink` (#289) — rute internal, jadi navigasi sisi-klien +
              prefetch. Bilah ini MENEMPEL sepanjang gulungan, jadi kedua
              tautan inilah yang paling lama terlihat di halaman; memuat ulang
              seluruh app dari sini adalah harga yang tidak dibayar apa pun. */}
          <ButtonLink href="/login" variant="ghost">
            {t("landing.signIn")}
          </ButtonLink>
          <ButtonLink href="/register" variant="primary">
            {t("landing.signUp")}
          </ButtonLink>

          {/* ══ MENU PONSEL — `<details>`, tanpa JavaScript ══════════════════
              Disembunyikan mulai `LANDING_NAV_LINKS_BREAKPOINT` (tautan seksi
              tampil di bilah). Semua keadaannya — tombol 40px, ikon yang
              bertukar saat terbuka, panel absolut di bawah bilah, fokus —
              hidup di `[data-landing-menu*]`, blok gaya `landing-scale.ts`;
              alasan pola ini di kepala berkas. */}
          <details data-landing-menu="">
            <summary
              data-landing-menu-toggle=""
              aria-label={t("landing.navMenu")}
              title={t("landing.navMenu")}
            >
              <MenuOutlined data-landing-menu-open="" aria-hidden="true" />
              <CloseOutlined data-landing-menu-close="" aria-hidden="true" />
            </summary>
            <div data-landing-menu-panel="">
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                }}
              >
                {links.map((link) => (
                  <li key={link.href}>
                    <NavLink link={link} style={MENU_LINK} />
                  </li>
                ))}
              </ul>
              {/* Bahasa di <576px saja — di 576–768 sakelar di bilah sudah
                  tampil (`data-landing-chrome`), dan dua sakelar untuk hal
                  yang sama di satu layar adalah satu terlalu banyak. */}
              <div
                data-landing-chrome-narrow=""
                style={{
                  justifyContent: "space-between",
                  marginTop: "var(--ant-margin-xs)",
                  paddingTop: "var(--ant-padding-sm)",
                  paddingInline: "var(--ant-padding-xs)",
                  borderTop: "1px solid var(--ant-color-border-secondary)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--ant-font-size)",
                    color: "var(--ant-color-text-secondary)",
                  }}
                >
                  {t("landing.navMenuLanguage")}
                </span>
                <LocaleToggle />
              </div>
            </div>
          </details>
        </div>
      </nav>
    </header>
  );
}
