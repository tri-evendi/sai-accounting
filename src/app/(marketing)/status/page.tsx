/**
 * `/status` — HALAMAN STATUS PUBLIK (issue #374 · F-5).
 *
 * ══ KENAPA HALAMAN, PADAHAL `/api/health` SUDAH ADA ════════════════════════
 * Probe itu menjawab MESIN. Halaman ini menjawab orang yang pekerjaannya baru
 * saja berhenti dan hanya punya satu pertanyaan: *apakah ini saya, atau kalian?*
 * Selama jawaban itu hanya ada dalam bentuk JSON di alamat yang tidak pernah
 * disebut kepada siapa pun, jawabannya praktis tidak ada — dan kegagalan
 * pertama yang kita ketahui tetap yang dilaporkan pelanggan, yaitu judul issue
 * ini.
 *
 * ══ SATU SUMBER, DUA KEDALAMAN ═════════════════════════════════════════════
 * Angkanya datang dari `healthReport()` — fungsi yang SAMA dengan yang dibaca
 * `/api/health`, bukan pengukuran kedua. Dua permukaan yang mengukur mesin yang
 * sama dengan kode masing-masing adalah dua permukaan yang suatu hari menjawab
 * berbeda tentangnya, dan halaman yang membantah probe-nya sendiri lebih buruk
 * daripada halaman yang tidak ada.
 *
 * Yang BERBEDA hanya kedalamannya, dan itu dikerjakan `publicStatus()` di
 * `lib/public-status.ts`: tiga komponen yang benar-benar dipakai pembaca, tanpa
 * satu pun nama basis data, angka umur denyut, atau kalimat galat. Redaksinya
 * hidup di modul murni supaya ia bisa DIBUKTIKAN dengan tes — sebuah kebocoran
 * di halaman status tidak pernah terlihat seperti halaman yang rusak.
 *
 * ══ TIDAK MEMANTULKAN YANG SUDAH BERSESI ═══════════════════════════════════
 * Berbeda dari `/` dan `/pricing`, yang memantulkan pengunjung bersesi ke
 * `/dashboard`. Halaman ini justru paling dicari oleh PELANGGAN yang sedang
 * masuk dan mendapati sesuatu tidak bekerja; memantulkannya ke dasbor yang
 * sedang bermasalah adalah kebalikan dari gunanya.
 *
 * Ia juga tidak memanggil `auth()` sama sekali — bukan penyederhanaan:
 * halaman status harus tetap terjawab justru ketika lapisan yang menjawab
 * "siapa Anda" ikut sakit.
 *
 * ══ TANPA CACHE, SELALU ════════════════════════════════════════════════════
 * `force-dynamic` + `revalidate = 0`. Sebuah halaman status yang disajikan dari
 * cache adalah halaman yang dengan tenang menyatakan semuanya normal selama
 * pemadaman — bentuk kesalahan yang paling merusak kepercayaan, sebab ia
 * meyakinkan dan salah pada saat yang bersamaan.
 */
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { LandingShell } from "@/components/landing/landing-shell";
import {
  LANDING_BODY,
  LANDING_HERO_TITLE,
  LANDING_LEAD,
  LANDING_NOTE,
  LANDING_SURFACE,
} from "@/components/landing/landing-scale";
import { APP_NAME } from "@/lib/constants";
import { healthReport } from "@/lib/health-report";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { publicAppUrl } from "@/lib/public-url";
import {
  maintenanceWindow,
  publicStatus,
  type ComponentId,
  type ComponentState,
} from "@/lib/public-status";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary(await getLocale());
  const asal = publicAppUrl();
  const judul = `${APP_NAME} — ${dictionary.statusPage.title}`;

  return {
    metadataBase: asal,
    title: judul,
    description: dictionary.statusPage.description,
    alternates: { canonical: "/status" },
    /*
     * TIDAK diindeks. Ia ada di `sitemap.ts` supaya bisa DITEMUKAN sebagai
     * alamat, tetapi cuplikan hasil pencarian yang dibekukan perayap akan
     * memajang keadaan kemarin sebagai keadaan hari ini — persis kesalahan
     * yang `force-dynamic` di atas dicegah, hanya dilakukan oleh mesin lain.
     */
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: APP_NAME,
      title: judul,
      description: dictionary.statusPage.description,
      url: new URL("/status", asal).toString(),
    },
  };
}

/**
 * Warna per keadaan — token semantik AntD, bukan nada pemasaran.
 *
 * ⚠ Warnanya TIDAK PERNAH sendirian. Setiap baris memikul labelnya sebagai
 * teks ("Normal", "Terganggu", …), sebab MASTER.md melarang makna yang hanya
 * dibawa warna, dan halaman inilah tempat larangan itu paling mengikat: yang
 * membacanya sedang panik, dan sebagian membacanya dengan penglihatan warna
 * yang berbeda dari penulisnya.
 */
const TONE: Record<ComponentState, { color: string; glyph: string }> = {
  operational: { color: "var(--ant-color-success)", glyph: "●" },
  degraded: { color: "var(--ant-color-warning)", glyph: "▲" },
  down: { color: "var(--ant-color-error)", glyph: "■" },
  unknown: { color: "var(--ant-color-text-tertiary)", glyph: "○" },
};

