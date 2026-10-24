/**
 * RETENSI UJI COBA BEKU (alur demo-first, migration platform 0012).
 *
 * Penghapusan tidak bisa dibalik, jadi yang dijaga di sini adalah tiga hal:
 *   1. sakelarnya GAGAL-TERTUTUP — bawaannya mati, dan kehilangan informasi
 *      (baris tak ada, env salah ketik) tidak pernah menyalakannya;
 *   2. tidak ada penghapusan tanpa pemberitahuan H-14 DAN H-3 yang terbukti
 *      terkirim — termasuk untuk tenant yang sudah lama beku saat sakelarnya
 *      dinyalakan, dan saat penjadwal sempat mati;
 *   3. penjadwal benar-benar menggerbangi langkahnya dengan sakelar itu.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RETENTION_NOTICE_KIND,
  planTrialRetention,
  retentionSuffix,
} from "@sai/billing/trial-retention";
import {
  TRIAL_RETENTION_DAYS_DEFAULT,
  trialAutoDeletionFrom,
  trialRetentionDaysFrom,
} from "@sai/core/site-settings-core";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-24T03:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);

describe("sakelar hapus otomatis — GAGAL-TERTUTUP", () => {
  it("bawaan MATI: tanpa baris, kolom null, env kosong/salah ketik", () => {
    expect(trialAutoDeletionFrom(null, {})).toBe(false);
    expect(trialAutoDeletionFrom({ trialAutoDeletion: null }, {})).toBe(false);
    for (const v of ["", "true", "1", "ON", "yes", "open"]) {
      expect(trialAutoDeletionFrom(null, { TRIAL_AUTO_DELETION: v }), v).toBe(false);
    }
  });

  it("menyala hanya bila konsol berkata ya, atau env persis `on`; konsol MENANG atas env", () => {
    expect(trialAutoDeletionFrom({ trialAutoDeletion: true }, {})).toBe(true);
    expect(trialAutoDeletionFrom(null, { TRIAL_AUTO_DELETION: "on" })).toBe(true);
    expect(trialAutoDeletionFrom({ trialAutoDeletion: false }, { TRIAL_AUTO_DELETION: "on" })).toBe(false);
  });

  it("masa retensi: konsol → env → 90; angka tak masuk akal tidak mempercepat penghapusan", () => {
    expect(trialRetentionDaysFrom(null, {})).toBe(TRIAL_RETENTION_DAYS_DEFAULT);
    expect(TRIAL_RETENTION_DAYS_DEFAULT).toBe(90);
    expect(trialRetentionDaysFrom({ trialRetentionDays: 120 }, { TRIAL_RETENTION_DAYS: "60" })).toBe(120);
    expect(trialRetentionDaysFrom(null, { TRIAL_RETENTION_DAYS: "60" })).toBe(60);
    for (const bad of [0, 7, 29, 4000, 1.5]) {
      expect(trialRetentionDaysFrom({ trialRetentionDays: bad }, {}), String(bad)).toBe(90);
    }
    expect(trialRetentionDaysFrom(null, { TRIAL_RETENTION_DAYS: "3" })).toBe(90);
  });
});

describe("planTrialRetention — tidak ada penghapusan tanpa H-14 DAN H-3", () => {
  const cand = (endedDaysAgo: number) => [{ subscriptionId: 1, tenantId: 9, trialEndedAt: ago(endedDaysAgo) }];
  const key = (prefix: string, endedDaysAgo: number) => `${prefix}${retentionSuffix(ago(endedDaysAgo))}`;

  it("belum waktunya: tidak ada pemberitahuan, tidak ada penghapusan", () => {
    const plan = planTrialRetention(cand(30), new Map(), now, 90);
    expect(plan.notices).toEqual([]);
    expect(plan.deletions).toEqual([]);
    expect(plan.overview[0].deleteAt).toBeNull();
  });

  it("H-14 dikirim begitu jendela terbuka; tanggal hapus = beku + 90 hari", () => {
    const plan = planTrialRetention(cand(76), new Map(), now, 90);
    expect(plan.notices).toHaveLength(1);
    expect(plan.notices[0].sendKey).toBe(key("D-14", 76));
    expect(plan.notices[0].deleteAt?.getTime()).toBe(ago(76).getTime() + 90 * DAY);
    expect(plan.deletions).toEqual([]);
  });

  it("tenant yang SUDAH lama beku saat sakelar dinyalakan: H-14 dulu, hapus ≥ 14 hari kemudian", () => {
    const plan = planTrialRetention(cand(400), new Map(), now, 90);
    expect(plan.deletions).toEqual([]);
    expect(plan.notices[0].sendKey).toBe(key("D-14", 400));
    expect(plan.notices[0].deleteAt?.getTime()).toBe(now.getTime() + 14 * DAY);
  });

  it("H-3 dikirim tiga hari sebelum tanggal hapus; hapus baru sesudah tanggal itu", () => {
    const logs = new Map([[1, [{ dueKey: key("D-14", 400), sentAt: ago(12) }]]]);
    const plan = planTrialRetention(cand(400), logs, now, 90);
    expect(plan.notices.map((n) => n.sendKey)).toEqual([key("D-3", 400)]);
    expect(plan.deletions).toEqual([]);
  });

  it("hapus hanya bila H-14 dan H-3 sudah terkirim dan tanggalnya lewat", () => {
    const logs = new Map([
      [1, [
        { dueKey: key("D-14", 400), sentAt: ago(15) },
        { dueKey: key("D-3", 400), sentAt: ago(4) },
      ]],
    ]);
    const plan = planTrialRetention(cand(400), logs, now, 90);
    expect(plan.notices).toEqual([]);
    expect(plan.deletions.map((d) => d.subscriptionId)).toEqual([1]);
  });

  it("H-3 yang terlambat (penjadwal mati) tetap memberi tiga hari penuh", () => {
    const logs = new Map([
      [1, [
        { dueKey: key("D-14", 400), sentAt: ago(30) },
        { dueKey: key("D-3", 400), sentAt: ago(1) },
      ]],
    ]);
    expect(planTrialRetention(cand(400), logs, now, 90).deletions).toEqual([]);
  });

  it("pemberitahuan untuk tanggal beku LAIN tidak dihitung (uji coba dicairkan lalu beku lagi)", () => {
    const logs = new Map([
      [1, [
        { dueKey: `D-14${retentionSuffix(ago(500))}`, sentAt: ago(100) },
        { dueKey: `D-3${retentionSuffix(ago(500))}`, sentAt: ago(90) },
      ]],
    ]);
    const plan = planTrialRetention(cand(400), logs, now, 90);
    expect(plan.deletions).toEqual([]);
    expect(plan.notices[0].sendKey).toBe(key("D-14", 400));
  });
});

describe("penjadwal menggerbangi retensi dengan sakelarnya", () => {
  const src = readFileSync(join(__dirname, "..", "scripts", "subscription-scheduler.ts"), "utf8");
  const step = src.slice(src.indexOf("── 4b. Retensi uji coba BEKU"), src.indexOf("── 5. Sinkronisasi usage_counters"));

  it("sakelar dibaca dari INTI pengaturan, dengan env sebagai bawaan", () => {
    expect(step).toContain("trialAutoDeletionFrom(settingsRow, process.env)");
    expect(step).toContain("trialRetentionDaysFrom(settingsRow, process.env)");
  });

  it("surel & penghapusan HANYA di cabang sakelar menyala; cabang mati hanya melapor", () => {
    const off = step.indexOf("if (!autoDeletion) {");
    const elseAt = step.indexOf("} else {", off);
    expect(off).toBeGreaterThan(-1);
    expect(elseAt).toBeGreaterThan(off);
    const offBranch = step.slice(off, elseAt);
    expect(offBranch).not.toContain("sendMail(");
    expect(offBranch).not.toContain("executeTenantDeletion(");
    expect(offBranch).not.toContain("reminderLog.createMany(");
    expect(step.slice(elseAt)).toContain("executeTenantDeletion(");
  });

  it("memakai mesin penghapusan UU PDP yang SUDAH ADA, bukan jalan hapus kedua", () => {
    expect(src).toContain('from "../apps/operator/src/lib/operator/writes"');
    expect(step).not.toMatch(/\.delete\(|\.deleteMany\(|DROP DATABASE/i);
  });

  it("tenant demo dan tenant dengan permintaan hapus sendiri dikecualikan", () => {
    expect(step).toContain("!t.isDemo");
    expect(step).toContain("!pendingDeletion.has(f.tenantId)");
    expect(step).toContain(`RETENTION_NOTICE_KIND`);
    expect(RETENTION_NOTICE_KIND).toBe("trial_deletion");
  });
});
