"use client";

/**
 * Daftar perusahaan yang bisa dibuka + tindakan memilihnya (issue #104).
 *
 * ══ MEMUAT ULANG PENUH, BUKAN NAVIGASI KLIEN ═══════════════════════════════
 * Setelah `update({ companyId })` berhasil, halaman dipindahkan dengan
 * `window.location.assign` — bukan `router.push`. Ini bukan kemalasan.
 *
 * Berganti perusahaan mengubah SEGALANYA yang di-cache di sisi klien: izin
 * efektif, himpunan modul aktif, identitas perusahaan yang tercetak di
 * dokumen, dan setiap hasil query React yang masih tersimpan. Navigasi klien
 * mempertahankan cache itu, sehingga ada jendela — sekejap, tapi nyata — di
 * mana menu PT A dirender di atas data PT B. Di aplikasi akuntansi, kebingungan
 * seperti itu persis yang tidak boleh terjadi.
 *
 * Anggap berganti perusahaan sebagai "masuk ke buku yang lain", bukan sebagai
 * mengubah penyaring.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Flex, Typography, theme } from "antd";
import { CheckOutlined, ShopOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { tenantPath } from "@/lib/tenant-routes";

const { Text } = Typography;

/** Kotak ikon perusahaan — bekas `h-9 w-9`. */
const AVATAR = 36;

export interface CompanyChoice {
  id: number;
  name: string;
  slug: string;
}

export function CompanyChoices({
  companies,
  activeId,
}: {
  companies: CompanyChoice[];
  activeId: number | null;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const { data: session, update } = useSession();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function open(companyId: number, companySlug: string) {
    setBusyId(companyId);
    // Keanggotaannya diperiksa ULANG di server (lihat callback `jwt` di
    // lib/auth.ts) — angka yang dikirim dari sini tidak pernah dipercaya.
    await update({ companyId });
    /*
     * Langsung ke jalur kanonik bila slug tenantnya ada (issue #157): lewat
     * `/dashboard` pun sampai, tapi itu satu pantulan tambahan tepat pada
     * langkah yang paling sering diulang orang bermulti-PT. Tanpa slug tenant
     * — sesi terbitan sebelum #157 — jalur lama tetap benar; pengarah
     * `/dashboard` yang mencarikan slugnya ke basis data.
     */
    const tenantSlug = session?.user?.tenantSlug;
    window.location.assign(
      tenantSlug ? tenantPath(tenantSlug, companySlug, "/dashboard") : "/dashboard"
    );
  }

  return (
    /* `component="ul"`: daftar perusahaan tetap sebuah LIST bagi pembaca layar
       ("daftar, 3 butir"), sementara jaraknya tetap milik `Flex`. Menyisipkan
       `<div>` di antara `<ul>` dan `<li>` akan memutus hubungan itu. */
    <Flex
      component="ul"
      vertical
      gap={token.marginXS}
      style={{ listStyle: "none", margin: 0, padding: 0 }}
    >
      {companies.map((company) => {
          const isActive = company.id === activeId;
          return (
            <li key={company.id}>
              <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                style={{
                  padding: token.paddingSM,
                  borderRadius: token.borderRadiusLG,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Flex align="center" gap={token.marginSM} style={{ minWidth: 0 }}>
                  <Flex
                    align="center"
                    justify="center"
                    style={{
                      width: AVATAR,
                      height: AVATAR,
                      flexShrink: 0,
                      borderRadius: token.borderRadius,
                      background: token.colorFillQuaternary,
                      color: token.colorTextSecondary,
                    }}
                  >
                    <ShopOutlined aria-hidden="true" style={{ fontSize: 16 }} />
                  </Flex>
                  <div style={{ minWidth: 0 }}>
                    <Text strong ellipsis style={{ display: "block" }}>
                      {company.name}
                    </Text>
                    <Text
                      type="secondary"
                      ellipsis
                      style={{ display: "block", fontSize: token.fontSizeSM }}
                    >
                      {company.slug}
                    </Text>
                  </div>
                </Flex>

                {isActive ? (
                  <Flex
                    align="center"
                    gap={token.marginXXS}
                    style={{
                      flexShrink: 0,
                      fontSize: token.fontSizeSM,
                      color: token.colorTextSecondary,
                    }}
                  >
                    <CheckOutlined aria-hidden="true" style={{ fontSize: 14 }} />
                    {t("auth.selectCompany.currentLabel")}
                  </Flex>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    style={{ flexShrink: 0 }}
                    disabled={busyId !== null}
                    onClick={() => void open(company.id, company.slug)}
                  >
                    {busyId === company.id
                      ? t("auth.selectCompany.switching")
                      : t("auth.selectCompany.openLabel")}
                  </Button>
                )}
              </Flex>
            </li>
        );
      })}
    </Flex>
  );
}
