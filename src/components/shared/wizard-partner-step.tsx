"use client";

/**
 * Langkah 1 kedua wizard (issue #5): pilih mitra yang sudah terdaftar, atau isi
 * mitra baru.
 *
 * Satu komponen untuk pelanggan DAN pemasok karena keputusannya identik —
 * "sudah ada / baru" — dan menduplikasinya berarti dua tempat yang bisa berbeda
 * aturan. Mitra baru TIDAK dibuat di sini: isiannya hanya masuk ke draf, dan
 * baris `customers`/`suppliers`-nya baru lahir di dalam transaksi terakhir.
 * Itulah sebabnya membatalkan di langkah 2 tidak meninggalkan mitra yatim.
 */

import { Col, Flex, Row, theme, Typography } from "antd";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import {
  ServerSearchableSelect,
  type PickerOption,
} from "@/components/ui/server-searchable-select";
import { DisclosureSection } from "@/components/ui/disclosure-section";
import { EmptyState } from "@/components/ui/empty-state";
import type { PartnerDraft } from "@/lib/wizard";
import { UserPlus, Users } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** Ikon keadaan kosong — sebesar `h-12 w-12` sebelum migrasi. */
const EMPTY_ICON_SIZE = 48;

interface Props {
  /**
   * Mitra mana yang sedang diisi. Dulu berupa kata benda Indonesia mentah
   * ("pelanggan"/"pemasok") yang dirangkai ke belasan label ("Pilih pelanggan",
   * "Belum ada pelanggan terdaftar"). Rangkaian seperti itu tidak bisa
   * diterjemahkan — bahasa lain menaruh kata bendanya di tempat lain — jadi
   * yang dikirim kini KUNCI-nya, dan katanya diambil dari kamus di sini.
   */
  kind: "customer" | "supplier";
  /** Mode statis: seluruh opsi dikirim halaman server. Abaikan bila `fetchUrl`
   *  dipakai. */
  options?: SearchableOption[];
  /**
   * Mode cari-ke-server (audit: pemilih mitra terpotong `take: 500`): endpoint
   * `{ options }` untuk `ServerSearchableSelect`, mis.
   * `/api/customers?active=1&picker=1`. Mitra lama ditemukan lewat pencarian,
   * bukan hilang di balik potongan daftar.
   */
  fetchUrl?: string;
  /** Label mitra yang sudah terpilih (mis. dari draf yang dipulihkan) — hanya
   *  berarti pada mode `fetchUrl`. */
  initialOption?: PickerOption | null;
  value: PartnerDraft;
  onChange: (patch: Partial<PartnerDraft>) => void;
  /** Pelanggan membawa PIC, NPWP, dan penanda bebas PPN; pemasok tidak. */
  withCustomerFields?: boolean;
  /** Halaman tempat mitra dikelola, untuk empty state. */
  manageHref: string;
}

