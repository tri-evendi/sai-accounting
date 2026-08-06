"use client";

/**
 * Aksi penagihan sisi pelanggan (issue #141) — dua komponen kecil untuk
 * halaman /platform:
 *
 *   • `PayInvoice` — instruksi bayar sebuah tagihan terbuka: menampilkan VA/
 *     QRIS yang masih menunggu, atau tombol untuk membuatnya (VA per bank,
 *     QRIS). Menekan dua kali aman: API memakai ulang instruksi pending.
 *   • `BillingProfileForm` — NPWP/nama/alamat lawan transaksi untuk Faktur
 *     Pajak kami (mesin e-Faktur menandai tagihan tanpa NPWP sebagai masalah).
 *
 * TIDAK ADA input kartu di sini — VA & QRIS saja (kartu = urusan gerbang).
 *
 * Keduanya dirender sebagai SEL di dalam tabel tagihan (`StaticTable`), jadi
 * mereka harus tetap sekecil mungkin: satu baris kendali, bukan panel.
 */

import { useState } from "react";
import { Flex, Typography, theme } from "antd";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

const { Text } = Typography;

interface PendingPayment {
  bank: string | null;
  vaNumber: string | null;
  qrString: string | null;
  expiresAt: string | Date | null;
  gateway?: string | null;
}

function Instructions({ payment }: { payment: PendingPayment }) {
  const t = useT();
  const { token } = theme.useToken();

  const box: React.CSSProperties = {
    padding: token.paddingXS,
    borderRadius: token.borderRadius,
    background: token.colorFillQuaternary,
  };

  if (payment.vaNumber) {
    return (
      <div style={box}>
        <Text type="secondary">
          {t("billing.vaLabel", { bank: (payment.bank ?? "").toUpperCase() })}
        </Text>{" "}
        <Text strong style={{ fontVariantNumeric: "tabular-nums" }}>
          {payment.vaNumber}
        </Text>
        {payment.expiresAt && (
          <Text
            type="secondary"
            style={{ marginInlineStart: token.marginXS, fontSize: token.fontSizeSM }}
          >
            {/* `toLocaleString("id-ID")` polos mencetak "5/8/2026 09.12.44" —
                detik yang tidak berguna, dan bulan berupa angka yang tidak
                sejalan dengan tanggal lain di halaman ini ("5 Agu 2026"). */}
            {t("billing.payBefore", { date: formatDateTime(payment.expiresAt) })}
          </Text>
        )}
      </div>
    );
  }
  if (payment.qrString) {
    return (
      <div style={box}>
        <Text type="secondary" style={{ display: "block" }}>
          {t("billing.qrisHint")}
        </Text>
        {/* Payload EMV apa adanya — pemindaian dari aplikasi bank menerima
            string ini lewat fitur "masukkan kode"; render gambar QR menyusul
            (butuh pustaka, dan CSP artifact/produksi harus ditinjau dulu). */}
        <code
          style={{
            display: "block",
            marginTop: token.marginXXS,
            fontSize: token.fontSizeSM,
            wordBreak: "break-all",
            color: token.colorText,
          }}
        >
          {payment.qrString}
        </code>
      </div>
    );
  }
  return null;
}

export function PayInvoice({
  invoiceId,
  pending,
}: {
  invoiceId: number;
  pending: PendingPayment | null;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();
  const [payment, setPayment] = useState<PendingPayment | null>(pending);
  const [manualText, setManualText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCharge(method: "virtual_account" | "qris") {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/billing/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, method }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error ?? t("billing.errPay"), "error");
        return;
      }
      if (data.manual) {
        setManualText(data.payment?.instructions ?? "");
      } else {
        setPayment(data.payment);
      }
    } finally {
      setLoading(false);
    }
  }

  if (payment?.vaNumber || payment?.qrString) return <Instructions payment={payment} />;
  if (manualText !== null) {
    return (
      <div
        style={{
          padding: token.paddingXS,
          borderRadius: token.borderRadius,
          background: token.colorFillQuaternary,
        }}
      >
        <Text type="secondary" style={{ lineHeight: 1.625 }}>
          {manualText || t("billing.manualFallback")}
        </Text>
      </div>
    );
  }

  /*
   * Selama permintaan berjalan, kedua tombol hanya menjadi `disabled` — pudar,
   * tapi tanpa satu kata pun yang mengatakan ada yang sedang terjadi. Menerbitkan
   * VA/QRIS memanggil gerbang pembayaran, jadi jeda beberapa detik itu normal;
   * yang dibaca orang dari dua tombol pudar yang diam adalah "tekanan saya tidak
   * masuk". `BillingProfileForm` tepat di bawahnya sudah mengganti labelnya saat
   * menyimpan — tombol bayar mengikuti pola yang sama, memakai kunci
   * `common.processing` yang sudah ada.
   */
  return (
    <Flex wrap gap={token.marginXS} aria-busy={loading}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => requestCharge("virtual_account")}
      >
        {loading ? t("common.processing") : t("billing.payVa")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => requestCharge("qris")}
      >
        {loading ? t("common.processing") : t("billing.payQris")}
      </Button>
    </Flex>
  );
}

export function BillingProfileForm({
  profile,
}: {
  profile: { npwp: string | null; name: string | null; address: string | null } | null;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/tenant/billing/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npwp: String(formData.get("npwp") ?? ""),
          name: String(formData.get("name") ?? ""),
          address: String(formData.get("address") ?? ""),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error ?? t("billing.errProfile"), "error");
      } else {
        toast(t("billing.profileSaved"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Kisi yang membagi lebarnya sendiri — pengganti `sm:grid-cols-2`.
          NPWP & nama berdampingan saat muat; alamat dan tombolnya membentang
          penuh lewat `gridColumn: "1 / -1"`. */}
      <div
        style={{
          display: "grid",
          gap: token.marginSM,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
        }}
      >
        <Input
          id="npwp"
          name="npwp"
          label={t("billing.npwp")}
          defaultValue={profile?.npwp ?? ""}
          maxLength={25}
          placeholder="00.000.000.0-000.000"
        />
        <Input
          id="name"
          name="name"
          label={t("billing.npwpName")}
          defaultValue={profile?.name ?? ""}
          maxLength={150}
        />
        <div style={{ gridColumn: "1 / -1" }}>
          <Input
            id="address"
            name="address"
            label={t("billing.npwpAddress")}
            defaultValue={profile?.address ?? ""}
            maxLength={255}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? t("billing.savingProfile") : t("billing.saveProfile")}
          </Button>
        </div>
      </div>
    </form>
  );
}
