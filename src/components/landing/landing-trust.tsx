/**
 * "Yang menjaga pembukuan Anda" — lapisan KEPERCAYAAN, dan satu-satunya bagian
 * halaman ini yang menjawab keberatan sebelum keberatan itu sempat lahir.
 *
 * ══ KENAPA SEKSI INI ADA ═══════════════════════════════════════════════════
 * Pola pendaratan untuk produk keuangan B2B (*Trust & Authority*) berbentuk:
 * hero → BUKTI → penjelasan → ajakan. Halaman ini punya hero, punya penjelasan,
 * punya harga yang jujur — dan tidak punya bukti sama sekali.
 *
 * Bukan karena tidak ada. Empat hal di bawah semuanya sudah berjalan, dan
 * masing-masing punya sumbernya di kode:
 *
 *   • basis data terpisah per PT   → issue #104, docs/MULTI-COMPANY.md
 *   • izin per peran + override DB → `lib/authz-effective.ts`, halaman `/permissions`
 *   • jejak audit                  → `lib/audit.ts`
 *   • ekspor mandiri saat ditangguhkan → `lib/tenant-export.ts`
 *
 * Sampai perubahan ini keempatnya hanya muncul sebagai JAWABAN FAQ — yaitu di
 * dalam `<details>` yang tertutup, di bawah harga, setelah orang sudah
 * memutuskan. Keberatan terbesar pada perangkat lunak akuntansi multi-PT
 * ("apakah data saya bisa tercampur", "apakah saya bisa keluar") karena itu
 * dijawab di tempat yang hanya ditemukan orang yang sudah mencari jawabannya.
 *
 * ══ KENAPA TIDAK ADA LENCANA KEAMANAN, LOGO, ATAU SERTIFIKASI ══════════════
 * Pola yang sama menyarankan "security badges, case studies, client logos".
 * Ketiganya DITOLAK di sini oleh `landing.md` §KLAIM HARUS PUNYA SUMBER, dan
 * penolakan itu benar: tak satu pun punya sumber di repo ini. Lencana ISO yang
 * tidak dimiliki, logo pelanggan yang tidak memberi izin, dan jumlah pelanggan
 * yang tidak dihitung dari mana pun adalah tiga cara berbeda untuk berbohong di
 * halaman yang dibaca sebelum orang percaya.
 *
 * Yang menggantikannya bukan versi lebih lembut dari klaim yang sama melainkan
 * hal yang berbeda jenisnya: MEKANISME yang bisa diperiksa sendiri. Karena itu
 * seksi ini berakhir pada tautan ke `/docs` — dokumentasi publik yang memang
 * bisa dibaca tanpa akun (`proxy.ts` melepaskannya), sehingga setiap kalimat di
 * atas bisa ditelusuri sebelum ada yang mendaftar.
 */
import {
  AuditOutlined,
  CloudDownloadOutlined,
  DatabaseOutlined,
  TeamOutlined,
} from "@ant-design/icons";

import {
  LANDING_BODY,
  type LandingHue,
  landingChip,
  landingFillSoft,
  landingGlyph,
  landingGrid,
} from "@/components/landing/landing-scale";
import {
  LandingSection,
  LandingSectionIntro,
} from "@/components/landing/landing-section";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { docsPath, type DocSlug } from "@/lib/docs";
import { getT } from "@/lib/i18n/server";

/** Sama dengan kartu fitur: 40px = target sentuh MASTER.md. */
const ICON_BOX = 40;

