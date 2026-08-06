"use client";

/**
 * Kulit layar PRA-APLIKASI (masuk, ganti kata sandi, pilih perusahaan, setup
 * belum jalan, fitur nonaktif).
 *
 * ── Kenapa TIDAK ada nama PT di sini ──────────────────────────────────────
 *
 * Sampai audit ini, panel brand menampilkan `useCompanyIdentity()`. Di layar
 * masuk hasilnya SELALU salah, dan salahnya senyap: hook itu mengambil
 * `/api/company/identity`, sementara `proxy.ts` menjawab 401 untuk setiap
 * `/api/*` tanpa token. Permintaannya karena itu tidak pernah berhasil sebelum
 * orang masuk, context jatuh ke nilai cadangan, dan nilai cadangan itu adalah
 * konstanta nama perusahaan di `constants.ts` — nama PT PEMASANG PERTAMA.
 * Setiap tenant melihat layar masuk (dan baris hak cipta) beratas-nama badan
 * hukum orang lain, persis kesalahan yang dilarang MASTER.md §Orientasi
 * Perusahaan untuk dokumen tercetak.
 *
 * Menambalnya dengan membuka endpoint identitas untuk publik hanya memindahkan
 * masalahnya: pada pemasangan multi-PT, aplikasi memang BELUM BISA TAHU tenant
 * mana yang sedang datang — pertanyaan itu baru terjawab setelah masuk (dan
 * kadang baru setelah `/select-company`). Jadi layar pra-aplikasi memakai
 * identitas PRODUK saja. Nama perusahaan muncul pertama kali di chrome
 * aplikasi (`CompanyIndicator`), tempat ia sudah bisa benar.
 *
 * ── Setelah AntD (issue #240, fase C9) ────────────────────────────────────
 * ⚠ Berkas ini KERANGKA: tujuh halaman `(auth)` dan tiga layar pra-aplikasi
 * digambar di dalamnya, jadi satu jarak yang bergeser di sini bergeser di
 * semuanya sekaligus — dan tidak ada tes yang akan berteriak.
 *
 * **Dua kolomnya `Row`/`Col`, dan itu bukan selera.** Panel brand dulu
 * `hidden lg:flex` dan kepala sempitnya `lg:hidden`; keduanya keadaan yang
 * dijawab MEDIA QUERY, yang tidak punya padanan gaya sebaris. Jalan yang
 * tersedia ada dua, dan hanya satu yang benar untuk layar ini:
 *
 *   • `Grid.useBreakpoint()` — sebuah hook, jadi nilainya baru benar SESUDAH
 *     render pertama. Di layar masuk itu berarti setiap pengunjung layar lebar
 *     melihat kepala versi ponsel sekejap, lalu tata letaknya melompat.
 *   • `Col` ber-`xs`/`lg` — kelas CSS biasa (`ant-col-lg-0` = `display:none`),
 *     benar sejak HTML pertama, tanpa satu baris JavaScript.
 *
 * Yang dipakai yang kedua. Jangan menukarnya dengan hook "supaya seragam
 * dengan sidebar": sidebar memilih hook karena ia harus MEMUTUSKAN antara dua
 * komponen berbeda (`Drawer` vs `Sider`), bukan menyembunyikan satu kolom.
 */

import Link from "next/link";
import { Alert, Col, Flex, Layout, Row, theme } from "antd";
import { Check } from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { BrandMark } from "@/components/ui/brand-mark";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BORDER_TOKENS_DARK, NEUTRAL_TEXT_DARK } from "@/lib/theme/antd-tokens";
import { useT } from "@/lib/i18n/client";

/** `max-w-md` — lebar kartu tugas. */
const LEBAR_KARTU = 448;
/** `max-w-xs` — lebar kalimat di panel brand; baris panjang sulit dibaca. */
const LEBAR_TEKS_BRAND = 320;

interface AuthShellProps {
  children: React.ReactNode;
  heading: string;
  description?: string;
  error?: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
}

