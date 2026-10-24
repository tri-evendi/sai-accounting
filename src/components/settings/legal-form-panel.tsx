"use client";

/**
 * Pengaturan → BENTUK USAHA (24 Okt 2026): bentuk usaha perusahaan dan daftar
 * pemilik/sekutu beserta porsi labanya.
 *
 * ══ YANG TIDAK DILAKUKANNYA, DAN DIKATAKAN DI LAYAR ════════════════════════
 * Mengganti bentuk usaha TIDAK menulis ulang satu jurnal pun dan TIDAK
 * mengubah bagan akun yang sudah ada. Yang berubah hanya perlakuan ke depan:
 * ke mana tutup buku tahunan berikutnya memindahkan laba, dan rincian
 * Laporan Perubahan Ekuitas. Peringatan itu tampil SEBELUM perubahan disimpan
 * (dialog konfirmasi), dan API menolak perubahan tanpa `acknowledged`.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Flex, Typography, theme } from "antd";
import { SaveOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@sai/ui/card";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { Select } from "@sai/ui/select";
import { useToast } from "@sai/ui/toast";
import { useT } from "@sai/core/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import {
  equityModelFor,
  isLegalForm,
  isPartnerRole,
  LEGAL_FORMS,
  LEGAL_FORM_LABEL_KEYS,
  type LegalForm,
} from "@sai/core/legal-form";
import {
  initialPartnerRows,
  PartnersEditor,
  rowsToDrafts,
  type PartnerRow,
} from "@/components/settings/partners-editor";

interface PartnerView {
  id: number;
  name: string;
  role: string | null;
  shareBp: number;
  isActive: boolean;
  capitalAccount: { code: string; name: string } | null;
  drawingAccount: { code: string; name: string } | null;
}

interface LegalFormResponse {
  legalForm: LegalForm;
  partners: PartnerView[];
}

/** Baris isian + id tersimpan (tidak ada = sekutu baru). */
type EditRow = PartnerRow & { id?: number };

function toRows(partners: PartnerView[]): EditRow[] {
  return partners
    .filter((p) => p.isActive)
    .map((p, i) => ({
      key: i + 1,
      id: p.id,
      name: p.name,
      role: isPartnerRole(p.role) ? p.role : null,
      percent: String(p.shareBp / 100),
    }));
}

export function LegalFormPanel() {
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();

  const [state, setState] = useState<LegalFormResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<LegalForm>("pt");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const apply = useCallback((data: LegalFormResponse) => {
    setState(data);
    setSelected(data.legalForm);
    const saved = toRows(data.partners);
    setRows(saved.length > 0 ? saved : initialPartnerRows(data.legalForm));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch("/api/company-settings/legal-form");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LegalFormResponse;
        if (alive) apply(data);
      } catch {
        if (alive) setLoadError(t("legalForm.loadFailed"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [apply, t]);

  async function saveLegalForm() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/company-settings/legal-form", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalForm: selected, acknowledged: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? t("legalForm.saveFailed"));
        return;
      }
      apply(data as LegalFormResponse);
      toast(t("legalForm.saved"));
    } catch {
      setError(t("legalForm.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function savePartners() {
    if (!state) return;
    setBusy(true);
    setError("");
    const drafts = rowsToDrafts(state.legalForm, rows);
    /* Sekutu yang DIHAPUS dari isian dikirim sebagai NONAKTIF — barisnya dan
       akunnya tetap ada, sebab riwayatnya tetap harus terbaca di laporan. */
    const kept = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
    const payload = [
      ...rows.map((r, i) => ({ ...(r.id ? { id: r.id } : {}), ...drafts[i]!, isActive: true })),
      ...state.partners
        .filter((p) => !kept.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          role: isPartnerRole(p.role) ? p.role : null,
          shareBp: 0,
          isActive: false,
        })),
    ];
    try {
      const res = await apiFetch("/api/company-settings/partners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partners: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? t("legalForm.saveFailed"));
        return;
      }
      apply(data as LegalFormResponse);
      toast(t("legalForm.partnersSaved"));
    } catch {
      setError(t("legalForm.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const model = state ? equityModelFor(state.legalForm) : "retained_earnings";
  const inactive = state?.partners.filter((p) => !p.isActive) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>{t("legalForm.panelTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <Alert type="error" showIcon message={loadError} />
        ) : !state ? (
          <Typography.Text type="secondary">{t("common.loading")}</Typography.Text>
        ) : (
          <Flex vertical gap={token.margin}>
            <Typography.Text type="secondary">{t("legalForm.panelIntro")}</Typography.Text>
            <Flex gap={token.marginSM} align="flex-end" wrap="wrap">
              <div style={{ flex: "1 1 260px", maxWidth: 420 }}>
                <Select
                  id="settings-legal-form"
                  label={t("legalForm.label")}
                  value={selected}
                  onChange={(e) => {
                    if (isLegalForm(e.target.value)) setSelected(e.target.value);
                  }}
                  disabled={busy}
                  options={LEGAL_FORMS.map((f) => ({ value: f, label: t(LEGAL_FORM_LABEL_KEYS[f]) }))}
                />
              </div>
              <Button
                variant="secondary"
                disabled={busy || selected === state.legalForm}
                onClick={() => setConfirmOpen(true)}
              >
                <SaveOutlined aria-hidden="true" />
                {t("legalForm.change")}
              </Button>
            </Flex>
            {selected !== state.legalForm && (
              <Alert type="warning" showIcon message={t("legalForm.changeWarning")} />
            )}

            {model !== "retained_earnings" && (
              <Flex vertical gap={token.marginSM}>
                <Typography.Title level={3} style={{ fontSize: token.fontSizeLG, margin: 0 }}>
                  {t(model === "sole_owner" ? "legalForm.ownerTitle" : "legalForm.partnersTitle")}
                </Typography.Title>
                {state.partners.length === 0 && (
                  <Alert type="info" showIcon message={t("legalForm.noPartnersYet")} />
                )}
                <PartnersEditor
                  legalForm={state.legalForm}
                  rows={rows}
                  onChange={setRows}
                  disabled={busy}
                  idPrefix="settings-partner"
                />
                {rows.some((r) => r.id) && (
                  <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {t("legalForm.accountsNote", {
                      list: state.partners
                        .filter((p) => p.isActive && p.capitalAccount)
                        .map((p) => `${p.name}: ${p.capitalAccount!.code}${p.drawingAccount ? ` / ${p.drawingAccount.code}` : ""}`)
                        .join(" · "),
                    })}
                  </Typography.Text>
                )}
                {inactive.length > 0 && (
                  <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {t("legalForm.inactiveList", { list: inactive.map((p) => p.name).join(", ") })}
                  </Typography.Text>
                )}
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {t("legalForm.sharesForwardNote")}
                </Typography.Text>
                <div>
                  <Button variant="primary" onClick={() => void savePartners()} disabled={busy}>
                    <SaveOutlined aria-hidden="true" />
                    {t("legalForm.savePartners")}
                  </Button>
                </div>
              </Flex>
            )}
            {error && <Alert type="error" showIcon message={error} />}
          </Flex>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("legalForm.confirmTitle")}
        message={t("legalForm.changeWarning")}
        confirmLabel={t("legalForm.change")}
        onConfirm={async () => {
          setConfirmOpen(false);
          await saveLegalForm();
        }}
      />
    </Card>
  );
}
