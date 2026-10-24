/**
 * BILAH PENGUMUMAN di puncak halaman pemasaran (`/`, `/pricing`) — diatur
 * operator di konsol `/landing`.
 *
 * ══ KAPAN TAMPIL ═══════════════════════════════════════════════════════════
 * Hanya bila (1) dinyalakan, (2) `now` di dalam jendela [mulai, akhir) yang
 * disetel — keduanya opsional — dan (3) pengunjung ini belum menutup
 * pengumuman YANG SAMA. Aturan (1)+(2) satu fungsi murni teruji
 * (`isAnnouncementActive`); tidak diatur / platform tak terjangkau = tidak ada
 * bilah, persis perilaku sebelumnya.
 *
 * ══ DITUTUP PER PENGUNJUNG, TANPA FLASH ════════════════════════════════════
 * Tombol tutup (daun client satu-satunya di sini) menulis cookie berisi SIDIK
 * pengumuman dan menyembunyikan bilahnya seketika. Server membaca cookie itu
 * pada muatan berikutnya dan tidak merender bilahnya sama sekali — jadi tidak
 * ada bilah yang muncul sekejap lalu hilang. Sidik berubah begitu teks,
 * tautan, atau jendelanya berubah: pengumuman BARU tampil lagi bagi yang
 * menutup yang lama. Halaman pemasaran sudah `force-dynamic`, jadi membaca
 * cookie tidak mengubah cara halamannya dirender.
 *
 * ══ KONTRAS ════════════════════════════════════════════════════════════════
 * Isian `--ant-color-brand-solid` + teks `--ant-color-text-light-solid`:
 * pasangan yang sama dengan tombol WhatsApp melayang, terukur 11,50:1 (terang)
 * · 5,06:1 (gelap) — di atas 4,5:1 untuk teks biasa di kedua tema. Tautannya
 * bergaris bawah, jadi ia tidak dibedakan oleh warna saja.
 */
import Link from "next/link";
import { cookies } from "next/headers";

import { LandingAnnouncementDismiss } from "@/components/landing/landing-announcement-dismiss";
import { getLocale, getT } from "@sai/platform/i18n/server";
import { landingSettings } from "@sai/platform/landing-settings";
import {
  ANNOUNCEMENT_DISMISS_COOKIE,
  announcementFingerprint,
  isAnnouncementActive,
  isInternalHref,
  localizedText,
} from "@sai/core/landing-settings";

/** Cookie penutup yang dikirim peramban, atau `null` (di luar konteks permintaan pun). */
async function sidikDitutup(): Promise<string | null> {
  try {
    return (await cookies()).get(ANNOUNCEMENT_DISMISS_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

const LINK_STYLE: React.CSSProperties = {
  color: "inherit",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  fontWeight: "var(--ant-font-weight-strong)",
  whiteSpace: "nowrap",
};

export async function LandingAnnouncement({ now = new Date() }: { now?: Date } = {}) {
  const { announcement } = await landingSettings();
  if (!announcement || !isAnnouncementActive(announcement, now)) return null;

  const sidik = announcementFingerprint(announcement);
  if ((await sidikDitutup()) === sidik) return null;

  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const teks = localizedText(announcement.text, locale);
  const href = announcement.href;

  return (
    <div
      role="region"
      aria-label={t("landing.announcementLabel")}
      data-landing-announcement=""
      style={{
        background: "var(--ant-color-brand-solid)",
        color: "var(--ant-color-text-light-solid)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--ant-margin-xs)",
          width: "100%",
          maxWidth: "var(--sai-landing-measure)",
          marginInline: "auto",
          paddingInline: "var(--sai-landing-gutter)",
          paddingBlock: "var(--ant-padding-xxs)",
          fontSize: "var(--ant-font-size)",
          lineHeight: 1.5,
        }}
      >
        <p style={{ margin: 0, flex: 1, textAlign: "center" }}>
          {teks}
          {href && (
            <>
              {" "}
              {isInternalHref(href) ? (
                <Link href={href} style={LINK_STYLE}>
                  {t("landing.announcementMore")} →
                </Link>
              ) : (
                <a href={href} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
                  {t("landing.announcementMore")} →
                </a>
              )}
            </>
          )}
        </p>
        <LandingAnnouncementDismiss fingerprint={sidik} label={t("landing.announcementDismiss")} />
      </div>
    </div>
  );
}
