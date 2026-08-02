/**
 * Tata letak jalur bertenant `/t/{tenantSlug}/{companySlug}/…` (issue #157).
 *
 * Ia SENGAJA setipis mungkin. Kerangka aplikasi — menu samping, navbar, tur,
 * palet perintah — tetap milik `(dashboard)/layout.tsx` di atasnya, dan
 * menyalinnya ke sini akan melahirkan dua kerangka yang perlahan berbeda.
 *
 * Yang ditambahkannya cuma satu, dan justru itu yang tidak boleh hilang:
 * MENAHAN permukaan interaktif sampai cookie sesi menunjuk perusahaan yang sama
 * dengan yang ada di jalur. Alasan lengkapnya ada di `CompanySessionSync` —
 * ringkasnya: sampai #158, route API masih mengambil perusahaannya dari sesi,
 * jadi halaman yang dibuka lewat tautan dalam bisa MENAMPILKAN buku PT A
 * sementara tombolnya menulis ke buku PT B.
 *
 * Slug yang tidak menunjuk perusahaan mana pun dijawab 404 di sini, sehingga
 * seluruh cabangnya ikut 404 sekaligus. Itu BUKAN pemeriksaan izin: keanggotaan
 * dibuktikan `requirePagePermission(izin, params)` di setiap halaman, dan
 * jawabannya untuk bukan-anggota adalah 404 yang sama persis.
 */

import { notFound } from "next/navigation";

import { CompanySessionSync } from "@/components/layout/company-session-sync";
import { companyIdForRoute } from "@/lib/company-route";

export default async function TenantScopedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string; companySlug: string }>;
}) {
  const { tenantSlug, companySlug } = await params;
  const companyId = await companyIdForRoute(tenantSlug, companySlug);
  if (companyId == null) notFound();

  return <CompanySessionSync companyId={companyId}>{children}</CompanySessionSync>;
}