function BrandPanel() {
  const t = useT();
  const { token } = theme.useToken();

  /*
   * Panel brand sengaja gelap di KEDUA tema (seperti menu samping), jadi
   * warnanya diambil dari token permukaan gelap AntD dan anak tangga netral
   * tema GELAP (#207) — bukan token yang ikut berbalik, yang di tema terang
   * akan menjadi teks terang di atas bidang terang.
   *
   * Tepi kanannya eksplisit, dan ia hanya BEKERJA di tema gelap — di sanalah
   * panel dan halaman kebetulan sama-sama gelap, sehingga tanpa garis ini
   * pembagian dua kolomnya hilang sama sekali (jebakan "dua bidang sewarna"
   * MASTER.md §Color Palette). Di tema terang garisnya praktis tak terlihat.
   */
  return (
    /*
     * `Layout.Sider`, bukan `<div>` berwarna: bidang gelap permanen ini memakai
     * token `Layout.siderBg` AntD — permukaan yang SAMA dengan menu samping
     * dasbor (#193) — sehingga tidak ada satu pun nilai warna gelap yang
     * ditulis ulang di berkas ini dan bisa menyimpang darinya.
     */
    <Layout.Sider
      width="100%"
      theme="dark"
      style={{
        height: "100%",
        borderInlineEnd: `${token.lineWidth}px solid ${BORDER_TOKENS_DARK.colorSplit}`,
        color: token.colorTextLightSolid,
      }}
    >
      {/*
       * ⚠ Tata letaknya milik pembungkus INI, bukan `Sider`. `Sider`
       * menyisipkan satu simpul `.ant-layout-sider-children` di antara dirinya
       * dan anak-anaknya, dan simpul itu `height:100%` TANPA `display:flex` —
       * jadi `flex:1` dan `justify` yang dipasang pada `Sider` hanya akan
       * berlaku pada pembungkus itu, dan isi panel diam-diam berhenti
       * ditengahkan. Pola yang sama dipakai menu samping dasbor (#193).
       */}
      <Flex
        vertical
        style={{
          position: "relative",
          height: "100%",
          overflow: "hidden",
          paddingInline: token.paddingXL,
          paddingBlock: token.paddingXL,
        }}
      >
        {/* Kilau merek — warnanya DITURUNKAN dari `colorPrimary` (+ alfa hex),
            bukan nilai biru yang ditulis ulang di sini. */}
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            backgroundImage: `radial-gradient(ellipse at top left, ${token.colorPrimary}2e, transparent 55%)`,
          }}
          aria-hidden
        />
        {/* Isi panel ditengahkan tegak; baris hak cipta menempel di dasar. Versi
            `justify-between` yang lebih sederhana meninggalkan ±450px kekosongan
            di antara keduanya pada layar 900px — terlihat seperti panel yang
            belum selesai dimuat. */}
        <Flex vertical justify="center" style={{ position: "relative", flex: 1 }}>
        {/* JALAN PULANG. Sejak `/` menjadi halaman pendaratan publik, orang
            yang menekan "Daftar" dari sana dan ingin membaca ulang harga atau
            daftar modulnya tidak punya jalan kembali selain tombol Back
            peramban — dan lambang produk adalah tempat pertama yang dicoba
            siapa pun untuk pulang. Untuk yang SUDAH bersesi, `/` memantulkan
            ke tujuan pasca-masuknya, jadi tautan ini tidak pernah menjadi
            jalan buntu di layar mana pun yang memakai kulit ini. */}
        <Link
          href="/"
          aria-label={t("auth.backToHome")}
          style={{
            display: "inline-flex",
            width: "fit-content",
            marginBottom: token.marginLG,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowSecondary,
          }}
        >
          <BrandMark size="lg" />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: token.fontSizeHeading3,
            fontWeight: token.fontWeightStrong,
            color: "inherit",
          }}
        >
          {APP_NAME}
        </h1>
        <p
          style={{
            margin: 0,
            marginTop: token.marginSM,
            maxWidth: LEBAR_TEKS_BRAND,
            color: NEUTRAL_TEXT_DARK.colorTextTertiary,
          }}
        >
          {t("auth.brandTagline")}
        </p>

        {/*
         * Tiga kemampuan, bukan tiga janji pemasaran.
         *
         * Ruang ini dulu diisi alamat kantor — yang salah tenant (lihat catatan
         * kepala berkas) dan, kalaupun benar, tidak menjawab pertanyaan siapa
         * pun yang sedang berdiri di layar masuk. Yang menggantikannya harus
         * lolos satu syarat: setiap barisnya benar untuk SETIAP pemasangan,
         * karena di sini aplikasi belum tahu tenant mana yang datang. Ketiganya
         * karena itu menyebut kemampuan PRODUK — pembukuan berpasangan, valas,
         * dan pemisahan buku antar-PT — bukan angka, pelanggan, atau klaim yang
         * hanya berlaku pada sebagian pemasangan.
         *
         * Bukan gaya landing (MASTER.md §Anti-Patterns): tidak ada hero, tidak
         * ada lencana, tidak ada CTA. Tiga baris teks kecil dengan centang.
         */}
        <ul
          style={{
            margin: 0,
            marginTop: token.marginXL,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: token.marginSM,
          }}
        >
          {(["brandPoint1", "brandPoint2", "brandPoint3"] as const).map((key) => (
            <li
              key={key}
              style={{
                listStyle: "none",
                display: "flex",
                alignItems: "flex-start",
                gap: token.marginXS,
                color: NEUTRAL_TEXT_DARK.colorTextTertiary,
              }}
            >
              <Check
                size={16}
                strokeWidth={3}
                style={{ marginTop: 2, flexShrink: 0, color: token.colorTextLightSolid }}
                aria-hidden
              />
              <span style={{ maxWidth: LEBAR_TEKS_BRAND }}>{t(`auth.${key}`)}</span>
            </li>
          ))}
        </ul>
        </Flex>

        <p
          style={{
            position: "relative",
            margin: 0,
            fontSize: token.fontSizeSM,
            color: NEUTRAL_TEXT_DARK.colorTextTertiary,
          }}
        >
          &copy; {new Date().getFullYear()} {APP_NAME}
          {" · v"}
          {APP_VERSION}
        </p>
      </Flex>
    </Layout.Sider>
  );
}