export async function LandingTrust() {
  const t = await getT();

  /*
   * ══ TIAP KLAIM MEMBAWA DOKUMENNYA ═════════════════════════════════════
   * Seksi ini berjanji "dokumentasinya terbuka untuk diperiksa sebelum Anda
   * membuat akun". Tombol tunggal di kaki seksi menjawabnya secara umum;
   * tautan PER BUTIR menjawabnya secara khusus — pembaca yang ragu pada satu
   * klaim tertentu tidak perlu mencari sendiri di daftar isi.
   *
   * ⚠ `doc: null` untuk jejak audit, dan itu DISENGAJA. `DOC_INDEX` belum
   * punya halaman yang membahasnya; menautkannya ke dokumen terdekat
   * (`periode-terkunci`) akan menjadi penunjuk PALSU — pembaca mengklik
   * "dokumentasinya" lalu menemukan topik lain, dan itu merusak persis
   * kepercayaan yang sedang dibangun seksi ini. Lebih baik tanpa tautan.
   * Slug-nya bertipe `DocSlug`, jadi dokumen yang dihapus/diganti nama
   * ditolak `tsc` — bukan menjadi tautan mati di halaman publik.
   */
  const items: {
    icon: typeof DatabaseOutlined;
    hue: LandingHue;
    title: string;
    body: string;
    doc: DocSlug | null;
  }[] = [
    {
      icon: DatabaseOutlined,
      hue: "brand",
      title: t("landing.trustIsolationTitle"),
      body: t("landing.trustIsolationBody"),
      doc: "paket-dan-perusahaan",
    },
    {
      icon: TeamOutlined,
      hue: "indigo",
      title: t("landing.trustRolesTitle"),
      body: t("landing.trustRolesBody"),
      doc: "peran-dan-izin",
    },
    {
      icon: AuditOutlined,
      hue: "violet",
      title: t("landing.trustAuditTitle"),
      body: t("landing.trustAuditBody"),
      doc: null,
    },
    {
      icon: CloudDownloadOutlined,
      hue: "cyan",
      title: t("landing.trustExportTitle"),
      body: t("landing.trustExportBody"),
      doc: "data-anda",
    },
  ];

  return (
    /* ⚠ Seksi POLOS, dan itu yang membuat keempat kartunya bisa kehilangan
       tepi. Sebelumnya seksi ini pita `brand` dengan kartu `surface` bertepi —
       dan tepi itu WAJIB di sana, sebab di tema gelap selisih kartu terhadap
       pitanya hanya 1,01–1,06:1.

       Membalik keduanya menyelesaikan hal yang sama tanpa satu garis pun:
       nada pindah dari pita ke KARTU, persis seperti seksi manfaat. Aturan
       `landing.md` §"warnai pitanya ATAU kartunya, tidak keduanya" tetap
       dipatuhi — yang berubah hanya sisi mana yang diwarnai. Halaman pun jadi
       berselang-seling: polos (kartu bernada) → pita → polos → pita. */
    <LandingSection>
      <LandingSectionIntro
        eyebrow={t("landing.eyebrowTrust")}
        title={t("landing.trustHeading")}
      >
        {t("landing.trustBody")}
      </LandingSectionIntro>

      <ul
        style={{
          ...landingGrid(2, 280),
          listStyle: "none",
          margin: 0,
          marginTop: "var(--ant-margin-lg)",
          padding: 0,
        }}
      >
        {items.map((item) => (
          <li key={item.title}>
            <Card
              data-landing-card=""
              style={{
                height: "100%",
                background: landingFillSoft(item.hue),
                borderRadius: "var(--sai-landing-radius)",
                border: "none",
              }}
            >
              <CardContent
                style={{ display: "flex", gap: "var(--ant-margin)" }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    flexShrink: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    width: ICON_BOX,
                    height: ICON_BOX,
                    borderRadius: "50%",
                    background: landingChip(item.hue),
                    color: landingGlyph(item.hue),
                    fontSize: "var(--ant-font-size-xl)",
                  }}
                >
                  <item.icon />
                </span>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "var(--ant-font-size-lg)",
                      fontWeight: "var(--ant-font-weight-strong)",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      ...LANDING_BODY,
                      marginTop: "var(--ant-margin-xxs)",
                      fontSize: "var(--ant-font-size)",
                    }}
                  >
                    {item.body}
                  </p>
                  {item.doc !== null && (
                    <Link
                      href={docsPath(item.doc)}
                      data-landing-link=""
                      style={{
                        display: "inline-block",
                        marginTop: "var(--ant-margin-xs)",
                        color: "var(--ant-color-link)",
                        fontSize: "var(--ant-font-size)",
                        textDecoration: "none",
                      }}
                    >
                      {t("landing.trustItemDoc")} →
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* `outline`, dan itu WAJIB bukan primer: pengecualian pendaratan
          membebaskan halaman ini dari BERAPA BANYAK primer, dengan syarat
          setiap primer menuju `/register` (`tests/button-emphasis.test.ts`).
          Tombol ini menuju tempat lain, jadi ia memang aksi lain — dan secara
          hierarki itu benar: membaca dokumentasi adalah jalan memeriksa, bukan
          jalan mendaftar. */}
      <div style={{ marginTop: "var(--ant-margin-lg)" }}>
        <ButtonLink href="/docs" variant="outline">
          {t("landing.trustDocsCta")}
        </ButtonLink>
      </div>
    </LandingSection>
  );
}
