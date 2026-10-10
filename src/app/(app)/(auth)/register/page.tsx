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
 * ⚠ Tombol di halaman pendaratan TIDAK diubah, dan itu disengaja: setiap tombol
 * berisi penuh di `components/landing/**` wajib menuju `/register`
 * (`tests/button-emphasis.test.ts` — satu ajakan yang diulang, bukan empat
 * yang bersaing). Menyebarkan "kalau tutup, arahkan ke WhatsApp" ke sepuluh
 * tombol berarti sepuluh tempat yang bisa menyimpang; halaman INI yang
 * menjawabnya, satu kali.
 */

import type { Metadata } from "next";
import { MailOutlined, UserAddOutlined, WhatsAppOutlined } from "@ant-design/icons";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { resolveContactChannels, resolveSelfServeSignupOpen } from "@/lib/site-settings";
import { getT } from "@/lib/i18n/server";

import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* Tidak diindeks saat tertutup maupun terbuka: halaman ini bukan permukaan
     pencarian — `/` dan `/pricing` yang mengundang, dan keduanya sudah punya
     metadatanya sendiri. */
  robots: { index: false, follow: true },
};

export default async function RegisterPage() {
  if (await resolveSelfServeSignupOpen()) return <RegisterForm />;

  const t = await getT();
  const kanal = await resolveContactChannels();

  return (
    <AuthShell
      icon={<UserAddOutlined aria-hidden="true" style={{ fontSize: 24 }} />}
      heading={t("auth.register.closedTitle")}
      description={t("auth.register.closedBody")}
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

        {/* Kanal yang BENAR-BENAR terpasang saja — `contactChannels()`
            memulangkan hanya yang nilainya sah, jadi tidak ada tombol yang
            menjanjikan jalan yang tidak ada. */}
        {kanal.whatsappUrl && (
          <Button href={kanal.whatsappUrl} target="_blank" rel="noreferrer" variant="primary">
            <WhatsAppOutlined aria-hidden="true" />
            {t("auth.register.closedWhatsapp")}
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
