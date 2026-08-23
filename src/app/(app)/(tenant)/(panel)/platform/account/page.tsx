/**
 * `/platform/account` — identitas AKUN, dan satu-satunya tempat namanya bisa
 * diganti (issue #458).
 *
 * ══ KENAPA RUTE SENDIRI, BUKAN BAGIAN DI `/platform` ═══════════════════════
 * Alasan yang sama yang memecah panel menjadi empat rute (lihat kepala
 * `platform/page.tsx`): pemisahan kewenangan yang bergantung pada
 * `{canX && …}` di dalam satu pohon render adalah pemisahan yang hilang pada
 * penyuntingan berikutnya. Sebagai rute tersendiri, penjaganya berdiri di
 * baris pertama halaman dan penolakannya adalah PANTULAN — batas yang jauh
 * lebih sulit dilanggar tanpa sengaja.
 *
 * ══ NAMA, BUKAN ALAMAT ═════════════════════════════════════════════════════
 * Halaman ini mengganti nama TAMPILAN akun. Slug di `/t/<slug>/…` sengaja
 * ditampilkan tetapi tidak bisa disunting: ia sudah terlanjur ada di bookmark,
 * di surel undangan yang sudah terkirim, dan di tautan yang dibagikan ke
 * akuntan eksternal. Menggantinya menuntut pengalihan permanen + pemesanan
 * slug lama, dan itu pekerjaan tersendiri (#458 lingkup 3).
 *
 * Yang TIDAK dilakukan: menyembunyikan slug-nya supaya pertanyaannya tidak
 * muncul. Ia dipajang apa adanya beserta kalimat yang menyatakan ia tetap —
 * pemilik akun berhak tahu alamat bukunya berisi apa.
 */

import type { Metadata } from "next";
import { IdcardOutlined } from "@ant-design/icons";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { controlDb } from "@/lib/control-db";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { bolehGantiLagi } from "@/lib/tenant-slug";

import { AccountNameForm } from "./account-name-form";
import { AccountSlugForm } from "./account-slug-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("platform.accountTitle") };
}

export default async function PlatformAccountPage() {
  const { tenant } = await requireTenantPagePermission("tenant.settings");
  const t = await getT();

  /* Kapan slug boleh diganti lagi dibaca DI SERVER: tombol yang hidup di layar
     lalu ditolak 409 oleh server adalah tombol yang berbohong. Pagarnya tetap
     di server (route-nya memeriksa ulang); ini yang membuat layarnya jujur. */
  const baris = await controlDb.tenant.findUnique({
    where: { id: tenant.tenantId },
    select: { slugChangedAt: true },
  });
  const bolehPada = bolehGantiLagi(baris?.slugChangedAt ?? null);

  return (
    <div>
      <PageHeader
        title={t("platform.accountTitle")}
        description={t("platform.accountDescription")}
        breadcrumbs={[
          { label: t("platform.title"), href: "/platform" },
          { label: t("platform.accountTitle") },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle level={2}>
            <IdcardOutlined aria-hidden="true" style={{ fontSize: 18 }} /> {t("platform.accountIdentity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AccountNameForm nama={tenant.tenantName} slug={tenant.tenantSlug} />
        </CardContent>
      </Card>

      {/* Alamat berdiri di KARTU SENDIRI, bukan di bawah nama: dua tindakan
          dengan akibat yang sangat berbeda tidak boleh terbaca sebagai dua
          isian dari satu formulir. */}
      <Card style={{ marginTop: 24 }}>
        <CardHeader>
          <CardTitle level={2}>{t("tenantSlug.heading")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountSlugForm
            slug={tenant.tenantSlug}
            bolehGantiPada={bolehPada ? bolehPada.toISOString() : null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
