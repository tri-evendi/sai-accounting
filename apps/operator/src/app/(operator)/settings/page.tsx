/**
 * `/settings` — PENGATURAN SITUS, menggantikan SSH.
 *
 * ══ MASALAH YANG DITUTUPNYA ════════════════════════════════════════════════
 * Tiga nilai yang paling sering perlu diubah pemilik hanya hidup di
 * environment, jadi mengubah salah satunya berarti: masuk SSH ke server
 * produksi, sunting `.env`, lalu `docker compose up -d`. Padahal ketiganya
 * bukan keputusan teknis — dan satu di antaranya memikul SELURUH corong
 * penawaran Fase B (`docs/KOMERSIALISASI.md` §7, langkah 1).
 *
 * ══ DUA GERBANG, DIPINDAHKAN ATAS PERMINTAAN PEMILIK ═══════════════════════
 * `SELF_SERVE_SIGNUP` dan `PLATFORM_PPN_DISABLED` dulu SENGAJA tidak ada di
 * sini — keduanya bukan "isi" melainkan gerbang, dan memindahkannya ke tombol
 * web disebut sebagai keputusan pemilik, bukan efek samping halaman
 * pengaturan. Keputusan itu kini diambil, jadi keduanya ada di bawah.
 *
 * Yang TIDAK berubah karena pemindahan ini, dan harus tetap begitu:
 *
 *   • **Gagal-tertutup pendaftaran.** Platform tak terjangkau → barisnya tak
 *     terbaca → `signupOpenFrom(null, env)` jatuh ke environment, yang
 *     bawaannya TERTUTUP. Basis data yang mati tidak pernah membuka corong.
 *   • **Penjadwal ikut membacanya.** PPN dipakai di JALUR UANG oleh
 *     `scripts/subscription-scheduler.ts` — proses `tsx` di luar Next. Kalau ia
 *     tidak ikut, menyalakan PPN di sini akan mengubah apa yang DIPAJANG
 *     halaman harga tanpa mengubah nominal yang benar-benar ditagih; itu panel
 *     yang berbohong tentang uang. Jalannya: `lib/site-settings-core.ts`,
 *     inti tanpa `server-only` yang menerima klien dari pemanggil.
 *   • **Tiga keadaan, bukan dua.** "Belum pernah disetel dari konsol" tetap
 *     bisa dibedakan dari "sengaja dimatikan" (kolom `TINYINT(1) NULL`,
 *     migration 0017) — tanpa itu, satu kali menyimpan formulir ini merampas
 *     keputusan dari `.env`.
 *
 * ══ LIMA TAB (`?tab=`) ═════════════════════════════════════════════════════
 * Pendaftaran & uji coba · Tagihan & PPN · Harga publik · Kontak · Retensi.
 * Tiap tab menyimpan medannya SENDIRI (`siteSettingsSectionSchema`), jadi
 * menyimpan satu tab tidak menulis ulang tab lain; jejaknya mencatat bagian
 * itu saja, nilai lama dan baru. Daftar kandidat retensi hanya dibaca di tab
 * Retensi. "Kembalikan ke pengaturan server" tetap satu tombol di bawah tab
 * (ia menghapus seluruh baris).
 */

import { CONSOLE_PAGE, ConsoleNotice, ConsolePanel } from "@op/components/operator/console-ui";
import { PageHeader } from "@sai/ui/page-header";
import { SiteSettingsForm, SiteSettingsReset } from "@op/components/operator/site-settings-form";
import { ConsoleTabs } from "@op/components/operator/console-tabs";
import { resolveConsoleTab } from "@op/lib/operator/console-tabs";
import { getT } from "@sai/platform/i18n/server";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import {
  effectiveSetting,
  ppnEnabledFrom,
  publicPricingVisibleFrom,
  signupOpenFrom,
  siteSettingsForOperator,
  trialAutoDeletionFrom,
  trialRetentionDaysFrom,
} from "@sai/platform/site-settings";
import { TrialRetentionForm } from "@op/components/operator/trial-retention-form";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { trialRetentionForOperator, type TrialRetentionRow } from "@op/lib/operator/store";
import { formatDateMedium as formatDate } from "@sai/core/utils";
import {
  operatorResetSiteSettings,
  operatorSaveSiteSettings,
  operatorSaveTrialRetention,
} from "./actions";

