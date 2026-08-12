"use client";

/**
 * METER kuota — satu rasio terhadap BATAS. Ditulis ulang di atas Ant Design
 * `Progress` pada issue #191 (fase B5).
 *
 * ══ KENAPA METER, BUKAN ANGKA TELANJANG ════════════════════════════════════
 * "2 / 3" benar dan tidak menjawab pertanyaan yang sebenarnya dibawa pemilik
 * akun ke halaman ini: *seberapa dekat saya dengan mentok?* Angka menuntut
 * pembacanya membagi sendiri; batang mengatakannya sebelum dibaca. Bentuk ini
 * dipilih dari heuristik: satu rasio terhadap sebuah batas → METER (bukan pai
 * dua irisan, bukan diagram batang satu batang).
 *
 * ══ WARNA TIDAK PERNAH SENDIRIAN ═══════════════════════════════════════════
 * Isian membawa tingkat keparahan (biasa → peringatan → penuh), dan trek
 * kosongnya adalah langkah yang lebih terang dari ramp yang sama sehingga
 * keadaannya terbaca di sepanjang batang. TAPI keparahan itu juga selalu
 * berupa KATA di samping angkanya — MASTER.md §Anti-Patterns melarang warna
 * sebagai satu-satunya penanda, dan meter yang hanya berubah rona tidak
 * terbaca oleh sebagian pembaca sama sekali.
 *
 * Warna ISIAN memakai `colorError`/`colorWarning`/`colorPrimary` bawaan AntD:
 * itu peran non-teks, ambangnya 3:1, dan `lib/theme/antd-tokens.ts` memang
 * menyebut `Progress` sebagai tempat warna penuh tetap benar. Warna KATA
 * keadaannya tidak boleh ikut: ia teks 14px, jadi ia memakai token uang
 * (#186) yang sudah terukur 6,0–10,7:1.
 *
 * ══ AKSESIBILITAS ══════════════════════════════════════════════════════════
 * `role="progressbar"` dengan `aria-valuenow/min/max` dan label yang menyebut
 * apa yang diukur: pembaca layar mengumumkan "2 dari 3", bukan "67 persen"
 * tanpa satuan.
 *
 * Itulah sebabnya `Progress` AntD dirender DI DALAM pembungkus `aria-hidden`,
 * bukan dipakai sebagai peran progressbar-nya sendiri: `Progress` mengumumkan
 * PERSEN, karena persen memang satu-satunya yang ia tahu. Untuk kuota, "67
 * persen" adalah jawaban yang benar atas pertanyaan yang tidak ditanyakan
 * siapa pun — yang ingin diketahui adalah masih ada berapa perusahaan lagi.
 *
 * Angka besar memakai angka PROPORSIONAL, bukan `tabular-nums`: tabular
 * memberi setiap digit lebar `0` dan membuat nilai tunggal tampak renggang.
 * Tabular tetap benar di KOLOM tabel, tempat digit harus sejajar ke bawah.
 *
 * ══ KOTAKNYA `Card`, BUKAN TEPI TULISAN TANGAN ═════════════════════════════
 * Sampai perbaikan ini berkas ini menggambar permukaannya sendiri — `div`
 * bertepi `colorBorderSecondary`, radius `borderRadiusLG`, padding 16. Nilainya
 * benar satu per satu dan tetap menghasilkan ubin yang BUKAN kartu: `Card`
 * memikul bayangan `boxShadowTertiary` sejak #266 dan padding sisinya
 * `paddingLG` (24), jadi meteran ini berdiri di sebelah `StatCard` di baris
 * ringkasan `/platform` dengan elevasi, indentasi, dan irama judul→nilai yang
 * berbeda. Tiga ubin sebaris, dua keluarga.
 *
 * Sekarang keduanya memakai `Card` + anatomi bersama `ui/stat-tile.ts`, jadi
 * yang tersisa sebagai perbedaan adalah yang memang berbeda: meteran punya
 * batang, kartu status tidak.
 */

