"use client";

/**
 * Batas galat tingkat-rute untuk seluruh dashboard.
 *
 * Sebelum ini tak ada `error.tsx` sama sekali: satu halaman yang gagal render
 * (mis. `/receivables` saat ada dokumen ber-currency tak sah) melompat ke
 * layar galat bawaan Next.js — polos, tanpa sidebar, tanpa jalan kembali selain
 * reload. Karena file ini berada di dalam `(dashboard)/layout.tsx`, galat kini
 * tertangkap DI DALAM cangkang: sidebar & navbar tetap ada, pengguna dapat
 * mencoba lagi (`reset()`) atau pindah halaman tanpa kehilangan konteks.
 *
 * ── Tanpa satu kelas Tailwind pun (PR penutup #201/#240) ───────────────────
 * Kembarannya `(tenant)/platform/error.tsx` sudah dikonversi di #200; berkas
 * ini tertinggal karena ia bukan halaman dan bukan komponen, jadi tak masuk
 * lingkup issue mana pun. Susunannya kini dibuat SAMA dengan kembarannya itu —
 * dua layar galat yang berbeda jarak dan berbeda warna lingkaran ikonnya adalah
 * cacat yang hanya terlihat kalau seseorang kebetulan memicu keduanya.
 */
import { useEffect } from "react";
import { Flex, Typography, theme } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { Link } from "@/components/ui/app-link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { moneyPalette } from "@/lib/theme/antd-tokens";
import { useT } from "@/lib/i18n/client";

const { Title, Text } = Typography;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  const { token } = theme.useToken();

  useEffect(() => {
    // Ter-log di server (dev console / pm2). Digest memetakan ke baris log
    // produksi bila perlu ditelusuri.
    console.error("Dashboard route error:", error);
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
              <Button variant="primary" onClick={() => reset()}>{t("error.retry")}</Button>
              <Link href="/dashboard">
                <Button variant="secondary">{t("error.toHome")}</Button>
              </Link>
            </Flex>
          </Flex>
        </CardContent>
      </Card>
    </Flex>
  );
}
