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
 * Dan kalaupun tidak, tombol "kembali ke beranda" di kaki kartu TETAP ada —
 * layar penjelas tanpa satu pun kendali adalah jalan buntu (MASTER.md
 * §Orientasi Perusahaan).
 *
 * ── Warna (issue #200) ───────────────────────────────────────────────────
 * Server component di dalam `AuthShell` yang belum dikonversi: tanpa `antd`,
 * dan tanpa komponen AntD di atasnya sehingga `--ant-…` tidak teratasi (#227).
 * Kalimatnya karena itu memakai token `:root` aplikasi — token yang sama
 * dengan kulitnya. Tombolnya mewarnai dirinya sendiri.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { CloseSquareOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";

import { auth } from "@/lib/auth";
import { getEnabledModules } from "@/lib/authz-effective";
import { MODULE_META, isBusinessModule, isModuleEnabled } from "@/lib/business-modules";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";

export const dynamic = "force-dynamic";

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

export default async function FeatureInactivePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  /*
   * Modul aktif adalah pengaturan PER PERUSAHAAN (issue #104), jadi tanpa
   * perusahaan aktif pertanyaan "modul ini menyala atau tidak" tidak punya
   * jawaban — membacanya akan melempar. Pilih perusahaannya dulu.
   */
  if (session.user.companyId == null) redirect("/select-company");

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
      icon={<CloseSquareOutlined aria-hidden="true" style={{ fontSize: 20 }} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={BODY_TEXT}>
          {t("modules.inactiveBody", { module: t(MODULE_META[raw].labelKey) })}
        </p>
        <p style={BODY_TEXT}>{t("modules.ledgerNote")}</p>
      </div>

      <div style={EXIT_ROW}>
        <Button asChild variant="outline" style={{ width: "100%" }}>
          <Link href="/dashboard">{t("modules.inactiveBack")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
