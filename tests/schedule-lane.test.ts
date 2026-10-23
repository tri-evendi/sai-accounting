/**
 * PENERBIT DENYUT TEPAT SATU — penjaga peralihan penerbitan Node ↔ Go
 * (09 §3.2 jalur `schedule`, §4 rekonsiliasi; PRODUCTION.md §Penerbit denyut).
 *
 * ══ BENTUK KEGAGALAN YANG DITUTUP ══════════════════════════════════════════
 * Kind berjadwal (`ledger.recurring`, `tenant.backup`) kini punya DUA penerbit
 * yang mungkin: langkah Node di peran `scheduler` (`svc-worker`) dan jalur
 * `schedule` Go (`svc-integrator`). Yang memilih satu di antaranya adalah
 * `contract/kinds.yaml` → `schedule.publisher`. Dua cara itu bisa rusak tanpa
 * satu galat pun:
 *
 *   • KEDUANYA menerbitkan — penerbit yang lupa memeriksa kontrak. Kunci yang
 *     identik menahan baris gandanya, tapi "kunci kebetulan sama" bukan
 *     rancangan: begitu bentuk kunci satu sisi berubah, setiap butir terbit
 *     dua kali (dua cadangan penuh sehari).
 *   • TIDAK SATU PUN menerbitkan — penerbit yang membaca kontrak dengan salah.
 *     Tidak ada baris, jadi antrean kosong, umur tertua nol, setiap ambang
 *     hijau — sementara dokumen berulang dan cadangan berhenti.
 *
 * Penjaga ini membaca TEKS kedua sisi (gerbang yang tak pernah dilewati orang
 * adalah `bun run verify`); perilaku Go dibuktikan `schedulelane/*_test.go`,
 * dan kesamaan kunci oleh fikstur bersama (`tests/schedule-due.test.ts`).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { JOB_KINDS, JOB_LANES, SCHEDULED_KINDS, type ScheduledKind } from "@sai/core/generated/job-kinds";
import { NOT_FROZEN_COMPANY_WHERE } from "@sai/core/tenant-migration";
import { goPublishedKinds } from "@sai/core/schedule-due";
import { scheduleLaneHealth } from "@sai/core/scheduler-heartbeat";
import { decideScheduleLaneAlert } from "../src/lib/health-watchdog";
import { AKAR_REPO, berkasGo } from "./akar-sumber";
import { workerRole, composeServices } from "./compose-worker";

const baca = (...p: string[]) => readFileSync(join(AKAR_REPO, ...p), "utf8");
/** Kode tanpa komentar — kata di komentar bukan kata di kode. */
const kode = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

const BERJADWAL = Object.keys(SCHEDULED_KINDS) as ScheduledKind[];

/** Setiap `.ts` di bawah `dir`, rekursif (tanpa `generated/`). */
function berkasTs(dir: string): { rel: string; isi: string }[] {
  if (!existsSync(dir)) return [];
  const hasil: { rel: string; isi: string }[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name === "node_modules" || d.name === "generated") continue;
    const penuh = join(dir, d.name);
    if (d.isDirectory()) hasil.push(...berkasTs(penuh));
    else if (/\.tsx?$/.test(d.name)) {
      hasil.push({ rel: penuh.slice(AKAR_REPO.length + 1), isi: readFileSync(penuh, "utf8") });
    }
  }
  return hasil;
}

const SUMBER_TS = ["workers", "scripts", "src", "packages", "apps"].flatMap((d) =>
  berkasTs(join(AKAR_REPO, d))
);

/** Penerbit Node satu kind: berkas yang memanggil `publishJob` dengan `kind: "<kind>"`. */
function penerbitNode(kind: string): { rel: string; isi: string }[] {
  const pola = new RegExp(`publishJob\\(\\{[\\s\\S]{0,80}kind:\\s*"${kind.replace(".", "\\.")}"`);
  return SUMBER_TS.filter((b) => pola.test(kode(b.isi)));
}

const GO = berkasGo();
const GO_PRODUKSI = GO.filter((b) => !b.rel.endsWith("_test.go"));

describe("kontrak: setiap kind berjadwal punya TEPAT satu penerbit", () => {
  it("ada kind berjadwal, dan penerbitnya node atau go", () => {
    expect(BERJADWAL.length).toBeGreaterThan(0);
    for (const k of BERJADWAL) expect(["node", "go"], k).toContain(SCHEDULED_KINDS[k].publisher);
  });

  it("jalur `schedule` tunggal-instans, dan denyutnya tidak diulang otomatis", () => {
    expect(JOB_LANES.schedule.singleInstance).toBe(true);
    expect(JOB_KINDS["schedule.tick"].maxAttempts).toBe(1);
  });
});

