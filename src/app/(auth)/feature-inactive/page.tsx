/**
 * "Fitur ini belum aktif" — layar untuk halaman yang tertutup karena MODULNYA
 * dimatikan, bukan karena perannya kurang (issue #99).
 *
 * Kenapa layar tersendiri, bukan pantulan diam-diam ke /dashboard: "Anda tidak
 * punya akses" dan "fitur ini belum aktif untuk perusahaan Anda" adalah dua
 * keadaan yang berbeda sama sekali. Yang pertama urusan hak akses (mintanya ke
 * atasan); yang kedua urusan konfigurasi perusahaan (ada di Pengaturan, dan
 * mungkin memang disengaja). Menyamakan keduanya membuat pengguna mengejar orang
 * yang salah — dan membuat modul terasa seperti kerusakan, bukan pilihan.
 *
 * Sengaja di grup rute `(auth)`, mengikuti `setup-required`: halamannya
 * menjelaskan keadaan aplikasi, bukan menampilkan data. Karena di luar
 * `(dashboard)` ia juga tidak memanggil `requirePagePermission()` — kalau ia
 * memanggilnya, penjaga yang sama bisa memantulkannya ke dirinya sendiri tanpa
 * henti.
 *
 * Bukan jalan buntu: kalau modulnya ternyata AKTIF (mis. tautan lama, atau
 * modulnya baru dinyalakan lagi), halaman ini langsung mengarahkan ke beranda.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageX } from "lucide-react";

import { Button } from "@/components/ui/button";

import { auth } from "@/lib/auth";
import { getEnabledModules } from "@/lib/authz-effective";
import { MODULE_META, isBusinessModule, isModuleEnabled } from "@/lib/business-modules";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";

export const dynamic = "force-dynamic";

export default async function FeatureInactivePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const raw = (await searchParams).module ?? "";
  // Nilai dari URL tidak pernah dipercaya: hanya modul yang dikenal kode yang
  // boleh disebut namanya di layar.
  if (!isBusinessModule(raw)) redirect("/dashboard");
  if (isModuleEnabled(raw, await getEnabledModules())) redirect("/dashboard");

  const t = await getT();

  return (
    <AuthShell
      heading={t("modules.inactiveTitle")}
      description={t("modules.sectionTitle")}
      icon={<PackageX className="h-5 w-5" aria-hidden="true" />}
    >
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>{t("modules.inactiveBody", { module: t(MODULE_META[raw].labelKey) })}</p>
        <p>{t("modules.ledgerNote")}</p>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard">{t("modules.inactiveBack")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