import { Progress, theme } from "antd";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TILE_CONTENT, TILE_HEADER, TILE_LABEL } from "@/components/ui/stat-tile";
import { moneyPalette } from "@/lib/theme/antd-tokens";

export interface QuotaMeterProps {
  /** Apa yang dihitung — "Perusahaan", "Pengguna". Sentence case, tanpa titik dua. */
  label: string;
  used: number;
  max: number;
  /** Teks nilai yang sudah dilokalkan, mis. "2 dari 3". */
  valueLabel: string;
  /** Kata keadaan saat hampir/sudah penuh — WAJIB bila `used >= max * 0.8`. */
  stateLabel?: string;
}

/** Ambang keparahan. 80% = masih bisa direncanakan; 100% = sudah menghalangi. */
const NEARLY_FULL = 0.8;

export function QuotaMeter({
  label,
  used,
  max,
  valueLabel,
  stateLabel,
}: QuotaMeterProps) {
  const { token } = theme.useToken();
  const money = moneyPalette(token);

  /* `max` 0 tidak boleh membuat batang menjadi NaN — perlakukan sebagai penuh:
   * kuota nol berarti tidak ada ruang tersisa, dan itu justru keadaan yang
   * paling perlu terlihat. */
  const ratio = max > 0 ? Math.min(used / max, 1) : 1;
  const full = max > 0 ? used >= max : true;
  const nearly = !full && ratio >= NEARLY_FULL;

  const stroke = full
    ? token.colorError
    : nearly
      ? token.colorWarning
      : token.colorPrimary;
  /* Trek kosongnya = anak tangga `*Bg` dari ramp yang SAMA dengan isiannya,
     supaya keadaan meter terbaca di sepanjang batang, bukan hanya di bagian
     yang terisi. (`railColor`; `trailColor` sudah usang di AntD v6.) */
  const rail = full
    ? token.colorErrorBg
    : nearly
      ? token.colorWarningBg
      : token.colorPrimaryBg;

  return (
    /* `height: 100%` supaya meteran yang berbagi kisi dengan kartu status
       (baris ringkasan `/platform`) mengisi tinggi barisnya alih-alih
       menggantung — ubin sebaris yang tepi bawahnya tidak segaris terbaca
       sebagai kartu yang isinya belum selesai dimuat. */
    <Card style={{ height: "100%" }}>
      <CardHeader style={TILE_HEADER}>
        <p style={TILE_LABEL}>{label}</p>
      </CardHeader>
      <CardContent style={TILE_CONTENT}>
        <p
          style={{
            margin: 0,
            fontSize: token.fontSizeHeading3,
            fontWeight: token.fontWeightStrong,
            color: token.colorText,
          }}
        >
          {valueLabel}
        </p>

        <div
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={`${label}: ${valueLabel}`}
          style={{ marginTop: token.marginXS }}
        >
          {/* `display: flex` menelan turunan garis-dasar di bawah `Progress`:
              `.ant-progress` sebuah `inline-block`, jadi barisnya menyisakan
              ruang untuk ekor huruf yang tidak pernah ada di sini. */}
          <div aria-hidden style={{ display: "flex" }}>
            <Progress
              percent={Math.round(ratio * 100)}
              showInfo={false}
              strokeColor={stroke}
              railColor={rail}
              style={{ width: "100%", margin: 0 }}
            />
          </div>
        </div>

        {/* Keadaan sebagai KATA. Tanpa baris ini, satu-satunya perbedaan antara
            "lega" dan "mentok" adalah rona batang. */}
        {stateLabel && (full || nearly) && (
          <p
            style={{
              margin: `${token.marginXS}px 0 0`,
              fontWeight: token.fontWeightStrong,
              color: full ? money.colorMoneyNegative : money.colorMoneyPending,
            }}
          >
            {stateLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
