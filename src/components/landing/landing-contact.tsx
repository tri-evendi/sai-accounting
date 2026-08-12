/**
 * Seksi "hubungi kami" — formulir, dan satu-satunya formulir di pendaratan.
 *
 * ══ KENAPA BUKAN PRIMITIF `Form` APLIKASI ══════════════════════════════════
 * Pola formulir aplikasi ini `react-hook-form` + `zod` lewat `Form`, dan pola
 * itu KLIEN. Memakainya di sini akan menaikkan `AMBANG_KLIEN` demi satu
 * formulir yang dipakai sebagian kecil pengunjung — sementara halaman ini
 * justru dibaca orang yang belum tentu pernah mendaftar. Yang dipakai adalah
 * `<form action={serverAction}>`: ia bekerja TANPA JavaScript sama sekali,
 * validasinya tetap `zod` (di server, lihat `lib/contact-actions.ts`), dan
 * pendaratan tetap nol komponen klien.
 *
 * ══ ISIANNYA TELANJANG, DAN ITU DISENGAJA ══════════════════════════════════
 * `Input`/`Textarea` milik `components/ui` adalah komponen AntD — komponen
 * klien. Isian di bawah karena itu `<input>`/`<textarea>` biasa yang digayakan
 * dengan token yang SAMA (`controlHeight`, radius, tepi, warna), jadi rupanya
 * sejalan dengan aplikasi tanpa menyeret satu byte JavaScript pun.
 *
 * ══ ALAMAT TUJUAN BELUM DISETEL = TANPA FORMULIR ═══════════════════════════
 * `PLATFORM_CONTACT_EMAIL` tidak punya nilai bawaan (lihat kedua `.env*.example`).
 * Merender formulir yang kiriman­nya tidak menuju ke mana pun lebih buruk
 * daripada tidak punya formulir: orang menulis pesan, menekan kirim, dan
 * mengira ada yang membacanya. Dalam keadaan itu seksinya menampilkan kalimat
 * apa adanya — pola yang sama dengan kartu paket rundingan.
 */
import { LANDING_NOTE, landingFill } from "@/components/landing/landing-scale";
import {
  LandingSection,
  LandingSectionIntro,
} from "@/components/landing/landing-section";
import { Button } from "@/components/ui/button";
import type { ContactOutcome } from "@/lib/contact-actions";
import { kirimPesanKontak } from "@/lib/contact-actions";
import { getT } from "@/lib/i18n/server";

/** Isian: tinggi & radius kendali aplikasi, tanpa komponen AntD. */
const FIELD: React.CSSProperties = {
  width: "100%",
  minHeight: 40,
  borderRadius: "var(--sai-landing-radius-control)",
  border: "1px solid var(--ant-color-border)",
  background: "var(--ant-color-bg-container)",
  color: "var(--ant-color-text)",
  paddingInline: "var(--ant-padding-sm)",
  paddingBlock: "var(--ant-padding-xs)",
  fontSize: "var(--ant-font-size)",
  fontFamily: "inherit",
};

const LABEL: React.CSSProperties = {
  display: "block",
  marginBottom: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  fontWeight: "var(--ant-font-weight-strong)",
};

/** Pita hasil kiriman — nadanya mengikuti arti, bukan sekadar warna. */
function Hasil({ outcome, pesan }: { outcome: ContactOutcome; pesan: string }) {
  const berhasil = outcome === "terkirim";
  return (
    <p
      role="status"
      style={{
        margin: 0,
        marginBottom: "var(--ant-margin)",
        borderRadius: "var(--sai-landing-radius)",
        border: `1px solid ${
          berhasil
            ? "var(--ant-color-success-border)"
            : "var(--ant-color-warning-border)"
        }`,
        background: berhasil
          ? "var(--ant-color-success-bg)"
          : "var(--ant-color-warning-bg)",
        padding: "var(--ant-padding-sm)",
        fontSize: "var(--ant-font-size)",
      }}
    >
      {pesan}
    </p>
  );
}

export async function LandingContact({
  outcome,
}: {
  outcome?: ContactOutcome;
}) {
  const t = await getT();
  const tujuanAda = Boolean(process.env.PLATFORM_CONTACT_EMAIL?.trim());

  const pesanHasil: Record<ContactOutcome, string> = {
    terkirim: t("landing.contactSent"),
    gagal: t("landing.contactFailed"),
    takbenar: t("landing.contactInvalid"),
    "terlalu-sering": t("landing.contactThrottled"),
  };

  return (
    <LandingSection id="kontak">
      <LandingSectionIntro
        eyebrow={t("landing.contactEyebrow")}
        title={t("landing.contactHeading")}
      >
        {t("landing.contactBody")}
      </LandingSectionIntro>

      <div
        style={{
          maxWidth: "var(--sai-landing-measure-narrow)",
          marginTop: "var(--ant-margin-lg)",
          borderRadius: "var(--sai-landing-radius)",
          background: landingFill("brand"),
          padding: "var(--ant-padding-lg)",
        }}
      >
        {outcome !== undefined && (
          <Hasil outcome={outcome} pesan={pesanHasil[outcome]} />
        )}

        {tujuanAda ? (
          <form
            action={kirimPesanKontak}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--ant-margin)",
            }}
          >
            <div>
              <label htmlFor="kontak-nama" style={LABEL}>
                {t("landing.contactName")}
              </label>
              <input
                id="kontak-nama"
                name="nama"
                required
                maxLength={120}
                autoComplete="name"
                style={FIELD}
              />
            </div>

            <div>
              <label htmlFor="kontak-surel" style={LABEL}>
                {t("landing.contactEmail")}
              </label>
              <input
                id="kontak-surel"
                name="surel"
                type="email"
                required
                maxLength={200}
                autoComplete="email"
                style={FIELD}
              />
            </div>

            <div>
              <label htmlFor="kontak-pesan" style={LABEL}>
                {t("landing.contactMessage")}
              </label>
              <textarea
                id="kontak-pesan"
                name="pesan"
                required
                minLength={10}
                maxLength={4000}
                rows={5}
                style={{ ...FIELD, minHeight: 120, resize: "vertical" }}
              />
            </div>

            {/* ══ PERANGKAP MADU ═══════════════════════════════════════════
                Bot pengisi-otomatis mengisi setiap isian yang ditemukannya;
                manusia tidak pernah melihat yang ini.

                Disembunyikan lewat `[data-landing-honeypot]` di blok gaya —
                BUKAN `type="hidden"`, sebab sebagian bot melewati isian
                tersembunyi justru karena tahu itu perangkap. `aria-hidden` +
                `tabIndex={-1}` menjaganya tidak pernah difokuskan pengguna
                papan ketik maupun dibacakan pembaca layar. */}
            <input
              data-landing-honeypot=""
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            {/* ⚠ `outline`, BUKAN `primary` — dan penjaga yang menemukannya.
                `tests/button-emphasis.test.ts` menuntut setiap tombol primer di
                `components/landing/**` menuju `/register`; tombol kirim tidak
                menuju ke mana pun. Aturan itu benar secara desain juga:
                pengecualian pendaratan sah karena ajakannya SATU yang diulang,
                dan tombol kirim berisi penuh akan menjadi ajakan KEDUA yang
                bersaing dengannya di halaman yang sama. */}
            <div data-landing-actions="">
              <Button type="submit" variant="outline">
                {t("landing.contactSubmit")}
              </Button>
            </div>
          </form>
        ) : (
          <p style={LANDING_NOTE}>{t("landing.contactUnavailable")}</p>
        )}
      </div>
    </LandingSection>
  );
}
