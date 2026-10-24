/**
 * BUKTI SOSIAL halaman depan — testimoni, logo klien, mitra resmi (konsol
 * `/landing/media`, migration platform 0015).
 *
 * ══ HANYA BILA ADA ═════════════════════════════════════════════════════════
 * Setiap seksi di sini memulangkan `null` bila tidak ada SATU pun butir yang
 * DITERBITKAN — bukan judul dengan kisi kosong, dan bukan contoh karangan.
 * Klaim tanpa sumber dilarang di halaman ini (`landing.md` §KLAIM HARUS PUNYA
 * SUMBER); testimoni yang belum ada tidak boleh diwakili apa pun. Tidak diatur
 * / platform tak terjangkau = tidak ada seksi, persis perilaku sebelumnya.
 *
 * ══ GAMBAR ═════════════════════════════════════════════════════════════════
 * `<img>`, bukan `next/image` — pola `BrandMark`: rute `/brand/landing/<id>`
 * sudah menyajikan berkas yang divalidasi, tanpa metadata, dengan sidik di
 * kueri (cache selamanya). `width`/`height` dari baris gambarnya, jadi tata
 * letak tidak melompat saat gambar tiba. `loading="lazy"` — semua seksi ini di
 * bawah lipatan.
 *
 * ⚠ Tidak ada data tenant di sini. Nama mitra adalah yang DIKETIK operator
 * untuk halaman publik; kolom `tenants.referred_by_partner` hanya dirujuk di
 * konsol sebagai pengingat, tidak pernah dibaca halaman ini.
 */
import {
  LANDING_BODY,
  LANDING_NOTE,
  landingFillSoft,
  landingGrid,
} from "@/components/landing/landing-scale";
import { LandingSection, LandingSectionIntro } from "@/components/landing/landing-section";
import { Card, CardContent } from "@sai/ui/card";
import { getLocale, getT } from "@sai/platform/i18n/server";
import { landingMedia } from "@sai/platform/landing-settings";
import { localizedText } from "@sai/core/landing-settings";
import { landingImageUrl, published, type LandingImageRef } from "@sai/core/landing-media";

/** Gambar unggahan, ukuran tampil dibatasi tinggi; rasio asli dipertahankan. */
function Gambar({
  src,
  alt,
  height,
  round = false,
}: {
  src: LandingImageRef;
  alt: string;
  height: number;
  round?: boolean;
}) {
  const width = round ? height : Math.round((src.width / src.height) * height);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- rute sendiri, pola `BrandMark`.
    <img
      src={landingImageUrl(src)}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      style={{
        width,
        height,
        maxWidth: "100%",
        objectFit: round ? "cover" : "contain",
        borderRadius: round ? "50%" : undefined,
        flexShrink: 0,
      }}
    />
  );
}

/** Tautan keluar opsional — tab baru, tanpa `opener`/perujuk. */
function MungkinTautan({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-landing-link="" style={{ color: "inherit" }}>
      {children}
    </a>
  );
}

/* ── Logo klien — strip tipis sesudah pahlawan ───────────────────────────── */

export async function LandingClientLogos() {
  const logos = published((await landingMedia()).clientLogos);
  if (logos.length === 0) return null;
  const t = await getT();

  return (
    <section
      aria-label={t("landing.clientLogosHeading")}
      style={{
        width: "100%",
        maxWidth: "var(--sai-landing-measure)",
        marginInline: "auto",
        paddingInline: "var(--sai-landing-gutter)",
        paddingBlock: "var(--ant-padding-lg)",
      }}
    >
      <p style={{ ...LANDING_NOTE, margin: 0, textAlign: "center" }}>{t("landing.clientLogosHeading")}</p>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          marginTop: "var(--ant-margin)",
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--ant-margin-lg)",
        }}
      >
        {logos.map((logo) => (
          <li key={logo.key}>
            <MungkinTautan href={logo.href}>
              <Gambar src={logo.logo} alt={logo.name} height={40} />
            </MungkinTautan>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Testimoni ─────────────────────────────────────────────────────────────── */

export async function LandingTestimonials() {
  const items = published((await landingMedia()).testimonials);
  if (items.length === 0) return null;
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  return (
    <LandingSection id="testimoni">
      <LandingSectionIntro eyebrow={t("landing.eyebrowTestimonials")} title={t("landing.testimonialsHeading")} />
      <ul
        style={{
          ...landingGrid(3, 260),
          listStyle: "none",
          margin: 0,
          marginTop: "var(--ant-margin-lg)",
          padding: 0,
        }}
      >
        {items.map((item) => (
          <li key={item.key}>
            <Card
              data-landing-card=""
              style={{
                height: "100%",
                background: landingFillSoft("brand"),
                borderRadius: "var(--sai-landing-radius)",
                border: "none",
              }}
            >
              <CardContent>
                <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: "var(--ant-margin)" }}>
                  <blockquote style={{ ...LANDING_BODY, margin: 0, fontSize: "var(--ant-font-size-lg)" }}>
                    “{localizedText(item.quote, locale)}”
                  </blockquote>
                  <figcaption style={{ display: "flex", alignItems: "center", gap: "var(--ant-margin-sm)" }}>
                    {item.photo && <Gambar src={item.photo} alt="" height={44} round />}
                    <span>
                      <strong style={{ display: "block" }}>{item.name}</strong>
                      {item.role && (
                        <span style={{ ...LANDING_NOTE, fontSize: "var(--ant-font-size-sm)" }}>{item.role}</span>
                      )}
                    </span>
                  </figcaption>
                </figure>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}

/* ── Mitra resmi ───────────────────────────────────────────────────────────── */

export async function LandingPartners() {
  const items = published((await landingMedia()).partners);
  if (items.length === 0) return null;
  const t = await getT();

  return (
    <LandingSection id="mitra">
      <LandingSectionIntro eyebrow={t("landing.eyebrowPartners")} title={t("landing.partnersHeading")}>
        {t("landing.partnersBody")}
      </LandingSectionIntro>
      <ul
        style={{
          ...landingGrid(3, 240),
          listStyle: "none",
          margin: 0,
          marginTop: "var(--ant-margin-lg)",
          padding: 0,
        }}
      >
        {items.map((item) => (
          <li key={item.key}>
            <Card
              data-landing-card=""
              style={{
                height: "100%",
                background: landingFillSoft("cyan"),
                borderRadius: "var(--sai-landing-radius)",
                border: "none",
              }}
            >
              <CardContent style={{ display: "flex", alignItems: "center", gap: "var(--ant-margin)" }}>
                {item.logo && <Gambar src={item.logo} alt="" height={40} />}
                <div>
                  <strong style={{ display: "block" }}>
                    <MungkinTautan href={item.href}>{item.name}</MungkinTautan>
                  </strong>
                  <span style={{ ...LANDING_NOTE, fontSize: "var(--ant-font-size-sm)" }}>{item.city}</span>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