export function WizardPartnerStep({
  kind,
  options = [],
  fetchUrl,
  initialOption,
  value,
  onChange,
  withCustomerFields = false,
  manageHref,
}: Props) {
  const t = useT();
  const { token } = theme.useToken();
  const isNew = value.mode === "new";
  const noun =
    kind === "customer" ? t("wizard.partner.nounCustomer") : t("wizard.partner.nounSupplier");
  const per = <T,>(customer: T, supplier: T): T => (kind === "customer" ? customer : supplier);

  return (
    <Card>
      {/* `CardContent` tanpa kelas sudah `px-6 py-4` — persis padding yang
          dulu ditulis ulang sebagai `py-4`. Jarak antar-blok pindah ke `Flex`. */}
      <CardContent>
        <Flex vertical gap={token.margin}>
          <fieldset>
            <legend
              style={{ marginBottom: token.marginXS, fontWeight: token.fontWeightStrong }}
            >
              {t(per("wizard.partner.thisCustomer", "wizard.partner.thisSupplier"))}
            </legend>
            <Row gutter={[token.marginXS, token.marginXS]}>
              {(
                [
                  { mode: "existing", label: t("wizard.partner.modeExisting"), icon: Users },
                  { mode: "new", label: t("wizard.partner.modeNew"), icon: UserPlus },
                ] as const
              ).map(({ mode, label, icon: Icon }) => {
                const picked = value.mode === mode;
                return (
                  <Col key={mode} xs={24} sm={12}>
                    {/*
                     * Kartu pilihan: yang terpilih ditandai batas `colorPrimary`
                     * + latar `colorPrimaryBg` — TAMBAHAN di atas radio yang
                     * memang sudah tercentang, bukan penggantinya. Warna di sini
                     * hanya mempercepat pembacaan; penandanya tetap radio.
                     */}
                    <Flex
                      component="label"
                      align="center"
                      gap={token.marginSM}
                      style={{
                        cursor: "pointer",
                        padding: token.paddingSM,
                        borderRadius: token.borderRadiusLG,
                        border: `${token.lineWidth}px solid ${
                          picked ? token.colorPrimary : token.colorBorder
                        }`,
                        background: picked ? token.colorPrimaryBg : undefined,
                        transition: `background ${token.motionDurationMid}, border-color ${token.motionDurationMid}`,
                      }}
                    >
                      <input
                        type="radio"
                        name="partner-mode"
                        style={{
                          width: token.fontSize,
                          height: token.fontSize,
                          cursor: "pointer",
                        }}
                        checked={picked}
                        onChange={() => onChange({ mode })}
                      />
                      <Icon
                        size={token.fontSize}
                        aria-hidden="true"
                        style={{ flexShrink: 0, color: token.colorTextSecondary }}
                      />
                      <span>{label}</span>
                    </Flex>
                  </Col>
                );
              })}
            </Row>
          </fieldset>

        {!isNew &&
          (fetchUrl ? (
            <ServerSearchableSelect
              id="partnerId"
              label={t("wizard.partner.pickLabel", { noun })}
              placeholder={t("wizard.partner.pickPlaceholder", { noun })}
              searchPlaceholder={t("wizard.partner.searchPlaceholder", { noun })}
              emptyText={t("wizard.partner.emptyText", { noun })}
              fetchUrl={fetchUrl}
              initialOption={initialOption}
              value={value.id != null ? String(value.id) : null}
              onChange={(v) => onChange({ id: v == null ? null : Number(v) })}
            />
          ) : options.length === 0 ? (
            <EmptyState
              icon={<Users size={EMPTY_ICON_SIZE} />}
              title={t("wizard.partner.emptyTitle", { noun })}
              description={t("wizard.partner.emptyDescription", { noun })}
              actionLabel={t("wizard.partner.manageAction", { noun })}
              actionHref={manageHref}
            />
          ) : (
            <SearchableSelect
              id="partnerId"
              label={t("wizard.partner.pickLabel", { noun })}
              placeholder={t("wizard.partner.pickPlaceholder", { noun })}
              searchPlaceholder={t("wizard.partner.searchPlaceholder", { noun })}
              emptyText={t("wizard.partner.emptyText", { noun })}
              options={options}
              value={value.id != null ? String(value.id) : null}
              onChange={(v) => onChange({ id: v == null ? null : Number(v) })}
            />
          ))}

        {isNew && (
          <>
            <Row gutter={[token.margin, token.margin]}>
              <Col xs={24} sm={12}>
                <Input
                  id="partnerName"
                  label={t(per("wizard.partner.nameCustomer", "wizard.partner.nameSupplier"))}
                  value={value.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  maxLength={100}
                  required
                />
              </Col>
              <Col xs={24} sm={12}>
                <Input
                  id="partnerPhone"
                  label={t("wizard.partner.phoneField")}
                  value={value.phone}
                  onChange={(e) => onChange({ phone: e.target.value })}
                  maxLength={30}
                />
              </Col>
            </Row>
            <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t(per("wizard.partner.notSavedCustomer", "wizard.partner.notSavedSupplier"))}{" "}
              <strong>{t("wizard.partner.notSavedStrong")}</strong>{" "}
              {t("wizard.partner.notSavedAfter")}
            </Typography.Text>

            <DisclosureSection
              description={
                withCustomerFields
                  ? t("wizard.partner.disclosureCustomer", { noun })
                  : t("wizard.partner.disclosureSupplier", { noun })
              }
              summary={[
                value.address || t("wizard.partner.summaryNoAddress"),
                value.email || t("wizard.partner.summaryNoEmail"),
              ].join(" · ")}
            >
              <Row gutter={[token.margin, token.margin]}>
                <Col xs={24} sm={12}>
                  <Input
                    id="partnerAddress"
                    label={t("common.address")}
                    value={value.address}
                    onChange={(e) => onChange({ address: e.target.value })}
                    maxLength={500}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Input
                    id="partnerEmail"
                    type="email"
                    label={t("wizard.partner.emailField")}
                    value={value.email}
                    onChange={(e) => onChange({ email: e.target.value })}
                    maxLength={100}
                  />
                </Col>
                {withCustomerFields && (
                  <>
                    <Col xs={24} sm={12}>
                      <Input
                        id="partnerPic"
                        label={t("wizard.partner.picField")}
                        value={value.pic}
                        onChange={(e) => onChange({ pic: e.target.value })}
                        maxLength={100}
                      />
                    </Col>
                    <Col xs={24} sm={12}>
                      <Input
                        id="partnerNpwp"
                        label={t("wizard.partner.npwpField")}
                        value={value.npwp}
                        onChange={(e) => onChange({ npwp: e.target.value })}
                        maxLength={30}
                      />
                    </Col>
                    <Col span={24}>
                      {/*
                       * Kata-katanya kini ANAK `Checkbox`, bukan `<label>` kedua
                       * yang membungkus `<label>` AntD. Daerah tekannya jadi
                       * milik `.ant-checkbox-wrapper` — kotak DAN keterangannya.
                       */}
                      <Checkbox
                        checked={value.taxExempt}
                        onCheckedChange={(v) => onChange({ taxExempt: v === true })}
                      >
                        {t("wizard.partner.taxExemptLabel")}
                        <Typography.Text
                          type="secondary"
                          style={{ display: "block", fontSize: token.fontSizeSM }}
                        >
                          {t("wizard.partner.taxExemptHint")}
                        </Typography.Text>
                      </Checkbox>
                    </Col>
                  </>
                )}
              </Row>
            </DisclosureSection>
          </>
        )}
        </Flex>
      </CardContent>
    </Card>
  );
}
