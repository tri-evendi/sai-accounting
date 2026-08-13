"use client";

/**
 * Kerangka layar penyiapan (issue #103).
 *
 * Wizard `/setup` dulu tinggal di grup rute `(dashboard)`, jadi ia dirender
 * dengan chrome penuh: sidebar ~40 menu + navbar. Sejak gerbang setup mendarat,
 * susunan itu jadi JEBAKAN — setiap menu memicu gerbang dan melempar penggunanya
 * kembali ke wizard. Empat puluh pintu yang semuanya memantul ke tempat yang
 * sama, pada layar pertama yang pernah dilihat pengguna baru.
 *
 * Kerangka ini menyisakan satu jalan ke depan: wizard-nya sendiri. Tidak ada
 * navigasi ke halaman yang memang belum bisa dibuka, jadi tidak ada pantulan.
 *
 * Yang SENGAJA tetap ada adalah jalan KELUAR (UX · User Freedom): menu pengguna
 * — ganti bahasa, ubah kata sandi, keluar. Pengguna yang salah masuk akun, atau
 * yang butuh membaca layarnya dalam bahasanya sendiri, tidak boleh terkunci
 * hanya karena kami menyempitkan chrome-nya. Menunya komponen yang SAMA dengan
 * navbar (`UserMenu`), bukan tiruan: satu perilaku, satu tempat memperbaikinya.
 *
 * Sengaja BUKAN `AuthShell`: layar `(auth)` adalah kartu sempit (maks ~28rem)
 * untuk formulir pendek, sedangkan wizard ini punya tabel saldo awal, daftar
 * modul, dan panel neraca berjalan — kartu selebar itu akan menyiksanya. Yang
 * dipinjam adalah PRINSIPNYA (kepala ramping, tanpa navigasi), bukan markup-nya.
 *
 * ── Setelah AntD (issue #240, fase C9) ────────────────────────────────────
 * ⚠ Berkas ini KERANGKA: ia digambar di sekeliling setiap layar penyiapan, dan
 * satu jarak yang bergeser di sini bergeser di semuanya sekaligus — tanpa satu
 * tes pun yang berbunyi. Yang berubah karena itu ditahan seminimal mungkin.
 *
 * Kepalanya kini `Layout.Header` AntD, yang latarnya memang gelap (`headerBg`
 * `#001529`) — peran yang sama dengan `bg-sidebar` sebelumnya, dan permukaan
 * yang sama dengan `Layout.Sider theme="dark"` milik chrome dasbor (#193).
 * Karena bidangnya SELALU gelap di kedua tema, teksnya memakai
 * `colorTextLightSolid` dan anak tangga netral tema GELAP (#207) — bukan token
 * yang ikut berbalik bersama tema, yang di tema terang akan menghilang.
 *
 * ── BERKAS INI PERNAH DIHAPUS, LALU DIKEMBALIKAN (#341 → #352) ─────────────
 * Ditulis di sini supaya tidak dihapus untuk KETIGA kalinya oleh orang yang
 * membaca alasan penghapusannya saja.
 *
 * `27af751` menghapusnya dan memindahkan wisaya ke `PlatformShell`, dengan
 * alasan yang SEBAGIAN BESAR benar dan masih berlaku: menu panel akun tidak
 * memantul (butirnya dijaga `requireTenantPagePermission`, yang tidak punya
 * gerbang setup), jadi jebakan "empat puluh pintu yang semuanya memantul" —
 * paragraf pembuka di atas — memang tidak pernah berlaku untuk menu ITU.
 * Paragraf itu bicara tentang sidebar DASBOR, dan untuk sidebar dasbor ia
 * tetap benar sampai hari ini.
 *
 * Yang membuat berkas ini kembali BUKAN bantahan atas alasan itu, melainkan
 * penilaian yang berbeda atas pertukarannya (#352): pada layar WAJIB PERTAMA,
 * fokus lebih berharga daripada keseragaman. Wisaya penyiapan dilewati SEKALI
 * seumur perusahaan; menu samping di sana menawarkan pekerjaan lain justru
 * pada satu-satunya momen ketika pekerjaan lain belum bisa dimulai.
 *
 * Karena itu `/docs` dan `/companies/new` TIDAK ikut kembali ke kulit sendiri:
 * keduanya dibuka dari DALAM aplikasi oleh orang yang sudah bekerja, dan
 * melemparnya keluar dari chrome-nya memang cacat. Wisaya ini tidak begitu.
 */

import { signOut, useSession } from "next-auth/react";
import { Flex, Layout, theme } from "antd";

import { BrandMark } from "@/components/ui/brand-mark";
import { UserMenu } from "@/components/layout/user-menu";
import { PageLoader } from "@/components/ui/loading";
import { APP_NAME } from "@/lib/constants";
import { BORDER_TOKENS_DARK, NEUTRAL_TEXT_DARK } from "@/lib/theme/antd-tokens";
import { useT } from "@/lib/i18n/client";

/** `max-w-5xl` — lebar isi wizard, sama untuk kepala dan badannya. */
const MAX_WIDTH = 1024;

const TRUNCATE: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function SetupShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const t = useT();
  const { token } = theme.useToken();

  if (status === "loading") {
    return <PageLoader message={t("common.loadingSession")} />;
  }

  // Tanpa sesi tidak ada yang bisa ditampilkan; halamannya sendiri (server)
  // yang mengarahkan ke /login lewat requirePagePermission.
  if (!session) return null;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* Kepala ramping: identitas aplikasi + jalan keluar. Tidak ada navigasi. */}
      <Layout.Header
        style={{
          height: "auto",
          lineHeight: token.lineHeight,
          paddingInline: 0,
          borderBottom: `${token.lineWidth}px solid ${BORDER_TOKENS_DARK.colorSplit}`,
        }}
      >
        <Flex
          align="center"
          justify="space-between"
          gap={token.margin}
          style={{
            width: "100%",
            maxWidth: MAX_WIDTH,
            margin: "0 auto",
            paddingInline: token.padding,
            paddingBlock: token.paddingSM,
          }}
        >
          <Flex align="center" gap={token.marginSM} style={{ minWidth: 0 }}>
            <BrandMark size="sm" />
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  ...TRUNCATE,
                  fontWeight: token.fontWeightStrong,
                  color: token.colorTextLightSolid,
                }}
              >
                {APP_NAME}
              </span>
              <span
                style={{
                  ...TRUNCATE,
                  fontSize: token.fontSizeSM,
                  color: NEUTRAL_TEXT_DARK.colorTextTertiary,
                }}
              >
                {t("setup.shellSubtitle")}
              </span>
            </span>
          </Flex>

          <UserMenu
            userName={session.user.name}
            // Wizard penyiapan selalu berjalan DI DALAM sebuah perusahaan, jadi
            // perannya ada; `?? ""` hanya menutup tipe nullable yang lahir dari
            // keadaan "belum memilih perusahaan" (issue #104).
            role={session.user.role ?? ""}
            onSignOut={() => signOut({ callbackUrl: "/login" })}
          />
        </Flex>
      </Layout.Header>

      <Layout.Content
        style={{
          width: "100%",
          maxWidth: MAX_WIDTH,
          margin: "0 auto",
          paddingInline: token.padding,
          paddingBlock: token.paddingLG,
        }}
      >
        {children}
      </Layout.Content>
    </Layout>
  );
}
