/**
 * "Aplikasi belum disiapkan" — layar untuk pengguna yang TIDAK berhak
 * menjalankan wizard setup.
 *
 * Kenapa halaman tersendiri, bukan sekadar mengarahkan semua orang ke
 * `/setup`: wizard dijaga izin `setup.manage`. Melempar staf biasa ke sana
 * hanya menghasilkan penolakan izin — pesan yang menyalahkan mereka atas
 * keadaan yang bukan urusan mereka. Layar ini menjelaskan apa yang terjadi dan
 * siapa yang bisa menyelesaikannya.
 *
 * Sengaja berada di grup rute `(auth)`, BUKAN `(dashboard)`: ini keadaan
 * pra-aplikasi (seperti halaman masuk), dan yang lebih penting — tata letak
 * dashboard menuntut sesi serta chrome penuh yang justru belum bermakna
 * sebelum perusahaan disiapkan. Karena di luar `(dashboard)`, halaman ini juga
 * tidak memanggil `requirePagePermission()`, jadi tidak mungkin memantul ke
 * dirinya sendiri.
 *
 * Halaman ini menjaga dirinya sendiri agar tidak jadi jalan buntu: kalau
 * ternyata setup SUDAH selesai, atau pembukanya memang berhak menjalankan
 * wizard, ia mengarahkan ke tujuan yang benar.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

import { auth } from "@/lib/auth";
import { canEffective } from "@/lib/authz-effective";
import { isSetupDone } from "@/lib/setup-gate";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";

/*
 * ── Warna (issue #200) ─────────────────────────────────────────────────────
 * Server component di dalam `AuthShell` yang belum dikonversi: tanpa `antd`,
 * dan tanpa satu pun komponen AntD di atasnya sehingga variabel `--ant-…`
 * tidak teratasi (#227). Kalimatnya memakai token `:root` aplikasi — token yang
 * sama dengan kulitnya, jadi keduanya tidak bisa berpisah warna. Tombolnya
 * mewarnai dirinya sendiri lewat primitif `Button`.
 */

/** Kalimat penjelas — bekas `text-sm leading-relaxed text-muted-foreground`. */
const BODY_TEXT: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.625,
  color: "var(--muted-foreground)",
};

/** Kaki kartu — bekas `mt-6 border-t border-border pt-5`. */
const EXIT_ROW: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 20,
  borderTop: "1px solid var(--border)",
};

export default async function SetupRequiredPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  /*
   * Tanpa perusahaan aktif, layar ini tidak punya pertanyaan untuk dijawab
   * (issue #104): "sudah disiapkan atau belum" selalu tentang SATU perusahaan,
   * dan tanpa itu setiap pembacaannya akan melempar. Pengguna dikirim memilih
   * dulu — bukan dibiarkan bertemu galat yang tidak menjelaskan apa pun.
   */
  if (session.user.companyId == null) redirect("/select-company");

  // Bukan jalan buntu: kedua keadaan di bawah membuat halaman ini tak relevan.
  if (await isSetupDone()) redirect("/dashboard");
  if (await canEffective(session.user, "setup.manage")) redirect("/setup");

  const t = await getT();

  return (
    <AuthShell
      heading={t("auth.setupRequired.heading")}
      description={t("auth.setupRequired.description")}
      icon={<Lock size={20} aria-hidden="true" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={BODY_TEXT}>{t("auth.setupRequired.body")}</p>
        <p style={BODY_TEXT}>{t("auth.setupRequired.whoCanFix")}</p>
      </div>

      {/*
       * Jalan keluar dari layar tunggu.
       *
       * Halaman ini TIDAK memantau sendiri: ia server component yang memeriksa
       * ulang setiap kali dirender, lalu mengarahkan ke beranda begitu setup
       * selesai. Tanpa tautan ini, staf yang menunggu sementara pimpinan
       * mengisi wizard tidak punya cara jelas untuk mencoba lagi selain menebak
       * bahwa halaman perlu dimuat ulang.
       *
       * Sengaja tautan biasa, bukan polling: menambah komponen client yang
       * menghubungi server tiap beberapa detik hanya untuk keadaan yang muncul
       * sekali seumur pemasangan jelas tidak sepadan. Menekan tautan ini
       * menuju beranda, gerbang berjalan lagi, dan hasilnya benar ke dua arah.
       */}
      <div style={EXIT_ROW}>
        <Button asChild variant="outline" style={{ width: "100%" }}>
          <Link href="/dashboard">{t("auth.setupRequired.retry")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
