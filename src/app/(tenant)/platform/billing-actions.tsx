"use client";

/**
 * Aksi penagihan sisi pelanggan (issue #141) — dua komponen kecil untuk
 * halaman /tenant:
 *
 *   • `PayInvoice` — instruksi bayar sebuah tagihan terbuka: menampilkan VA/
 *     QRIS yang masih menunggu, atau tombol untuk membuatnya (VA per bank,
 *     QRIS). Menekan dua kali aman: API memakai ulang instruksi pending.
 *   • `BillingProfileForm` — NPWP/nama/alamat lawan transaksi untuk Faktur
 *     Pajak kami (mesin e-Faktur menandai tagihan tanpa NPWP sebagai masalah).
 *
 * TIDAK ADA input kartu di sini — VA & QRIS saja (kartu = urusan gerbang).
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

interface PendingPayment {
  bank: string | null;
  vaNumber: string | null;
  qrString: string | null;
  expiresAt: string | Date | null;
  gateway?: string | null;
}

function Instructions({ payment }: { payment: PendingPayment }) {
  const t = useT();
  if (payment.vaNumber) {
    return (
      <div className="rounded-md bg-muted p-2 text-sm">
        <span className="text-muted-foreground">
          {t("billing.vaLabel", { bank: (payment.bank ?? "").toUpperCase() })}
        </span>{" "}
        <span className="font-medium tabular-nums text-foreground">{payment.vaNumber}</span>
        {payment.expiresAt && (
          <span className="ml-2 text-xs text-muted-foreground">
            {/* `toLocaleString("id-ID")` polos mencetak "5/8/2026 09.12.44" —
                detik yang tidak berguna, dan bulan berupa angka yang tidak
                sejalan dengan tanggal lain di halaman ini ("5 Agu 2026"). */}
            {t("billing.payBefore", { date: formatDateTime(payment.expiresAt) })}
          </span>
        )}
      </div>
    );
  }
  if (payment.qrString) {
    return (
      <div className="rounded-md bg-muted p-2 text-sm">
        <p className="text-muted-foreground">{t("billing.qrisHint")}</p>
        {/* Payload EMV apa adanya — pemindaian dari aplikasi bank menerima
            string ini lewat fitur "masukkan kode"; render gambar QR menyusul
            (butuh pustaka, dan CSP artifact/produksi harus ditinjau dulu). */}
        <code className="mt-1 block break-all text-xs text-foreground">{payment.qrString}</code>
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
      <p className="rounded-md bg-muted p-2 text-sm leading-relaxed text-muted-foreground">
        {manualText || t("billing.manualFallback")}
      </p>
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
    <div className="flex flex-wrap gap-2" aria-busy={loading}>
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
    </div>
  );
}

export function BillingProfileForm({
  profile,
}: {
  profile: { npwp: string | null; name: string | null; address: string | null } | null;
}) {
  const t = useT();
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
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
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
      <div className="sm:col-span-2">
        <Input
          id="address"
          name="address"
          label={t("billing.npwpAddress")}
          defaultValue={profile?.address ?? ""}
          maxLength={255}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? t("billing.savingProfile") : t("billing.saveProfile")}
        </Button>
      </div>
    </form>
  );
}
