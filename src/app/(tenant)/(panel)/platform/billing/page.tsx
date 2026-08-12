/**
 * `/platform/billing` — langganan, paket berjalan, dan riwayat tagihan.
 * Penjaganya `tenant.billing` (OWNER, kontraktual — bukan peran di sebuah PT).
 *
 * ══ PENJAGA DI BARIS PERTAMA, BUKAN CABANG RENDER ══════════════════════════
 * Sampai audit rute, isi ini adalah `{canSeeBilling && <SubscriptionSection/>}`
 * di tengah halaman pendaratan, dan janji "data langganan tidak pernah DIBACA
 * untuk yang tak berhak" dijaga oleh letak `await` di dalam cabang itu — benar,
 * tapi rapuh: satu pemindahan baris ke luar cabang membuat query berjalan untuk
 * semua orang tanpa satu pun tes berbunyi (halamannya tetap terlihat sama).
 *
 * Sebagai rute tersendiri janji itu menjadi struktural: `member` tidak pernah
 * sampai ke berkas ini, sebab penjaga di baris pertama sudah memantulkannya.
 * Query di bawahnya karena itu tidak perlu bersyarat sama sekali.
 */
import { ArrowRightOutlined } from "@ant-design/icons";
import { platformHead } from "@/components/tenant/platform-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { billingOverviewForTenant } from "@/lib/subscription-store";
import { getT } from "@/lib/i18n/server";
import { requireTenantPagePermission } from "@/lib/tenant-guard";

import { SubscriptionSection } from "../subscription-section";

export const dynamic = "force-dynamic";

/*
 * Judul & kalimat kartu memakai variabel token AntD — keduanya dirender DI
 * DALAM `Card`, dan `Card` adalah komponen AntD yang membawa `css-var-root`
 * tempat variabelnya dipasang (#227). Di luar pohon itu variabelnya tidak
 * teratasi; lihat catatan yang sama di beranda (#199).
 */
const CARD_HEADING: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const CARD_BODY: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Kepala kartu bernada `violet` — wilayah "katalog paket" (#303).
 *
 * Kartu ini adalah PINTU menuju `/platform/billing/plans`, jadi ia memakai hue
 * tujuannya, bukan hue halamannya. Warna di sini menjawab "saya akan dibawa ke
 * mana", dan itu satu-satunya alasan ia berwarna.
 *
 * ⚠ Radius atas wajib — kepala adalah anak pertama `.ant-card`, yang tidak
 * memasang `overflow: hidden`.
 */
const UPGRADE_HEAD: React.CSSProperties = {
  background: platformHead("violet"),
  borderTopLeftRadius: "var(--ant-border-radius-lg)",
  borderTopRightRadius: "var(--ant-border-radius-lg)",
};

export default async function PlatformBillingPage() {
  const { tenant } = await requireTenantPagePermission("tenant.billing");
  const t = await getT();

  const overview = await billingOverviewForTenant(tenant.tenantId);

  return (
    <>
      <PageHeader
        title={t("tenantSettings.title")}
        description={t("tenantSettings.description")}
        breadcrumbs={[
          { label: t("platform.title"), href: "/platform" },
          { label: t("tenantSettings.title") },
        ]}
        actions={
          <Button href="/platform/billing/plans" variant="outline" size="sm">
            {t("platform.plansViewLabel")}
            <ArrowRightOutlined aria-hidden="true" />
          </Button>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <SubscriptionSection overview={overview} />

        {/* Jalan keluar dari halaman ini menuju pertanyaan yang paling sering
            menyusul setelah membaca tagihan: "kalau saya butuh lebih?" —
            dijawab di katalog, bukan di sini, sebab jawabannya adalah
            perbandingan, bukan satu angka. */}
        <Card>
          <CardHeader style={UPGRADE_HEAD}>
            <h2 style={CARD_HEADING}>{t("platform.plansUpgradeHeading")}</h2>
          </CardHeader>
          {/* Kalimat dan tombol berdampingan saat muat, bertumpuk saat tidak —
              `flexWrap` menggantikan `sm:flex-row`, tanpa media query. */}
          <CardContent>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <p style={{ ...CARD_BODY, flex: "1 1 260px" }}>
                {t("platform.plansDescription")}
              </p>
              {/*
               * `outline`: ini SALINAN KETIGA dari tautan yang sama di satu
               * layar — kepala halaman, pita masa coba di `SubscriptionSection`,
               * lalu kartu ini. Yang berisi penuh sebelumnya adalah salinan
               * ketiga itu, sehingga tiga tombol berlabel "Lihat paket"
               * berlomba dan yang paling menonjol justru yang paling jauh dari
               * alasan orang membuka halaman ini.
               *
               * Yang boleh primer di layar ini tinggal dua, dan keduanya
               * berkondisi: pita masa coba saat `trial.urgent`
               * (`subscription-section.tsx`), dan tombol simpan profil pajak —
               * satu-satunya aksi MENGIKAT di halaman yang selebihnya bacaan.
               * Lihat MASTER.md §Aksi utama.
               */}
              <Button href="/platform/billing/plans" variant="outline" style={{ flexShrink: 0 }}>
                {t("platform.plansViewLabel")}
                <ArrowRightOutlined aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
