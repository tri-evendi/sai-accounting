/**
 * `/unlock` — otentikasi ulang sebelum masuk ke buku sebuah PT.
 *
 * ══ KENAPA DI GRUP `(auth)` ════════════════════════════════════════════════
 * Dua alasan, dan yang kedua mekanis.
 *
 * Yang pertama benar secara isi: ini LAYAR OTENTIKASI. `AuthShell` adalah kulit
 * untuk layar yang menanyakan kredensial, dan halaman ini menanyakan persis itu
 * — jadi ia satu-satunya tempat di aplikasi ini yang panel jualan `AuthShell`
 * memang pada tempatnya (bandingkan dengan `/companies/new`, yang justru
 * dipindahkan KELUAR dari kulit ini karena ia tugas administratif, bukan
 * otentikasi).
 *
 * Yang kedua: halaman ini TIDAK BOLEH memanggil `requirePagePermission`.
 * Gerbang kunci buku hidup di dalam fungsi itu, jadi halaman yang memakainya
 * akan memantul ke dirinya sendiri tanpa henti. Penjaganya karena itu ringan
 * dan ditulis di sini: ada sesi, dan PT yang diminta memang salah satu
 * keanggotaannya.
 *
 * ⚠ Keanggotaan diperiksa SEBELUM nama PT ditampilkan. Tanpa itu halaman ini
 * menjadi alat penebak: mengetik slug apa pun akan memberi tahu apakah PT
 * dengan nama itu ada dan siapa namanya. Slug yang bukan miliknya diperlakukan
 * sama dengan slug yang tidak ada — `notFound()`.
 */
import { LockOutlined } from "@ant-design/icons";
import { notFound, redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { auth } from "@/lib/auth";
import { companiesForUser } from "@/lib/company-registry";
import { getT } from "@/lib/i18n/server";

import { UnlockForm } from "./unlock-form";

export const dynamic = "force-dynamic";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; next?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { company: slug, next } = await searchParams;
  if (!slug) notFound();

  const companies = await companiesForUser(Number.parseInt(session.user.id, 10));
  const company = companies.find((c) => c.slug === slug);
  /* Bukan miliknya = tidak ada. Lihat catatan penebak di kepala berkas. */
  if (!company) notFound();

  const t = await getT();

  return (
    <AuthShell
      heading={t("unlock.title")}
      description={t("unlock.description", { company: company.name })}
      icon={<LockOutlined aria-hidden="true" style={{ fontSize: 20 }} />}
    >
      {/*
       * `next` TIDAK dioper apa adanya ke peramban sebagai tujuan tanpa
       * diperiksa: nilai dari query string bisa berisi alamat luar, dan
       * pengalihan terbuka di layar otentikasi adalah bahan phishing yang
       * matang. Yang dioper hanya SLUG-nya; formulir menyusun sendiri tujuan
       * di dalam aplikasi. Lihat `unlock-form.tsx`.
       */}
      <UnlockForm companySlug={company.slug} next={next} />
    </AuthShell>
  );
}
