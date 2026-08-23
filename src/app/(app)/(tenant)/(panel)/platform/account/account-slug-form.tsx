"use client";

/**
 * Ganti ALAMAT akun (issue #458 lingkup 3).
 *
 * ══ KENAPA TERPISAH DARI FORMULIR NAMA ═════════════════════════════════════
 * Dua tindakan dengan akibat yang sangat berbeda. Nama tampilan hanya dipegang
 * layar; alamat dipegang bookmark, surel undangan yang sudah terkirim, riwayat
 * peramban, dan tautan yang dibagikan ke akuntan eksternal. Satu tombol Simpan
 * yang mengerjakan keduanya adalah tombol yang suatu hari mengganti alamat
 * seseorang yang hanya bermaksud membetulkan ejaan namanya.
 *
 * ══ KETIK ULANG, BUKAN "YA" ════════════════════════════════════════════════
 * Konfirmasinya menuntut alamat barunya diketik SEKALI LAGI — pola yang sama
 * dengan penghapusan dokumen berjurnal. Bukan untuk menyulitkan: mengetiknya
 * memaksa orang membaca alamat yang sedang ia pasang, dan salah ketik di sini
 * memesan satu slug selamanya.
 *
 * ⚠ Sesudah berhasil, halaman ini PINDAH sendiri ke alamat barunya. Alamat
 * lama tidak rusak — jalur masuk memantulkannya permanen — tetapi membiarkan
 * orang berdiri di alamat usang tepat sesudah ia sendiri yang menggantinya
 * adalah kebingungan yang tidak perlu.
 */

import { useState } from "react";
import { Alert, Flex, Typography, theme } from "antd";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { tenantSlugFrom } from "@/lib/registration";

const { Text } = Typography;

export function AccountSlugForm({
  slug,
  bolehGantiPada,
}: {
  slug: string;
  /** ISO — kapan boleh diganti lagi; `null` berarti sekarang juga. */
  bolehGantiPada: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const { token } = theme.useToken();

  const [nilai, setNilai] = useState(slug);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* Dinormalkan dengan aturan yang SAMA dengan server: pratinjau yang memakai
     aturannya sendiri adalah pratinjau yang menjanjikan alamat yang tidak jadi. */
  const slugBaru = tenantSlugFrom(nilai);
  const berubah = slugBaru !== slug && nilai.trim().length >= 2;
  const terkunci = bolehGantiPada !== null;

  async function ganti() {
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/tenant/slug", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slugBaru }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? t("tenantSlug.taken"));
        return;
      }
      toast(t("tenantSlug.changed"), "success");
      /* Halaman ini sendiri hidup di `/platform/…`, yang TIDAK memuat slug —
         jadi yang perlu disegarkan hanya datanya, bukan alamat halaman ini. */
      router.refresh();
    } finally {
      setLoading(false);
      setKonfirmasi(false);
    }
  }

  return (
    <Flex vertical gap={token.marginMD}>
      {error && <Alert type="error" showIcon message={error} />}

      <Text type="secondary">{t("tenantSlug.hint")}</Text>

      <Input
        id="account-slug"
        name="slug"
        label={t("tenantSlug.heading")}
        value={nilai}
        onChange={(e) => setNilai(e.currentTarget.value)}
        minLength={2}
        maxLength={50}
        disabled={loading || terkunci}
      />

      <Text style={{ fontFamily: "var(--ant-font-family-code)" }}>/t/{slugBaru}/…</Text>

      <Alert type="warning" showIcon message={t("tenantSlug.warning")} />

      {terkunci && (
        <Text type="secondary">
          {t("tenantSlug.nextChange", {
            date: new Date(bolehGantiPada).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          })}
        </Text>
      )}

      <div>
        <Button
          variant="secondary"
          disabled={!berubah || loading || terkunci}
          onClick={() => setKonfirmasi(true)}
        >
          {t("tenantSlug.submit")}
        </Button>
      </div>

      <ConfirmDialog
        open={konfirmasi}
        onOpenChange={setKonfirmasi}
        title={t("tenantSlug.confirmTitle")}
        message={t("tenantSlug.confirmBody", { slug: slugBaru })}
        confirmLabel={t("tenantSlug.submit")}
        /* Alamat barunya diketik ulang: salah ketik di sini memesan satu slug
           selamanya, dan slug yang sudah dipesan tidak pernah dilepas. */
        confirmPhrase={slugBaru}
        onConfirm={ganti}
      />
    </Flex>
  );
}
