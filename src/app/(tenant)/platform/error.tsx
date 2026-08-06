"use client";

/**
 * Batas galat untuk seluruh permukaan `/platform`.
 *
 * ══ KENAPA HALAMAN INI PUNYA TARUHAN SENDIRI ═══════════════════════════════
 * Grup `(dashboard)` sudah punya `error.tsx` dengan alasan yang tertulis di
 * kepalanya: tanpa batas galat, satu halaman yang gagal render melompat ke
 * layar bawaan Next.js — polos, tanpa cangkang, tanpa jalan kembali selain
 * reload. Di sini akibatnya lebih buruk daripada di dasbor.
 *
 * `/platform` adalah PENDARATAN pasca-masuk setiap pelanggan, dan sebagian
 * pengunjungnya belum punya satu pun PT — itulah sebabnya ia hidup di grup
 * `(tenant)`. Layar galat bawaan Next.js tidak membawa sidebar, tidak membawa
 * bilah atas, dan karena itu tidak membawa tombol KELUAR maupun penanda "akun
 * siapa". Yang tersisa bagi orang yang baru mendaftar adalah halaman putih
 * tanpa satu pun kendali: persis "jalan buntu" yang dilarang MASTER.md
 * §Orientasi Perusahaan untuk layar tanpa chrome aplikasi.
 *
 * Karena berkas ini berada DI DALAM `platform/layout.tsx`, galatnya tertangkap
 * di dalam cangkang panel — menu, penanda akun, dan tombol keluar tetap ada.
 *
 * ⚠ DUA JALAN KELUAR, dan keduanya harus tetap ada setelah konversi AntD
 * (#200): "Coba lagi" (`reset()`) dan tautan kembali ke `/platform`. Tombol
 * keduanya menuju `/platform`, BUKAN `error.toHome` ("Ke Beranda") yang dipakai
 * dasbor: beranda adalah buku sebuah PT, dan menawarkannya kepada pemilik yang
 * belum punya PT berarti mengirimnya ke pantulan berikutnya.
 */
import { useEffect } from "react";
import Link from "next/link";
import { Flex, Typography, theme } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { moneyPalette } from "@/lib/theme/antd-tokens";

const { Title, Text } = Typography;

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  const { token } = theme.useToken();

  useEffect(() => {
    // Digest memetakan ke baris log produksi bila perlu ditelusuri.
    console.error("Platform route error:", error);
  }, [error]);

  return (
    <Flex align="center" justify="center" style={{ minHeight: "60vh" }}>
      <Card style={{ maxWidth: 448 }}>
        <CardContent>
          <Flex vertical align="center" gap={token.margin} style={{ textAlign: "center" }}>
            <Flex
              align="center"
              justify="center"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: token.colorErrorBg,
                /* Ikon adalah bentuk, bukan teks — 3:1 sudah cukup; tapi token
                   uang negatif dipakai supaya ia sewarna dengan galat lain di
                   aplikasi ini. */
                color: moneyPalette(token).colorMoneyNegative,
              }}
            >
              <WarningOutlined aria-hidden="true" style={{ fontSize: 24 }} />
            </Flex>

            <Flex vertical gap={token.marginXXS}>
              <Title level={1} style={{ fontSize: token.fontSizeLG, marginBlock: 0 }}>
                {t("error.title")}
              </Title>
              <Text type="secondary" style={{ lineHeight: 1.625 }}>
                {t("error.description")}
              </Text>
              {error.digest && (
                <Text
                  type="secondary"
                  style={{ fontFamily: "monospace", fontSize: token.fontSizeSM }}
                >
                  {t("error.code", { digest: error.digest })}
                </Text>
              )}
            </Flex>

            <Flex wrap align="center" justify="center" gap={token.marginSM}>
              <Button onClick={() => reset()}>{t("error.retry")}</Button>
              <Button asChild variant="secondary">
                <Link href="/platform">{t("platform.title")}</Link>
              </Button>
            </Flex>
          </Flex>
        </CardContent>
      </Card>
    </Flex>
  );
}
