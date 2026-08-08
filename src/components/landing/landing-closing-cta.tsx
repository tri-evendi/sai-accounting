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
import { LandingSection, LandingSectionIntro } from "@/components/landing/landing-section";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export async function LandingClosingCta() {
  const t = await getT();

  return (
    <LandingSection center>
      <LandingSectionIntro title={t("landing.ctaHeading")} center>
        {t("landing.ctaBody")}
      </LandingSectionIntro>
      <div style={{ marginTop: "var(--sai-landing-cta-space)" }}>
        <Button href="/register" size="lg" variant="primary">
          {t("landing.heroPrimary")}
        </Button>
      </div>
    </LandingSection>
  );
}
