"use client";

/**
 * Kartu "Pengingat Jatuh Tempo" di halaman Pengaturan (issue #467).
 *
 * ══ SATU-SATUNYA KARTU DI HALAMAN INI YANG BERBICARA KE LUAR ════════════════
 * Setiap kartu lain di Pengaturan mengubah apa yang dilihat orang DI DALAM
 * kantor. Yang ini menyalakan mesin yang mengirim surel kepada pelanggan
 * seseorang, dan surel yang terlanjur keluar tidak bisa ditarik kembali.
 *
 * Itu sebabnya urutannya dipaksa terlihat, bukan cuma diberlakukan diam-diam
 * di server:
 *
 *   1. Sakelar induk BAWAANNYA MATI.
 *   2. Selama belum pernah ada KIRIM-UJI, pita peringatan berdiri di atas
 *      kartunya dan mengatakan apa adanya bahwa tidak ada satu pelanggan pun
 *      yang akan menerima apa-apa. Penjadwal memang menolak — tapi penolakan
 *      yang hanya terjadi di log adalah fitur yang tampak rusak.
 *   3. Tombol uji mengirim kalimat yang SAMA PERSIS ke alamat orang yang
 *      menekannya, jadi keputusan "boleh keluar" diambil setelah membacanya,
 *      bukan sebelum.
 *
 * Panel hanya dirender bila server menilai penggunanya memegang
 * `company_setting.manage` (pola `ModuleSettingsPanel`/`TaxSettingsPanel`).
 * API-nya ber-gate izin yang sama — bukan tampilan yang menjaga dirinya.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Flex, Typography, theme } from "antd";
import { BellOutlined, SaveOutlined } from "@ant-design/icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/utils";

const { Text } = Typography;

interface ReminderState {
  enabled: boolean;
  points: string[];
  testedAt: string | null;
}

/**
 * Urutan & label titiknya — kuncinya sama dengan `REMINDER_POINTS` di server.
 *
 * Kunci kamusnya ditulis UTUH, bukan dirakit dari `point.key`: kunci yang
 * dirakit tidak terlihat oleh penjaga kunci yatim, dan kunci yang tak terlihat
 * akan ikut tercabut pada pembersihan kamus berikutnya
 * (`tests/i18n-orphan-keys.test.ts`).
 */
const POINTS: { key: string; labelKey: DictionaryKey }[] = [
  { key: "before_3", labelKey: "invoiceReminder.pointBefore3" },
  { key: "after_1", labelKey: "invoiceReminder.pointAfter1" },
  { key: "after_7", labelKey: "invoiceReminder.pointAfter7" },
];

export function ReminderSettingsPanel() {
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();

  const [state, setState] = useState<ReminderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/company-settings/reminders");
    if (!res.ok) return;
    setState((await res.json()) as ReminderState);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  function togglePoint(key: string, checked: boolean) {
    setState((prev) =>
      prev
        ? {
            ...prev,
            points: checked ? [...prev.points, key] : prev.points.filter((p) => p !== key),
          }
        : prev
    );
  }

  async function save() {
    if (!state) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/company-settings/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: state.enabled, points: state.points }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error ?? t("invoiceReminder.errSave"), "error");
        return;
      }
      setState(data as ReminderState);
      toast(t("invoiceReminder.saved"));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await apiFetch("/api/company-settings/reminders", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error ?? t("invoiceReminder.errSave"), "error");
        return;
      }
      setState({ enabled: data.enabled, points: data.points, testedAt: data.testedAt });
      toast(t("invoiceReminder.testSent", { recipient: data.recipient }));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>
          <BellOutlined aria-hidden="true" style={{ marginInlineEnd: token.marginXXS }} />
          {t("invoiceReminder.settingsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Flex vertical gap={token.marginSM}>
          <Text type="secondary">{t("invoiceReminder.settingsDescription")}</Text>

          {/* Dinyalakan tapi belum pernah diuji = keadaan yang paling mudah
              disalahpahami: pengguna mengira pengingatnya berjalan, padahal
              penjadwal menolak. Dikatakan di layar, bukan hanya di log. */}
          {state.enabled && !state.testedAt && (
            <Alert type="warning" showIcon message={t("invoiceReminder.testRequired")} />
          )}

          <Checkbox
            checked={state.enabled}
            onCheckedChange={(checked) =>
              setState((prev) => (prev ? { ...prev, enabled: checked } : prev))
            }
          >
            {t("invoiceReminder.enable")}
          </Checkbox>

          <Flex vertical gap={token.marginXXS} style={{ paddingInlineStart: token.marginLG }}>
            {POINTS.map((point) => (
              <Checkbox
                key={point.key}
                checked={state.points.includes(point.key)}
                disabled={!state.enabled}
                onCheckedChange={(checked) => togglePoint(point.key, checked)}
              >
                {t(point.labelKey)}
              </Checkbox>
            ))}
          </Flex>

          {state.testedAt && (
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t("invoiceReminder.testedAt", { date: formatDateTime(state.testedAt) })}
            </Text>
          )}

          <Flex wrap gap={token.marginXS}>
            {/* Satu-satunya aksi MENGIKAT di kartu ini — yang lain hanya
                mengirim contoh ke diri sendiri (MASTER.md §Aksi utama). */}
            <Button type="button" variant="primary" onClick={save} disabled={busy}>
              <SaveOutlined aria-hidden="true" />
              {busy ? t("common.processing") : t("common.save")}
            </Button>
            <Button type="button" variant="secondary" onClick={sendTest} disabled={testing}>
              {testing ? t("invoiceReminder.testSending") : t("invoiceReminder.testButton")}
            </Button>
          </Flex>
        </Flex>
      </CardContent>
    </Card>
  );
}
