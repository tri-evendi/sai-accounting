"use client";

import { Flex, theme } from "antd";
import { FileText, Truck, Receipt, Wallet, Check, Minus, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { ChainStatus, ContractChainStage } from "@/lib/document-chain";
import { useT } from "@/lib/i18n/client";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { moneyPalette } from "@/lib/theme/antd-tokens";

/**
 * Timeline dokumen berantai (issue #15): Kontrak → Surat Jalan → Faktur →
 * Pembayaran, dengan progres tiap tahap.
 *
 * Status tidak pernah warna saja (MASTER.md §Anti-Patterns): setiap tahap
 * membawa badge BERTEKS dan ikon, jadi ia terbaca sama oleh pengguna buta warna
 * maupun di atas kertas.
 *
 * ── Kenapa ia menyeberang jadi client component (issue #194) ───────────────
 * Sebelumnya server component: ia hanya memformat angka yang sudah dihitung
 * halamannya. Yang mengubahnya adalah WARNA — cincin tahap memakai pasangan
 * latar/teks token (`colorSuccessBg` + `colorMoneyPositive`), dan token AntD
 * hanya bisa dibaca lewat `theme.useToken()`, sebuah hook.
 *
 * Dua jalan lain sudah dicoba dan ditolak:
 *  • Variabel CSS `var(--ant-…)`. Nilainya memang ditulis `ConfigProvider`
 *    (cssVar menyala bawaan di AntD v6), TETAPI hanya pada elemen ber-kelas
 *    `css-var-root` yang dipasang komponen AntD sendiri — dan tak ada satu pun
 *    komponen AntD di atas komponen ini pada pohon halaman kontrak. Variabelnya
 *    karena itu tidak pernah teratasi, dan warnanya diam-diam jatuh ke warisan.
 *  • Mengimpor `Flex` AntD sambil tetap server component. Ditolak penjaga
 *    `tests/rsc-boundary.test.ts`, dan penjaga itu benar: AntD hanya boleh
 *    diimpor dari modul client.
 *
 * Harganya kecil dan terukur: komponen ini dirender SEKALI per halaman kontrak,
 * dengan empat tahap; propnya adalah data biasa yang halamannya sudah hitung.
 * Halaman kontraknya sendiri TETAP server component — yang menyeberang adalah
 * daun, bukan pengambilan datanya.
 */

/**
 * Lebar dasar satu kartu tahap. Menggantikan `sm:grid-cols-2 lg:grid-cols-4`:
 * kartu tumbuh membagi baris dan turun sendiri saat tak muat, jadi 375px
 * memberi satu kolom dan 1440px memberi empat — tanpa titik patah yang harus
 * dijaga tetap sama dengan titik patah lain.
 */
const STAGE_BASIS = 240;

/** Bulatan ikon tahap — sebesar `h-10 w-10` sebelum migrasi. */
const STAGE_BULLET = 40;

const stageIcons = {
  contract: FileText,
  delivery: Truck,
  invoice: Receipt,
  payment: Wallet,
} as const;

const statusBadge: Record<
  ChainStatus,
  { variant: "success" | "warning" | "default"; labelKey: DictionaryKey }
> = {
  selesai: { variant: "success", labelKey: "chainStatus.selesai" },
  sebagian: { variant: "warning", labelKey: "chainStatus.sebagian" },
  belum: { variant: "default", labelKey: "chainStatus.belum" },
};

/**
 * Nama tahap diambil dari KUNCI tahap, bukan dari `stage.label`: labelnya
 * disusun `lib/document-chain.ts` yang menarik Prisma, jadi teksnya tidak bisa
 * ikut ke kamus di sana. Nilai literal di modul itu tetap ada sebagai bahasa
 * sumber, persis seperti `label` di `WORKFLOWS`.
 */
const stageLabelKeys: Record<ContractChainStage["key"], DictionaryKey> = {
  contract: "chainStage.contract",
  delivery: "chainStage.delivery",
  invoice: "chainStage.invoice",
  payment: "chainStage.payment",
};

const statusMark = {
  selesai: Check,
  sebagian: Clock,
  belum: Minus,
} as const;

/**
 * Rupa cincin bulatan tahap. Berpasangan dengan ikon tanda, tak pernah sendiri.
 *
 * Pasangan latar/teksnya mengikuti aturan yang sama dengan `Tag` (#187): latar
 * TIPIS (`color*Bg`) dengan teks anak tangga uang (#186) — bukan `colorSuccess`
 * pekat sebagai warna teks, yang di ukuran ini hanya 2,21:1.
 *
 * Fungsi, bukan konstanta modul: nilainya token yang berganti bersama tema.
 */
type RingToken = ReturnType<typeof theme.useToken>["token"];

function statusRing(
  status: ChainStatus,
  token: RingToken,
  money: ReturnType<typeof moneyPalette>
): React.CSSProperties {
  if (status === "selesai") {
    return {
      borderColor: token.colorSuccess,
      background: token.colorSuccessBg,
      color: money.colorMoneyPositive,
    };
  }
  if (status === "sebagian") {
    return {
      borderColor: token.colorWarning,
      background: token.colorWarningBg,
      color: money.colorMoneyPending,
    };
  }
  return {
    borderColor: token.colorBorderSecondary,
    background: token.colorFillSecondary,
    color: token.colorTextSecondary,
  };
}

function stageAmount(stage: ContractChainStage, currency: string): string {
  if (stage.unit === "IDR") {
    return `${formatCurrency(stage.done, currency)} / ${formatCurrency(stage.target, currency)}`;
  }
  return `${formatNumber(stage.done)} / ${formatNumber(stage.target)} kg`;
}

export function DocumentChainTimeline({
  stages,
  currency = "IDR",
}: {
  stages: ContractChainStage[];
  /** Currency of the money-denominated stage (payments are summed in IDR base). */
  currency?: string;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  return (
    /*
     * Garis penghubung antar-tahap DIHAPUS, bukan dipindahkan. Ia dulu
     * `absolute … hidden lg:block` — dekorasi (`aria-hidden`) yang hanya benar
     * ketika keempat kartu kebetulan berada di satu baris. Tata letaknya kini
     * membungkus sendiri sesuai lebar, jadi garis itu tidak lagi punya cara
     * mengetahui apakah tahap berikutnya ada di sebelah kanan atau di baris
     * bawah — dan garis yang menunjuk ke tempat yang salah lebih buruk
     * daripada tidak ada garis. Urutannya tetap terbaca: nomor "1." … "4." ada
     * di setiap judul tahap, dan `<ol>`-nya tetap daftar berurutan.
     */
    <Flex component="ol" wrap gap="middle" style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {stages.map((stage, i) => {
        const Icon = stageIcons[stage.key];
        const Mark = statusMark[stage.status];
        const badge = statusBadge[stage.status];
        return (
          <li
            key={stage.key}
            style={{ flex: `1 1 ${STAGE_BASIS}px`, minWidth: 0, listStyle: "none" }}
          >
            <Flex
              vertical
              gap="small"
              style={{
                height: "100%",
                padding: token.padding,
                borderRadius: token.borderRadiusLG,
                border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                background: token.colorBgContainer,
              }}
            >
              <Flex align="center" gap="small">
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: STAGE_BULLET,
                    height: STAGE_BULLET,
                    flexShrink: 0,
                    borderRadius: "50%",
                    borderStyle: "solid",
                    borderWidth: 2,
                    ...statusRing(stage.status, token, money),
                  }}
                >
                  <Icon size="1em" aria-hidden />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: token.fontWeightStrong,
                    }}
                  >
                    <span style={{ color: token.colorTextSecondary }}>{i + 1}. </span>
                    {t(stageLabelKeys[stage.key])}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: token.fontSizeSM,
                      color: token.colorTextSecondary,
                    }}
                  >
                    {t("aging.docCount", { count: stage.count })}
                  </p>
                </div>
              </Flex>
              <Flex align="center" justify="space-between" gap="small">
                {/* Ikon berukuran `1em` = `fontSizeSM` milik `Tag`; jaraknya
                    dari `.ant-tag > svg + span`, jadi labelnya wajib `<span>`. */}
                <Badge variant={badge.variant}>
                  <Mark size="1em" aria-hidden />
                  <span>{t(badge.labelKey)}</span>
                </Badge>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "right",
                    fontSize: token.fontSizeSM,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {stageAmount(stage, currency)}
                </span>
              </Flex>
            </Flex>
          </li>
        );
      })}
    </Flex>
  );
}
