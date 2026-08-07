"use client";

/**
 * Pemilih periode Minggu / Bulan / Tahun / Rentang (issue #126).
 *
 * DIPAKAI BERSAMA oleh Riwayat Stok dan Riwayat Hitung Ulang Stok (issue #129):
 * dua halaman yang menanyakan rentang waktu dengan cara yang sama harus
 * MENAWARKANNYA dengan cara yang sama — pemilih kembar yang berperilaku beda
 * tipis justru lebih membingungkan daripada dua rancangan yang jelas berbeda.
 *
 * Satu ANCHOR, empat tampilan. Mengganti granularitas mengirim ulang tanggal
 * jangkar yang sama, jadi berpindah dari "Juli 2026" ke Minggu mendarat di
 * minggu yang memuat jangkar itu — bukan melempar pengguna kembali ke hari ini,
 * yang akan membuat penelusuran mundur harus diulang dari awal setiap kali.
 *
 * Panah ◀ ▶ hanya muncul untuk periode yang bisa dilangkahi. Rentang khusus
 * tidak punya "berikutnya" yang bermakna — panah yang tak jelas artinya lebih
 * buruk daripada tidak ada panah.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flex, theme, Typography } from "antd";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { useT } from "@/lib/i18n/client";
import type { StockPeriodGranularity } from "@/lib/stock-period";

/** Lebar minimum label periode (setara `min-w-[16rem]` sebelum migrasi). */
const PERIOD_LABEL_WIDTH = 256;

export function StockPeriodFilter({
  basePath,
  granularity,
  anchorISO,
  fromISO,
  toISO,
  prevAnchorISO,
  nextAnchorISO,
  label,
}: {
  basePath: string;
  granularity: StockPeriodGranularity;
  anchorISO: string;
  fromISO: string;
  toISO: string;
  prevAnchorISO: string | null;
  nextAnchorISO: string | null;
  label: string;
}) {
  const router = useRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [f, setF] = useState(fromISO);
  const [to, setTo] = useState(toISO);

  // Sinkron ulang saat URL berubah (panah ◀ ▶, tombol granularitas): useState
  // hanya membaca props sekali, jadi tanpa ini kolom rentang menampilkan
  // rentang lama — yang lalu diam-diam dikirim ulang saat "Tampilkan" ditekan.
  // Pola resmi React "adjusting state when props change": set saat render,
  // bukan lewat effect.
  const [prevRange, setPrevRange] = useState({ fromISO, toISO });
  if (prevRange.fromISO !== fromISO || prevRange.toISO !== toISO) {
    setPrevRange({ fromISO, toISO });
    setF(fromISO);
    setTo(toISO);
  }

  const go = (g: StockPeriodGranularity, anchor: string) => {
    const p = new URLSearchParams({ g, d: anchor });
    router.push(`${basePath}?${p.toString()}`);
  };

  const options: { value: StockPeriodGranularity; label: string }[] = [
    { value: "week", label: t("stockMovement.granularityWeek") },
    { value: "month", label: t("stockMovement.granularityMonth") },
    { value: "year", label: t("stockMovement.granularityYear") },
    { value: "custom", label: t("stockMovement.granularityCustom") },
  ];

  /* `HTMLElement`, bukan `HTMLFormElement`: `<form>`-nya kini dirender `Flex`
     lewat prop `component`, dan tanda tangan event AntD tidak menyempit ke
     elemen form. Isi fungsinya tidak menyentuh `currentTarget` sama sekali. */
  function submitCustom(e: React.FormEvent<HTMLElement>) {
    e.preventDefault();
    const p = new URLSearchParams({ g: "custom" });
    if (f) p.set("from", f);
    if (to) p.set("to", to);
    router.push(`${basePath}?${p.toString()}`);
  }

  return (
    <Flex vertical gap={token.marginSM} style={{ marginBottom: token.marginLG }}>
      <Flex
        wrap
        align="center"
        gap={token.marginXS}
        role="group"
        aria-label={t("stockMovement.granularityLabel")}
      >
        {options.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={granularity === o.value ? "primary" : "outline"}
            aria-pressed={granularity === o.value}
            onClick={() => go(o.value, anchorISO)}
          >
            {o.label}
          </Button>
        ))}
      </Flex>

      {granularity === "custom" ? (
        <Flex component="form" wrap align="flex-end" gap={token.marginSM} onSubmit={submitCustom}>
          <Input id="from" type="date" label={t("common.from")} value={f} onChange={(e) => setF(e.target.value)} />
          <Input id="to" type="date" label={t("common.to")} value={to} onChange={(e) => setTo(e.target.value)} />
          <Button type="submit">{t("common.show")}</Button>
        </Flex>
      ) : (
        <Flex align="center" gap={token.marginSM}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={t("stockMovement.previousPeriod")}
            disabled={!prevAnchorISO}
            onClick={() => prevAnchorISO && go(granularity, prevAnchorISO)}
          >
            <LeftOutlined aria-hidden="true" />
          </Button>
          {/* Lebar minimum supaya ◀ ▶ tidak bergeser saat labelnya berganti
              dari "Minggu 3 Agu" ke "September 2026" — panah yang berpindah
              tempat tiap klik adalah target yang harus dicari ulang. */}
          <Typography.Text strong style={{ minWidth: PERIOD_LABEL_WIDTH, textAlign: "center" }}>
            {label}
          </Typography.Text>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={t("stockMovement.nextPeriod")}
            disabled={!nextAnchorISO}
            onClick={() => nextAnchorISO && go(granularity, nextAnchorISO)}
          >
            <RightOutlined aria-hidden="true" />
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
