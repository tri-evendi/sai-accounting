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
 */

import { PageHeader } from "@/components/ui/page-header";
import { SiteSettingsForm } from "@/components/operator/site-settings-form";
import { getT } from "@/lib/i18n/server";
import { requireOperatorPage } from "@/lib/operator/guard";
import {
  effectiveSetting,
  ppnEnabledFrom,
  signupOpenFrom,
  siteSettingsForOperator,
} from "@/lib/site-settings";
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

/** `null` → "ikut pengaturan server"; `true`/`false` → keputusan konsol. */
function gateValue(v: boolean | null | undefined): "env" | "on" | "off" {
  if (v === true) return "on";
  if (v === false) return "off";
  return "env";
}

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
    /* `null` di baris = "ikut pengaturan server", dan ia DIPILIH sebagai nilai
       awal — bukan diterjemahkan lebih dulu menjadi on/off. Kalau layar ini
       merender `off` untuk baris yang masih `null`, menyimpan perubahan nomor
       telepon akan ikut menuliskan keputusan gerbang yang tak pernah diambil. */
    selfServeSignup: gateValue(row?.selfServeSignupOpen),
    ppn: gateValue(row?.ppnEnabled),
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

  return (
    <div>
      <PageHeader
        title={t("operator.settings.heading")}
        description={t("operator.settings.description")}
      />
      <SiteSettingsForm
        initial={initial}
        fromDb={fromDb}
        envGates={envGates}
        rowExists={row !== null}
        save={operatorSaveSiteSettings}
        reset={operatorResetSiteSettings}
      />
    </div>
  );
}
