/**
 * "Pilih perusahaan" — layar yang berdiri di antara masuk dan dasbor bagi
 * pengguna yang memegang lebih dari satu PT (issue #104).
 *
 * KENAPA TIDAK DIPILIHKAN SAJA. Memilihkan otomatis (mis. "yang pertama menurut
 * abjad") terdengar ramah dan justru berbahaya: orang akan mengira ia sedang
 * melihat perusahaan yang biasa dibukanya, lalu mencatat transaksi ke buku yang
 * salah. Di aplikasi akuntansi, kesalahan itu tidak berbunyi saat terjadi — ia
 * muncul berbulan-bulan kemudian sebagai neraca yang tidak cocok. Jadi bila ada
 * lebih dari satu kemungkinan, orangnya yang memilih.
 *
 * Pengguna dengan SATU perusahaan tidak pernah melihat layar ini: pilihannya
 * tidak ambigu, jadi perusahaannya sudah aktif sejak ia masuk (lihat
 * `lib/auth.ts`).
 *
 * Sengaja di grup rute `(auth)`, BUKAN `(dashboard)`: pada titik ini belum ada
 * perusahaan aktif, sedangkan setiap halaman dasbor menuntutnya. Menaruhnya di
 * dalam dasbor akan membuatnya memantul ke dirinya sendiri tanpa henti.
 */
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { auth } from "@/lib/auth";
import { companiesForUser } from "@/lib/company-registry";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { CompanyChoices, SignOutAction } from "./company-choices";

export const dynamic = "force-dynamic";

export default async function SelectCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getT();
  const companies = await companiesForUser(Number.parseInt(session.user.id, 10));

  // Bukan jalan buntu ke arah mana pun:
  //  • satu perusahaan → tidak ada yang perlu dipilih, langsung buka;
  //  • nol perusahaan  → katakan apa adanya, jangan biarkan ia berputar-putar
  //    di aplikasi yang setiap halamannya akan menolaknya.
  if (companies.length === 1 && session.user.companyId === companies[0].companyId) {
    redirect("/dashboard");
  }

  if (companies.length === 0) {
    return (
      <AuthShell
        heading={t("auth.selectCompany.noAccessHeading")}
        description={t("auth.selectCompany.noAccessBody")}
        icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
        footer={<SignOutAction />}
      >
        {/* Keadaan ini hampir selalu berarti akses baru saja dicabut: masuk
            tanpa satu pun keanggotaan sudah ditahan lebih awal di `authorize()`.
            Jadi yang dibutuhkan pembacanya bukan penjelasan tambahan,
            melainkan cara keluar untuk mencoba akun yang lain. */}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("auth.selectCompany.noAccessNext")}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={t("auth.selectCompany.heading")}
      description={t("auth.selectCompany.description")}
      icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
    >
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        {t("auth.selectCompany.body")}
      </p>
      <CompanyChoices
        companies={companies.map((c) => ({ id: c.companyId, name: c.name, slug: c.slug }))}
        activeId={session.user.companyId ?? null}
      />
    </AuthShell>
  );
}
