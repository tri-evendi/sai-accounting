"use client";

/**
 * Kemajuan penyediaan perusahaan — daftar tahap + bilah (issue #104).
 *
 * ══ SELURUH TAHAP DITAMPILKAN SEJAK AWAL ═══════════════════════════════════
 * Versi pertama hanya mencetak tahap yang SUDAH terjadi. Bedanya besar bagi
 * yang menunggu: daftar yang tumbuh satu per satu tidak pernah memberi tahu
 * ada berapa tahap seluruhnya, jadi setiap jeda terasa seperti mungkin yang
 * terakhir — atau mungkin macet. Dengan keempat tahap tercetak sejak detik
 * pertama, menunggu berubah dari "entah sampai kapan" menjadi "tinggal dua
 * lagi", dan tahap yang gagal terlihat sebagai satu baris merah di antara
 * baris-baris yang sudah selesai.
 *
 * ══ BILAH HANYA UNTUK YANG KEMAJUANNYA SUNGGUHAN DIKETAHUI ═════════════════
 * Menerapkan skema adalah satu-satunya tahap panjang (40-an berkas), dan
 * servernya melaporkan sudah sampai berkas ke berapa. Justru di sanalah bilah
 * determinate layak dipakai. Tahap lain tidak diberi bilah — bilah yang
 * bergerak berdasarkan jadwal karangan adalah kebohongan kecil yang persis
 * merusak kepercayaan pada indikator berikutnya.
 *
 * ══ SATU PENGUMUMAN, BUKAN EMPAT PULUH ═════════════════════════════════════
 * Daftar tahapnya `aria-live="off"` DENGAN SENGAJA. Tahap migration
 * memperbarui barisnya puluhan kali; menandai daftarnya sebagai live region
 * akan membuat pembaca layar membacakan "menerapkan skema 12 dari 43" tanpa
 * henti dan menutupi segalanya. Yang diumumkan hanya PERPINDAHAN TAHAP, lewat
 * satu baris status terpisah.
 *
 * ── Setelah AntD (issue #200) ────────────────────────────────────────────
 * Warna ikon tahap datang dari token uang (#186), bukan `colorSuccess`/
 * `colorError` bawaan: keduanya dipakai berdampingan dengan TEKS tahapnya, dan
 * status tahap tidak pernah disampaikan warna saja — ikonnya berbeda bentuk
 * (centang / segitiga / lingkaran / pemutar) dan barisnya berbunyi lewat
 * `ProvisionAnnouncer`.
 */

import { Flex, Typography, theme } from "antd";
import type { GlobalToken } from "antd";
import { CheckCircle2, CircleDashed, Loader2, TriangleAlert } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useT } from "@/lib/i18n/client";
import { moneyPalette } from "@/lib/theme/antd-tokens";
import type { ProvisionPhase } from "@/lib/company-provisioning-shared";

const { Text } = Typography;

/** Tahap yang dilalui, berurutan. `done` bukan tahap — ia keadaan akhir. */
export const PROVISION_STEPS = [
  "validate",
  "create_database",
  "migrate",
  "register",
] as const satisfies readonly ProvisionPhase[];

export type StepStatus = "pending" | "active" | "done" | "error";

export interface ProvisionState {
  /** Tahap yang sedang berjalan; `null` sebelum mulai. */
  current: ProvisionPhase | null;
  /** Tahap yang sudah selesai. */
  completed: ReadonlySet<ProvisionPhase>;
  /** Kemajuan 0–1 tahap `migrate`, bila dilaporkan. */
  migrateProgress?: number;
  /** Nama migration yang sedang diterapkan — konteks, bukan tuntutan baca. */
  detail?: string;
  failed?: boolean;
}

/**
 * Pengganti `animate-spin` + `motion-reduce:animate-none`: aturan CSS
 * ber-`href` + `precedence` (React 19 meniadakan gandanya) yang menyasar
 * atribut `data-spin`, bukan kelas. Gaya sebaris tidak bisa membawa media
 * query, dan `prefers-reduced-motion` adalah media query.
 */
export const SPIN_RULE = `
[data-spin]{animation:sai-spin 1s linear infinite}
@keyframes sai-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){[data-spin]{animation:none}}
`;

function statusOf(phase: ProvisionPhase, state: ProvisionState): StepStatus {
  if (state.completed.has(phase)) return "done";
  if (state.current === phase) return state.failed ? "error" : "active";
  return "pending";
}

