/**
 * `/operator/settings` — PENGATURAN SITUS, menggantikan SSH.
 *
 * ══ MASALAH YANG DITUTUPNYA ════════════════════════════════════════════════
 * Tiga nilai yang paling sering perlu diubah pemilik hanya hidup di
 * environment, jadi mengubah salah satunya berarti: masuk SSH ke server
 * produksi, sunting `.env`, lalu `docker compose up -d`. Padahal ketiganya
 * bukan keputusan teknis — dan satu di antaranya memikul SELURUH corong
 * penawaran Fase B (`docs/KOMERSIALISASI.md` §7, langkah 1).
 *
 * ⚠ Yang TIDAK ada di sini, dan ketiadaannya disengaja: `SELF_SERVE_SIGNUP`
 * (membuka/menutup pendaftaran) dan `PLATFORM_PPN_DISABLED` (PPN di tagihan).
 * Keduanya bukan "isi" melainkan GERBANG: yang pertama gagal-tertutup dan
 * membuka corong komersial, yang kedua punya akibat pajak. Memindahkannya ke
 * tombol web adalah keputusan pemilik — bukan efek samping halaman pengaturan.
 */

import { PageHeader } from "@/components/ui/page-header";
import { SiteSettingsForm } from "@/components/operator/site-settings-form";
import { getT } from "@/lib/i18n/server";
import { requireOperatorPage } from "@/lib/operator/guard";
import { effectiveSetting, siteSettingsForOperator } from "@/lib/site-settings";
import {
  operatorResetSiteSettings,
  operatorSaveSiteSettings,
} from "./actions";

export const dynamic = "force-dynamic";

/** "Platform tidak terjangkau" — kalimat jujur, bukan galat. */
const NOTICE: React.CSSProperties = {
  margin: 0,
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-fill-quaternary)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

export default async function OperatorSettingsPage() {
  await requireOperatorPage();
  const t = await getT();
  const row = await siteSettingsForOperator();

  if (row === "unreachable") {
    return (
      <div>
        <PageHeader
          title={t("operator.settings.heading")}
          description={t("operator.settings.description")}
        />
        <p style={NOTICE}>{t("operator.tenant.billingUnavailable")}</p>
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
  };

  /* Dari mana nilainya datang — dikatakan per medan di layar. `null` di baris
     berarti "tidak diatur dari konsol", jadi sumbernya environment. */
  const fromDb = {
    whatsapp: row?.contactWhatsapp != null,
    email: row?.contactEmail != null,
    payment: row?.manualPaymentInstructions != null,
  };

  return (
    <div>
      <PageHeader
        title={t("operator.settings.heading")}
        description={t("operator.settings.description")}
      />
      <SiteSettingsForm
        initial={initial}
        fromDb={fromDb}
        rowExists={row !== null}
        save={operatorSaveSiteSettings}
        reset={operatorResetSiteSettings}
      />
    </div>
  );
}
