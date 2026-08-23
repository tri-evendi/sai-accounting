"use client";

/**
 * Ganti nama tampilan akun (issue #458).
 *
 * ⚠ `router.refresh()` sesudah berhasil, bukan `setState` lokal saja: nama akun
 * dirender juga oleh KULIT (bilah panel) di server, dan halaman yang menampilkan
 * nama baru di dalam kartu sementara bilah di atasnya masih menyebut nama lama
 * terbaca sebagai simpanan yang setengah jadi.
 *
 * Slug ditampilkan sebagai teks, BUKAN isian yang dinonaktifkan: isian kelabu
 * mengundang orang mencoba menyuntingnya lalu menyimpulkan aplikasinya rusak.
 * Kalimat di bawahnya menyatakan apa adanya bahwa alamat itu tetap.
 */

import { useState } from "react";
import { Alert, Flex, Typography, theme } from "antd";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

const { Text } = Typography;

export function AccountNameForm({ nama, slug }: { nama: string; slug: string }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const { token } = theme.useToken();

  const [nilai, setNilai] = useState(nama);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const berubah = nilai.trim() !== nama && nilai.trim().length >= 2;

  async function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/tenant/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nilai.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("platform.accountSaveFailed"));
        return;
      }
      toast(t("platform.accountSaved"), "success");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={simpan}>
      <Flex vertical gap={token.marginMD}>
        {error && <Alert type="error" showIcon message={error} />}

        <Input
          id="account-name"
          name="name"
          label={t("platform.accountNameLabel")}
          value={nilai}
          onChange={(e) => setNilai(e.currentTarget.value)}
          minLength={2}
          maxLength={150}
          required
          disabled={loading}
        />

        <div>
          <Text strong style={{ display: "block", fontSize: token.fontSizeSM }}>
            {t("platform.accountAddressLabel")}
          </Text>
          <Text style={{ fontFamily: "var(--ant-font-family-code)" }}>/t/{slug}/…</Text>
          <Text type="secondary" style={{ display: "block", fontSize: token.fontSizeSM }}>
            {t("platform.accountAddressFixed")}
          </Text>
        </div>

        <div>
          <Button type="submit" variant="primary" disabled={!berubah || loading}>
            {loading ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </Flex>
    </form>
  );
}