export function AuthShell({
  children,
  heading,
  description,
  error,
  icon,
  footer,
}: AuthShellProps) {
  const t = useT();
  const { token } = theme.useToken();

  /*
   * Permukaan halaman = `colorBgLayout`, bukan warna kartu.
   *
   * Kartunya harus lebih TERANG daripada halamannya di kedua tema; menyamakan
   * keduanya membuat kartu berhenti terbaca sebagai permukaan yang terangkat —
   * kegagalan yang tidak terlihat dari kode dan hanya muncul di salah satu tema.
   */
  return (
    <Row align="stretch" style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      {/* `xs={0}` = `display:none` sejak HTML pertama; lihat kepala berkas. */}
      <Col xs={0} lg={7} style={{ maxWidth: 384 }}>
        <BrandPanel />
      </Col>

      <Col xs={24} lg={17} style={{ flex: 1, minWidth: 0 }}>
        <Flex vertical style={{ minHeight: "100%" }}>
          {/* Kepala layar sempit — lambang + nama + posisi produk. Ketiga poin
              kemampuan TIDAK ikut: di layar 375px mereka mendorong formulirnya
              ke bawah lipatan, dan yang datang ke sini datang untuk masuk. */}
          <Row>
            <Col xs={24} lg={0}>
              {/* `Layout.Header` memberi bidang gelap yang sama dengan panel
                  brand tanpa menulis ulang warnanya (`Layout.headerBg`). */}
              <Layout.Header
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: token.marginSM,
                  height: "auto",
                  lineHeight: token.lineHeight,
                  paddingInline: token.paddingLG,
                  paddingBlock: token.padding,
                  fontSize: token.fontSize,
                  borderBottom: `${token.lineWidth}px solid ${BORDER_TOKENS_DARK.colorSplit}`,
                }}
              >
                <BrandMark size="md" />
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: token.fontSizeLG,
                      fontWeight: token.fontWeightStrong,
                      color: token.colorTextLightSolid,
                    }}
                  >
                    {APP_NAME}
                  </p>
                  <p style={{ margin: 0, color: NEUTRAL_TEXT_DARK.colorTextTertiary }}>
                    {t("auth.brandTagline")}
                  </p>
                </div>
              </Layout.Header>
            </Col>
          </Row>

          {/*
           * Preferensi tampilan, DI ATAS kartu dan di luar alurnya.
           *
           * Keduanya harus terjangkau SEBELUM masuk: pemilih bahasa selama ini
           * hanya hidup di menu akun — chrome yang baru ada setelah orang
           * berhasil melewati layar ini — sehingga pembaca yang tidak mengerti
           * bahasanya terkunci di luar oleh satu-satunya layar yang bisa
           * membebaskannya.
           *
           * Ditaruh di kanan atas dan bukan di dalam kartu: kartu itu satu
           * tugas (masuk), dan menyelipkan sakelar preferensi di antara "Kata
           * Sandi" dan tombol kirim menjadikan pilihan menonton sebagai
           * penghalang pekerjaan. `wrap` membuatnya turun sendiri ke baris
           * berikutnya di layar sempit.
           */}
          <Flex
            wrap
            align="center"
            justify="flex-end"
            gap={token.marginXS}
            style={{ paddingInline: token.padding, paddingTop: token.padding }}
          >
            <LocaleToggle />
            <ThemeToggle />
          </Flex>

          <Flex
            align="center"
            justify="center"
            style={{
              flex: 1,
              paddingInline: token.padding,
              paddingTop: token.padding,
              paddingBottom: token.paddingXL,
            }}
          >
            <div style={{ width: "100%", maxWidth: LEBAR_KARTU }}>
              <div
                style={{
                  padding: token.paddingXL,
                  borderRadius: token.borderRadiusLG,
                  border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  background: token.colorBgContainer,
                  boxShadow: token.boxShadowTertiary,
                }}
              >
                <div style={{ marginBottom: token.marginXL }}>
                  {icon && (
                    <div
                      style={{
                        display: "flex",
                        width: 44,
                        height: 44,
                        marginBottom: token.margin,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: token.borderRadiusLG,
                        border: `${token.lineWidth}px solid ${token.colorPrimaryBorder}`,
                        background: token.colorPrimaryBg,
                        color: token.colorLink,
                      }}
                    >
                      {icon}
                    </div>
                  )}
                  <h2
                    style={{
                      margin: 0,
                      fontSize: token.fontSizeHeading4,
                      fontWeight: token.fontWeightStrong,
                      color: token.colorText,
                    }}
                  >
                    {heading}
                  </h2>
                  {description && (
                    <p
                      style={{
                        margin: 0,
                        marginTop: token.marginXS,
                        color: token.colorTextSecondary,
                      }}
                    >
                      {description}
                    </p>
                  )}
                </div>

                {/* `Alert` AntD sudah `role="alert"` sendiri; pembungkus tak
                    menambah apa pun — lihat catatan di
                    `app/(auth)/forgot-password/page.tsx`. */}
                {error && (
                  <div style={{ marginBottom: token.marginLG }}>
                    <Alert type="error" showIcon message={error} />
                  </div>
                )}

                {children}

                {footer && (
                  <div
                    style={{
                      marginTop: token.marginLG,
                      paddingTop: token.padding,
                      borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    {footer}
                  </div>
                )}
              </div>

              {/* Panel brand sudah membawa baris hak cipta di layar lebar —
                  di sini hanya untuk layar sempit yang tidak melihat panel itu. */}
              <Row>
                <Col xs={24} lg={0}>
                  <p
                    style={{
                      margin: 0,
                      marginTop: token.marginLG,
                      textAlign: "center",
                      fontSize: token.fontSizeSM,
                      color: token.colorTextSecondary,
                    }}
                  >
                    &copy; {new Date().getFullYear()} {APP_NAME} · v{APP_VERSION}
                  </p>
                </Col>
              </Row>
            </div>
          </Flex>
        </Flex>
      </Col>
    </Row>
  );
}
