"use client";

/**
 * Isian pemilik/sekutu (bentuk usaha, 24 Okt 2026) — dipakai wisaya penyiapan
 * dan Pengaturan → Bentuk usaha.
 *
 *   • CV    — nama, peran (aktif/komanditer), porsi laba (%).
 *   • Firma — nama, porsi laba (%). Semua sekutu firma aktif.
 *   • Usaha perorangan — satu nama pemilik; porsinya selalu 100%.
 *
 * Porsi diketik dalam PERSEN (boleh dua desimal, 33,33) dan disimpan dalam
 * basis poin (`percentToBp`). Jumlahnya ditampilkan langsung di bawah tabel —
 * "kurang 0,01%" jauh lebih mudah diperbaiki di sini daripada saat tutup buku.
 */

import { Button as AntButton, Flex, Typography, theme } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Input } from "@sai/ui/input";
import { Select } from "@sai/ui/select";
import { useT } from "@sai/core/i18n/client";
import {
  equityModelFor,
  FULL_SHARE_BP,
  PARTNER_ROLES,
  isPartnerRole,
  usesPartnerRoles,
  type LegalForm,
  type PartnerRole,
} from "@sai/core/legal-form";
import { percentToBp, type PartnerDraft } from "@/lib/partners";
import { PARTNER_ROLE_OPTION_KEYS } from "@/lib/legal-form-messages";

/** Satu baris isian. `percent` teks apa adanya, supaya "33," bisa diketik. */
export interface PartnerRow {
  key: number;
  name: string;
  role: PartnerRole | null;
  percent: string;
}

/** Teks persen (koma atau titik desimal) → angka; kosong/tidak sah → NaN. */
function parsePercent(text: string): number {
  const v = Number(text.trim().replace(",", "."));
  return text.trim() === "" ? Number.NaN : v;
}

/** Baris isian → draf untuk server. Perorangan: porsi selalu 100%. */
export function rowsToDrafts(form: LegalForm, rows: readonly PartnerRow[]): PartnerDraft[] {
  if (equityModelFor(form) === "sole_owner") {
    const owner = rows[0];
    return owner && owner.name.trim()
      ? [{ name: owner.name.trim(), role: null, shareBp: FULL_SHARE_BP }]
      : [];
  }
  return rows.map((r) => {
    const pct = parsePercent(r.percent);
    return {
      name: r.name.trim(),
      role: usesPartnerRoles(form) ? r.role : null,
      shareBp: Number.isFinite(pct) ? percentToBp(pct) : -1,
    };
  });
}

/** Baris awal yang masuk akal untuk bentuk usaha itu. */
export function initialPartnerRows(form: LegalForm): PartnerRow[] {
  switch (equityModelFor(form)) {
    case "sole_owner":
      return [{ key: 1, name: "", role: null, percent: "100" }];
    case "partners":
      return [
        { key: 1, name: "", role: usesPartnerRoles(form) ? "aktif" : null, percent: "50" },
        { key: 2, name: "", role: usesPartnerRoles(form) ? "komanditer" : null, percent: "50" },
      ];
    default:
      return [];
  }
}

export function PartnersEditor({
  legalForm,
  rows,
  onChange,
  disabled,
  idPrefix = "partner",
}: {
  legalForm: LegalForm;
  rows: PartnerRow[];
  onChange: (rows: PartnerRow[]) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const model = equityModelFor(legalForm);
  if (model === "retained_earnings") return null;

  const update = (key: number, patch: Partial<PartnerRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (model === "sole_owner") {
    const owner = rows[0] ?? { key: 1, name: "", role: null, percent: "100" };
    return (
      <Flex vertical gap={token.marginXXS}>
        <Input
          id={`${idPrefix}-owner`}
          label={t("legalForm.ownerName")}
          value={owner.name}
          onChange={(e) => onChange([{ ...owner, name: e.target.value }])}
          disabled={disabled}
          maxLength={120}
        />
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {t("legalForm.ownerHelp")}
        </Typography.Text>
      </Flex>
    );
  }

  const totalBp = rows.reduce((sum, r) => {
    const pct = parsePercent(r.percent);
    return sum + (Number.isFinite(pct) ? percentToBp(pct) : 0);
  }, 0);
  const roles = usesPartnerRoles(legalForm);

  return (
    <Flex vertical gap={token.marginSM}>
      <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {t(roles ? "legalForm.partnersHelpCv" : "legalForm.partnersHelpFirma")}
      </Typography.Text>
      {rows.map((row, i) => (
        <Flex key={row.key} gap={token.marginSM} wrap="wrap" align="flex-end">
          <div style={{ flex: "2 1 200px" }}>
            <Input
              id={`${idPrefix}-name-${row.key}`}
              label={t("legalForm.partnerNameN", { n: i + 1 })}
              value={row.name}
              onChange={(e) => update(row.key, { name: e.target.value })}
              disabled={disabled}
              maxLength={120}
            />
          </div>
          {roles && (
            <div style={{ flex: "1 1 160px" }}>
              <Select
                id={`${idPrefix}-role-${row.key}`}
                label={t("legalForm.partnerRole")}
                value={row.role ?? ""}
                onChange={(e) => update(row.key, { role: isPartnerRole(e.target.value) ? e.target.value : null })}
                disabled={disabled}
                options={PARTNER_ROLES.map((r) => ({ value: r, label: t(PARTNER_ROLE_OPTION_KEYS[r]) }))}
              />
            </div>
          )}
          <div style={{ flex: "0 1 120px" }}>
            <Input
              id={`${idPrefix}-share-${row.key}`}
              label={t("legalForm.partnerShare")}
              value={row.percent}
              inputMode="decimal"
              onChange={(e) => update(row.key, { percent: e.target.value })}
              disabled={disabled}
            />
          </div>
          <AntButton
            type="text"
            danger
            icon={<DeleteOutlined aria-hidden="true" />}
            aria-label={t("legalForm.removePartner", { name: row.name || String(i + 1) })}
            onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
            disabled={disabled || rows.length <= 1}
          />
        </Flex>
      ))}
      <Flex justify="space-between" align="center" wrap="wrap" gap={token.marginSM}>
        <AntButton
          icon={<PlusOutlined aria-hidden="true" />}
          onClick={() =>
            onChange([
              ...rows,
              {
                key: Math.max(0, ...rows.map((r) => r.key)) + 1,
                name: "",
                role: roles ? "komanditer" : null,
                percent: "",
              },
            ])
          }
          disabled={disabled}
        >
          {t("legalForm.addPartner")}
        </AntButton>
        <Typography.Text
          role="status"
          type={totalBp === FULL_SHARE_BP ? "success" : "danger"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {t("legalForm.shareTotal", {
            total: (totalBp / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 }),
          })}
        </Typography.Text>
      </Flex>
    </Flex>
  );
}
