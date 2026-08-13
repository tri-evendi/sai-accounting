/**
 * Presentation pieces shared by /receivables and /payables (issue #12).
 *
 * Kept together so an AR row and an AP row cannot drift into looking different:
 * the two screens answer the same question pointed in opposite directions, and a
 * user reading both should not have to relearn the badges or the bucket order.
 *
 * Every status carries an icon *and* a word — per the design system, colour is
 * never the only signal (MASTER.md §Anti-Patterns).
 *
 * ── Batas yang membentuk berkas ini (issue #194) ──────────────────────────
 * Semua komponen di sini **wajib tetap server component**, dan alasannya bukan
 * selera: `AGING_BUCKETS` datang dari `lib/receivables.ts`, yang mengimpor
 * Prisma. Menaruh `"use client"` di kepala berkas ini akan menyeret klien Prisma
 * ke bundel peramban — kegagalan build yang sama persis dengan yang tercatat di
 * kepala `ui/learn-more.tsx`. `AgeCell` dan `PaymentStatusBadge` juga dirender
 * SEKALI PER BARIS di Piutang dan Utang; menjadikannya client berarti setiap
 * baris kedua layar itu ikut menyeberang.
 *
 * Konsekuensinya untuk gaya, dan ini yang harus dipahami sebelum menyuntingnya:
 * **berkas ini tidak boleh mengimpor `antd`** (dijaga `tests/rsc-boundary.test.ts`)
 * dan karena itu tidak bisa memanggil `theme.useToken()`. Warna karena itu
 * datang dari dua sumber saja:
 *
 *  • **Primitif yang mewarnai dirinya sendiri** — `Badge` (token `Tag`),
 *    `Money` (token uang #186), `Card` (permukaan & tepi AntD). Ketiganya
 *    komponen client yang dirender sebagai DAUN, jadi batas RSC tidak bergeser.
 *  • **Variabel CSS `--ant-…`**, dan sejak issue #227 itu berlaku di mana pun
 *    di dokumen — bukan lagi hanya di dalam pohon sebuah komponen AntD.
 *    `AntdProvider` memberi `cssVar` sebuah KUNCI tetap dan root layout
 *    memasang kunci itu di `<html>`, jadi blok `.sai-tokens{--ant-…}` berdiri
 *    di HTML pertama dan diwarisi seluruh halaman. Alasan lengkap beserta
 *    urutan penyisipannya di `lib/theme/antd-tokens.ts`.
 *
 * `AgeCell` dan kedua catatan kaki di bawah karena itu MENDAPAT kembali warna
 * hierarkinya (`--ant-color-text-secondary`, dan amber #186 untuk catatan
 * dokumen tanpa kurs) — hilang di #194 karena jalan di atas belum ada. Yang
 * TIDAK berubah: warna tetap bukan penanda tunggal. Ukuran (`<small>`), kata,
 * dan ikon tetap membawa maknanya sendiri.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import { CheckCircleOutlined, ClockCircleOutlined, MinusCircleOutlined, QuestionCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { AGING_BUCKETS, type AgingBucket, type PaymentStatus } from "@/lib/receivables";
import { getT } from "@/lib/i18n/server";
/* `ChartCard` server, `AgingChart` client — batas RSC-nya sama persis dengan
   pemakaian grafik lain (beranda, /inventory, /reports/cash-flow), jadi berkas
   ini TETAP server component. Dijaga `tests/rsc-boundary.test.ts`. */
import { ChartCard } from "@/components/dashboard/chart-card";
import { AgingChart } from "@/components/shared/dashboard-charts";

/**
 * Lebar dasar satu kartu ember umur. Menggantikan
 * `sm:grid-cols-2 lg:grid-cols-5`: kelima kartu tumbuh membagi baris dan turun
 * sendiri saat tak muat — satu kolom di 375px, lima berjajar di 1440px.
 */
const BUCKET_BASIS = 180;

/**
 * Jarak yang tidak bisa dibaca dari token di sini — berkas ini tanpa hook dan
 * tanpa `antd` (lihat kepala berkas). Nilainya SAMA dengan token yang
 * seharusnya dipakai, dan disebut di komentar supaya #203 bisa menukarnya
 * tanpa menebak: `marginLG` 24, `marginSM` 12, `marginXXS` 4.
 */
const SECTION_GAP = 24;
const CARD_GAP = 12;
const ICON_GAP = 4;
/** `leading-tight` = 1,25. Dua baris umur harus rapat agar terbaca satu satuan. */
const TIGHT_LEADING = 1.25;

/** Padding baris `PartyTotals` — sengaja lebih rapat dari bawaan sel tabel. */
const PARTY_ROW_PADDING = 10;

/*
 * Kedua peta label di bawah TIDAK pindah ke `lib/i18n/labels.ts`: sumbernya
 * `lib/receivables.ts` yang mengimpor Prisma, dan `labels.ts` ikut ke bundel
 * peramban. Semua pemakainya komponen server, jadi teksnya dibaca `getT()`
 * di sini — bentuknya tetap `Record<...>` bertipe penuh, jadi status/ember
 * baru tetap ditolak `tsc`.
 */

