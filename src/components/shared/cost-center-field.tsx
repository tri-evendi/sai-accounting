"use client";

/**
 * Pemilih pusat biaya untuk formulir DOKUMEN (issue #98).
 *
 * Fase 1 (#91) memasang kolom `cost_center_id` di faktur, transaksi pemasok dan
 * transaksi kas, dan mesin posting sudah menstempelkannya ke setiap baris
 * jurnal — tetapi hanya formulir kas yang punya pemilihnya. Akibatnya PENDAPATAN
 * PENJUALAN tidak bisa ditandai sama sekali, dan Laba/Rugi per cabang berisi
 * kas + jurnal manual saja tanpa satu pun tanda bahwa ada yang kurang. Komponen
 * ini yang membuat kolom-kolom itu bisa diisi.
 *
 * SATU komponen, bukan empat salinan: pemilih yang sama kini muncul di faktur
 * (baru & ubah), pembelian/pembayaran pemasok, transaksi kas, dan pengeluaran
 * stok manual. Kalau tiap formulir menyalin `fetch` + `Select` + hint-nya
 * sendiri, kelimanya pelan-pelan berbeda label dan berbeda perlakuan terhadap
 * "kosong" — padahal "kosong" di sini punya arti akuntansi yang tepat.
 *
 * DUA KEPUTUSAN YANG DIPUSATKAN DI SINI:
 *  1. Perusahaan yang belum memakai pusat biaya mendapat daftar KOSONG, dan
 *     pemilihnya tidak dirender sama sekali — formulirnya tak berubah sedikit
 *     pun bagi mereka.
 *  2. Tak dipilih = `""` = `null` = "belum ditetapkan / seluruh perusahaan".
 *     Itu nilai yang SAH, bukan isian yang terlewat, jadi tak pernah `required`.
 */

import { useEffect, useState } from "react";
import { Flex, theme, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import { fetchOptionList } from "@/lib/option-list";

/** Pusat biaya aktif, sebagaimana dikembalikan `GET /api/cost-centers`. */
export interface CostCenterOption {
  id: number;
  code: string;
  name: string;
}

/**
 * Muat daftar pusat biaya AKTIF. Yang nonaktif sengaja tak ditawarkan: ia masih
 * harus terbaca di laporan lama, tetapi tak boleh dipilih untuk dokumen baru.
 */
export function useCostCenters(): {
  costCenters: CostCenterOption[];
  /** Permintaannya GAGAL — bukan "perusahaan ini tidak punya pusat biaya". */
  loadFailed: boolean;
} {
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  /*
   * Dibedakan dari daftar kosong, dan di sini akibatnya paling sunyi dari
   * semuanya: `CostCenterField` MENGHILANG saat daftarnya kosong (lihat di
   * bawah), jadi permintaan yang gagal tidak menampilkan kolom yang kosong —
   * ia menghapus kolomnya dari layar. Dokumennya lalu tersimpan dengan
   * `cost_center_id` NULL, yang merupakan nilai yang SAH, sehingga tidak ada
   * satu pun galat di mana pun; yang hilang cuma harga pokok cabang di
   * Laba/Rugi per pusat biaya, berbulan-bulan kemudian.
   */
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchOptionList<CostCenterOption>("/api/cost-centers?activeOnly=1");
      if (cancelled) return;
      setLoadFailed(data == null);
      setCostCenters(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { costCenters, loadFailed };
}

export interface CostCenterFieldProps {
  costCenters: CostCenterOption[];
  /** Dari `useCostCenters()`. Tanpa ini, kegagalan memuat tak terbedakan dari
   *  perusahaan yang memang belum memakai pusat biaya. */
  loadFailed?: boolean;
  /** `""` = belum ditetapkan. */
  value: string;
  onChange: (value: string) => void;
  /** Ganti kalimat bantuan bawaan — dipakai formulir stok, yang alasannya beda. */
  hint?: string;
}

/**
 * Nilainya dikendalikan pemanggil (bukan `FormData`), supaya formulir yang
 * mengirim JSON — semuanya, di app ini — bisa menaruh `costCenterId` di badan
 * permintaan tanpa menebak-nebak isi `<form>`.
 *
 * Prop `className` DICABUT di issue #240: ia hidup sebagai jalan lewat untuk
 * `sm:col-span-2` selama kelima formulir pemanggilnya belum dikonversi, dan
 * sejak #195–#199 kelimanya menempatkan pemilih ini lewat pembungkusnya sendiri
 * (`<Col>` atau `<div style>`) — tidak ada satu pun yang masih mengisinya.
 */
export function CostCenterField({
  costCenters,
  loadFailed = false,
  value,
  onChange,
  hint,
}: CostCenterFieldProps) {
  const t = useT();
  const { token } = theme.useToken();
  /*
   * Kosong karena GAGAL: kolomnya tetap tidak bisa dirender (tak ada pilihan
   * untuk ditawarkan), tapi kepergiannya harus disebutkan. Menghilang diam-diam
   * adalah satu-satunya bentuk yang tidak boleh: pengguna yang biasa mengisi
   * pusat biaya akan menyimpulkan dokumen ini memang tidak memerlukannya.
   */
  if (costCenters.length === 0 && loadFailed) {
    return (
      <Typography.Text
        role="alert"
        style={{ fontSize: token.fontSizeSM, color: token.colorError }}
      >
        {t("common.optionsLoadFailed")}
      </Typography.Text>
    );
  }
  // Kosong karena memang belum ada: perusahaan yang tidak memakai dimensi ini
  // tidak perlu melihat isian yang selamanya tak punya pilihan.
  if (costCenters.length === 0) return null;

  return (
    <div>
      <Select
        id="costCenterId"
        name="costCenterId"
        label={t("costCenters.filterLabel")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: "", label: t("costCenters.filterUnassigned") },
          ...costCenters.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` })),
        ]}
      />
      <Flex
        align="flex-start"
        gap={token.marginXXS}
        style={{ marginTop: token.marginXXS }}
      >
        <InfoCircleOutlined
          aria-hidden="true"
          style={{ fontSize: token.fontSize, flexShrink: 0 }}
        />
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {hint ?? t("costCenters.pickerHint")}
        </Typography.Text>
      </Flex>
    </div>
  );
}

/** Bentuk yang dikirim ke API: `""` menjadi `null`, bukan `0` dan bukan `NaN`. */
export function costCenterPayload(value: string): number | null {
  return value ? Number(value) : null;
}
