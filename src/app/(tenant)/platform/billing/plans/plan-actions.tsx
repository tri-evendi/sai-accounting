"use client";

/**
 * Tombol "Pilih paket ini" + layar konfirmasinya.
 *
 * ══ KONFIRMASI MENYEBUT KONSEKUENSINYA, BUKAN "ANDA YAKIN?" ════════════════
 * Dua arah, dua kalimat yang berbeda, dan keduanya menyebut hal yang paling
 * mudah membuat orang merasa ditipu kalau baru diketahui SESUDAHNYA:
 *
 *   naik   "Anda membayar SELISIHNYA untuk sisa periode; tanggal tagihan
 *          berikutnya tidak bergeser; paket aktif setelah tagihan itu lunas."
 *   turun  "Berlaku SEKETIKA, sisa hari di paket sekarang TIDAK dikembalikan."
 *
 * Arah ditebak dari harga di sisi klien HANYA untuk memilih kalimatnya. Yang
 * MEMUTUSKAN tetap server (`/api/tenant/billing/plan-change`): kuota, prorata,
 * dan penolakan turun-paket dihitung di sana dari pemakaian nyata. Klien yang
 * ikut memutuskan berarti dua kebenaran tentang uang yang sama.
 *
 * Penolakan `over_quota` DITERJEMAHKAN DI SINI dari angka yang dikembalikan
 * server, bukan dari kalimat jadi: pelanggan perlu tahu BERAPA yang terpakai
 * dan berapa kuotanya untuk bisa memutuskan apa yang ditutup.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flex, Typography, theme } from "antd";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { moneyPalette } from "@/lib/theme/antd-tokens";

const { Text } = Typography;

interface PlanActionProps {
  planKey: string;
  planName: string;
  /** Harga katalog paket ini, untuk menebak arah — bukan untuk menghitung. */
  priceMonthly: number;
  /** Harga langganan BERJALAN (snapshot), sumber tebakan arah yang sama. */
  currentPrice: number;
  /** Sisa hari & panjang periode, untuk kalimat konfirmasi naik paket. */
  remainingDays: number;
  periodDays: number;
}

interface OverQuota {
  used: number;
  max: number;
}

export function PlanAction({
  planKey,
  planName,
  priceMonthly,
  currentPrice,
  remainingDays,
  periodDays,
}: PlanActionProps) {
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<{
    companies: OverQuota | null;
    users: OverQuota | null;
  } | null>(null);

  const isUpgrade = priceMonthly > currentPrice;

  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    setBlocked(null);
    try {
      const res = await fetch("/api/tenant/billing/plan-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.code === "over_quota") {
          setBlocked({ companies: data.companies ?? null, users: data.users ?? null });
        }
        setError(data?.error ?? t("platform.planChangeFailed"));
        return;
      }

      if (data?.applied) {
        setMessage(t("platform.planChangeApplied"));
      } else {
        setMessage(t("platform.planChangeInvoiceCreated"));
      }
      /* Kuota, status, dan daftar tagihan semuanya baru saja berubah di server —
       * yang tampil sekarang sudah basi sampai halamannya diambil ulang. */
      router.refresh();
    } catch {
      setError(t("platform.planChangeFailed"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <Flex vertical gap={token.marginXS}>
      <Button
        style={{ width: "100%" }}
        variant={isUpgrade ? "default" : "outline"}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {t("platform.planChangeSelect")}
      </Button>

      {message && (
        <Flex vertical gap={token.marginXS}>
          {/* `role="status"`: kalimat ini satu-satunya umpan balik dari sebuah
              permintaan yang tidak memindahkan halaman ke mana pun. */}
          <Text role="status" style={{ color: money.colorMoneyPositive, lineHeight: 1.625 }}>
            {message}
          </Text>
          {/* Tagihan baru hidup di halaman tagihan — di sanalah tombol bayarnya
              (VA/QRIS) sudah ada, bukan disalin ke sini menjadi jalur kedua. */}
          <Button asChild variant="outline" size="sm" style={{ width: "100%" }}>
            <a href="/platform/billing">{t("platform.planChangeGoToInvoice")}</a>
          </Button>
        </Flex>
      )}

      {error && (
        <Flex vertical gap={token.marginXXS} role="alert">
          {/* `colorMoneyNegative`, bukan `colorError`: ini TEKS 14px, dan
              `colorError` AntD hanya 3,27:1 sebagai teks (MASTER.md). */}
          <Text style={{ color: money.colorMoneyNegative, lineHeight: 1.625 }}>{error}</Text>
          {blocked?.companies && (
            <Text
              style={{ color: money.colorMoneyNegative, fontVariantNumeric: "tabular-nums" }}
            >
              {t("platform.planChangeCompaniesOver", {
                used: blocked.companies.used,
                max: blocked.companies.max,
              })}
            </Text>
          )}
          {blocked?.users && (
            <Text
              style={{ color: money.colorMoneyNegative, fontVariantNumeric: "tabular-nums" }}
            >
              {t("platform.planChangeUsersOver", {
                used: blocked.users.used,
                max: blocked.users.max,
              })}
            </Text>
          )}
        </Flex>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(
          isUpgrade
            ? "platform.planChangeConfirmUpgradeTitle"
            : "platform.planChangeConfirmDowngradeTitle",
          { plan: planName }
        )}
        message={
          isUpgrade
            ? t("platform.planChangeConfirmUpgradeBody", {
                days: remainingDays,
                total: periodDays,
              })
            : t("platform.planChangeConfirmDowngradeBody")
        }
        confirmLabel={t("platform.planChangeSelect")}
        onConfirm={submit}
      />
    </Flex>
  );
}