export const dynamic = "force-dynamic";

/** Judul & keterangan panel per tab — peta STATIS (penjaga kunci yatim membaca teks). */
const TAB_HEADING = {
  signup: "operator.settings.tabSignup",
  billing: "operator.settings.tabBilling",
  pricing: "operator.settings.tabPricing",
  contact: "operator.settings.tabContact",
} as const;
const TAB_DESCRIPTION = {
  signup: "operator.settings.tabSignupDescription",
  billing: "operator.settings.tabBillingDescription",
  pricing: "operator.settings.tabPricingDescription",
  contact: "operator.settings.tabContactDescription",
} as const;

/** `null` → "ikut pengaturan server"; `true`/`false` → keputusan konsol. */
function gateValue(v: boolean | null | undefined): "env" | "on" | "off" {
  if (v === true) return "on";
  if (v === false) return "off";
  return "env";
}

const TABS = ["signup", "billing", "pricing", "contact", "retention"] as const;
type Tab = (typeof TABS)[number];

export default async function OperatorSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const tab: Tab = resolveConsoleTab((await searchParams).tab, TABS, "signup");
  const row = await siteSettingsForOperator();

  if (row === "unreachable") {
    return (
      <div>
        <PageHeader
          title={t("operator.settings.heading")}
          description={t("operator.settings.description")}
        />
        <ConsoleNotice>{t("operator.tenant.billingUnavailable")}</ConsoleNotice>
      </div>
    );
  }

  /* Nilai AWAL = yang BERLAKU sekarang, bukan isi barisnya: operator harus
     melihat apa yang dilihat pengunjung, termasuk ketika nilainya masih datang
     dari environment. Presedensinya satu fungsi (`effectiveSetting`), teruji. */
  const initial = {
    contactWhatsapp:
      effectiveSetting(row?.contactWhatsapp, process.env.PLATFORM_CONTACT_WHATSAPP) ?? "",
    contactEmail:
      effectiveSetting(row?.contactEmail, process.env.PLATFORM_CONTACT_EMAIL) ?? "",
    manualPaymentInstructions:
      effectiveSetting(
        row?.manualPaymentInstructions,
        process.env.MANUAL_PAYMENT_INSTRUCTIONS
      ) ?? "",
    /* `null` di baris = "ikut pengaturan server", dan ia DIPILIH sebagai nilai
       awal — bukan diterjemahkan lebih dulu menjadi on/off. Kalau layar ini
       merender `off` untuk baris yang masih `null`, menyimpan perubahan nomor
       telepon akan ikut menuliskan keputusan gerbang yang tak pernah diambil. */
    selfServeSignup: gateValue(row?.selfServeSignupOpen),
    ppn: gateValue(row?.ppnEnabled),
    /* Dua keadaan (tanpa env): `null` = tampil, fungsi yang SAMA dengan
       pembaca halaman publik. */
    publicPricing: publicPricingVisibleFrom(row) ? ("on" as const) : ("off" as const),
  };

  /* Yang BERLAKU bila pilihannya "ikut pengaturan server" — dihitung di sini
     sebab hanya server melihat `.env`; keduanya memakai fungsi presedensi yang
     sama dengan pembaca sungguhan, dipanggil dengan baris KOSONG supaya yang
     dijawab benar-benar "apa kata environment". */
  const envGates = {
    signupOpen: signupOpenFrom(null, process.env),
    ppnEnabled: ppnEnabledFrom(null, process.env),
  };

  /* Dari mana nilainya datang — dikatakan per medan di layar. `null` di baris
     berarti "tidak diatur dari konsol", jadi sumbernya environment. */
  const fromDb = {
    whatsapp: row?.contactWhatsapp != null,
    email: row?.contactEmail != null,
    payment: row?.manualPaymentInstructions != null,
  };

  /* ── Retensi uji coba beku (migration platform 0012) ─────────────────────
     Nilai BERLAKU dihitung dengan fungsi yang SAMA dengan penjadwal. */
  const retentionDays = trialRetentionDaysFrom(row, process.env);
  const autoDeletionOn = trialAutoDeletionFrom(row, process.env);
  /* Kandidat retensi dibaca HANYA di tab Retensi — tab lain tidak membayar
     kuerinya. */
  const retentionRows = tab === "retention" ? await trialRetentionForOperator(retentionDays) : null;
  const retentionColumns: SaiColumns<TrialRetentionRow> = [
    {
      key: "tenant",
      title: t("operator.tenants.colName"),
      align: "left",
      render: (_v, r) => `${r.tenantName} (${r.tenantSlug})`,
    },
    {
      key: "ended",
      title: t("operator.retention.colEnded"),
      align: "left",
      render: (_v, r) => formatDate(r.trialEndedAt),
    },
    {
      key: "delete",
      title: t("operator.retention.colDelete"),
      align: "left",
      render: (_v, r) =>
        r.deleteAt
          ? formatDate(r.deleteAt)
          : t("operator.retention.notNotified", { date: formatDate(r.baseDeleteAt) }),
    },
    {
      key: "notices",
      title: t("operator.retention.colNotices"),
      align: "left",
      render: (_v, r) => (r.noticesSent.length ? r.noticesSent.map((k) => k.split(":")[0]).join(", ") : "—"),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("operator.settings.heading")}
        description={t("operator.settings.description")}
      />
      <ConsoleTabs
        label={t("operator.settings.tabsAria")}
        basePath="/settings"
        active={tab}
        defaultId="signup"
        tabs={[
          { id: "signup", label: t("operator.settings.tabSignup") },
          { id: "billing", label: t("operator.settings.tabBilling") },
          { id: "pricing", label: t("operator.settings.tabPricing") },
          { id: "contact", label: t("operator.settings.tabContact") },
          { id: "retention", label: t("operator.settings.tabRetention") },
        ]}
      />
      <div style={{ ...CONSOLE_PAGE, marginTop: "var(--ant-margin-lg)" }}>
      {!operatorCan(operator.role, "site.settings") ? (
        <ConsoleNotice>{t("operator.roleCannotEdit")}</ConsoleNotice>
      ) : tab !== "retention" ? (
      <>
      <ConsolePanel
        title={t(TAB_HEADING[tab])}
        description={t(TAB_DESCRIPTION[tab])}
      >
        {/* `key` per tab: RHF memegang `defaultValues` render pertama, dan
            formulir tab sebelumnya tidak boleh terbawa ke tab ini. */}
        <SiteSettingsForm
          key={tab}
          section={tab}
          initial={initial}
          fromDb={fromDb}
          envGates={envGates}
          save={operatorSaveSiteSettings}
        />
      </ConsolePanel>
      {row !== null && (
        <ConsolePanel footnote={t("operator.settings.resetNote")}>
          <SiteSettingsReset reset={operatorResetSiteSettings} />
        </ConsolePanel>
      )}
      </>
      ) : (
      <>
      {/* Retensi uji coba beku — sakelar BAWAAN MATI; selama mati penjadwal
          hanya melaporkan kandidat di tabel bawah. */}
      <ConsolePanel
        title={t("operator.retention.heading")}
        description={
          autoDeletionOn
            ? t("operator.retention.descriptionOn", { days: retentionDays })
            : t("operator.retention.descriptionOff", { days: retentionDays })
        }
      >
        <TrialRetentionForm
          initial={{
            autoDeletion: gateValue(row?.trialAutoDeletion),
            retentionDays: row?.trialRetentionDays ?? 0,
          }}
          envValues={{
            autoDeletion: trialAutoDeletionFrom(null, process.env),
            retentionDays: trialRetentionDaysFrom(null, process.env),
          }}
          save={operatorSaveTrialRetention}
        />
      </ConsolePanel>
      <ConsolePanel
        title={`${t("operator.retention.candidatesHeading")} (${retentionRows?.length ?? 0})`}
        footnote={t("operator.retention.candidatesNote")}
        flush
      >
        {retentionRows === null ? (
          <ConsoleNotice>{t("operator.tenant.billingUnavailable")}</ConsoleNotice>
        ) : (
          <StaticTable
            columns={retentionColumns}
            rows={retentionRows}
            rowKey={(r) => r.tenantId}
            empty={<p style={{ padding: "var(--ant-padding-lg)", margin: 0 }}>{t("operator.retention.candidatesEmpty")}</p>}
          />
        )}
      </ConsolePanel>
      </>
      )}
      </div>
    </div>
  );
}
