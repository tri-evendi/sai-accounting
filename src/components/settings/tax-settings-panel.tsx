"use client";

/**
 * Kartu "PPN" di halaman Pengaturan (issue #368, temuan F-12).
 *
 * ══ APA YANG DIPERBAIKI KARTU INI ══════════════════════════════════════════
 * Tarif PPN dulu konstanta kompilasi. Akibatnya dua: perusahaan NON-PKP
 * mendapat bawaan 11% yang salah sejak faktur pertamanya, dan mengubah tarif
 * ketika aturannya berubah menuntut redeploy sepuluh menit untuk satu angka.
 *
 * ══ YANG TIDAK BISA DILAKUKAN DARI SINI, DAN ITU DISENGAJA ═════════════════
 * Mengubah dokumen yang sudah tersimpan. Faktur membawa `tax_rate`-nya SENDIRI
 * dan mesin posting membaca kolom itu, jadi menambahkan tarif baru tidak
 * menyentuh satu pun angka yang sudah terbit di laporan. Kalimat itu ditulis
 * di layar, bukan cuma di sini: orang yang ragu apakah menekan "Simpan" akan
 * menulis ulang bukunya berhak tahu jawabannya sebelum menekan.
 *
 * Panel hanya dirender bila server menilai penggunanya memegang
 * `company_setting.manage` (pola `ModuleSettingsPanel`). API-nya ber-gate izin
 * yang sama — pertahanan berlapis, bukan tampilan yang menjaga dirinya sendiri.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Flex, Typography, theme } from "antd";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StaticTable } from "@/components/ui/static-table";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { formatDate } from "@/lib/utils";
import { PlusOutlined, SaveOutlined } from "@ant-design/icons";

interface TaxRateRow {
  id: number;
  rate: number;
  effectiveFrom: string;
  note: string | null;
}

interface TaxResponse {
  isPkp: boolean;
  rates: TaxRateRow[];
}

/** Lebar isian tarif — dua digit + koma, tak perlu selebar kolom. */
const RATE_WIDTH = 140;

export function TaxSettingsPanel() {
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();

  const [state, setState] = useState<TaxResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [note, setNote] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TaxRateRow | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/company-settings/tax");
    if (!res.ok) {
      setLoadError(t("taxSettings.loadFailed"));
      return;
    }
    setState((await res.json()) as TaxResponse);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Satu jalur untuk setiap tulisan: kirim, baca ulang, keluhkan kalau gagal. */
  async function send(init: RequestInit & { url?: string }): Promise<boolean> {
    setBusy(true);
    setFormError("");
    try {
      const res = await apiFetch(init.url ?? "/api/company-settings/tax", init);
      const data = (await res.json().catch(() => null)) as
        | (TaxResponse & { error?: string })
        | null;
      if (!res.ok) {
        setFormError(data?.error || t("taxSettings.saveFailed"));
        return false;
      }
      if (data) setState({ isPkp: data.isPkp, rates: data.rates });
      toast(t("taxSettings.saved"));
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function togglePkp(next: boolean) {
    await send({ method: "PUT", body: JSON.stringify({ isPkp: next }) });
  }

  async function addRate() {
    const ok = await send({
      method: "POST",
      body: JSON.stringify({
        rate: Number(rate),
        effectiveFrom,
        note: note.trim() || undefined,
      }),
    });
    if (ok) {
      setRate("");
      setEffectiveFrom("");
      setNote("");
    }
  }

  if (loadError) {
    return (
      <Card>
        <CardContent>
          <Alert type="error" showIcon message={loadError} />
        </CardContent>
      </Card>
    );
  }

  if (!state) return null;

  const canAdd = Number(rate) >= 0 && rate.trim() !== "" && effectiveFrom !== "" && !busy;

  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>{t("taxSettings.sectionTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Flex vertical gap={token.marginMD}>
          <Typography.Text type="secondary">{t("taxSettings.sectionDescription")}</Typography.Text>

          {/* PKP — pertanyaan yang menentukan apakah tabel di bawah dipakai
              sama sekali, jadi ia berdiri lebih dulu. */}
          <div>
            <Checkbox
              id="isPkp"
              checked={state.isPkp}
              disabled={busy}
              onCheckedChange={(v) => void togglePkp(v === true)}
            >
              {t("taxSettings.pkpLabel")}
            </Checkbox>
            <Typography.Text
              type="secondary"
              style={{ display: "block", fontSize: token.fontSizeSM }}
            >
              {t("taxSettings.pkpHint")}
            </Typography.Text>
          </div>

          {/*
           * Jaminan yang ditulis di LAYAR, bukan hanya di kepala berkas: orang
           * yang ragu apakah menyimpan tarif baru akan menulis ulang faktur
           * lamanya berhak tahu jawabannya sebelum menekan tombolnya.
           */}
          <Alert type="info" showIcon message={t("taxSettings.historySafe")} />

          <StaticTable<TaxRateRow>
            rows={state.rates}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "effectiveFrom",
                title: t("taxSettings.colEffectiveFrom"),
                render: (_v, r) => formatDate(r.effectiveFrom),
              },
              {
                key: "rate",
                title: t("taxSettings.colRate"),
                align: "right",
                /* Angka: rata kanan + `tabular-nums` (MASTER.md §3), supaya
                   11 dan 12,5 berbaris pada koma yang sama. */
                render: (_v, r) => (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {t("taxSettings.ratePercent", { rate: r.rate })}
                  </span>
                ),
              },
              {
                key: "note",
                title: t("taxSettings.colNote"),
                render: (_v, r) => r.note ?? "—",
              },
              {
                key: "actions",
                title: t("common.actions"),
                align: "right",
                render: (_v, r) =>
                  state.rates.length > 1 ? (
                    <Button variant="ghost" disabled={busy} onClick={() => setPendingDelete(r)}>
                      {t("common.delete")}
                    </Button>
                  ) : (
                    /* Baris terakhir tak bisa dihapus — tabel kosong akan
                       disemai ulang jadi 11%, yang justru kebalikan dari
                       maksud orang yang menekannya. Ditegakkan juga di API. */
                    <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {t("taxSettings.lastRow")}
                    </Typography.Text>
                  ),
              },
            ]}
          />

          {formError ? <Alert type="error" showIcon message={formError} /> : null}

          <Flex wrap align="flex-end" gap={token.marginSM}>
            <Input
              id="taxRateValue"
              label={t("taxSettings.colRate")}
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              style={{ width: RATE_WIDTH, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
            />
            <Input
              id="taxRateFrom"
              label={t("taxSettings.colEffectiveFrom")}
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <Input
              id="taxRateNote"
              label={t("taxSettings.colNote")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={t("taxSettings.notePlaceholder")}
            />
            <Button variant="primary" disabled={!canAdd} onClick={() => void addRate()}>
              {rate && state.rates.some((r) => r.effectiveFrom === effectiveFrom) ? (
                <SaveOutlined aria-hidden="true" />
              ) : (
                <PlusOutlined aria-hidden="true" />
              )}
              {t("taxSettings.addRate")}
            </Button>
          </Flex>
        </Flex>
      </CardContent>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("taxSettings.deleteTitle")}
        message={t("taxSettings.deleteDescription")}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          const row = pendingDelete;
          setPendingDelete(null);
          if (!row) return;
          await send({ method: "DELETE", url: `/api/company-settings/tax?id=${row.id}` });
        }}
      />
    </Card>
  );
}
