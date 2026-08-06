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
 *
 * ── Warna di berkas ini (issue #203) ─────────────────────────────────────
 * Server component, jadi tanpa `antd` dan tanpa `theme.useToken()`. Kalimat
 * penjelasnya karena itu memakai variabel token AntD, dan itu SAH walau tak
 * ada satu pun komponen AntD di atasnya: sejak #227 kelas `ANTD_CSS_VAR_KEY`
 * ("sai-tokens") dipikul `<html>` oleh root layout — bukan oleh elemen yang
 * digambar komponen AntD — sehingga `var(--ant-…)` teratasi di seluruh
 * dokumen. Token `:root` aplikasi bukan lagi pilihan: #203 mencabutnya dari
 * `globals.css`, dan `AuthShell` pun kini berdiri di atas token AntD, jadi
 * kulit dan isinya tetap tidak bisa berpisah warna. Tombolnya sendiri sudah
 * mewarnai dirinya (primitif `Button`).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusOutlined, ShopOutlined, UserOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";

import { auth } from "@/lib/auth";
import { companiesForUser } from "@/lib/company-registry";
import { tenantCan } from "@/lib/tenant-authz";
import { tenantMembershipForUser } from "@/lib/tenant-directory";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignedInAs } from "@/components/auth/signed-in-as";
import { CompanyChoices } from "./company-choices";

export const dynamic = "force-dynamic";

/** `space-y-3` / `space-y-4` di kaki & badan kartu. */
const STACK_SM = 12;
const STACK_MD = 16;
/** `mb-5` di bawah kalimat pembuka daftar. */
const LEAD_BOTTOM = 20;

/** Kalimat penjelas — `text-sm leading-relaxed text-muted-foreground`. */
const BODY_TEXT: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

const FULL_WIDTH: React.CSSProperties = { width: "100%" };

export default async function SelectCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getT();
  const userId = Number.parseInt(session.user.id, 10);
  const companies = await companiesForUser(userId);

  /*
   * "Tambah Perusahaan" — izin TINGKAT TENANT (issue #135), dijawab
   * keanggotaan tenant si pengguna, TANPA menuntut perusahaan aktif. Inilah
   * yang memecah ayam-dan-telur yang dulu tercatat di komentar halaman ini:
   * izin lama milik keanggotaan di satu PT, jadi tautannya baru muncul setelah
   * ada perusahaan aktif — padahal pemilik tenant TANPA satu pun PT justru
   * orang yang paling membutuhkan pintunya.
   */
  const tenantMembership = await tenantMembershipForUser(userId);
  const canCreate = tenantCan(tenantMembership, "company.create");
  /*
   * Halaman akun `/platform` (issue #172, dulu `/tenant` berpenjaga owner).
   * Sejak ia menjadi pendaratan pasca-masuk, SETIAP anggota tenant boleh
   * membukanya — isinya yang dipisah menurut kewenangan, bukan pintunya.
   */
  const canOpenPlatform = tenantCan(tenantMembership, "tenant.home");

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
        heading={t(
          canCreate
            ? "auth.selectCompany.noCompanyYetHeading"
            : "auth.selectCompany.noAccessHeading"
        )}
        description={t(
          canCreate ? "auth.selectCompany.noCompanyYetBody" : "auth.selectCompany.noAccessBody"
        )}
        icon={<ShopOutlined aria-hidden="true" style={{ fontSize: 20 }} />}
        footer={<SignedInAs name={session.user.name} />}
      >
        {/* Untuk pengguna BIASA keadaan ini hampir selalu berarti akses baru
            saja dicabut (masuk tanpa satu pun keanggotaan sudah ditahan lebih
            awal di `authorize()`), jadi yang ia butuhkan adalah jalan keluar.
            Untuk OWNER/ADMIN TENANT (issue #135) keadaan yang sama berarti
            hal lain: belum ada PT sama sekali — dan jalan keluarnya adalah
            MEMBUAT yang pertama, bukan menghubungi siapa-siapa. */}
        {canCreate ? (
          <div style={{ display: "flex", flexDirection: "column", gap: STACK_MD }}>
            <p style={BODY_TEXT}>{t("auth.selectCompany.noCompanyYetOwner")}</p>
            <Button asChild style={FULL_WIDTH}>
              <Link href="/companies/new">
                <PlusOutlined aria-hidden="true" />
                {t("companies.newTitle")}
              </Link>
            </Button>
          </div>
        ) : (
          <p style={BODY_TEXT}>{t("auth.selectCompany.noAccessNext")}</p>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={t("auth.selectCompany.heading")}
      description={t("auth.selectCompany.description")}
      icon={<ShopOutlined aria-hidden="true" style={{ fontSize: 20 }} />}
      footer={
        /*
         * KELUAR HARUS ADA DI SINI, dan ini bukan kelengkapan kosmetik.
         *
         * Layar ini berdiri SEBELUM aplikasi: tidak ada menu samping, tidak
         * ada menu avatar, tidak ada satu pun chrome. Tanpa tombol di bawah
         * ini, satu-satunya tindakan yang mungkin dilakukan pengunjungnya
         * adalah membuka salah satu perusahaan — termasuk ketika yang sedang
         * masuk ternyata AKUN YANG SALAH (komputer bersama, sesi rekan kerja
         * yang belum ditutup). Jalan keluarnya cuma menghapus cookie, dan tidak
         * ada pengguna awam yang tahu caranya.
         *
         * Karena itu identitasnya ikut ditulis: "keluar" hanya berguna kalau
         * orangnya lebih dulu SADAR ia masuk sebagai siapa.
         */
        <div style={{ display: "flex", flexDirection: "column", gap: STACK_SM }}>
          {canCreate && (
            <Button asChild variant="outline" style={FULL_WIDTH}>
              <Link href="/companies/new">
                <PlusOutlined aria-hidden="true" />
                {t("companies.newTitle")}
              </Link>
            </Button>
          )}
          {canOpenPlatform && (
            <Button asChild variant="outline" style={FULL_WIDTH}>
              <Link href="/platform">
                <UserOutlined aria-hidden="true" />
                {t("platform.title")}
              </Link>
            </Button>
          )}
          <SignedInAs name={session.user.name} />
        </div>
      }
    >
      <p style={{ ...BODY_TEXT, marginBottom: LEAD_BOTTOM }}>
        {t("auth.selectCompany.body")}
      </p>
      <CompanyChoices
        companies={companies.map((c) => ({ id: c.companyId, name: c.name, slug: c.slug }))}
        activeId={session.user.companyId ?? null}
      />
    </AuthShell>
  );
}
