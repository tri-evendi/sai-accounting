"use client";

/**
 * "Stok belum dipotong untuk kontrak ini" (issue #491) — pemberitahuan +
 * konfirmasi, bukan pemotongan otomatis.
 *
 * == PERTANYAAN YANG DIJAWABNYA ============================================
 * Pengguna meminta (24 Agustus 2026): "setiap kontrak done atau selesai
 * pembayaran dan pengiriman nanti akan potong langsung stok persediaan barang".
 *
 * Diterjemahkan apa adanya, permintaan itu bertabrakan dengan doktrin yang
 * sudah berjalan: stok dipotong SURAT JALAN, sebab persediaan berkurang saat
 * barang fisik keluar gudang — bukan saat pembayaran lunas. Kalau kontrak IKUT
 * memotong, satu pengiriman terpotong DUA KALI, dan selisihnya baru ketahuan
 * saat stok opname berikutnya.
 *
 * == KENAPA DIALOG, BUKAN SAKELAR ==========================================
 * Yang sebenarnya dikeluhkan pengguna bukan "kontrak tidak memotong stok",
 * melainkan: kontraknya sudah selesai difakturkan, tetapi stoknya masih utuh di
 * sistem, dan tidak ada satu pun tanda yang mengatakan kenapa. Yang hilang
 * adalah KABAR dan JALAN KELUARNYA, bukan pemotongan otomatis.
 *
 * Jadi keadaannya dikatakan, dan keputusannya diserahkan: aplikasi menunjukkan
 * berapa kilo yang sudah difakturkan tanpa surat jalan, lalu MENAWARKAN
 * membuatkan surat jalannya. Yang memotong stok tetap satu jalur — jalur yang
 * sudah teruji, yang menjaga saldo tak pernah negatif, dan yang memposting HPP
 * pada harga rata-rata tertimbang.
 *
 * Menekan "Ya" TIDAK memotong stok. Ia membuka formulir surat jalan dengan
 * kontraknya sudah terpilih; kuantitas dan kendaraan tetap diperiksa manusia
 * sebelum tersimpan. Sebuah tombol di halaman kontrak yang langsung menulis ke
 * buku besar adalah persis jenis kejutan yang doktrin ini dibuat untuk cegah.
 */
import { useState } from "react";
import { InfoCircleOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppRouter } from "@/components/ui/app-link";
import { useT } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/utils";

const ICON_SIZE = 16;

export function DeductStockNotice({
  contractId,
  undeliveredKg,
}: {
  contractId: number;
  /** Kilo yang sudah difakturkan tetapi belum bersurat jalan. */
  undeliveredKg: number;
}) {
  const t = useT();
  const router = useAppRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: 12,
          marginBottom: 24,
          borderRadius: "var(--ant-border-radius)",
          background: "var(--ant-color-info-bg)",
          color: "var(--ant-color-text)",
        }}
        role="status"
      >
        <InfoCircleOutlined
          aria-hidden="true"
          style={{ fontSize: ICON_SIZE, flexShrink: 0, marginTop: 2 }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0 }}>
            {t("contracts.stockNotDeducted", { qty: formatNumber(undeliveredKg) })}
          </p>
          <p
            style={{
              margin: 0,
              marginTop: 4,
              fontSize: "var(--ant-font-size-sm)",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {t("contracts.stockNotDeductedWhy")}
          </p>
        </div>
        {/* `secondary`: ini bukan aksi utama halaman kontrak, dan ia tidak
            mendesak — kontrak yang barangnya memang belum dikirim berada di
            keadaan ini dengan benar. */}
        <Button
          variant="secondary"
          size="sm"
          style={{ flexShrink: 0 }}
          onClick={() => setOpen(true)}
        >
          {t("contracts.deductStockAction")}
        </Button>
      </div>

      <ConfirmDialog
        title={t("contracts.deductStockTitle")}
        message={t("contracts.deductStockMessage", { qty: formatNumber(undeliveredKg) })}
        confirmLabel={t("contracts.deductStockConfirm")}
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => {
          /* TIDAK memotong stok di sini — membuka formulir surat jalan dengan
             kontraknya terpilih. Lihat catatan di kepala berkas. */
          router.push(`/delivery-orders/new?contractId=${contractId}`);
        }}
      />
    </>
  );
}
