"use client";

/**
 * Uang Muka Pembelian on the supplier screen (issue #41).
 * Dikonversi ke token Ant Design pada issue #196.
 *
 * The purchase side of advances was complete in the backend since #26 — the
 * type, the endpoint, the compensation guard, the AP integration and their tests
 * all existed — with no way to reach any of it except by calling the API by
 * hand. This panel is that missing surface, and deliberately nothing more: every
 * write goes through the same two endpoints the sales side uses, so the journals
 * are the ones the API already produced. No accounting rule lives in this file.
 *
 * ── Why the target is PICKED here, unlike the invoice screen ─────────────────
 * On `/invoices/[id]` the document being settled is the page itself, so there is
 * nothing to choose. A supplier has many purchases, so the flow gains one step:
 * pick the purchase, then compensate into it. That step is also where the
 * issue's "show each purchase's outstanding" requirement is met — the picker
 * carries the remaining IDR of every option, so the choice is informed rather
 * than made blind and corrected by a server error.
 *
 * ── Currency discipline ─────────────────────────────────────────────────────
 * Every cross-document figure here is IDR base. An advance or purchase with no
 * usable rate has no IDR value at all, so it is excluded from the totals and
 * counted out loud (`Belum berkurs`) rather than folded in at 1:1 — the bug
 * fixed in #35/#36 and re-stated in the header of `receivables.ts`.
 *
 * ── Catatan konversi #196 ───────────────────────────────────────────────────
 * Daftar uang mukanya kini `StaticTable` (tetap tanpa rc-table: ia hanya
 * menampilkan). Kolom "Sisa (IDR)" adalah satu-satunya yang tidak lewat
 * `moneyColumn`, karena selnya harus bisa mengatakan **"belum berkurs"** —
 * sebuah nilai yang BELUM DIKETAHUI, yang tak boleh dirender sebagai Rp 0.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Col, Flex, Row, theme } from "antd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import {
  AdvanceCompensationSection,
  type AdvanceOption,
  type AppliedAdvance,
} from "@/components/shared/advance-compensation";
import {
  AdvanceForm,
  type ContractOption,
} from "@/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/advances/new/advance-form";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { CloseOutlined, InfoCircleOutlined, MoneyCollectOutlined, PlusOutlined, VerticalAlignTopOutlined } from "@ant-design/icons";
/** One purchase this supplier's advances can be compensated into. */
export interface PurchaseTargetView {
  id: number;
  label: string;
  date: string;
  currency: string;
  amount: number;
  /** Room left for compensation, IDR base. Never null here — see page.tsx. */
  remainingBase: number;
}

/** One advance paid to this supplier, with its balance already worked out. */
export interface SupplierAdvanceView {
  id: number;
  advanceNo: string;
  date: string;
  currency: string;
  amount: number;
  applied: number;
  remaining: number;
  remainingBase: number | null;
  unratedApplications: number;
  isFullyApplied: boolean;
  contractNo: string | null;
}

/** Lebar nyaman pemilih target kompensasi (`max-w-md` lama = 28rem). */
const TARGET_PICKER_MAX_WIDTH = 448;

