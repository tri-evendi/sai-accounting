/**
 * Kerangka grup `(operator)` (issue #154) — chrome KONSOL OPERATOR.
 *
 * SENGAJA bukan kerangka `(dashboard)` dan tanpa `SessionProvider` NextAuth:
 * bidang operator punya sesinya sendiri (`lib/operator/session.ts`), dan
 * modul-modulnya dijaga bersih dari impor kode pelanggan supaya ekstraksi
 * menjadi aplikasi kedua kelak tinggal memindahkan folder, bukan mengurai
 * jalinan.
 *
 * ⚠ Konsol ini berjalan di domain terpisah (`ops.`) dan TIDAK BOLEH mewarisi
 * konteks perusahaan. Berkas ini karena itu tidak mengimpor satu pun modul
 * bertenant/bercompany — juga tidak "sekadar untuk tampilan".
 *
 * Kerangka ini TIDAK menjadi penjaga (pola grup lain: penjaga per halaman,
 * ditegakkan tests/authz-coverage) — ia hanya membaca sesi secara opsional
 * untuk chrome: tanpa sesi (halaman login) kepala tampil polos tanpa menu.
 *
 * ══ BENTUKNYA PANEL ADMIN, BUKAN BILAH TAB ═════════════════════════════════
 * Bentuk lama berkas ini — satu bilah gelap 56px, satu baris tab mendatar, isi
 * terkurung 1152px — lahir ketika konsol hanya punya SATU halaman hanya-baca.
 * Ia tidak ikut tumbuh bersama isinya, dan tiga akibatnya terukur: menu
 * mendatar yang menggulung (butir ketujuh = butir tak terlihat), judul halaman
 * yang harus digambar sendiri oleh setiap halaman lewat konstanta `H1` yang
 * disalin, dan tabel tenant tujuh kolom yang menggulung mendatar di monitor
 * 1440px. Alasan lengkap + kenapa `PlatformShell` tidak bisa dipakai apa adanya
 * ada di kepala `components/operator/operator-shell.tsx`.
 *
 * Kalimat & ikon DIOPER dari sini (server) ke kulit (client): `getT()` sudah ada
 * di berkas ini, jadi kulitnya tidak perlu membaca konteks apa pun untuk lima
 * kalimat. Formulir keluar pun digambar di sini dan dioper sebagai `ReactNode`,
 * supaya kulit client tidak mengimpor satu pun modul autentikasi.
 */

import { Button } from "@/components/ui/button";
import { OperatorShell } from "@/components/operator/operator-shell";
import { optionalOperatorSession } from "@/lib/operator/guard";
import { operatorNav } from "@/lib/operator/nav";
import { getT } from "@/lib/i18n/server";
import { SIDER_BG_DARK } from "@/lib/theme/antd-tokens";
import { operatorLogout } from "./operator/actions";

export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([optionalOperatorSession(), getT()]);

  const logout = (
    <form action={operatorLogout}>
      <Button type="submit" variant="secondary" size="sm">
        {t("operator.logout")}
      </Button>
    </form>
  );

  /*
   * TANPA SESI = halaman masuk, dan di situ kulit panel justru salah: menu
   * samping ke halaman yang semuanya akan menolak pembukanya adalah menu yang
   * mengumumkan isi konsol kepada orang yang belum membuktikan apa pun.
   *
   * Yang tetap digambar: bidang gelapnya, supaya satu pandangan cukup untuk
   * tahu ini bukan halaman masuk pelanggan.
   */
  if (!session) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background: "var(--ant-color-bg-layout)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            minHeight: 56,
            paddingInline: 16,
            /* Permukaan yang sama dengan menu samping konsol; bukan
               `var(--ant-layout-sider-bg)` — variabel token KOMPONEN hanya ada
               bila komponennya benar-benar dirender, dan halaman ini tidak
               menggambar satu pun `Layout.Sider`. */
            background: SIDER_BG_DARK,
            color: "var(--ant-color-text-light-solid)",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {t("operator.consoleTitle")}
          </span>
        </header>
        <main style={{ flex: 1, padding: "24px 16px" }}>{children}</main>
      </div>
    );
  }

  return (
    <OperatorShell
      nav={operatorNav(t)}
      labels={{
        consoleTitle: t("operator.consoleTitle"),
        auditedBadge: t("operator.auditedBadge"),
        signedInAs: t("operator.signedInAs", { name: session.operator.name }),
        operatorName: session.operator.name,
        /* Host dibaca dari environment di SERVER — kulit client tidak membaca
           `process.env` (ia tidak akan menemukannya di peramban) dan tidak
           boleh menyimpulkannya dari `location.host`, yang akan memajang apa
           pun yang diketik orang di bilah alamat. */
        host: process.env.OPERATOR_HOST ?? "",
        mainMenu: t("sidebar.mainMenu"),
        closeMenu: t("sidebar.closeMenu"),
      }}
      logout={logout}
    >
      {children}
    </OperatorShell>
  );
}
