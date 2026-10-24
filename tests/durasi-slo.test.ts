/**
 * PENJAGA sebaran durasi jendela harian & vonis SLO (09 §11, TATA-KELOLA §2).
 *
 * ══ KENAPA BERKAS INI ADA ═════════════════════════════════════════════════
 * Jalur Go (`interactive`/`report.export_go`, `schedule`, `tenant`, `bulk`,
 * `integration`) tercatat "tak terukur" di tabel §11. Klaim Go sudah menulis
 * `started_at` sejak 0.23.0, tetapi satu-satunya permukaan durasi adalah
 * jendela 15 menit `jobMetrics` — dan jalur yang menjalankan belasan pekerjaan
 * sehari hampir tak pernah punya satu sampel pun di 15 menit. Jawabannya
 * `jobDurations` (`@sai/platform/job-durations`): jendela harian, p50/p95/p99/
 * maks per jalur (GABUNGAN baris) dan per `kind`, plus vonis SLO dari kontrak.
 *
 * Bukti terhadap PostgreSQL sungguhan (termasuk SQL klaim Go dari
 * `contract/jobs.sql`) ada di `tests/jobs-time-columns.integration.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";
import {
  SLO_MIN_SAMPLES,
  laneSlo,
  sloVerdict,
  sloWindowDays,
} from "@sai/core/queue-health";
import { JOB_LANES } from "@sai/core/generated/job-kinds";
import { DONE_RETENTION_DAYS } from "@sai/core/generated/job-numbers";
import { lipatDurasi, type BarisDurasi } from "@sai/platform/job-durations";

const baca = (rel: string) => readFileSync(join(AKAR_REPO, rel), "utf8");
const durasi = tanpaKomentar(baca("packages/platform/src/job-durations.ts"));
const halaman = baca("apps/operator/src/app/(operator)/scheduler/page.tsx");

const baris = (ubah: Partial<BarisDurasi>): BarisDurasi => ({
  lane: "interactive",
  kind: null,
  samples: BigInt(0),
  p50: null,
  p95: null,
  p99: null,
  max: null,
  over: BigInt(0),
  ...ubah,
});

describe("SLO durasi DIDEFINISIKAN SEKALI — di kontrak", () => {
  it("interactive: p95 < 10.000 ms, 30 hari, disahkan 24 Okt 2026", () => {
    expect(laneSlo("interactive")).toEqual({
      durationP95Ms: 10_000,
      windowDays: 30,
      decided: "2026-10-24",
    });
  });

  it("angkanya sama dengan yang disahkan di TATA-KELOLA §2", () => {
    /* Dua tempat yang menyebut janji yang sama menyimpang tanpa galat; yang
       dinilai mesin adalah kontraknya, yang dibaca customer dokumennya. */
    const tk = baca("docs/TATA-KELOLA.md");
    const ekspor = tk.split("\n").find((l) => l.startsWith("| Ekspor laporan (antrean `interactive`)"));
    expect(ekspor).toBeDefined();
    const detik = Number(/<\s*(\d+)\s*detik/.exec(ekspor!)?.[1]);
    expect(detik * 1000).toBe(laneSlo("interactive")!.durationP95Ms);
  });

  it("jalur lain tidak punya SLO — `null`, bukan angka karangan", () => {
    for (const lane of Object.keys(JOB_LANES)) {
      if (lane !== "interactive") expect(laneSlo(lane), lane).toBeNull();
    }
    expect(laneSlo("(tak dikenal)")).toBeNull();
  });

  it("halaman TIDAK mengetik ambangnya sendiri", () => {
    const kode = tanpaKomentar(halaman);
    expect(kode).toContain("laneSlo(");
    expect(kode).toContain("sloVerdict(");
    expect(kode).not.toMatch(/\b10[_.]?000\b/);
  });
});

describe("vonis SLO", () => {
  it("jalur tanpa SLO → `unset`", () => {
    expect(sloVerdict("ledger", 50_000, 999)).toBe("unset");
  });

  it(`di bawah ${SLO_MIN_SAMPLES} sampel → \`insufficient\`, BUKAN hijau`, () => {
    expect(sloVerdict("interactive", 100, SLO_MIN_SAMPLES - 1)).toBe("insufficient");
    expect(sloVerdict("interactive", 99_999, SLO_MIN_SAMPLES - 1)).toBe("insufficient");
    expect(sloVerdict("interactive", null, 500)).toBe("insufficient");
  });

  it("p95 = sasaran masih DALAM; satu milidetik di atasnya MELAMPAUI", () => {
    expect(sloVerdict("interactive", 10_000, SLO_MIN_SAMPLES)).toBe("within");
    expect(sloVerdict("interactive", 10_001, SLO_MIN_SAMPLES)).toBe("exceeding");
  });

  it("minimum sampel 20 = satu pekerjaan per 5% error budget", () => {
    expect(SLO_MIN_SAMPLES).toBe(20);
  });

  it("jendela yang dinilai dipotong retensi baris `done`", () => {
    const slo = laneSlo("interactive")!;
    expect(sloWindowDays(slo)).toBe(Math.min(slo.windowDays, DONE_RETENTION_DAYS));
    expect(sloWindowDays({ ...slo, windowDays: 3 })).toBe(3);
  });
});