const STATUS_STYLE: Record<
  PaymentStatus,
  { variant: "default" | "success" | "warning" | "danger"; Icon: typeof CheckCircleOutlined }
> = {
  paid: { variant: "success", Icon: CheckCircleOutlined },
  partial: { variant: "warning", Icon: ClockCircleOutlined },
  unpaid: { variant: "default", Icon: MinusCircleOutlined },
  overdue: { variant: "danger", Icon: WarningOutlined },
};

export async function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = await getT();
  const labels: Record<PaymentStatus, string> = {
    paid: t("paymentStatus.paid"),
    partial: t("paymentStatus.partial"),
    unpaid: t("paymentStatus.unpaid"),
    overdue: t("paymentStatus.overdue"),
  };
  const { variant, Icon } = STATUS_STYLE[status];
  return (
    // Ikon `1em` = `fontSizeSM` milik `Tag`; jaraknya dari aturan
    // `.ant-tag > svg + span` AntD — karena itu labelnya wajib `<span>`.
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      <span>{labels[status]}</span>
    </Badge>
  );
}

/**
 * Age of a document in days, labelled by what it is actually counting.
 *
 * A row with a due date shows days past that date; a row without one shows days
 * since it was issued. Both are "age", but only the first means *overdue*, and
 * conflating them is the failure mode this whole feature has to avoid — so the
 * distinction is spelled out on every single row, not in a footnote.
 */
export async function AgeCell({ days, fromIssue }: { days: number; fromIssue: boolean }) {
  const t = await getT();
  const label = fromIssue
    ? t("aging.sinceIssue")
    : days > 0
      ? t("aging.pastDue")
      : t("aging.towardsDue");
  const shown = Math.abs(days);
  return (
    /*
     * DUA baris, dan itu bukan kerapian: baris pertama adalah ANGKA umur,
     * baris kedua menyatakan umur SEJAK APA ia dihitung. Keduanya wajib
     * berdampingan di setiap baris — "30 hari sejak diterbitkan" dan "30 hari
     * lewat jatuh tempo" adalah dua pernyataan yang berbeda, dan angka
     * telanjang tidak bisa membedakannya.
     */
    <span
      style={{ display: "inline-flex", flexDirection: "column", lineHeight: TIGHT_LEADING }}
    >
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {t("aging.ageDays", { days: shown })}
      </span>
      {/* `<small>` DAN warna sekunder — dua penanda, bukan satu. Warnanya
          kembali sejak #227; sebelum itu barisnya memakai warna teks penuh dan
          kedua baris terbaca sama pentingnya. */}
      <small style={{ color: "var(--ant-color-text-secondary)" }}>{label}</small>
    </span>
  );
}

export interface AgingSummaryProps {
  buckets: Record<AgingBucket, number>;
  total: number;
  /** Documents with no usable exchange rate, therefore missing from the totals. */
  unresolved: number;
  /** What the buckets are measuring, e.g. "umur sejak jatuh tempo". */
  caption: string;
}

