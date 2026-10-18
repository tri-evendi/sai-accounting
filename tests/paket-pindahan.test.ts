/**
 * MODUL YANG PINDAH KE PAKET WORKSPACE (monorepo Fase 2) HANYA DIIMPOR LEWAT
 * PAKETNYA.
 *
 *   2a (18 Okt 2026) — fondasi ke `@sai/core`: authz, constants, control-db,
 *       money-format, utils.
 *   2b — i18n inti ke `@sai/core/i18n/*`. `server.ts`, `actions.ts`,
 *       `labels.ts` TETAP di `src/lib/i18n` (bergantung pada modul aplikasi).
 *   2c — primitif desain ke `@sai/ui`: `components/ui/*` (kecuali enam yang
 *       bergantung pada server action / konteks perusahaan / domain), tema,
 *       skala jarak, lambang; `labels` & `tenant-routes` ke `@sai/core`.
 *   2d — aturan penagihan MURNI ke `@sai/billing` (penulisnya — webhook,
 *       katalog, ganti paket — tetap di aplikasi karena menyentuh basis data).
 *   3a–3c — penutupan dependensi konsol operator: modul MURNI ke `@sai/core` /
 *       `@sai/billing`, modul SISI-SERVER (basis data, surel, jejak) ke
 *       `@sai/platform`.
 *
 * Salinan yang tertinggal di jalur lama — atau yang dibuat ulang karena
 * seseorang mengira modulnya hilang — lolos `tsc` dan diam-diam menjadi sumber
 * kebenaran KEDUA: matriks izin atau token warna yang berbeda di dua tempat.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AKAR = process.cwd();

/** [jalur lama, jalur baru] relatif akar repo. */
const PINDAH: ReadonlyArray<readonly [string, string]> = [
  ["src/components/providers/antd-provider.tsx", "packages/ui/src/providers/antd-provider.tsx"],
  ["src/components/providers/root-document.tsx", "packages/ui/src/providers/root-document.tsx"],
  ["src/components/ui/alert-dialog.tsx", "packages/ui/src/components/alert-dialog.tsx"],
  ["src/components/ui/app-link.tsx", "packages/ui/src/components/app-link.tsx"],
  ["src/components/ui/badge.tsx", "packages/ui/src/components/badge.tsx"],
  ["src/components/ui/brand-lockup.tsx", "packages/ui/src/components/brand-lockup.tsx"],
  ["src/components/ui/brand-mark.tsx", "packages/ui/src/components/brand-mark.tsx"],
  ["src/components/ui/button.tsx", "packages/ui/src/components/button.tsx"],
  ["src/components/ui/card.tsx", "packages/ui/src/components/card.tsx"],
  ["src/components/ui/checkbox.tsx", "packages/ui/src/components/checkbox.tsx"],
  ["src/components/ui/command.tsx", "packages/ui/src/components/command.tsx"],
  ["src/components/ui/confirm-dialog.tsx", "packages/ui/src/components/confirm-dialog.tsx"],
  ["src/components/ui/data-table.tsx", "packages/ui/src/components/data-table.tsx"],
  ["src/components/ui/dialog.tsx", "packages/ui/src/components/dialog.tsx"],
  ["src/components/ui/empty-state.tsx", "packages/ui/src/components/empty-state.tsx"],
  ["src/components/ui/form.tsx", "packages/ui/src/components/form.tsx"],
  ["src/components/ui/input.tsx", "packages/ui/src/components/input.tsx"],
  ["src/components/ui/item-name-input.tsx", "packages/ui/src/components/item-name-input.tsx"],
  ["src/components/ui/label.tsx", "packages/ui/src/components/label.tsx"],
  ["src/components/ui/learn-more.tsx", "packages/ui/src/components/learn-more.tsx"],
  ["src/components/ui/loading.tsx", "packages/ui/src/components/loading.tsx"],
  ["src/components/ui/money-column.tsx", "packages/ui/src/components/money-column.tsx"],
  ["src/components/ui/money-input-format.ts", "packages/ui/src/components/money-input-format.ts"],
  ["src/components/ui/money-input.tsx", "packages/ui/src/components/money-input.tsx"],
  ["src/components/ui/money.tsx", "packages/ui/src/components/money.tsx"],
  ["src/components/ui/page-header.tsx", "packages/ui/src/components/page-header.tsx"],
  ["src/components/ui/pagination.tsx", "packages/ui/src/components/pagination.tsx"],
  ["src/components/ui/password-input.tsx", "packages/ui/src/components/password-input.tsx"],
  ["src/components/ui/popover.tsx", "packages/ui/src/components/popover.tsx"],
  ["src/components/ui/progress.tsx", "packages/ui/src/components/progress.tsx"],
  ["src/components/ui/quota-meter.tsx", "packages/ui/src/components/quota-meter.tsx"],
  ["src/components/ui/searchable-select.tsx", "packages/ui/src/components/searchable-select.tsx"],
  ["src/components/ui/select.tsx", "packages/ui/src/components/select.tsx"],
  ["src/components/ui/stat-card.tsx", "packages/ui/src/components/stat-card.tsx"],
  ["src/components/ui/stat-tile.ts", "packages/ui/src/components/stat-tile.ts"],
  ["src/components/ui/static-table.tsx", "packages/ui/src/components/static-table.tsx"],
  ["src/components/ui/table-columns.tsx", "packages/ui/src/components/table-columns.tsx"],
  ["src/components/ui/table.tsx", "packages/ui/src/components/table.tsx"],
  ["src/components/ui/term-tooltip.tsx", "packages/ui/src/components/term-tooltip.tsx"],
  ["src/components/ui/textarea.tsx", "packages/ui/src/components/textarea.tsx"],
  ["src/components/ui/toast.tsx", "packages/ui/src/components/toast.tsx"],
  ["src/components/ui/wizard-steps.tsx", "packages/ui/src/components/wizard-steps.tsx"],
  ["src/lib/account-mail.ts", "packages/core/src/account-mail.ts"],
  ["src/lib/authz.ts", "packages/core/src/authz.ts"],
  ["src/lib/billing/change-tenant-plan.ts", "packages/platform/src/billing/change-tenant-plan.ts"],
  ["src/lib/billing/platform-efaktur.ts", "packages/platform/src/billing/platform-efaktur.ts"],
  ["src/lib/brand/mark.ts", "packages/ui/src/brand/mark.ts"],
  ["src/lib/client-ip.ts", "packages/core/src/client-ip.ts"],
  ["src/lib/constants.ts", "packages/core/src/constants.ts"],
  ["src/lib/contact-channels.ts", "packages/core/src/contact-channels.ts"],
  ["src/lib/control-db.ts", "packages/core/src/control-db.ts"],
  ["src/lib/efaktur.ts", "packages/core/src/efaktur.ts"],
  ["src/lib/i18n/client.tsx", "packages/core/src/i18n/client.tsx"],
  ["src/lib/i18n/config.ts", "packages/core/src/i18n/config.ts"],
  ["src/lib/i18n/dictionaries/en.json", "packages/core/src/i18n/dictionaries/en.json"],
  ["src/lib/i18n/dictionaries/id.json", "packages/core/src/i18n/dictionaries/id.json"],
  ["src/lib/i18n/dictionaries/zh.json", "packages/core/src/i18n/dictionaries/zh.json"],
  ["src/lib/i18n/dictionary.ts", "packages/core/src/i18n/dictionary.ts"],
  ["src/lib/i18n/load.ts", "packages/core/src/i18n/load.ts"],
  ["src/lib/i18n/locale-cookie.ts", "packages/core/src/i18n/locale-cookie.ts"],
  ["src/lib/i18n/server.ts", "packages/platform/src/i18n/server.ts"],
  ["src/lib/i18n/validation.ts", "packages/core/src/i18n/validation.ts"],
  ["src/lib/icons.ts", "packages/ui/src/icons.ts"],
  ["src/lib/invitation-store.ts", "packages/platform/src/invitation-store.ts"],
  ["src/lib/invitations.ts", "packages/core/src/invitations.ts"],
  ["src/lib/labels.ts", "packages/core/src/labels.ts"],
  ["src/lib/layout-scale.ts", "packages/ui/src/layout-scale.ts"],
  ["src/lib/mail-health.ts", "packages/platform/src/mail-health.ts"],
  ["src/lib/mail-settings.ts", "packages/platform/src/mail-settings.ts"],
  ["src/lib/mailer-core.ts", "packages/platform/src/mailer-core.ts"],
  ["src/lib/mailer.ts", "packages/platform/src/mailer.ts"],
  ["src/lib/membership-upsert.ts", "packages/platform/src/membership-upsert.ts"],
  ["src/lib/migration-manifest.ts", "packages/core/src/migration-manifest.ts"],
  ["src/lib/money-format.ts", "packages/core/src/money-format.ts"],
  ["src/lib/operator/plane.ts", "packages/core/src/operator-plane.ts"],
  ["src/lib/password-reset-store.ts", "packages/platform/src/password-reset-store.ts"],
  ["src/lib/password-reset.ts", "packages/core/src/password-reset.ts"],
  ["src/lib/payment-gateway.ts", "packages/billing/src/payment-gateway.ts"],
  ["src/lib/payment-webhook.ts", "packages/platform/src/payment-webhook.ts"],
  ["src/lib/plan-change.ts", "packages/billing/src/plan-change.ts"],
  ["src/lib/plan-copy.ts", "packages/billing/src/plan-copy.ts"],
  ["src/lib/plan-stacking.ts", "packages/billing/src/plan-stacking.ts"],
  ["src/lib/platform-constants.ts", "packages/billing/src/platform-constants.ts"],
  ["src/lib/platform-db.ts", "packages/platform/src/platform-db.ts"],
  ["src/lib/platform-reconciliation.ts", "packages/platform/src/platform-reconciliation.ts"],
  ["src/lib/platform-revenue.ts", "packages/billing/src/platform-revenue.ts"],
  ["src/lib/public-status.ts", "packages/core/src/public-status.ts"],
  ["src/lib/rate-limit.ts", "packages/core/src/rate-limit.ts"],
  ["src/lib/registration.ts", "packages/core/src/registration.ts"],
  ["src/lib/scheduler-heartbeat.ts", "packages/core/src/scheduler-heartbeat.ts"],
  ["src/lib/schema-version.ts", "packages/core/src/schema-version.ts"],
  ["src/lib/settings-crypto.ts", "packages/core/src/settings-crypto.ts"],
  ["src/lib/site-content-store.ts", "packages/platform/src/site-content-store.ts"],
  ["src/lib/site-content.ts", "packages/core/src/site-content.ts"],
  ["src/lib/site-settings-core.ts", "packages/core/src/site-settings-core.ts"],
  ["src/lib/site-settings.ts", "packages/platform/src/site-settings.ts"],
  ["src/lib/status-notices-store.ts", "packages/platform/src/status-notices-store.ts"],
  ["src/lib/status-notices.ts", "packages/core/src/status-notices.ts"],
  ["src/lib/subscription-events.ts", "packages/platform/src/subscription-events.ts"],
  ["src/lib/subscription-lifecycle.ts", "packages/billing/src/subscription-lifecycle.ts"],
  ["src/lib/table-sort.ts", "packages/ui/src/table-sort.ts"],
  ["src/lib/tax.ts", "packages/core/src/tax.ts"],
  ["src/lib/tenant-audit.ts", "packages/platform/src/tenant-audit.ts"],
  ["src/lib/tenant-cache.ts", "packages/core/src/tenant-cache.ts"],
  ["src/lib/tenant-deletion.ts", "packages/core/src/tenant-deletion.ts"],
  ["src/lib/tenant-routes.ts", "packages/core/src/tenant-routes.ts"],
  ["src/lib/tenant-slug.ts", "packages/platform/src/tenant-slug.ts"],
  ["src/lib/tenant-state.ts", "packages/platform/src/tenant-state.ts"],
  ["src/lib/theme/actions.ts", "packages/ui/src/theme/actions.ts"],
  ["src/lib/theme/antd-tokens.ts", "packages/ui/src/theme/antd-tokens.ts"],
  ["src/lib/theme/client.tsx", "packages/ui/src/theme/client.tsx"],
  ["src/lib/theme/config.ts", "packages/ui/src/theme/config.ts"],
  ["src/lib/theme/server.ts", "packages/ui/src/theme/server.ts"],
  ["src/lib/theme/tone-recipe.ts", "packages/ui/src/theme/tone-recipe.ts"],
  ["src/lib/utils.ts", "packages/core/src/utils.ts"],
  ["src/lib/viewport.ts", "packages/ui/src/viewport.ts"],
];

