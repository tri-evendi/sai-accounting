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
      icon={<Lock className="h-5 w-5" aria-hidden="true" />}
    >
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>{t("auth.setupRequired.body")}</p>
        <p>{t("auth.setupRequired.whoCanFix")}</p>
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
      <div className="mt-6 border-t border-border pt-5">
        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard">{t("auth.setupRequired.retry")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