describe("lipatDurasi — bentuk tabel per jalur & `kind`", () => {
  it("setiap jalur kontrak muncul, tanpa sampel pun, dengan persentil `null`", () => {
    const hasil = lipatDurasi([]);
    expect(hasil.map((d) => d.lane)).toEqual(Object.keys(JOB_LANES));
    for (const d of hasil) {
      expect(d.kind).toBeNull();
      expect(d.samples).toBe(0);
      expect(d.p95Ms).toBeNull();
      expect(d.maxMs).toBeNull();
    }
  });

  it("baris gabungan jalur lebih dulu, lalu `kind`-nya terurut", () => {
    const hasil = lipatDurasi([
      baris({ kind: "report.export_go", samples: BigInt(2), p95: 900.4, max: 1200 }),
      baris({ kind: null, samples: BigInt(5), p50: 120.6, p95: 880, p99: 1190, max: 1200, over: BigInt(1) }),
      baris({ kind: "report.export", samples: BigInt(3), p95: 300 }),
    ]);
    const interactive = hasil.filter((d) => d.lane === "interactive");
    expect(interactive.map((d) => d.kind)).toEqual([null, "report.export", "report.export_go"]);
    expect(interactive[0]).toMatchObject({ samples: 5, p50Ms: 121, p95Ms: 880, p99Ms: 1190, maxMs: 1200, overSlo: 1 });
    expect(interactive[2]!.p95Ms).toBe(900);
  });

  it("`overSlo` `null` di jalur tanpa SLO — bukan 0", () => {
    const hasil = lipatDurasi([baris({ lane: "tenant", samples: BigInt(4), p95: 20_000, over: BigInt(0) })]);
    expect(hasil.find((d) => d.lane === "tenant")!.overSlo).toBeNull();
    expect(hasil.find((d) => d.lane === "interactive")!.overSlo).toBe(0);
  });

  it("jalur yang tak dikenal kontrak tetap terlihat, di akhir", () => {
    const hasil = lipatDurasi([baris({ lane: "(tak dikenal)", samples: BigInt(1), p95: 5 })]);
    expect(hasil.at(-1)).toMatchObject({ lane: "(tak dikenal)", samples: 1 });
  });
});

describe("kueri sebaran: kolom yang benar, setiap jalur", () => {
  it("durasi dari `finished_at - started_at`, tidak pernah dari `claimed_at`", () => {
    expect(durasi).toMatch(/finished_at - j\.started_at|finished_at - started_at/);
    expect(durasi).not.toMatch(/claimed_at/);
    expect(durasi).toContain("started_at IS NOT NULL");
  });

  it("persentil jalur atas GABUNGAN baris (GROUPING SETS), bukan lipatan antar `kind`", () => {
    expect(durasi).toContain("GROUPING SETS ((lane, kind), (lane))");
    expect(durasi).toContain("MAX(ms)");
  });

  it("peta `kind → jalur` dari kontrak bangkitan, tanpa CASE WHEN, tanpa daftar `kind` tulisan tangan", () => {
    expect(durasi).toContain("Object.keys(JOB_KINDS)");
    expect(durasi).not.toMatch(/CASE\s+WHEN/i);
    /* Tidak ada saringan kind/jalur: jalur Go yang tersaring keluar adalah
       persis cara durasinya hilang tanpa gejala. */
    expect(durasi).not.toMatch(/kind\s*(=|IN|<>|!=)\s*'/i);
  });

  it("jendela bawaannya retensi `done`, dihitung server dari LOCALTIMESTAMP", () => {
    expect(durasi).toContain("windowDays: number = DONE_RETENTION_DAYS");
    expect(durasi).toContain("LOCALTIMESTAMP -");
  });

  it("tab Metrik memuatnya, dan `null` berarti 'tak terbaca'", () => {
    expect(halaman).toContain('tab === "metrics" ? jobDurationsForOperator() : null');
    expect(halaman).toContain("durations === null");
    expect(halaman).toContain("operator.scheduler.durationsSloInsufficient");
  });
});
