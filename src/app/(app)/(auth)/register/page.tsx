/**
 * `/register` — SERVER component yang memutuskan: formulir, atau penjelasan.
 *
 * ══ KENAPA BERKAS INI ADA (Fase A komersialisasi) ══════════════════════════
 * Halaman ini dulu satu berkas `"use client"` berisi formulirnya sendiri.
 * Formulirnya tidak berubah — ia pindah utuh ke `./register-form.tsx` — dan
 * yang ditambahkan hanyalah satu keputusan yang HARUS diambil di server:
 * **apakah pendaftaran mandiri sedang dibuka?** (`selfServeSignupOpen`,
 * gagal-tertutup; alasannya di `lib/registration.ts`).
 *
 * Komponen client tidak bisa membaca jawabannya: `SELF_SERVE_SIGNUP` adalah
 * environment server, dan menurunkannya sebagai prop publik berarti jawabannya
 * bisa dibaca — lalu dianggap sebagai gerbang — dari peramban. Gerbang yang
 * sebenarnya tetap di route API-nya (`api/auth/register`), yang menolak 403
 * tanpa menyentuh basis data; berkas ini yang menentukan apa yang DILIHAT
 * orang.
 *
 * ══ KENAPA PENJELASAN, BUKAN 404 ATAU PANTULAN ═════════════════════════════
 * Orang yang mendarat di sini datang dari tombol ajakan halaman pendaratan —
 * satu-satunya alasan halaman itu ada. Memulangkan 404 atau memantulkannya ke
 * `/login` mengubah calon pelanggan yang paling bersemangat menjadi pengunjung
 * yang bingung.
 *
 * ══ PINTU MASUK PENAWARAN, BUKAN PEMBERITAHUAN PENOLAKAN ═══════════════════
 * Versi pertama layar ini benar secara fakta dan salah secara bentuk: ia
 * menyambut orang yang BARU MENEKAN "Minta penawaran" dengan judul
 * "Pendaftaran mandiri sedang ditutup". Pengunjung itu tidak sedang ditolak —
 * ia sedang berada di langkah pertama jalur yang memang dipilih (`Fase B`,
 * `docs/KOMERSIALISASI.md` §7). Judul yang mengabarkan sebuah PINTU TERTUTUP
 * kepada orang yang baru saja mengetuk pintu yang BENAR adalah cara kehilangan
 * dia di langkah terakhir.
 *
 * Karena itu yang dipajang sekarang: judul yang sama dengan tombol yang ia
 * tekan ("Minta penawaran"), lalu **tiga langkah prosesnya** — apa yang ia
 * kirim, apa yang ia terima, dan apa yang terjadi sesudah disetujui — lalu
 * kanal kontak yang memang ada (`contactChannels()`). Riset pola pendaratan
 * untuk produk yang dijual lewat penawaran (*Trust & Authority*, *Enterprise
 * Gateway*) menempatkan jalur kontak sebagai AJAKAN UTAMA, bukan sebagai
 * catatan di balik pemberitahuan.
 *
 * ⚠ Tiga langkah itu BUKAN janji waktu. Tidak ada SLA, jam layanan, maupun
 * "dibalas dalam 1×24 jam" — tak ada kode maupun kebijakan tertulis di repo ini
 * yang menjaminnya (§KLAIM HARUS PUNYA SUMBER berlaku di luar pendaratan juga).
 *
 * ══ FORMULIR YANG MENCATAT (migration platform 0016) ═════════════════════
 * Sampai formulir ini ada, layar ini hanya memajang tombol WhatsApp & surel —
 * tidak ada yang tercatat, jadi prospek yang menekan lalu urung mengirim pesan
 * hilang tanpa jejak. Sekarang ajakan UTAMA-nya formulir singkat
 * (`./lead-form.tsx` → `/api/leads` → `lead_requests` → konsol `/leads`), dan
 * tombol WhatsApp/surel/pemesanan demo turun menjadi jalan lain di bawahnya
 * (`outline`): satu primer per layar, dan primernya kini tombol kirim.
 * Sumbernya: `quote` untuk `?quote=1`, `contact_page` selainnya, atau nama
 * tombol dari `?from=<nama>` (disaring `sanitizeLeadSource`).
 *
 * ⚠ Tombol di halaman pendaratan TIDAK diubah, dan itu disengaja: setiap tombol
 * berisi penuh di `components/landing/**` wajib menuju `/register`
 * (`tests/button-emphasis.test.ts` — satu ajakan yang diulang, bukan empat
 * yang bersaing). Menyebarkan "kalau tutup, arahkan ke WhatsApp" ke sepuluh
 * tombol berarti sepuluh tempat yang bisa menyimpang; halaman INI yang
 * menjawabnya, satu kali.
 */

import type { Metadata } from "next";
import { CalendarOutlined, MailOutlined, UserAddOutlined, WhatsAppOutlined } from "@ant-design/icons";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@sai/ui/button";
import { resolveContactChannels, resolveSelfServeSignupOpen } from "@sai/platform/site-settings";
import { getLocale, getT } from "@sai/platform/i18n/server";
import { QUOTE_PARAM } from "@/lib/landing-ask";
import { landingSettings, resolveLandingWhatsappUrl } from "@sai/platform/landing-settings";
import { sanitizeLeadSource } from "@sai/core/lead-request";