export function SupplierAdvancePanel({
  supplier,
  contracts,
  advances,
  outstandingBase,
  unratedAdvanceCount,
  purchases,
  unratedPurchaseCount,
  appliedByPurchase,
}: {
  supplier: { id: number; name: string };
  contracts: ContractOption[];
  advances: SupplierAdvanceView[];
  /** Σ remaining of every advance that HAS an IDR value. */
  outstandingBase: number;
  /** Advances excluded from that sum because they carry no rate. */
  unratedAdvanceCount: number;
  purchases: PurchaseTargetView[];
  /** Purchases dropped from the picker because they carry no rate. */
  unratedPurchaseCount: number;
  appliedByPurchase: Record<number, AppliedAdvance[]>;
}) {
  const router = useRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [recording, setRecording] = useState(false);
  const [targetId, setTargetId] = useState<string>("");

  const open = advances.filter((a) => !a.isFullyApplied);
  const selected = purchases.find((p) => String(p.id) === targetId) ?? null;

  // Only advances with balance left can be compensated, and only ones with a
  // usable IDR value can be checked against the target — the API rejects the
  // rest with an explanatory error, so they are listed above but not offered.
  const options: AdvanceOption[] = open.map((a) => ({
    id: a.id,
    advanceNo: a.advanceNo,
    date: a.date,
    currency: a.currency,
    remaining: a.remaining,
    remainingBase: a.remainingBase,
    partyName: supplier.name,
  }));

  const advanceColumns: SaiColumns<SupplierAdvanceView> = [
    {
      key: "advanceNo",
      dataIndex: "advanceNo",
      title: t("suppliers.colNumber"),
      align: "left",
      render: (_v, row) => (
        <>
          <span style={{ fontWeight: token.fontWeightStrong }}>{row.advanceNo}</span>
          {/* Badge always carries text — colour is never the only signal. */}
          <span style={{ display: "block", marginTop: token.marginXXS }}>
            <Badge variant={row.isFullyApplied ? "default" : "warning"}>
              {row.isFullyApplied ? t("suppliers.badgeUsedUp") : t("suppliers.badgeRemaining")}
            </Badge>
          </span>
        </>
      ),
    },
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      align: "left",
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatDateShort(new Date(row.date))}
        </span>
      ),
    },
    {
      key: "contractNo",
      dataIndex: "contractNo",
      title: t("suppliers.colContract"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: token.colorTextSecondary }}>{row.contractNo ?? "—"}</span>
      ),
    },
    moneyColumn<SupplierAdvanceView>({
      dataIndex: "amount",
      title: t("suppliers.colValue"),
      sorter: false,
      currency: (row) => row.currency,
    }),
    moneyColumn<SupplierAdvanceView>({
      dataIndex: "applied",
      title: t("suppliers.colApplied"),
      sorter: false,
      currency: (row) => row.currency,
    }),
    moneyColumn<SupplierAdvanceView>({
      dataIndex: "remaining",
      title: t("suppliers.colRemaining"),
      sorter: false,
      currency: (row) => row.currency,
    }),
    {
      key: "remainingBase",
      dataIndex: "remainingBase",
      title: t("suppliers.colRemainingIdr"),
      align: "right",
      // Sengaja BUKAN `moneyColumn`: sel ini harus bisa mengatakan "belum
      // berkurs", yaitu nilai yang BELUM DIKETAHUI — bukan Rp 0.
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {row.remainingBase != null ? (
            <Money value={row.remainingBase} currency="IDR" />
          ) : (
            <small style={{ color: token.colorWarningText }}>{t("common.rateMissing")}</small>
          )}
          {row.unratedApplications > 0 && (
            <span style={{ display: "block", color: token.colorWarningText }}>
              <small>
                {t("suppliers.unratedApplications", { count: row.unratedApplications })}
              </small>
            </span>
          )}
        </span>
      ),
    },
  ];

  /** Kotak keterangan bernada netral — ikon + kata, tak pernah warna saja. */
  const infoNote = (body: React.ReactNode) => (
    <p
      style={{
        margin: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: token.marginXS,
        borderRadius: token.borderRadius,
        border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        background: token.colorFillQuaternary,
        paddingInline: token.paddingSM,
        paddingBlock: token.paddingXS,
        color: token.colorTextSecondary,
      }}
    >
      <InfoCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: token.marginXXS }} />
      <small>{body}</small>
    </p>
  );

  return (
    <Flex vertical gap={token.marginLG}>
      {/* What this money IS. Direction is carried by an icon and by the words
          "Uang keluar", never by colour alone. */}
      {infoNote(
        <>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: token.marginXXS,
              fontWeight: token.fontWeightStrong,
              color: token.colorText,
            }}
          >
            <VerticalAlignTopOutlined aria-hidden="true" />
            {t("suppliers.introMoneyOut")}
          </span>{" "}
          {t("suppliers.introA")} <strong>{t("suppliers.introBefore")}</strong>{" "}
          {t("suppliers.introB")} <strong>{t("suppliers.introAdvance")}</strong>{" "}
          {t("suppliers.introC")} <em>{t("suppliers.introAsset")}</em>{" "}
          <strong>{t("suppliers.introNot")}</strong> {t("suppliers.introD")}
        </>
      )}

      {/* Balance tiles — the number the panel exists to answer. */}
      <Row gutter={[token.marginSM, token.marginSM]}>
        <Col xs={24} sm={12}>
          <div
            style={{
              borderRadius: token.borderRadius,
              border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
              padding: token.paddingSM,
            }}
          >
            <small style={{ color: token.colorTextSecondary }}>
              {t("suppliers.outstandingLabel")}
            </small>
            <p
              style={{
                margin: 0,
                marginTop: token.marginXXS,
                fontSize: token.fontSizeHeading4,
                fontWeight: token.fontWeightStrong,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatCurrency(outstandingBase, "IDR")}
            </p>
            <p style={{ margin: 0, color: token.colorTextSecondary }}>
              <small>{t("suppliers.outstandingHint", { count: open.length })}</small>
            </p>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div
            style={{
              borderRadius: token.borderRadius,
              border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
              padding: token.paddingSM,
            }}
          >
            <small style={{ color: token.colorTextSecondary }}>
              {t("suppliers.unratedLabel")}
            </small>
            <p
              style={{
                margin: 0,
                marginTop: token.marginXXS,
                fontSize: token.fontSizeHeading4,
                fontWeight: token.fontWeightStrong,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {unratedAdvanceCount}
            </p>
            <p style={{ margin: 0, color: token.colorTextSecondary }}>
              <small>
                {t("suppliers.unratedHintA")} <strong>{t("suppliers.unratedHintStrong")}</strong>{" "}
                {t("suppliers.unratedHintB")}
              </small>
            </p>
          </div>
        </Col>
      </Row>

      {/* Record a new advance — progressive disclosure, closed by default so the
          panel reads as a balance first and a form second. */}
      {recording ? (
        <div>
          <Flex
            wrap
            align="center"
            justify="space-between"
            gap={token.marginXS}
            style={{ marginBottom: token.marginXS }}
          >
            <h4 style={{ margin: 0 }}>
              {t("suppliers.recordAdvanceTo", { name: supplier.name })}
            </h4>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRecording(false)}>
              <CloseOutlined aria-hidden="true" />
              {t("common.close")}
            </Button>
          </Flex>
          <AdvanceForm
            contracts={contracts}
            locked={{ type: "purchase", party: supplier }}
            onSaved={() => {
              setRecording(false);
              router.refresh();
            }}
            onCancel={() => setRecording(false)}
          />
        </div>
      ) : (
        <div>
          {/* PEMICU yang membuka panel — `secondary` (#267): yang primer adalah
              submit di dalam `AdvanceForm` yang ia buka. Akibatnya
              `/suppliers/[id]` memikul NOL primer dalam keadaan bawaan dan tepat
              satu saat panelnya dibuka. Sebelum ini ia berdampingan dengan
              pemicu `secondary` "Catat transaksi" dan kompensasi uang muka yang
              sudah turun di potongan 2 — satu-satunya blok biru di halaman baca
              justru pemicunya. */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRecording(true)}
          >
            <PlusOutlined aria-hidden="true" />
            {t("suppliers.recordAdvance")}
          </Button>
        </div>
      )}

      {/* Advances paid to this supplier */}
      {advances.length === 0 ? (
        <p
          style={{
            margin: 0,
            borderRadius: token.borderRadius,
            border: `${token.lineWidth}px dashed ${token.colorBorder}`,
            paddingInline: token.paddingSM,
            paddingBlock: token.paddingLG,
            textAlign: "center",
            color: token.colorTextSecondary,
          }}
        >
          {t("suppliers.noAdvances")}
        </p>
      ) : (
        <div
          style={{
            borderRadius: token.borderRadius,
            border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
            overflow: "hidden",
          }}
        >
          <StaticTable
            columns={advanceColumns}
            rows={advances}
            rowKey={(row) => row.id}
            size="small"
          />
        </div>
      )}

      {/* Compensate into a purchase */}
      <div
        style={{
          borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
          paddingTop: token.padding,
        }}
      >
        <h4
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: token.marginXXS,
          }}
        >
          <MoneyCollectOutlined aria-hidden="true" style={{ color: token.colorTextSecondary }} />
          {t("suppliers.compensateTitle")}
        </h4>
        <p
          style={{
            margin: 0,
            marginTop: token.marginXXS,
            marginBottom: token.marginSM,
            color: token.colorTextSecondary,
          }}
        >
          <small>
            {t("suppliers.compensateHintA")} <strong>{t("suppliers.compensateHintStrong")}</strong>{" "}
            {t("suppliers.compensateHintB")}
          </small>
        </p>

        {purchases.length === 0 ? (
          infoNote(
            <>
              {t("suppliers.noTargets")}
              {unratedPurchaseCount > 0 && (
                <>
                  {" "}
                  <strong>
                    {t("suppliers.unratedPurchaseCount", { count: unratedPurchaseCount })}
                  </strong>{" "}
                  {t("suppliers.unratedPurchaseRest")}
                </>
              )}
            </>
          )
        ) : (
          <Flex vertical gap={token.margin}>
            <div style={{ maxWidth: TARGET_PICKER_MAX_WIDTH }}>
              <Select
                id="advance-target"
                label={t("suppliers.targetLabel")}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={t("suppliers.pickPurchase")}
                options={purchases.map((p) => ({
                  value: String(p.id),
                  label: t("suppliers.targetOption", {
                    label: p.label,
                    date: formatDateShort(new Date(p.date)),
                    remaining: formatCurrency(p.remainingBase, "IDR"),
                  }),
                }))}
              />
              {unratedPurchaseCount > 0 && (
                <p
                  style={{
                    margin: 0,
                    marginTop: token.marginXXS,
                    color: token.colorWarningText,
                  }}
                >
                  <small>{t("suppliers.unratedNotShown", { count: unratedPurchaseCount })}</small>
                </p>
              )}
            </div>

            {selected && (
              <div
                style={{
                  borderRadius: token.borderRadius,
                  border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                  padding: token.paddingSM,
                }}
              >
                <Flex
                  wrap
                  align="baseline"
                  justify="space-between"
                  gap={token.marginXS}
                  style={{ marginBottom: token.marginSM }}
                >
                  <span style={{ fontWeight: token.fontWeightStrong }}>{selected.label}</span>
                  <span style={{ color: token.colorTextSecondary }}>
                    <small>
                      {t("suppliers.selectedValue", {
                        amount: formatCurrency(selected.amount, selected.currency),
                      })}{" "}
                      <strong
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          color: token.colorText,
                        }}
                      >
                        {formatCurrency(selected.remainingBase, "IDR")}
                      </strong>
                    </small>
                  </span>
                </Flex>
                <AdvanceCompensationSection
                  targetKind="purchase"
                  targetId={selected.id}
                  targetCurrency={selected.currency}
                  outstandingBase={selected.remainingBase}
                  advances={options}
                  applied={appliedByPurchase[selected.id] ?? []}
                />
              </div>
            )}
          </Flex>
        )}
      </div>
    </Flex>
  );
}
