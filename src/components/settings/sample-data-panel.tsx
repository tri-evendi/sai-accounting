"use client";

/**
 * Kartu "Data Contoh" — membuang seluruh transaksi bertanda `[CONTOH]`.
 *
 * ══ KENAPA KARTU INI ADA, DAN KENAPA NADANYA TEGAS ═════════════════════════
 *
 * Sejak buku perusahaan BARU ikut diisi contoh, setiap pelanggan memulai
 * pembukuannya dengan pendapatan yang bukan miliknya. Awalan `[CONTOH]`
 * menandai BARISNYA — tetapi laporan tidak menampilkan baris, ia menampilkan
 * ANGKA. Di Laba/Rugi tidak ada satu pun tanda bahwa Rp 82 juta itu karangan,
 * dan angka yang salah dipercaya tidak menimbulkan galat apa pun: ia dibawa ke
 * rapat, ke bank, atau ke kantor pajak.
 *
 * Karena itu teks kartunya menyebut akibatnya lebih dulu ("ikut terhitung di
 * Laba/Rugi, Neraca, dan Arus Kas"), bukan sekadar menawarkan bersih-bersih.
 * Pengguna yang tidak tahu angkanya ikut terhitung tidak punya alasan untuk
 * menekan tombolnya.
 *
 * ══ `Alert` BERNADA PERINGATAN, BUKAN KARTU NETRAL ═════════════════════════
 * Nada "menunggu/perhatian" — sama dengan spanduk perusahaan contoh — bukan
 * merah galat: bukunya tidak rusak, hanya belum bersih. Merah akan membuat
 * pengguna baru mengira produknya bermasalah.
 *
 * ══ KONFIRMASI TANPA FRASA KETIK ULANG ═════════════════════════════════════
 * `ConfirmDialog` mendukung `confirmPhrase`, dan sengaja TIDAK dipakai di sini.
 * Yang dihapus adalah data yang memang bukan milik penggunanya; menuntut
 * mengetik ulang sebuah frasa untuk membuang barang contoh mengubah kemudahan
 * menjadi ritual, dan ritual yang membosankan membuat datanya menetap — persis
 * yang kartu ini coba cegah. Dialognya tetap menyebut bahwa tindakannya tidak
 * bisa dibatalkan.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Space, theme, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";

export interface SampleDataCounts {
  invoices: number;
  purchases: number;
  expenses: number;
  customers: number;
  suppliers: number;
  total: number;
}

export function SampleDataPanel({ counts }: { counts: SampleDataCounts }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const { token } = theme.useToken();
  const [busy, setBusy] = useState(false);

  /* Buku yang sudah bersih tidak perlu diingatkan tentang kebersihannya. */
  if (counts.total === 0) return null;

  async function clear() {
    setBusy(true);
    try {
      const response = await apiFetch("/api/sample-data", { method: "DELETE" });
      const body = (await response.json()) as {
        error?: string;
        keptPartners?: string[];
      };
      if (!response.ok) {
        /* Kalimat aslinya dari server — periode tertutup punya penjelasan yang
           jauh lebih berguna daripada "gagal". */
        toast(body.error ?? t("settings.sampleFailed"), "error");
        return;
      }
      toast(t("settings.sampleCleared"), "success");
      if (body.keptPartners && body.keptPartners.length > 0) {
        toast(t("settings.sampleKept", { names: body.keptPartners.join(", ") }), "info");
      }
      /* Kartunya dirender dari data server; menyegarkan rute membuatnya hilang
         sendiri tanpa menyalin keadaan yang sama ke state client. */
      router.refresh();
    } catch {
      toast(t("settings.sampleFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginBottom: token.marginLG }}>
      <CardHeader>
        <CardTitle level={2}>{t("settings.sampleTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Space direction="vertical" size={token.margin} style={{ display: "flex" }}>
          <Alert
            type="warning"
            showIcon
            icon={<ExperimentOutlined />}
            message={t("settings.sampleBody")}
            description={
              <Typography.Text style={{ fontVariantNumeric: "tabular-nums" }}>
                {t("settings.sampleCounts", {
                  invoices: counts.invoices,
                  purchases: counts.purchases,
                  expenses: counts.expenses,
                  customers: counts.customers,
                  suppliers: counts.suppliers,
                })}
              </Typography.Text>
            }
          />
          <ConfirmDialog
            title={t("settings.sampleConfirmTitle")}
            message={t("settings.sampleConfirmBody")}
            confirmLabel={t("settings.sampleClear")}
            onConfirm={clear}
            trigger={
              <Button variant="danger" disabled={busy}>
                {busy ? t("settings.sampleClearing") : t("settings.sampleClear")}
              </Button>
            }
          />
        </Space>
      </CardContent>
    </Card>
  );
}
