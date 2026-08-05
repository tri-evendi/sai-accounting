"use client";

/**
 * Wizard terpandu — kerangka yang dipakai bersama "Penjualan Baru" dan
 * "Pembelian Baru" (issue #5).
 *
 * Empat keputusan yang menentukan bentuk komponen ini:
 *
 *  1. **Tidak ada satu pun langkah yang menyimpan ke server.** Komponen ini
 *     hanya memindahkan langkah dan menampilkan penjaga; `onFinish` dipanggil
 *     sekali saja, di langkah terakhir. Itulah yang membuat "batal di langkah
 *     mana pun tidak menyisakan data setengah jadi" bukan sekadar niat baik.
 *
 *  2. **Maju harus lewat tombol "Lanjut".** Penanda langkah hanya bisa dipakai
 *     untuk MUNDUR (`canJumpToStep`); melompat maju lewat penanda akan melewati
 *     penjaga langkah yang sedang dibuka tanpa terlihat.
 *
 *  3. **"Lanjut" tidak pernah dimatikan diam-diam.** Tombol yang mati tanpa
 *     penjelasan adalah jalan buntu bagi staf non-akuntan. Tombolnya tetap
 *     hidup; menekannya saat masih ada yang kurang akan MENAMPILKAN daftar
 *     alasannya di `role="alert"` — persis pola yang dipakai formulir lain di
 *     app ini (`resolveSubmitFailure`).
 *
 *  4. **Status langkah tidak pernah warna saja.** Setiap langkah membawa teks
 *     "Selesai / Sedang diisi / Belum" dan ikon centang, sesuai MASTER.md.
 *
 * **Kenapa penanda langkah tetap `<button>` mentah.** Tombol aksi wizard
 * ("Kembali"/"Lanjut"/"Selesai") memakai primitif `Button`, tetapi kartu
 * penanda langkah TIDAK: ia adalah kembaran interaktif dari `<div>` di
 * sebelahnya (langkah yang belum boleh dilompati) dan harus tampil identik —
 * kartu dua baris, tinggi mengikuti isi, `rounded-lg`, `flex-1` selebar kolom.
 * `Button` memaksa tinggi tetap 40px, `justify-center`, dan `whitespace-nowrap`
 * yang justru merusak kesamaan itu. Dikecualikan sadar di
 * `tests/design-system-primitives.test.ts`.
 */

import { useState } from "react";
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { canJumpToStep, stepIndex, type WizardStepMeta } from "@/lib/wizard";
import { moneyPalette } from "@/lib/theme/antd-tokens";
import { useT } from "@/lib/i18n/client";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  ShieldCheck,
} from "lucide-react";

/** Bulatan nomor langkah — sebesar `h-7 w-7` sebelum migrasi. */
const STEP_BULLET = 28;

interface WizardProps {
  steps: readonly WizardStepMeta[];
  currentId: string;
  onNavigate: (id: string) => void;
  /** Alasan langkah ini belum boleh dilanjutkan. Kosong = boleh lanjut. */
  blockers: string[];
  /** Dipanggil SEKALI di langkah terakhir — satu-satunya penulisan ke server. */
  onFinish: () => void | Promise<void>;
  /** Membuang draf dan meninggalkan wizard. Tidak menyentuh database. */
  onCancel: () => void;
  busy?: boolean;
  /** Galat dari server setelah "Selesai" ditekan. */
  error?: string | null;
  /** Catatan di atas isi langkah (mis. draf lama dibuang). */
  notice?: string | null;
  finishLabel?: string;
  children: React.ReactNode;
}

