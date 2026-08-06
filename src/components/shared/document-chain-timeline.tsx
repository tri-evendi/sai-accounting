import { FileText, Truck, Receipt, Wallet, Check, Minus, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { ChainStatus, ContractChainStage } from "@/lib/document-chain";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Timeline dokumen berantai (issue #15): Kontrak → Surat Jalan → Faktur →
 * Pembayaran, dengan progres tiap tahap.
 *
 * Status tidak pernah warna saja (MASTER.md §Anti-Patterns): setiap tahap
 * membawa badge BERTEKS dan ikon, jadi ia terbaca sama oleh pengguna buta warna
 * maupun di atas kertas.
 *
 * ── Kembali menjadi server component (issue #227) ──────────────────────────
 * Berkas ini sempat menyeberang jadi client di #194, dan yang memindahkannya
 * bukan interaktivitas — ia tetap tanpa satu pun penangan kejadian — melainkan
 * WARNA: cincin tahapnya memakai pasangan token AntD, dan token AntD dulu hanya
 * bisa dibaca lewat `theme.useToken()`, sebuah hook.
 *
 * Sejak #227 alasan itu hilang. `AntdProvider` memberi `cssVar` sebuah KUNCI
 * tetap dan root layout memasang kunci itu di `<html>`, jadi blok
 * `.sai-tokens{--ant-…}` berdiri di HTML pertama dan diwarisi seluruh dokumen —
 * termasuk pohon ini, yang tidak punya satu pun komponen AntD di atasnya.
 * Warnanya karena itu ditulis sebagai `var(--ant-…)` biasa, benar sejak render
 * pertama dan ikut berganti saat tema diubah tanpa render ulang. Alasan lengkap
 * beserta urutan penyisipannya di `lib/theme/antd-tokens.ts`.
 *
 * Konsekuensi praktisnya: berkas ini **tidak boleh mengimpor `antd`** (dijaga
 * `tests/rsc-boundary.test.ts`). `Flex` karena itu diganti `display:flex` biasa
 * dengan jarak dari token yang sama yang dipakai `Flex` sendiri
 * (`flexGap` = `padding` 16px untuk "middle", `flexGapSM` = `paddingXS` 8px
 * untuk "small") — bukan angka baru.
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

/** Tebal cincin bulatan tahap — dua kali `lineWidth`, jadi ia terbaca sebagai cincin. */
const RING_WIDTH = 2;

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
 * Konstanta modul, bukan fungsi bertoken lagi: nilainya kini nama VARIABEL,
 * dan variabelnya yang berganti bersama tema — bukan berkas ini.
 */
const STATUS_RING: Record<ChainStatus, React.CSSProperties> = {
  selesai: {
    borderColor: "var(--ant-color-success)",
    background: "var(--ant-color-success-bg)",
    color: "var(--ant-color-money-positive)",
  },
  sebagian: {
    borderColor: "var(--ant-color-warning)",
    background: "var(--ant-color-warning-bg)",
    color: "var(--ant-color-money-pending)",
  },
  belum: {
    borderColor: "var(--ant-color-border-secondary)",
    background: "var(--ant-color-fill-secondary)",
    color: "var(--ant-color-text-secondary)",
  },
};

function stageAmount(stage: ContractChainStage, currency: string): string {
  if (stage.unit === "IDR") {
    return `${formatCurrency(stage.done, currency)} / ${formatCurrency(stage.target, currency)}`;
  }
  return `${formatNumber(stage.done)} / ${formatNumber(stage.target)} kg`;
}

export async function DocumentChainTimeline({
  stages,
  currency = "IDR",
}: {
  stages: ContractChainStage[];
  /** Currency of the money-denominated stage (payments are summed in IDR base). */
  currency?: string;
}) {
  const t = await getT();
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
    <ol
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--ant-padding)",
        margin: 0,
        padding: 0,
        listStyle: "none",
      }}
    >
      {stages.map((stage, i) => {
        const Icon = stageIcons[stage.key];
        const Mark = statusMark[stage.status];
        const badge = statusBadge[stage.status];
        return (
          <li
            key={stage.key}
            style={{ flex: `1 1 ${STAGE_BASIS}px`, minWidth: 0, listStyle: "none" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--ant-padding-xs)",
                height: "100%",
                padding: "var(--ant-padding)",
                borderRadius: "var(--ant-border-radius-lg)",
                border: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
                background: "var(--ant-color-bg-container)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--ant-padding-xs)",
                }}
              >
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
                    borderWidth: RING_WIDTH,
                    ...STATUS_RING[stage.status],
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
                      fontWeight: "var(--ant-font-weight-strong)",
                    }}
                  >
                    <span style={{ color: "var(--ant-color-text-secondary)" }}>{i + 1}. </span>
                    {t(stageLabelKeys[stage.key])}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--ant-font-size-sm)",
                      color: "var(--ant-color-text-secondary)",
                    }}
                  >
                    {t("aging.docCount", { count: stage.count })}
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--ant-padding-xs)",
                }}
              >
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
                    fontSize: "var(--ant-font-size-sm)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {stageAmount(stage, currency)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
