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
 * ── Warna (issue #203) ───────────────────────────────────────────────────
 * Server component, jadi tanpa `antd` dan tanpa `theme.useToken()`. Kalimatnya
 * memakai variabel token AntD `var(--ant-…)`, yang teratasi walau tak ada satu
 * pun komponen AntD di atasnya: sejak #227 kelas `ANTD_CSS_VAR_KEY` dipikul
 * `<html>` oleh root layout, bukan oleh komponen AntD. Token `:root` aplikasi
 * yang dulu dipakai sudah dicabut `globals.css` oleh #203. Tombolnya mewarnai
 * dirinya sendiri.
 */
import { redirect } from "next/navigation";
import { CloseSquareOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";

import { auth } from "@/lib/auth";
import { getEnabledModules } from "@/lib/authz-effective";
import { runWithCompany } from "@/lib/company-context";
import { getCompany } from "@/lib/company-registry";
import { MODULE_META, isBusinessModule, isModuleEnabled } from "@/lib/business-modules";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";

export const dynamic = "force-dynamic";

/** Kalimat penjelas — bekas `text-sm leading-relaxed text-muted-foreground`. */
const BODY_TEXT: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

/** Kaki kartu — bekas `mt-6 border-t border-border pt-5`. */
const EXIT_ROW: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 20,
  borderTop: "1px solid var(--ant-color-border-secondary)",
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

  /*
   * ⚠ KONTEKS PERUSAHAAN DITANAM SENDIRI DI SINI — jangan hapus (issue #355).
   *
   * "Modul mana yang menyala" adalah pertanyaan PER PERUSAHAAN, jadi
   * `getEnabledModules()` menempuh `currentCompany()`. Yang menanam konteks itu
   * untuk sebuah permintaan HTTP hanyalah penjaga (`requirePagePermission` /
   * `requireApiPermission`) — dan halaman ini sengaja TIDAK memanggil penjaga,
   * sebab gerbang modul hidup di dalamnya dan halaman ini akan memantul ke
   * dirinya sendiri tanpa henti (lihat kepala berkas).
   *
   * Akibatnya halaman ini dulu MELEMPAR `MissingCompanyContextError` — benar
   * menurut doktrin #104, tapi hasilnya layar galat bawaan Next berbahasa
   * Inggris ("This page couldn't load", HTTP 409) di setiap rute milik modul
   * yang dimatikan. Penjelasan berbahasa Indonesia di bawah tidak pernah
   * terlihat sekali pun.
   *
   * Perbaikannya BUKAN melonggarkan doktrin: tidak ada `?? defaultCompany` dan
   * tidak ada tebakan. Perusahaannya disebut EKSPLISIT — dari `session.user`,
   * yang sudah dipastikan tidak null tepat di atas — lalu dibungkus
   * `runWithCompany()`, persis jalur yang dipakai skrip dan cron. `run()`
   * (bukan `enterWith()`) memang yang benar di sini: seluruh pekerjaannya muat
   * di dalam satu callback, jadi rambatannya bisa diandalkan sepenuhnya.
   */
  const company = await getCompany(session.user.companyId);
  /* Perusahaan di sesi sudah lenyap/nonaktif — pilih ulang, jangan menebak. */
  if (!company) redirect("/select-company");

  const enabled = await runWithCompany(company, () => getEnabledModules());
  if (isModuleEnabled(raw, enabled)) redirect("/dashboard");

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
        <Button href="/dashboard" variant="outline" style={{ width: "100%" }}>
          {t("modules.inactiveBack")}
        </Button>
      </div>
    </AuthShell>
  );
}
