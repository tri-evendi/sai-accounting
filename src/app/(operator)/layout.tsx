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
 * bertenant/bercompany — juga tidak "sekadar untuk tampilan". Konversi AntD
 * (#200, dilanjutkan #203) tidak menambah satu impor pun: warnanya variabel
 * token AntD (`var(--ant-…)`, teratasi di seluruh dokumen karena `<html>`
 * memikul kelas `ANTD_CSS_VAR_KEY` sejak #227) dan primitif yang sudah ada.
 *
 * Kerangka ini TIDAK menjadi penjaga (pola grup lain: penjaga per halaman,
 * ditegakkan tests/authz-coverage) — ia hanya membaca sesi secara opsional
 * untuk chrome: tanpa sesi (halaman login) kepala tampil polos tanpa menu.
 *
 * Kepala GELAP di kedua tema (`#001529` — permukaan yang sama dengan panel
 * brand `AuthShell` dan menu samping dasbor; lihat catatan di tempatnya di
 * bawah) — pembeda visual yang disengaja: satu pandangan cukup untuk tahu
 * Anda sedang di bidang operator, bukan di aplikasi pelanggan.
 *
 * ── Kenapa tombol keluarnya `secondary`, bukan garis di atas gelap (#200) ──
 * Bentuk lamanya adalah `outline` yang tepi & teksnya ditimpa kelas khusus
 * permukaan gelap, berikut dua keadaan hover. Gaya sebaris tidak bisa membawa
 * hover, dan menuliskannya sebagai aturan CSS tersendiri hanya untuk satu
 * tombol berarti melawan spesifisitas gaya AntD di satu berkas. Tombol default
 * AntD di atas bilah gelap sudah terbaca sebagai kendali dan mempertahankan
 * SELURUH keadaan interaktifnya — itu yang dipilih.
 */

import { SafetyCertificateOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OperatorNav } from "@/components/operator/operator-nav";
import { optionalOperatorSession } from "@/lib/operator/guard";
import { getT } from "@/lib/i18n/server";
import { operatorLogout } from "./operator/actions";

export const dynamic = "force-dynamic";

/** Lebar isi konsol — bekas `max-w-6xl`. */
const CONTENT_MAX = 1152;

const BAR: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
  minHeight: 56,
  width: "100%",
  maxWidth: CONTENT_MAX,
  margin: "0 auto",
  padding: "8px 16px",
};

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([optionalOperatorSession(), getT()]);

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
          borderBottom: "1px solid var(--ant-color-border-secondary)",
          /* `#001529` ditulis LITERAL, dan itu disengaja: ini nilai
             `Layout.siderBg` bawaan AntD — permukaan yang sama persis dengan
             `Layout.Sider theme="dark"` milik `AuthShell` dan menu samping
             dasbor, sehingga bidang gelap operator tidak menyimpang sendiri.
             Tidak ada variabel yang bisa dirujuk: variabel token KOMPONEN AntD
             baru ada bila komponennya benar-benar dirender, dan chrome operator
             ini tidak menggambar satu pun `Layout.Sider`. Kalau `Layout.siderBg`
             kelak diubah, ubah juga di sini. */
          background: "#001529",
          color: "var(--ant-color-text-light-solid)",
        }}
      >
        <div style={BAR}>
          <SafetyCertificateOutlined aria-hidden="true" style={{ fontSize: 20, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {t("operator.consoleTitle")}
          </span>
          {/* Sejak #155 konsol ini MENULIS — penandanya berganti dari
              "hanya-baca" menjadi peringatan bahwa setiap tindakan terekam
              atas nama operator yang sedang masuk. */}
          <Badge variant="warning">{t("operator.auditedBadge")}</Badge>
          {session && (
            <div
              style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 12 }}
            >
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {t("operator.signedInAs", { name: session.operator.name })}
              </span>
              <form action={operatorLogout}>
                <Button type="submit" variant="secondary" size="sm">
                  {t("operator.logout")}
                </Button>
              </form>
            </div>
          )}
        </div>
      </header>

      {session && (
        <div
          style={{
            borderBottom: "1px solid var(--ant-color-border-secondary)",
            background: "var(--ant-color-bg-container)",
          }}
        >
          <div style={{ width: "100%", maxWidth: CONTENT_MAX, margin: "0 auto", padding: "0 16px" }}>
            <OperatorNav
              ariaLabel={t("operator.consoleTitle")}
              items={[
                {
                  href: "/operator",
                  label: t("operator.nav.tenants"),
                  activePrefixes: ["/operator/tenants"],
                },
                {
                  href: "/operator/reconciliation",
                  label: t("operator.nav.reconciliation"),
                  activePrefixes: ["/operator/reconciliation"],
                },
                {
                  href: "/operator/scheduler",
                  label: t("operator.nav.scheduler"),
                  activePrefixes: ["/operator/scheduler"],
                },
                {
                  href: "/operator/mail",
                  label: t("operator.nav.mail"),
                  activePrefixes: ["/operator/mail"],
                },
              ]}
            />
          </div>
        </div>
      )}

      <main
        style={{
          width: "100%",
          maxWidth: CONTENT_MAX,
          flex: 1,
          margin: "0 auto",
          padding: "24px 16px",
        }}
      >
        {children}
      </main>
    </div>
  );
}
