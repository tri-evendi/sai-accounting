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
 *     "Selesai / Sedang diisi / Belum", sesuai MASTER.md.
 *
 * **Penanda langkahnya sudah TIDAK tinggal di sini.** Sampai penyatuan penanda
 * langkah, berkas ini menggambar sendiri deretan kartu dua baris — termasuk
 * `<button>` mentah yang dikecualikan sadar di
 * `tests/design-system-primitives.test.ts`, sebab ia harus tampil identik
 * dengan `<div>` di sebelahnya (langkah yang belum boleh dilompati) dan
 * `Button` memaksa tinggi 40px + `whitespace-nowrap` yang merusak kesamaan itu.
 *
 * Seluruh blok itu kini `components/ui/wizard-steps.tsx` di atas `Steps` AntD,
 * dipakai bersama wisaya penyiapan `/t/…/setup` yang dulu punya kosakata
 * penanda SENDIRI (pil datar bernomor, dan bedanya "sedang dibuka" dari "belum"
 * cuma rona). Alasan lengkapnya di kepala berkas itu. Yang ikut hilang bersama
 * kartunya adalah pengecualian `<button>` mentah tadi — `Steps` menggambar
 * elemen interaktifnya sendiri.
 */

import { useState } from "react";
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WizardSteps } from "@/components/ui/wizard-steps";
import { canJumpToStep, stepIndex, type WizardStepMeta } from "@/lib/wizard";
import { useT } from "@/lib/i18n/client";
import { ArrowLeftOutlined, ArrowRightOutlined, ExclamationCircleOutlined, SafetyCertificateOutlined } from "@ant-design/icons";

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

  return (
    <div>
      {/* ── Penanda langkah ─────────────────────────────────────────────── */}
      {/* ── Penanda langkah — komponen bersama, lihat `ui/wizard-steps.tsx` ── */}
      <div style={{ marginBottom: token.marginLG }}>
        <WizardSteps
          steps={steps.map((s) => ({
            key: s.id,
            title: t(s.titleKey),
            optional: s.optional,
          }))}
          current={index}
          canJump={(i) => {
            const target = steps[i];
            return target ? canJumpToStep(steps, target.id, currentId) : false;
          }}
          onJump={(i) => {
            const target = steps[i];
            if (target) onNavigate(target.id);
          }}
        />
      </div>

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
            icon={<ExclamationCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSizeLG }} />}
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
          <ArrowLeftOutlined aria-hidden="true" /> {t("common.back")}
        </Button>

        {/* Satu-satunya aksi utama layar wisaya, dan dua cabang yang saling
            meniadakan: "Lanjut" di langkah tengah, "Selesai" di langkah
            terakhir (#267). "Kembali" `secondary` dan "Batal" `ghost` — dua
            jalan keluar, bukan dua ajakan. Layar SUKSES yang menggantikan
            wisaya ini (`purchase-wizard`/`sales-wizard`) memasang primernya
            sendiri; ia tidak pernah terender bersamaan dengan kaki ini. */}
        {isLast ? (
          <Button type="button" variant="primary" onClick={finish} disabled={busy}>
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
                <SafetyCertificateOutlined aria-hidden="true" /> {finishText}
              </>
            )}
          </Button>
        ) : (
          <Button type="button" variant="primary" onClick={goNext} disabled={busy}>
            {t("wizard.next")} <ArrowRightOutlined aria-hidden="true" />
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
