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
 * Orang yang mendarat di sini datang dari tombol "Coba gratis" di halaman
 * pendaratan — satu-satunya alasan halaman pendaratan itu ada. Memulangkan 404
 * atau memantulkannya ke `/login` mengubah calon pelanggan yang paling
 * bersemangat menjadi pengunjung yang bingung.
 *
 * Yang dipajang karena itu: kalimat yang menyebut keadaannya apa adanya
 * ("pendaftaran mandiri sedang ditutup"), lalu **jalan yang masih terbuka** —
 * kanal kontak yang sudah ada (`contactChannels()`), yaitu persis jalur
 * penawaran yang dipilih Fase B (`docs/KOMERSIALISASI.md` §7). Jadi sakelar
 * yang menutup pendaftaran tidak menutup penjualan; ia memindahkannya ke
 * meja manusia.
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
import { contactChannels } from "@/lib/contact-channels";
import { getT } from "@/lib/i18n/server";
import { selfServeSignupOpen } from "@/lib/registration";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* Tidak diindeks saat tertutup maupun terbuka: halaman ini bukan permukaan
     pencarian — `/` dan `/pricing` yang mengundang, dan keduanya sudah punya
     metadatanya sendiri. */
  robots: { index: false, follow: true },
};

export default async function RegisterPage() {
  if (selfServeSignupOpen()) return <RegisterForm />;

  const t = await getT();
  const kanal = contactChannels();

  return (
    <AuthShell
      icon={<UserAddOutlined aria-hidden="true" style={{ fontSize: 24 }} />}
      heading={t("auth.register.closedTitle")}
      description={t("auth.register.closedBody")}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin)" }}>
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
