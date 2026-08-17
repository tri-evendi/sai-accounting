/**
 * Ajakan penutup — pengulangan aksi utama di ujung gulungan, dan sejak #401
 * PUNCAK WARNA halaman ini: satu pita navy PEKAT.
 *
 * Ini dimensi kedua "pemasaran" (bobot CTA, lihat `landing-scale.ts`): aksi
 * yang SAMA muncul berkali-kali di halaman ini — hero, tiap kartu paket, dan
 * di sini — karena orang yang membaca sampai bawah tidak boleh disuruh
 * menggulung balik untuk menemukan tombolnya. Di app internal pengulangan
 * seperti itu justru cacat: aksi utama muncul sekali, di `PageHeader.actions`.
 *
 * Teksnya memakai kunci yang sama dengan tombol paket (`landing.heroPrimary`)
 * — satu janji, satu kalimat. Justru pengulangan itulah yang membuat #267
 * TIDAK berlaku di sini: aturan "satu aksi utama per layar" melarang banyak
 * ajakan BERBEDA, dan halaman ini hanya punya satu ajakan yang muncul
 * berkali-kali. Batas pengecualiannya dijaga: setiap tombol berisi penuh di
 * direktori ini — `primary` MAUPUN `inverse` — harus menuju `/register`
 * (`tests/button-emphasis.test.ts`).
 *
 * ══ KENAPA PITA PEKAT, DAN KENAPA BARU SEKARANG (#401) ═════════════════════
 * Sampai #401 semua pita halaman ini tint 14–18% pada SATU tingkat kecerahan;
 * tak ada puncak, dan halaman berakhir datar. Kompetitor yang ditinjau
 * menutup dengan satu bidang pekat. `landing.md` §Yang DITOLAK dulu menolak
 * "pita penutup biru pekat dengan teks putih" — dan penolakan itu BENAR untuk
 * yang diukurnya: tangga BIRU AntD (membalik di tema gelap; tidak ada satu
 * anak tangga pun yang lolos di kedua tema) dan `SIDER_BG_DARK` (isian tombol
 * primer terang di atasnya 2,99:1). Navy MEREK adalah token lain dengan
 * angkanya sendiri: `--ant-color-brand-solid` = `#1E3A5F` (terang) /
 * `#2F6FBF` (gelap), putih di atasnya 11,50:1 / 5,06:1. Dokumen itu DIREVISI
 * bersama perubahan ini, dengan angkanya — bukan dilanggar diam-diam.
 *
 * ══ TOMBOLNYA TERBALIK, BUKAN `primary` ════════════════════════════════════
 * Isian primer di atas navy = navy di atas navy (1,00:1 di tema terang):
 * tombolnya lenyap sebagai bidang. `variant="inverse"` (isian putih, label
 * navy — `components/ui/button.tsx`) memberi 11,50:1 / 5,06:1 untuk labelnya
 * dan angka yang sama untuk bidangnya terhadap pita. `primary` DILARANG di
 * berkas ini, dijaga `tests/landing-colors.test.ts`.
 *
 * ══ CATATAN PENENANG: PUTIH 92%, BUKAN 85% ═════════════════════════════════
 * Diukur di kedua tema: 85% putih di atas `#2F6FBF` hanya 4,14:1. 92% adalah
 * kadar terendah yang lolos 4,5:1 (`LANDING_ON_SOLID_MUTED_PCT`).
 */
import {
  LANDING_NOTE,
} from "@/components/landing/landing-scale";
import {
  LandingSection,
  LandingSectionIntro,
} from "@/components/landing/landing-section";
import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";
import { TRIAL_DAYS } from "@/lib/registration";

export async function LandingClosingCta() {
  const t = await getT();

  return (
    <LandingSection center tone="solid">
      <LandingSectionIntro title={t("landing.ctaHeading")} center onSolid>
        {t("landing.ctaBody")}
      </LandingSectionIntro>
      <div style={{ marginTop: "var(--sai-landing-cta-space)" }}>
        <ButtonLink href="/register" size="lg" variant="inverse">
          {t("landing.heroPrimary")}
        </ButtonLink>
      </div>

      {/* Penenang terakhir, tepat di bawah tombolnya — di situlah keraguan
          menit terakhir muncul ("berapa lama saya bisa mencoba", "apa yang
          harus saya pasang").

          ⚠ Angkanya dari `TRIAL_DAYS`, konstanta yang SAMA yang menghitung
          masa uji coba — bukan diketik. Dan tidak ada klaim tambahan di sini:
          "tanpa kartu kredit" TIDAK ditulis, sebab tak ada satu pun kode di
          repo ini yang menjaminnya (`landing.md` §KLAIM HARUS PUNYA SUMBER). */}
      <p
        style={{
          ...LANDING_NOTE,
          marginTop: "var(--ant-margin)",
          fontVariantNumeric: "tabular-nums",
          color: "var(--sai-landing-on-solid-muted)",
        }}
      >
        {t("landing.ctaTrialNote", { days: TRIAL_DAYS })}
      </p>
    </LandingSection>
  );
}
