"use client";

/**
 * Pengaturan → PROFIL USAHA (bentuk usaha, PR B — 24 Okt 2026).
 *
 *  1. Identitas legal: NIB, nomor akta / pernyataan pendirian, SK
 *     Kemenkumham, tanggal pendirian — semuanya opsional.
 *  2. PPh Final UMKM (PP 55/2022): sakelar + tahun mulai. Bawaan MATI.
 *     Alat bantu laporan saja: tidak ada jurnal yang diterbitkan.
 */

import { useEffect, useState } from "react";
import { Alert, Flex, Typography, theme } from "antd";
import { SaveOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@sai/ui/card";
import { Checkbox } from "@sai/ui/checkbox";
import { Input } from "@sai/ui/input";
import { useToast } from "@sai/ui/toast";
import { useT } from "@sai/core/i18n/client";
import { Link } from "@sai/ui/app-link";
import { apiFetch } from "@/lib/api-fetch";
import type { LegalForm } from "@sai/core/legal-form";
import { PPH_FINAL_TIME_LIMITS, pphFinalGroupFor, pphFinalTimeLimit } from "@/lib/pph-final-umkm";

interface Profile {
  nib: string | null;
  deedNumber: string | null;
  ministryDecreeNumber: string | null;
  establishedOn: string | null;
  pphFinalUmkm: boolean;
  pphFinalUmkmStartYear: number | null;
}

interface ProfileResponse {
  legalForm: LegalForm;
  profile: Profile | null;
}

export function BusinessProfilePanel() {
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [nib, setNib] = useState("");
  const [deedNumber, setDeedNumber] = useState("");
  const [decree, setDecree] = useState("");
  const [establishedOn, setEstablishedOn] = useState("");
  const [pphOn, setPphOn] = useState(false);
  const [startYear, setStartYear] = useState("");

  function apply(d: ProfileResponse) {
    setData(d);
    const p = d.profile;
    setNib(p?.nib ?? "");
    setDeedNumber(p?.deedNumber ?? "");
    setDecree(p?.ministryDecreeNumber ?? "");
    setEstablishedOn(p?.establishedOn ?? "");
    setPphOn(p?.pphFinalUmkm ?? false);
    setStartYear(p?.pphFinalUmkmStartYear ? String(p.pphFinalUmkmStartYear) : "");
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch("/api/company-settings/business-profile");
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as ProfileResponse;
        if (alive) apply(d);
      } catch {
        if (alive) setLoadError(t("businessProfile.loadFailed"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  async function save(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/company-settings/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d?.error ?? t("businessProfile.saveFailed"));
        return;
      }
      apply(d as ProfileResponse);
      toast(t("businessProfile.saved"));
    } catch {
      setError(t("businessProfile.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const thisYear = new Date().getFullYear();
  const legalForm = data?.legalForm ?? "pt";
  const group = pphFinalGroupFor(legalForm);
  const limit = pphFinalTimeLimit(legalForm, startYear ? Number(startYear) : null, thisYear);

  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>{t("businessProfile.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <Alert type="error" showIcon message={loadError} />
        ) : !data ? (
          <Typography.Text type="secondary">{t("common.loading")}</Typography.Text>
        ) : !data.profile ? (
          <Alert type="info" showIcon message={t("businessProfile.setupFirst")} />
        ) : (
          <Flex vertical gap={token.marginLG}>
            <Flex vertical gap={token.marginSM}>
              <Typography.Title level={3} style={{ fontSize: token.fontSizeLG, margin: 0 }}>
                {t("businessProfile.identityTitle")}
              </Typography.Title>
              <Flex gap={token.marginSM} wrap="wrap">
                <div style={{ flex: "1 1 220px" }}>
                  <Input id="bp-nib" label={t("businessProfile.nib")} value={nib} inputMode="numeric" maxLength={13} onChange={(e) => setNib(e.target.value)} disabled={busy} />
                </div>
                <div style={{ flex: "1 1 220px" }}>
                  <Input
                    id="bp-deed"
                    label={legalForm === "pt_perorangan" ? t("businessProfile.statementNumber") : t("businessProfile.deedNumber")}
                    value={deedNumber}
                    maxLength={100}
                    onChange={(e) => setDeedNumber(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div style={{ flex: "1 1 220px" }}>
                  <Input id="bp-decree" label={t("businessProfile.decreeNumber")} value={decree} maxLength={100} onChange={(e) => setDecree(e.target.value)} disabled={busy} />
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <Input id="bp-established" type="date" label={t("businessProfile.establishedOn")} value={establishedOn} onChange={(e) => setEstablishedOn(e.target.value)} disabled={busy} />
                </div>
              </Flex>
              <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {t("businessProfile.identityNote")}
              </Typography.Text>
              <div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void save({ identity: { nib, deedNumber, ministryDecreeNumber: decree, establishedOn } })
                  }
                >
                  <SaveOutlined aria-hidden="true" />
                  {t("businessProfile.saveIdentity")}
                </Button>
              </div>
            </Flex>

            <Flex vertical gap={token.marginSM}>
              <Typography.Title level={3} style={{ fontSize: token.fontSizeLG, margin: 0 }}>
                {t("businessProfile.pphTitle")}
              </Typography.Title>
              <Checkbox id="bp-pph" checked={pphOn} onCheckedChange={(v) => setPphOn(v === true)} disabled={busy}>
                {t("businessProfile.pphToggle")}
              </Checkbox>
              {pphOn && (
                <div style={{ maxWidth: 220 }}>
                  <Input
                    id="bp-pph-start"
                    label={t("businessProfile.pphStartYear")}
                    value={startYear}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setStartYear(e.target.value.replace(/\D/g, ""))}
                    disabled={busy}
                  />
                </div>
              )}
              <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {group ? PPH_FINAL_TIME_LIMITS[group].rule : t("businessProfile.pphNoGroup")}{" "}
                {t("businessProfile.pphCheckLatest")}
              </Typography.Text>
              {pphOn && limit.lastYear !== null && (
                <Alert
                  type={limit.status === "expired" ? "warning" : limit.status === "last_year" ? "info" : "success"}
                  showIcon
                  message={t(
                    limit.status === "expired"
                      ? "businessProfile.pphExpired"
                      : limit.status === "last_year"
                        ? "businessProfile.pphLastYear"
                        : "businessProfile.pphActiveUntil",
                    { year: limit.lastYear }
                  )}
                />
              )}
              <Flex gap={token.marginSM} align="center" wrap="wrap">
                <Button
                  variant="secondary"
                  disabled={busy || (pphOn && !startYear)}
                  onClick={() => void save({ pphFinal: { enabled: pphOn, startYear: startYear ? Number(startYear) : null } })}
                >
                  <SaveOutlined aria-hidden="true" />
                  {t("businessProfile.savePph")}
                </Button>
                {data.profile.pphFinalUmkm && <Link href="/tax/pph-final-umkm">{t("businessProfile.openReport")}</Link>}
              </Flex>
            </Flex>
            {error && <Alert type="error" showIcon message={error} />}
          </Flex>
        )}
      </CardContent>
    </Card>
  );
}