const tanpaEkstensi = (p: string) => p.replace(/\.(tsx?|js)$/, "");
const LAMA = new Set(PINDAH.map(([lama]) => tanpaEkstensi(lama)));

function berkasTs(dir: string): string[] {
  const keluar: string[] = [];
  for (const e of readdirSync(join(AKAR, dir), { withFileTypes: true })) {
    const anak = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "generated") continue;
      keluar.push(...berkasTs(anak));
    } else if (/\.(ts|tsx|mts)$/.test(e.name)) {
      keluar.push(anak);
    }
  }
  return keluar;
}

const IMPOR = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.(?:do)?[mM]ock\(\s*)["']([^"']+)["']/g;

describe("modul pindahan monorepo Fase 2", () => {
  const berkas = ["src", "scripts", "tests", "prisma", "packages"].flatMap(berkasTs);

  it.each(PINDAH)("%s → %s", (lama, baru) => {
    expect(existsSync(join(AKAR, baru)), baru).toBe(true);
    expect(existsSync(join(AKAR, lama)), lama).toBe(false);
    for (const ext of [".ts", ".tsx"]) expect(existsSync(join(AKAR, tanpaEkstensi(lama) + ext))).toBe(false);
  });

  it("ada pengimpor paket untuk diperiksa — penjaga atas tes ini sendiri", () => {
    const pemakai = berkas.filter((f) => /["']@sai\/(core|ui|billing|platform)\//.test(readFileSync(join(AKAR, f), "utf8")));
    expect(pemakai.length).toBeGreaterThan(400);
  });

  it("nol impor ke jalur lama (`@/…` atau relatif)", () => {
    const pelanggar: string[] = [];
    for (const f of berkas) {
      for (const m of readFileSync(join(AKAR, f), "utf8").matchAll(IMPOR)) {
        const spec = m[1];
        let tuju: string | null = null;
        if (spec.startsWith("@/")) tuju = `src/${spec.slice(2)}`;
        else if (spec.startsWith(".")) tuju = join(f, "..", spec);
        if (tuju && LAMA.has(tanpaEkstensi(tuju))) pelanggar.push(`${f} → ${spec}`);
      }
    }
    expect(pelanggar).toEqual([]);
  });
});
