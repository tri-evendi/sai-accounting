/**
 * Ajakan penutup — pengulangan aksi utama di ujung gulungan.
 *
 * Ini dimensi kedua "pemasaran" (bobot CTA, lihat `landing-scale.ts`): aksi
 * yang SAMA muncul tiga kali di halaman ini — hero, tiap kartu paket, dan di
 * sini — karena orang yang membaca sampai bawah tidak boleh disuruh menggulung
 * balik untuk menemukan tombolnya. Di app internal pengulangan seperti itu
 * justru cacat: aksi utama muncul sekali, di `PageHeader.actions`.
 *
 * Teksnya memakai kunci yang sama dengan tombol hero (`landing.heroPrimary`) —
 * satu janji, satu kalimat. Dua kalimat untuk tombol yang menuju tempat yang
 * sama akan berbeda pada hari salah satunya disunting.
 *
 * Justru pengulangan itulah yang membuat #267 TIDAK berlaku di sini: aturan
 * "satu aksi utama per layar" melarang banyak ajakan BERBEDA, dan halaman ini
 * hanya punya satu ajakan yang muncul berkali-kali. Batas pengecualiannya
 * dijaga: setiap tombol primer di direktori ini harus menuju `/register`
 * (`tests/button-emphasis.test.ts`).
 */
import { LANDING_NOTE } from "@/components/landing/landing-scale";
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
    /* Nada `accent` (16%) dipakai TEPAT SEKALI di halaman ini, di sini —
       nada terkuat kehilangan artinya kalau ia muncul dua kali. Ia masih
       memikul tombol primer, jadi kadarnya dibatasi ambang 3:1 terhadap isian
       tombol di tema gelap (terukur 3,11:1); lihat `landing-scale.ts`. */
    <LandingSection center tone="accent">
      <LandingSectionIntro title={t("landing.ctaHeading")} center>
        {t("landing.ctaBody")}
      </LandingSectionIntro>
      <div style={{ marginTop: "var(--sai-landing-cta-space)" }}>
        <ButtonLink href="/register" size="lg" variant="primary">
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
        }}
      >
        {t("landing.ctaTrialNote", { days: TRIAL_DAYS })}
      </p>
    </LandingSection>
  );
}