describe("sisi Node: penerbit memeriksa kontrak SEBELUM menerbitkan", () => {
  for (const kind of BERJADWAL) {
    it(`\`${kind}\` — satu penerbit Node, dan ia bertanya pada kontrak`, () => {
      const penerbit = penerbitNode(kind);
      /* Penerbit Node kedua untuk kind berjadwal = penerbit yang tidak melewati
         gerbang ini, dan kind itu terbit dua kali sesudah peralihan. */
      expect(penerbit.map((p) => p.rel), `penerbit Node \`${kind}\``).toHaveLength(1);
      const isi = kode(penerbit[0]!.isi);
      const gerbang = isi.indexOf(`nodePublishes("${kind}")`);
      expect(gerbang, `${penerbit[0]!.rel} tidak memanggil nodePublishes("${kind}")`).toBeGreaterThan(-1);
      expect(gerbang, "gerbang penerbit harus mendahului publishJob").toBeLessThan(isi.indexOf("publishJob("));
      /* Kunci & muatan dari aturan bersama, bukan ditulis ulang di skrip. */
      expect(isi).toContain(`duePublications("${kind}"`);
    });
  }

  it("langkah-langkah Node TETAP di putaran penjadwal — mereka yang melewati dirinya sendiri", () => {
    /* Peralihan ke Go tidak menyentuh compose: langkahnya tetap, dan ia keluar
       0 dengan satu baris log ketika penerbitnya Go. Jalan mundurnya karena itu
       juga satu baris kontrak — bukan compose yang harus diingat orang. */
    const scheduler = workerRole("scheduler");
    expect(scheduler).toContain("langkah recurring:publish bun run recurring:publish");
    expect(scheduler).toContain("langkah backup:publish bun run backup:publish");
  });
});

