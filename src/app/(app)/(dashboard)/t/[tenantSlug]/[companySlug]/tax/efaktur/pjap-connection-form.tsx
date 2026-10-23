"use client";

/**
 * SAMBUNGAN PJAP milik PT (docs/EFAKTUR.md) — penyedia, client id, rahasia,
 * sandbox/produksi. Hanya untuk `tax.manage`.
 *
 * Rahasia tidak pernah dikirim balik dari server: kolomnya kosong, dan
 * keterangannya berkata "tersimpan" bila ada. Membiarkannya kosong = rahasia
 * lama tetap dipakai.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Col, Row } from "antd";
import { Button } from "@sai/ui/button";
import { Input } from "@sai/ui/input";
import { PasswordInput } from "@sai/ui/password-input";
import { Select } from "@sai/ui/select";
import { Checkbox } from "@sai/ui/checkbox";
import { useToast } from "@sai/ui/toast";
import { SaveOutlined } from "@ant-design/icons";
import { useT } from "@sai/core/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

const FIELD_GAP = 16;
const ICON_SIZE = 16;

type Provider = "" | "mock" | "pjap";

export function PjapConnectionForm({
  basePath,
  initial,
}: {
  basePath: string;
  initial: { provider: "mock" | "pjap" | null; clientId: string | null; hasSecret: boolean; isProduction: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [provider, setProvider] = useState<Provider>(initial.provider ?? "");
  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [isProduction, setIsProduction] = useState(initial.isProduction);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await apiFetch(`${basePath}/connection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider === "" ? null : provider,
          clientId: clientId || null,
          // Kosong = biarkan rahasia tersimpan.
          ...(secret !== "" ? { secret } : {}),
          isProduction,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("tax.saveFailed"), "error");
        return;
      }
      setSecret("");
      toast(t("tax.pjap.saved"), "success");
      router.refresh();
    } catch {
      toast(t("tax.networkFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  const needsCredentials = provider === "pjap";

  return (
    <Row gutter={[FIELD_GAP, FIELD_GAP]}>
      <Col xs={24} sm={12}>
        <Select
          label={t("tax.pjap.provider")}
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          options={[
            { value: "", label: t("tax.pjap.providerNone") },
            { value: "mock", label: t("tax.pjap.providerMock") },
            { value: "pjap", label: t("tax.pjap.providerPjap") },
          ]}
        />
      </Col>
      {needsCredentials && (
        <>
          <Col xs={24} sm={12}>
            <Input
              id="pjapClientId"
              label={t("tax.pjap.clientId")}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </Col>
          <Col xs={24} sm={12}>
            <PasswordInput
              id="pjapSecret"
              label={t("tax.pjap.secret")}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
              aria-describedby="pjapSecretHint"
            />
            <p
              id="pjapSecretHint"
              style={{ margin: "var(--ant-margin-xxs) 0 0", color: "var(--ant-color-text-secondary)" }}
            >
              {initial.hasSecret ? t("tax.pjap.secretStored") : t("tax.pjap.secretMissing")}
            </p>
          </Col>
          <Col xs={24} sm={12}>
            <label htmlFor="pjapProduction" style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
              <Checkbox
                id="pjapProduction"
                checked={isProduction}
                onCheckedChange={(v) => setIsProduction(v === true)}
              />
              <span>{t("tax.pjap.production")}</span>
            </label>
          </Col>
        </>
      )}
      <Col span={24}>
        <Button type="button" variant="secondary" onClick={save} disabled={saving}>
          <SaveOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 6 }} />
          {saving ? t("common.saving") : t("tax.pjap.save")}
        </Button>
      </Col>
    </Row>
  );
}