const STATE_LABEL: Record<ComponentState, DictionaryKey> = {
  operational: "statusPage.stateOperational",
  degraded: "statusPage.stateDegraded",
  down: "statusPage.stateDown",
  unknown: "statusPage.stateUnknown",
};

const OVERALL_LABEL: Record<ComponentState, DictionaryKey> = {
  operational: "statusPage.overallOperational",
  degraded: "statusPage.overallDegraded",
  down: "statusPage.overallDown",
  unknown: "statusPage.overallUnknown",
};

const COMPONENT_LABEL: Record<ComponentId, { name: DictionaryKey; note: DictionaryKey }> = {
  application: {
    name: "statusPage.componentApplication",
    note: "statusPage.componentApplicationNote",
  },
  billing: { name: "statusPage.componentBilling", note: "statusPage.componentBillingNote" },
  email: { name: "statusPage.componentEmail", note: "statusPage.componentEmailNote" },
};

const SECTION: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "0 var(--ant-padding-lg)",
};

const CARD: CSSProperties = {
  background: LANDING_SURFACE,
  border: "1px solid var(--ant-color-border-secondary)",
  borderRadius: "var(--ant-border-radius-lg)",
  padding: "var(--ant-padding-lg)",
};

/** Keping keadaan: bentuk + warna + kata, ketiganya sekaligus. */
function StatePill({ state, label }: { state: ComponentState; label: string }) {
  const tone = TONE[state];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--ant-margin-xs)",
        color: tone.color,
        fontWeight: "var(--ant-font-weight-strong)",
        whiteSpace: "nowrap",
      }}
    >
      {/* `aria-hidden`: pembaca layar sudah menerima labelnya sebagai teks di
          sebelahnya, dan glif geometris yang ikut dibacakan hanya menambah
          kebisingan pada halaman yang justru harus cepat dipahami. */}
      <span aria-hidden="true">{tone.glyph}</span>
      {label}
    </span>
  );
}

export default async function StatusPage() {
  const t = await getT();
  const report = await healthReport();
  const status = publicStatus(report);
  const now = new Date();
  const maintenance = maintenanceWindow(
    now,
    process.env.MAINTENANCE_FROM,
    process.env.MAINTENANCE_UNTIL
  );

  return (
    <LandingShell>
      <div style={{ padding: "var(--ant-padding-xl) 0 var(--ant-margin-xl)" }}>
        <div style={{ ...SECTION, display: "grid", gap: "var(--ant-margin-lg)" }}>
          <header style={{ display: "grid", gap: "var(--ant-margin-sm)" }}>
            <h1 style={LANDING_HERO_TITLE}>{t("statusPage.heading")}</h1>
            <p style={LANDING_LEAD}>{t("statusPage.intro")}</p>
          </header>

          {/* Ringkasan — satu kalimat yang bisa dibaca dari jauh, sebab itulah
              satu-satunya hal yang benar-benar dicari mayoritas pembaca. */}
          <section
            aria-live="polite"
            style={{
              ...CARD,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "var(--ant-margin-sm)",
            }}
          >
            <StatePill state={status.overall} label={t(OVERALL_LABEL[status.overall])} />
            <p style={LANDING_NOTE}>{t("statusPage.checkedAt", { time: formatDateTime(now) })}</p>
          </section>

          {maintenance ? (
            <section
              style={{
                ...CARD,
                display: "grid",
                gap: "var(--ant-margin-xxs)",
                borderColor: "var(--ant-color-warning-border)",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "var(--ant-font-size-lg)",
                  fontWeight: "var(--ant-font-weight-strong)",
                }}
              >
                {t("statusPage.maintenanceHeading")}
              </h2>
              <p style={LANDING_BODY}>
                {t(
                  maintenance.state === "active"
                    ? "statusPage.maintenanceActive"
                    : "statusPage.maintenanceUpcoming",
                  {
                    from: formatDateTime(maintenance.from),
                    until: formatDateTime(maintenance.until),
                  }
                )}
              </p>
            </section>
          ) : null}

          <section style={{ display: "grid", gap: "var(--ant-margin-sm)" }}>
            {status.components.map((component) => {
              const label = COMPONENT_LABEL[component.id];
              return (
                <div
                  key={component.id}
                  style={{
                    ...CARD,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "var(--ant-margin-sm)",
                  }}
                >
                  <div style={{ display: "grid", gap: "var(--ant-margin-xxs)", minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "var(--ant-font-size-lg)",
                        fontWeight: "var(--ant-font-weight-strong)",
                      }}
                    >
                      {t(label.name)}
                    </p>
                    <p style={LANDING_NOTE}>{t(label.note)}</p>
                  </div>
                  <StatePill state={component.state} label={t(STATE_LABEL[component.state])} />
                </div>
              );
            })}
          </section>

          <section style={{ display: "grid", gap: "var(--ant-margin-xxs)" }}>
            <h2
              style={{
                margin: 0,
                fontSize: "var(--ant-font-size-lg)",
                fontWeight: "var(--ant-font-weight-strong)",
              }}
            >
              {t("statusPage.reportHeading")}
            </h2>
            <p style={LANDING_BODY}>{t("statusPage.reportBody")}</p>
          </section>
        </div>
      </div>
    </LandingShell>
  );
}
