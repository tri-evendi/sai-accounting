/**
 * PENGUMUMAN STATUS (migration platform 0004): aturan tampil, kosakata, dan
 * larangan teks bebas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BANNER_LEAD_MS,
  NOTICE_SENTENCE,
  PHASES_FOR,
  STATUS_NOTICE_COMPONENTS,
  STATUS_NOTICE_KINDS,
  STATUS_NOTICE_PHASES,
  visibleAsBanner,
  visibleOnStatusPage,
  type StatusNoticeRecord,
} from "@/lib/status-notices";

const NOW = new Date("2026-10-17T05:00:00Z");
const H = 60 * 60 * 1000;
const base: StatusNoticeRecord = {
  id: 1,
  kind: "incident",
  component: "application",
  phase: "investigating",
  startsAt: new Date(NOW.getTime() - H),
  endsAt: null,
  resolvedAt: null,
  showInApp: true,
};

describe("aturan tampil", () => {
  it("selesai: tampil 24 jam di /status, tidak pernah sebagai banner", () => {
    const baru = { ...base, phase: "resolved", resolvedAt: new Date(NOW.getTime() - 2 * H) };
    const lama = { ...baru, id: 2, resolvedAt: new Date(NOW.getTime() - 25 * H) };
    expect(visibleOnStatusPage([baru, lama], NOW).map((n) => n.id)).toEqual([1]);
    expect(visibleAsBanner([baru], NOW)).toEqual([]);
  });

  it("pemeliharaan: banner hanya 72 jam sebelum mulai sampai akhirnya", () => {
    const m = (id: number, mulaiDariSekarang: number, akhirDariSekarang: number) => ({
      ...base,
      id,
      kind: "maintenance",
      phase: "scheduled",
      startsAt: new Date(NOW.getTime() + mulaiDariSekarang),
      endsAt: new Date(NOW.getTime() + akhirDariSekarang),
    });
    const jauh = m(1, BANNER_LEAD_MS + H, BANNER_LEAD_MS + 3 * H);
    const dekat = m(2, 10 * H, 12 * H);
    const lewat = m(3, -3 * H, -H);
    expect(visibleAsBanner([jauh, dekat, lewat], NOW).map((n) => n.id)).toEqual([2]);
    /* Yang jauh tetap di /status — pengumuman dini justru gunanya. */
    expect(visibleOnStatusPage([jauh], NOW)).toHaveLength(1);
  });

  it("showInApp=false: hanya /status", () => {
    expect(visibleAsBanner([{ ...base, showInApp: false }], NOW)).toEqual([]);
    expect(visibleOnStatusPage([{ ...base, showInApp: false }], NOW)).toHaveLength(1);
  });

  it("kosakata asing dibuang — ia tidak punya kalimat", () => {
    expect(visibleOnStatusPage([{ ...base, kind: "outage" }, { ...base, id: 2, phase: "scheduled" }], NOW)).toEqual([]);
  });
});

describe("kosakata & kalimat", () => {
  it("setiap pasangan jenis × fase yang sah punya kalimat di ketiga kamus", () => {
    for (const lang of ["id", "en", "zh"]) {
      const d = JSON.parse(readFileSync(join(process.cwd(), `src/lib/i18n/dictionaries/${lang}.json`), "utf8"));
      for (const kind of STATUS_NOTICE_KINDS) {
        for (const phase of PHASES_FOR[kind]) {
          const kunci = NOTICE_SENTENCE[kind][phase];
          expect(kunci, `${kind}.${phase}`).toBeDefined();
          const nilai = (kunci as string).split(".").reduce((o: Record<string, unknown>, k) => o?.[k] as Record<string, unknown>, d);
          expect(typeof nilai, `${lang}:${kunci}`).toBe("string");
        }
      }
    }
  });

  it("kosakata kode = CHECK constraint migration", () => {
    const sql = readFileSync(join(process.cwd(), "prisma/postgresql/platform/0004_status_notices/migration.sql"), "utf8");
    const ambil = (kolom: string) =>
      [...(sql.match(new RegExp(`"${kolom}" IN \\(([^)]+)\\)`))?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(ambil("kind")).toEqual([...STATUS_NOTICE_KINDS].sort());
    expect(ambil("component")).toEqual([...STATUS_NOTICE_COMPONENTS].sort());
    expect(ambil("phase")).toEqual([...STATUS_NOTICE_PHASES].sort());
  });

  it("model StatusNotice tidak punya kolom teks bebas", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/platform/schema.prisma"), "utf8");
    const model = schema.slice(schema.indexOf("model StatusNotice {"));
    const badan = model.slice(0, model.indexOf("\n}"));
    expect(badan).not.toMatch(/@db\.Text|title|body|message/);
  });
});