export function ProvisionProgress({ state }: { state: ProvisionState }) {
  const t = useT();
  const { token } = theme.useToken();

  const labels: Record<(typeof PROVISION_STEPS)[number], string> = {
    validate: t("companies.stepValidate"),
    create_database: t("companies.stepDatabase"),
    migrate: t("companies.stepMigrate"),
    register: t("companies.stepRegister"),
  };

  const doneCount = PROVISION_STEPS.filter((p) => state.completed.has(p)).length;
  const money = moneyPalette(token);

  return (
    <Flex
      vertical
      gap={token.marginSM}
      style={{
        padding: token.padding,
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillQuaternary,
      }}
    >
      <style href="sai-spin" precedence="default">
        {SPIN_RULE}
      </style>

      <Flex align="baseline" justify="space-between" gap={token.marginSM}>
        <Text strong>{t("companies.progressTitle")}</Text>
        {/* Angka rata & tabular (MASTER.md) — hitungan yang melompat lebarnya
            membuat seluruh baris ikut bergeser tiap kali bertambah. */}
        <Text type="secondary" style={{ fontVariantNumeric: "tabular-nums" }}>
          {doneCount}/{PROVISION_STEPS.length}
        </Text>
      </Flex>

      <Flex
        component="ol"
        vertical
        gap={10}
        aria-live="off"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {PROVISION_STEPS.map((phase) => {
          const status = statusOf(phase, state);
          const showBar =
            phase === "migrate" && status === "active" && state.migrateProgress != null;

          return (
            <li
              key={phase}
              style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
            >
              <StepIcon status={status} token={token} />
              <Flex vertical gap={6} style={{ minWidth: 0, flex: 1 }}>
                <Text
                  type={status === "pending" ? "secondary" : undefined}
                  style={
                    status === "error" ? { color: money.colorMoneyNegative } : undefined
                  }
                >
                  {labels[phase]}
                  {phase === "migrate" &&
                    state.migrateProgress != null &&
                    status !== "pending" && (
                      <Text
                        type="secondary"
                        style={{
                          marginInlineStart: token.marginXXS,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {Math.round(state.migrateProgress * 100)}%
                      </Text>
                    )}
                </Text>

                {showBar && (
                  <>
                    <Progress value={state.migrateProgress!} label={labels.migrate} />
                    {state.detail && (
                      // Nama migration bisa panjang, dan di 375px ia harus
                      // memendek — bukan menggeser tata letak.
                      <Text
                        type="secondary"
                        ellipsis
                        style={{
                          display: "block",
                          fontFamily: "monospace",
                          fontSize: token.fontSizeSM,
                        }}
                      >
                        {state.detail}
                      </Text>
                    )}
                  </>
                )}
              </Flex>
            </li>
          );
        })}
      </Flex>
    </Flex>
  );
}

/**
 * Teks khusus pembaca layar — pengganti utilitas `sr-only` yang hilang bersama
 * kelas Tailwind. Bukan `display:none`: itu justru mengeluarkannya dari pohon
 * aksesibilitas, kebalikan dari yang dibutuhkan.
 */
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * Satu-satunya bagian yang DIUMUMKAN. Terpisah dari daftar supaya perpindahan
 * tahap terdengar sekali, bukan puluhan kali mengikuti berkas migration.
 */
export function ProvisionAnnouncer({ message }: { message: string | null }) {
  return (
    <p role="status" aria-live="polite" style={SR_ONLY}>
      {message ?? ""}
    </p>
  );
}

function StepIcon({ status, token }: { status: StepStatus; token: GlobalToken }) {
  const money = moneyPalette(token);
  const base: React.CSSProperties = { marginTop: 2, flexShrink: 0 };

  if (status === "done")
    return (
      <CheckCircle2
        size={16}
        style={{ ...base, color: money.colorMoneyPositive }}
        aria-hidden="true"
      />
    );
  if (status === "error")
    return (
      <TriangleAlert
        size={16}
        style={{ ...base, color: money.colorMoneyNegative }}
        aria-hidden="true"
      />
    );
  if (status === "active")
    return (
      <Loader2
        data-spin
        size={16}
        style={{ ...base, color: token.colorPrimary }}
        aria-hidden="true"
      />
    );
  return (
    <CircleDashed
      size={16}
      style={{ ...base, color: token.colorTextSecondary }}
      aria-hidden="true"
    />
  );
}