export async function AgingSummary({ buckets, total, unresolved, caption }: AgingSummaryProps) {
  const t = await getT();
  const bucketLabels: Record<AgingBucket, string> = {
    b0_30: t("agingBucket.b0_30"),
    b31_60: t("agingBucket.b31_60"),
    b61_90: t("agingBucket.b61_90"),
    b90_plus: t("agingBucket.b90_plus"),
  };
  /** Isi satu kartu ember: keterangan di atas, nominal besar di bawah. */
  const bucketCard = (label: string, value: number, emphasised = false) => (
    <div style={{ padding: "var(--ant-padding)" }}>
      {/*
       * Kartu total berlatar `colorPrimaryBg`, jadi keterangannya `colorText`
       * dan BUKAN `colorLink` (issue #355). Komentar di bawah dulu menyebut
       * "5,65:1" untuk `--ant-color-link`; angka itu benar terhadap latar
       * NETRAL, bukan terhadap tint merek yang benar-benar ada di belakangnya.
       * Diukur pada `antd` terpasang: 4,05:1 di tema terang, 3,49:1 di gelap.
       * `colorText` lolos keduanya (6,59 / 9,08), dan penekanannya tetap ada
       * lewat batas + tint kartunya.
       */}
      <p
        style={{
          margin: 0,
          color: emphasised ? "var(--ant-color-text)" : "var(--ant-color-text-secondary)",
        }}
      >
        {label}
      </p>
      {/*
       * Nominal lewat `Money` (#186): tabular-nums, rata format id-ID, dan mata
       * uang eksplisit datang dari satu tempat. `18,66px tebal` melewati ambang
       * teks besar, tapi warnanya sengaja TIDAK hijau/merah — ini saldo, bukan
       * arah pergerakan uang.
       */}
      <p
        style={{
          margin: 0,
          marginTop: "var(--ant-margin-xxs)",
          fontSize: "var(--ant-font-size-lg)",
          fontWeight: "var(--ant-font-weight-strong)",
        }}
      >
        <Money value={value} currency="IDR" />
      </p>
    </div>
  );

  return (
    <div style={{ marginBottom: SECTION_GAP }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: CARD_GAP }}>
        {AGING_BUCKETS.map((b) => (
          <Card key={b} style={{ flex: `1 1 ${BUCKET_BASIS}px` }}>
            {bucketCard(bucketLabels[b], buckets[b])}
          </Card>
        ))}
        {/*
         * Kartu total ditandai batas & latar merek — penanda KEDUA; yang
         * pertama adalah katanya sendiri ("Total Tunggakan"). Warna teksnya
         * dijelaskan di `bucketCard` di atas: `colorText`, sebab teks merek di
         * atas tint merek gagal 4,5:1 di kedua tema (issue #355).
         */}
        <Card
          style={{
            flex: `1 1 ${BUCKET_BASIS}px`,
            borderColor: "var(--ant-color-primary)",
            background: "var(--ant-color-primary-bg)",
          }}
        >
          {bucketCard(t("aging.totalOutstanding"), total, true)}
        </Card>
      </div>

      {/*
       * Bentuk umurnya, bukan hanya angkanya (issue #355).
       *
       * Kartu di atas sudah menyebut setiap nominal; grafik ini menjawab
       * pertanyaan yang berbeda dan tidak bisa dijawab deretan angka:
       * "menumpuk di ember tua atau tidak?". Ia diletakkan DI BAWAH kartunya,
       * bukan menggantikan — angka tetap sumber kebenaran, grafik tetap
       * ringkasan.
       */}
      <div style={{ marginTop: CARD_GAP }}>
        <ChartCard title={t("aging.chartTitle")} description={caption}>
          <AgingChart
            data={AGING_BUCKETS.map((b) => ({ label: bucketLabels[b], amount: buckets[b] }))}
            currency="IDR"
          />
        </ChartCard>
      </div>
      <p style={{ margin: 0, marginTop: CARD_GAP, color: "var(--ant-color-text-secondary)" }}>
        <small>
          {t("aging.baseNote")} {caption}
        </small>
      </p>
      {/*
       * Dokumen tanpa kurs TIDAK ikut ditotal, dan jumlah yang dikecualikan
       * selalu disebutkan (MASTER.md: nilai tak diketahui ditulis kosong, tak
       * pernah 0). Penandanya ikon tanda tanya + kata yang ditebalkan; warna
       * amber (`colorMoneyPending` #186, min 6,23:1) adalah penanda KETIGA,
       * bukan satu-satunya — ia kembali sejak #227 membuat token terbaca di
       * server component.
       */}
      {unresolved > 0 && (
        <p
          style={{
            margin: 0,
            display: "flex",
            alignItems: "flex-start",
            gap: ICON_GAP,
            color: "var(--ant-color-money-pending)",
          }}
        >
          <QuestionCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <small>
            {t("aging.unresolvedBefore", { count: unresolved })}
            <strong> {t("aging.unresolvedStrong")}</strong>
            {t("aging.unresolvedAfter")}
          </small>
        </p>
      )}
    </div>
  );
}

/** Outstanding per counterparty — the "siapa berutang berapa" view. */
export async function PartyTotals({
  rows,
  title,
}: {
  rows: { name: string; outstandingBase: number; count: number }[];
  title: string;
}) {
  if (rows.length === 0) return null;
  const t = await getT();
  return (
    <Card style={{ marginBottom: "var(--ant-margin-lg)" }}>
      <CardHeader>
        <h2 style={{ margin: 0, fontWeight: "var(--ant-font-weight-strong)" }}>{title}</h2>
      </CardHeader>
      {/*
       * Tetap primitif `Table` JSX, BUKAN `StaticTable`: daftar ini sengaja
       * tanpa baris judul — ia dibaca sebagai "siapa berutang berapa", dan
       * judulnya sudah berdiri sebagai kepala kartu di atasnya. `StaticTable`
       * selalu menggambar baris judulnya, jadi memakainya berarti menambah tiga
       * judul kolom baru — beserta tiga kunci kamus baru di tiga bahasa —
       * demi perubahan yang tidak diminta issue ini. Ia dirender di server,
       * sama seperti sebelumnya.
       */}
      <Table>
        <TableBody>
          {rows.slice(0, 10).map((r) => (
            <TableRow key={r.name}>
              <TableCell style={{ paddingBlock: PARTY_ROW_PADDING }}>{r.name}</TableCell>
              <TableCell
                style={{
                  paddingBlock: PARTY_ROW_PADDING,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {t("aging.docCount", { count: r.count })}
              </TableCell>
              <TableCell style={{ padding: 0 }}>
                <MoneyCell
                  style={{
                    paddingBlock: PARTY_ROW_PADDING,
                    fontWeight: "var(--ant-font-weight-strong)",
                  }}
                  value={r.outstandingBase}
                  currency="IDR"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