export function Wizard({
  steps,
  currentId,
  onNavigate,
  blockers,
  onFinish,
  onCancel,
  busy = false,
  error = null,
  notice = null,
  finishLabel,
  children,
}: WizardProps) {
  const t = useT();
  const { token } = theme.useToken();
  const finishText = finishLabel ?? t("common.finishAndSave");
  // Daftar penjaga ditandai MILIK langkah tertentu, bukan sekadar on/off. Dengan
  // begitu berpindah langkah otomatis membersihkannya — tanpa efek yang memanggil
  // setState, yang akan memicu render berantai.
  const [blockersShownFor, setBlockersShownFor] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const index = Math.max(0, stepIndex(steps, currentId));
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const showBlockers = blockersShownFor === currentId;

  function goNext() {
    if (blockers.length > 0) {
      setBlockersShownFor(currentId);
      return;
    }
    const next = steps[index + 1];
    if (next) onNavigate(next.id);
  }

  function goBack() {
    const prev = steps[index - 1];
    if (prev) onNavigate(prev.id);
  }

  function finish() {
    if (blockers.length > 0) {
      setBlockersShownFor(currentId);
      return;
    }
    void onFinish();
  }

  /**
   * Rupa bulatan langkah. Warnanya penanda KEDUA — bentuk pertamanya adalah
   * ikon (centang / titik / angka) dan kata di sebelahnya ("Selesai / Sedang
   * diisi / Belum"), jadi keadaannya tetap terbaca tanpa warna sama sekali.
   * `colorSuccessBg`/`colorMoneyPositive` dipakai berpasangan seperti `Tag`
   * (#187), bukan `colorSuccess` yang di ukuran ini hanya 2,21:1.
   */
  const money = moneyPalette(token);
  const bulletLook = (state: "done" | "current" | "todo") => {
    if (state === "done") {
      return { background: token.colorSuccessBg, color: money.colorMoneyPositive };
    }
    if (state === "current") {
      return { background: token.colorPrimary, color: token.colorWhite };
    }
    return { background: token.colorFillSecondary, color: token.colorTextSecondary };
  };

  return (
    <div>
      {/* ── Penanda langkah ─────────────────────────────────────────────── */}
      <nav aria-label={t("wizard.stepsAria")} style={{ marginBottom: token.marginLG }}>
        <Typography.Text
          type="secondary"
          strong
          style={{ display: "block", marginBottom: token.marginXS }}
        >
          {t("wizard.stepOf", { step: index + 1, total: steps.length })}
        </Typography.Text>
        {/*
         * Menumpuk di 375px, berjajar sejak `sm`. `Flex wrap` + `flex: 1` per
         * butir menggantikan `flex-col sm:flex-row sm:flex-wrap`: kartu langkah
         * tumbuh membagi baris, dan turun sendiri saat tak muat — tanpa titik
         * patah yang harus dijaga tetap sama dengan titik patah lain.
         */}
        <Flex component="ol" wrap gap={token.marginXS} align="stretch" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {steps.map((s, i) => {
            const state = i < index ? "done" : i === index ? "current" : "todo";
            const reachable = canJumpToStep(steps, s.id, currentId) && i !== index;
            const label =
              state === "done"
                ? t("wizard.stateDone")
                : state === "current"
                  ? t("wizard.stateCurrent")
                  : t("wizard.stateTodo");
            const content = (
              <>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: STEP_BULLET,
                    height: STEP_BULLET,
                    flexShrink: 0,
                    borderRadius: "50%",
                    fontSize: token.fontSizeSM,
                    fontWeight: token.fontWeightStrong,
                    ...bulletLook(state),
                  }}
                >
                  {state === "done" ? (
                    <Check size={token.fontSize} aria-hidden="true" />
                  ) : state === "current" ? (
                    <CircleDot size={token.fontSize} aria-hidden="true" />
                  ) : (
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  )}
                </span>
                <span style={{ minWidth: 0, textAlign: "left" }}>
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: token.fontWeightStrong,
                    }}
                  >
                    {t(s.titleKey)}
                    {s.optional && (
                      <Typography.Text
                        type="secondary"
                        style={{ marginInlineStart: token.marginXXS, fontWeight: "normal" }}
                      >
                        {t("wizard.optionalSuffix")}
                      </Typography.Text>
                    )}
                  </span>
                  <Typography.Text
                    type="secondary"
                    style={{ display: "block", fontSize: token.fontSizeSM }}
                  >
                    {label}
                  </Typography.Text>
                </span>
              </>
            );

            /** Kartu langkah — sama persis untuk yang bisa & tidak bisa ditekan. */
            const cardStyle: React.CSSProperties = {
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: token.marginXS,
              paddingBlock: token.paddingXS,
              paddingInline: token.paddingSM,
              borderRadius: token.borderRadiusLG,
              borderStyle: "solid",
              borderWidth: token.lineWidth,
              textAlign: "left",
              transition: `background ${token.motionDurationMid}, border-color ${token.motionDurationMid}`,
            };

            return (
              <li key={s.id} style={{ flex: 1, listStyle: "none" }}>
                {reachable ? (
                  /* Tetap `<button>` mentah — alasannya di kepala berkas, dan
                     pengecualiannya terdaftar di
                     `tests/design-system-primitives.test.ts`. */
                  <button
                    type="button"
                    onClick={() => onNavigate(s.id)}
                    aria-current={undefined}
                    style={{
                      ...cardStyle,
                      cursor: "pointer",
                      borderColor: token.colorBorderSecondary,
                      background: token.colorBgContainer,
                      font: "inherit",
                      color: "inherit",
                    }}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    aria-current={state === "current" ? "step" : undefined}
                    style={{
                      ...cardStyle,
                      borderColor:
                        state === "current" ? token.colorPrimary : token.colorBorderSecondary,
                      background:
                        state === "current" ? token.colorPrimaryBg : token.colorBgContainer,
                    }}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </Flex>
      </nav>

      {/* ── Judul & penjelasan langkah ──────────────────────────────────── */}
      <div style={{ marginBottom: token.margin }}>
        <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, margin: 0 }}>
          {t(step.titleKey)}
        </Typography.Title>
        <Typography.Text
          type="secondary"
          style={{ display: "block", marginTop: token.marginXXS }}
        >
          {t(step.descriptionKey)}
        </Typography.Text>
      </div>

      {/*
       * Catatan & galat lewat `Alert` AntD: teksnya `colorText` di atas latar
       * tipis (bukan amber/merah di atas amber/merah muda), dan ikon bawaannya
       * membuat maknanya tidak bergantung warna. `role` tetap dipasang di
       * pembungkus — AntD tidak memasangnya, dan tanpa itu pesannya tidak
       * pernah diumumkan pembaca layar.
       */}
      {notice && (
        <div role="status" style={{ marginBottom: token.margin }}>
          <Alert type="warning" showIcon message={notice} />
        </div>
      )}

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <div>{children}</div>

      {/* ── Penjaga langkah, muncul setelah "Lanjut" ditekan ────────────── */}
      {showBlockers && blockers.length > 0 && (
        <div role="alert" style={{ marginTop: token.marginLG }}>
          <Alert
            type="error"
            showIcon
            icon={<AlertCircle size={token.fontSizeLG} aria-hidden="true" />}
            message={t("wizard.blockersTitle")}
            description={
              <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            }
          />
        </div>
      )}

      {/* ── Navigasi ────────────────────────────────────────────────────── */}
      <Flex
        wrap
        align="center"
        gap={token.marginSM}
        style={{
          marginTop: token.marginLG,
          paddingTop: token.margin,
          borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Button type="button" variant="secondary" onClick={goBack} disabled={index === 0 || busy}>
          <ArrowLeft aria-hidden="true" /> {t("common.back")}
        </Button>

        {isLast ? (
          <Button type="button" onClick={finish} disabled={busy}>
            {busy ? (
              <>
                {/* Pemutar AntD, bukan `Loader2` + `animate-spin`: animasinya
                    milik `Spin` (`antRotate`), jadi tidak ada kelas Tailwind
                    yang harus hidup sampai #203. `color: inherit` supaya
                    titik-titiknya memakai warna label tombol — bawaan `Spin`
                    adalah `colorPrimary`, yaitu biru di atas biru. */}
                <Spin size="small" style={{ color: "inherit" }} /> {t("common.saving")}
              </>
            ) : (
              <>
                <ShieldCheck aria-hidden="true" /> {finishText}
              </>
            )}
          </Button>
        ) : (
          <Button type="button" onClick={goNext} disabled={busy}>
            {t("wizard.next")} <ArrowRight aria-hidden="true" />
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          style={{ marginInlineStart: "auto" }}
          onClick={() => setConfirmCancel(true)}
          disabled={busy}
        >
          {t("common.cancel")}
        </Button>
      </Flex>

      <Typography.Text
        type="secondary"
        style={{ display: "block", marginTop: token.marginSM, fontSize: token.fontSizeSM }}
      >
        {t("wizard.nothingSavedBefore")} <strong>{finishText}</strong>{" "}
        {t("wizard.nothingSavedAfter")}
      </Typography.Text>

      <ConfirmDialog
        title={t("wizard.cancelTitle")}
        message={t("wizard.cancelMessage")}
        confirmLabel={t("wizard.cancelConfirm")}
        confirmVariant="danger"
        cancelLabel={t("wizard.cancelKeep")}
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        onConfirm={onCancel}
      />
    </div>
  );
}

/** Satu baris ringkasan: label kiri, nilai kanan dengan `tabular-nums`. */
export function WizardSummaryRow({
  label,
  value,
  hint,
  strong = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  strong?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <Flex
      align="flex-start"
      justify="space-between"
      gap={token.margin}
      style={{ paddingBlock: token.paddingXXS }}
    >
      <dt>
        <Typography.Text type="secondary">{label}</Typography.Text>
        {hint && (
          <Typography.Text
            type="secondary"
            style={{ display: "block", marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
          >
            {hint}
          </Typography.Text>
        )}
      </dt>
      {/* `<dd>` bawaan browser bermargin kiri 40px; dinolkan supaya nominalnya
          benar-benar rata tepi kanan. `tabular-nums` supaya digit sejajar
          antar-baris ringkasan (MASTER.md §3). */}
      <dd
        style={{
          margin: 0,
          flexShrink: 0,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          fontWeight: strong ? token.fontWeightStrong : undefined,
        }}
      >
        {value}
      </dd>
    </Flex>
  );
}