describe("sisi Go: hanya jalur `schedule` yang menerbitkan, dan hanya milik Go", () => {
  const penerbitGo = GO_PRODUKSI.filter((b) => /\.Publish\(/.test(b.isi) && !b.rel.endsWith("/jobs/queue.go"));

  it("pemanggil Publish di pohon Go hanya `internal/schedulelane` dan `internal/integrationlane`", () => {
    expect(penerbitGo.length, "penjaga ini tidak melihat penerbit Go mana pun").toBeGreaterThan(0);
    /* Penerbit KEDUA lahir Okt 2026: jalur `integration` (e-Faktur,
       docs/EFAKTUR.md) menerbitkan `integration.efaktur_poll` (dirinya sendiri)
       dan `efaktur.record` (diklaim Node). Keduanya BUKAN kind berjadwal —
       janji penjaga ini (Go tidak menerbitkan kind berjadwal milik Node) tetap
       dipegang hanya oleh `schedulelane`, dan diperiksa di bawah. */
    for (const b of penerbitGo) {
      expect(b.rel, b.rel).toMatch(/\/internal\/(schedulelane|integrationlane)\//);
    }
  });

  it("jalur `integration` tidak menyentuh kind berjadwal sama sekali", () => {
    const integrasi = GO_PRODUKSI.filter((b) => b.rel.includes("/internal/integrationlane/"));
    expect(integrasi.length).toBeGreaterThan(0);
    for (const b of integrasi) {
      expect(b.isi, b.rel).not.toMatch(/ScheduledKinds|GoOwned\(|KindLedgerRecurring|KindTenantBackup|KindScheduleTick/);
    }
  });

  it("penerbit Go menyaring kind berjadwal pada `publisher: go`", () => {
    const due = GO_PRODUKSI.find((b) => b.rel.endsWith("internal/schedulelane/due.go"))!;
    expect(due.isi).toMatch(/func GoOwned\(\)[\s\S]{0,200}s\.Publisher == contract\.PublisherGo/);
    const runner = GO_PRODUKSI.find((b) => b.rel.endsWith("internal/schedulelane/runner.go"))!;
    expect(runner.isi).toContain("milik:      GoOwned(),");
    /* Tick hanya menerbitkan `d.milik`; denyut pulang tanpa menerbitkan bila
       kosong. Penerbit yang mengulang `contract.ScheduledKinds` langsung akan
       menerbitkan kind milik Node. */
    expect(runner.isi).not.toMatch(/range contract\.ScheduledKinds/);
    expect(runner.isi).toMatch(/for _, k := range d\.milik/);
    expect(runner.isi).toMatch(/if len\(d\.milik\) == 0 \{[\s\S]{0,300}return\n/);
  });

  it("denyut Go berjalan HANYA di pemegang pagar (`Beside`), di koneksi langsung", () => {
    const runner = GO_PRODUKSI.find((b) => b.rel.endsWith("internal/schedulelane/runner.go"))!.isi;
    expect(runner).toContain("Beside: d.beat,");
    expect(runner).toContain("LockQueue: jobs.New(langsung),");
    expect(runner).toContain("db.KendaliLangsung(");
    const pelari = GO_PRODUKSI.find((b) => b.rel.endsWith("internal/jobs/runner.go"))!.isi;
    const i = pelari.indexOf("if r.Beside != nil {");
    expect(i, "jobs.Runner tidak menjalankan Beside").toBeGreaterThan(-1);
    /* Beside dimulai SESUDAH pagar diambil — urutan teksnya urutan eksekusinya. */
    expect(pelari.indexOf("p, dapat, err := ambil(ctx, r.Lane)")).toBeLessThan(i);
  });

  it("`cmd/integrator` menjalankan jalur `schedule`", () => {
    const main = GO_PRODUKSI.find((b) => b.rel.endsWith("cmd/integrator/main.go"))!.isi;
    expect(main).toContain('{"schedule", schedulelane.Run}');
  });

  it("saringan perusahaan Go = saringan penerbit Node", () => {
    /* Dua daftar berbeda antara penerbit Node dan Go berarti peralihan
       mengubah SIAPA yang menerima dokumen berulang — tanpa satu galat pun. */
    expect(kode(baca("scripts", "publish-recurring.ts"))).toMatch(
      /isActive: true, isDemo: false, \.\.\.NOT_FROZEN_COMPANY_WHERE/
    );
    expect(NOT_FROZEN_COMPANY_WHERE).toEqual({
      OR: [{ tenantId: null }, { tenant: { is: { frozenAt: null } } }],
    });
    const runner = GO_PRODUKSI.find((b) => b.rel.endsWith("internal/schedulelane/runner.go"))!.isi;
    const sql = runner.slice(runner.indexOf("const pilihTerjadwal"), runner.indexOf("ORDER BY c.id ASC"));
    for (const wajib of [
      "c.is_active = true",
      "c.is_demo = false",
      "c.tenant_id IS NULL",
      "EXISTS (SELECT 1 FROM tenants t WHERE t.id = c.tenant_id AND t.frozen_at IS NULL)",
    ]) {
      expect(sql, wajib).toContain(wajib);
    }
  });
});

describe("compose: denyut Go hidup di `svc-integrator`, tanpa env baru", () => {
  it("`svc-integrator` menjalankan biner gabungan dan memegang kedua sambungan kendali", () => {
    const svc = composeServices()["svc-integrator"] as { command?: unknown; environment?: Record<string, unknown> };
    expect(svc.command).toEqual(["svc-integrator"]);
    /* Pekerjaan lewat pooler, pagar langsung — keduanya sudah disediakan untuk
       jalur `tenant` dan `interactive`; jalur `schedule` tidak menambah satu
       nama pun ke daftar izin. */
    expect(Object.keys(svc.environment ?? {})).toEqual(
      expect.arrayContaining(["CONTROL_DATABASE_URL", "CONTROL_DATABASE_DIRECT_URL"])
    );
  });
});

describe("denyut penerbit Go: penerbit yang mati TIDAK terbaca sehat", () => {
  const jam = (iso: string) => new Date(iso);

  it("selama Node penerbit semuanya: `node`, diam", () => {
    expect(scheduleLaneHealth(null, []).status).toBe("node");
    expect(
      decideScheduleLaneAlert({ status: "node", goKinds: [], lastRunAt: null, ageMinutes: null, staleAfterMinutes: 0 })
        .alert
    ).toBe(false);
  });

  it("milik Go, tick segar: ok, diam", () => {
    const h = scheduleLaneHealth(jam("2026-10-23T05:00:01Z"), ["tenant.backup"], jam("2026-10-23T05:30:00Z"));
    if (h.status === "node") throw new Error("milik Go terbaca node");
    expect(h.status).toBe("ok");
    expect(decideScheduleLaneAlert(h).alert).toBe(false);
  });

  it("milik Go, tick terakhir > 2 jam: late, BERBUNYI dengan sidik jarinya sendiri", () => {
    const h = scheduleLaneHealth(jam("2026-10-23T01:00:00Z"), ["tenant.backup"], jam("2026-10-23T05:30:00Z"));
    if (h.status === "node") throw new Error("milik Go terbaca node");
    const d = decideScheduleLaneAlert(h);
    expect(h.status).toBe("late");
    expect(d.alert).toBe(true);
    /* Terpisah dari `scheduler:*`: penjadwal Node yang sehat tidak boleh
       meredam penerbit Go yang mati, atau sebaliknya. */
    expect(d.fingerprint).toBe("schedule-lane:late");
    expect(d.body).toContain("svc-integrator");
  });

  it("milik Go, belum pernah satu tick pun: BERBUNYI (bukan 'pemasangan baru')", () => {
    const h = scheduleLaneHealth(null, ["ledger.recurring"]);
    if (h.status === "node") throw new Error("milik Go terbaca node");
    expect(decideScheduleLaneAlert(h).alert).toBe(true);
  });

  it("penjaga kesehatan membaca jejak `schedule.tick`, hanya bila Go penerbitnya", () => {
    const w = kode(baca("scripts", "watch-health.ts"));
    expect(w).toContain("goPublishedKinds()");
    expect(w).toMatch(/where: \{ kind: "schedule\.tick", status: "done" \}/);
    expect(w).toContain("decideScheduleLaneAlert(");
    expect(goPublishedKinds()).toEqual(
      BERJADWAL.filter((k) => SCHEDULED_KINDS[k].publisher === "go").sort()
    );
  });
});
