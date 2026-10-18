"use client";

/**
 * LAYAR STATUS — satu rupa untuk setiap "halaman ini tidak bisa ditampilkan":
 * batas galat (`error.tsx`), 404 (`not-found.tsx`, `global-not-found.tsx`), dan
 * galat root (`global-error.tsx`), di KEDUA aplikasi.
 *
 * Diangkat dari `(dashboard)/error.tsx` dan `(tenant)/(panel)/platform/error.tsx`,
 * yang dulu menyalin tata letak yang sama baris demi baris — "dua layar galat
 * yang berbeda jarak dan berbeda warna lingkaran ikonnya adalah cacat yang hanya
 * terlihat kalau seseorang kebetulan memicu keduanya". Dengan satu primitif,
 * salinan ketiga sampai kedelapan tidak pernah lahir.
 *
 * TEKS DATANG LEWAT PROP, bukan `useT()`: layar ini juga dipakai di permukaan
 * TANPA `<LocaleProvider>` (pemasaran, `global-error`), dan di sana `useT()`
 * hanya memulangkan kuncinya. Pemanggil yang punya provider menerjemahkan
 * sendiri; yang tidak, memakai `useLoadedDictionary()`.
 *
 * Tombol "pulang" SENGAJA `<Button href>` (pemuatan PENUH), bukan `<ButtonLink>`
 * (#289): ini jalan keluar dari render yang gagal, dan satu-satunya cara
 * memastikan tidak ada sisa keadaan rusak (cache router yang memuat segmen
 * beracun, muatan RSC yang gagal terurai) adalah memulai dokumen baru.
 *
 * Tidak bergantung pada `ConfigProvider`: `theme.useToken()` memulangkan token
 * bawaan bila tidak ada provider — dan `global-error` memang dirender TANPA
 * provider, karena yang barusan meledak bisa jadi provider itu sendiri.
 */
import { Flex, Typography, theme } from "antd";
import { QuestionCircleOutlined, WarningOutlined } from "@ant-design/icons";

import { Button } from "./button";
import { Card, CardContent } from "./card";
import { moneyPalette } from "../theme/antd-tokens";

const { Title, Text } = Typography;

export interface StatusScreenProps {
  /** `error` = sesuatu rusak; `notFound` = alamatnya tidak ada. Menentukan ikon & warnanya. */
  kind: "error" | "notFound";
  title: string;
  description: string;
  /** Baris kecil bermonospasi — kode digest galat, untuk dicocokkan dengan log server. */
  detail?: string;
  /** Tombol utama "coba lagi" — hanya untuk galat yang bisa dipulihkan. */
  retry?: { label: string; onRetry: () => void };
  /** Jalan pulang. Pemuatan penuh, lihat kepala berkas. */
  home: { label: string; href: string };
  /** Tinggi minimum area — `100vh` untuk layar yang menggantikan seluruh dokumen. */
  minHeight?: string;
}

export function StatusScreen({ kind, title, description, detail, retry, home, minHeight = "60vh" }: StatusScreenProps) {
  const { token } = theme.useToken();
  const galat = kind === "error";

  return (
    <Flex align="center" justify="center" style={{ minHeight, padding: token.padding }}>
      <Card style={{ maxWidth: 448, width: "100%" }}>
        <CardContent>
          <Flex vertical align="center" gap={token.margin} style={{ textAlign: "center" }}>
            <Flex
              align="center"
              justify="center"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: galat ? token.colorErrorBg : token.colorFillSecondary,
                /* Ikon adalah bentuk, bukan teks — 3:1 sudah cukup. Galat memakai
                   token uang negatif supaya sewarna dengan galat lain di aplikasi
                   ini; 404 bukan kegagalan, jadi ia netral. */
                color: galat ? moneyPalette(token).colorMoneyNegative : token.colorTextSecondary,
              }}
            >
              {galat ? (
                <WarningOutlined aria-hidden="true" style={{ fontSize: 24 }} />
              ) : (
                <QuestionCircleOutlined aria-hidden="true" style={{ fontSize: 24 }} />
              )}
            </Flex>

            <Flex vertical gap={token.marginXXS}>
              <Title level={1} style={{ fontSize: token.fontSizeLG, marginBlock: 0 }}>
                {title}
              </Title>
              <Text type="secondary" style={{ lineHeight: 1.625 }}>
                {description}
              </Text>
              {detail && (
                <Text type="secondary" style={{ fontFamily: "monospace", fontSize: token.fontSizeSM }}>
                  {detail}
                </Text>
              )}
            </Flex>

            {/* Satu primer per layar (#267): dengan "coba lagi", pulang turun ke
                sekunder; tanpanya, pulang-lah satu-satunya aksi. Dua cabang
                eksplisit, bukan `variant={retry ? …}` — keduanya tidak pernah
                terender bersamaan, dan penjaga penekanan menghitungnya begitu. */}
            <Flex wrap align="center" justify="center" gap={token.marginSM}>
              {retry ? (
                <>
                  <Button variant="primary" onClick={() => retry.onRetry()}>
                    {retry.label}
                  </Button>
                  <Button href={home.href} variant="secondary">
                    {home.label}
                  </Button>
                </>
              ) : (
                <Button href={home.href} variant="primary">
                  {home.label}
                </Button>
              )}
            </Flex>
          </Flex>
        </CardContent>
      </Card>
    </Flex>
  );
}