import { LeadForm } from "./lead-form";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* Tidak diindeks saat tertutup maupun terbuka: halaman ini bukan permukaan
     pencarian — `/` dan `/pricing` yang mengundang, dan keduanya sudah punya
     metadatanya sendiri. */
  robots: { index: false, follow: true },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* `?quote=1` = pengunjung MEMINTA PENAWARAN (harga publik disembunyikan,
     `quoteContactHref`): layar penawaran dirender walau pendaftaran terbuka.
     Tanpa parameter perilakunya tidak berubah. */
  const params = await searchParams;
  const mintaPenawaran = params[QUOTE_PARAM] !== undefined;
  const terbuka = await resolveSelfServeSignupOpen();
  if (terbuka && !mintaPenawaran) return <RegisterForm />;

  const t = await getT();
  const kanal = await resolveContactChannels();
  /* WhatsApp dengan kalimat pembuka (konsol `/landing`) — tujuan yang sama
     dengan tombol melayang di pendaratan, jadi orang yang datang dari sana
     tidak mendapat dua percakapan yang dibuka dengan cara berbeda. */
  const [waUrl, { demoBookingUrl }] = await Promise.all([
    resolveLandingWhatsappUrl(await getLocale()),
    landingSettings(),
  ]);

  /* Sumber baris `lead_requests`: nama tombol dari `?from=` (disaring), atau
     sumber bawaan layar ini. */
  const from = sanitizeLeadSource(Array.isArray(params.from) ? params.from[0] : params.from);
  const source = from ?? (mintaPenawaran ? "quote" : "contact_page");

  return (
    <AuthShell
      icon={<UserAddOutlined aria-hidden="true" style={{ fontSize: 24 }} />}
      heading={t("auth.register.closedTitle")}
      /* Saat terbuka, kalimat "bukan lewat pendaftaran mandiri" tidak benar —
         kalimat penawarannya sendiri yang dipakai. */
      description={t(terbuka ? "auth.register.quoteBody" : "auth.register.closedBody")}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin)" }}>
        {/* TIGA LANGKAH — bernomor, sebab yang ditanya orang di titik ini
            bukan "apa itu penawaran" melainkan "lalu apa yang terjadi".
            `<ol>` sungguhan: urutannya bagian dari maknanya, jadi ia struktur
            dokumen, bukan tiga baris yang kebetulan berurutan. */}
        <ol
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--ant-margin-xs)",
            margin: 0,
            paddingInlineStart: "var(--ant-padding-lg)",
            fontSize: "var(--ant-font-size)",
            lineHeight: 1.625,
            color: "var(--ant-color-text-secondary)",
          }}
        >
          <li>{t("auth.register.quoteStep1")}</li>
          <li>{t("auth.register.quoteStep2")}</li>
          <li>{t("auth.register.quoteStep3")}</li>
        </ol>

        {/* AJAKAN UTAMA: formulir yang mencatat (lihat kepala berkas). */}
        <LeadForm
          defaultKind={mintaPenawaran ? "quote" : "demo"}
          source={source}
          whatsappBaseUrl={kanal.whatsappUrl}
        />

        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: "var(--ant-font-size-sm)",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          {t("auth.lead.orContact")}
        </p>

        {/* Kanal yang BENAR-BENAR terpasang saja — `contactChannels()`
            memulangkan hanya yang nilainya sah, jadi tidak ada tombol yang
            menjanjikan jalan yang tidak ada. */}
        {waUrl && (
          <Button href={waUrl} target="_blank" rel="noreferrer" variant="outline">
            <WhatsAppOutlined aria-hidden="true" />
            {t("auth.register.closedWhatsapp")}
          </Button>
        )}
        {/* Tautan pemesanan demo (konsol `/landing`) — langkah pertama dari
            tiga di atas, langsung ke kalender. `outline`: tombol kirim formulir
            satu-satunya primer layar ini. https saja, tab baru, tanpa `opener`. */}
        {demoBookingUrl && (
          <Button href={demoBookingUrl} target="_blank" rel="noopener noreferrer" variant="outline">
            <CalendarOutlined aria-hidden="true" />
            {t("auth.register.closedBookDemo")}
          </Button>
        )}
        {kanal.email && (
          <Button href={`mailto:${kanal.email}`} variant="outline">
            <MailOutlined aria-hidden="true" />
            {t("auth.register.closedEmail", { email: kanal.email })}
          </Button>
        )}
        {/* Jalan pulang bagi yang SUDAH punya akun — ia sampai di sini karena
            menekan tombol yang salah, dan tanpa baris ini layar ini menjadi
            jalan buntu baginya. */}
        <Button href="/login" variant="ghost">
          {t("auth.register.closedSignIn")}
        </Button>
      </div>
    </AuthShell>
  );
}
