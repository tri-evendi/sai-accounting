/**
 * TANGKAPAN LAYAR UNGGAHAN — pengganti purwarupa yang digambar kode, HANYA
 * bila operator mengunggahnya (konsol `/landing/media`, migration platform
 * 0015).
 *
 * Tanpa unggahan, `LandingHeroMock` dan `LandingGallery` tetap tampil persis
 * seperti sebelumnya — keduanya dirender, mengikuti tema & bahasa, dan
 * dijaga penjaga angka; tangkapan layar tidak. Karena itu tangkapan layar
 * adalah PILIHAN operator, bukan pengganti bawaan.
 *
 * Teks alternatif wajib (bahasa Indonesia; bahasa lain jatuh ke sana): ini
 * gambar yang memikul isi, bukan hiasan.
 */
import { LANDING_SURFACE } from "@/components/landing/landing-scale";
import { landingImageUrl, type LandingScreenshot } from "@sai/core/landing-media";
import { localizedText } from "@sai/core/landing-settings";
import type { Locale } from "@sai/core/i18n/config";

const BINGKAI: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  borderRadius: "var(--sai-landing-radius)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: LANDING_SURFACE,
  boxShadow: "var(--ant-box-shadow)",
};

function Layar({ shot, locale, eager = false }: { shot: LandingScreenshot; locale: Locale; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- rute sendiri, pola `BrandMark`.
    <img
      src={landingImageUrl(shot.image)}
      alt={localizedText(shot.alt, locale)}
      width={shot.image.width}
      height={shot.image.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      style={BINGKAI}
    />
  );
}

/** Gambar utama hero — dimuat segera (di atas lipatan). */
export function LandingHeroScreenshot({ shot, locale }: { shot: LandingScreenshot; locale: Locale }) {
  return <Layar shot={shot} locale={locale} eager />;
}

/** Galeri tangkapan layar di seksi modul. */
export function LandingScreenGallery({ shots, locale }: { shots: LandingScreenshot[]; locale: Locale }) {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        marginTop: "var(--sai-landing-rhythm)",
        padding: 0,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        gap: "var(--ant-margin-lg)",
      }}
    >
      {shots.map((shot) => (
        <li key={shot.image.id}>
          <Layar shot={shot} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
