/**
 * Denyut penjadwal (issue #373) — putusan "masih berdetak atau tidak".
 *
 * Yang dijaga di sini bukan sekadar aritmetika umur, melainkan tiga keputusan
 * yang mudah dibalik oleh orang berikutnya dan yang akibatnya baru terasa
 * berbulan-bulan kemudian:
 *
 *   1. `unknown` BUKAN `late`. Pemasangan yang baru lahir tidak boleh berbunyi
 *      seperti pemasangan yang rusak.
 *   2. `/api/health` TIDAK PERNAH 503 karena penjadwal (doktrin #137) — kalau
 *      ia 503, Traefik berhenti mengirim lalu lintas dan satu masalah
 *      penagihan berubah menjadi pemadaman total.
 *   3. Penjadwalnya adalah LAYANAN, bukan cron host yang dipasang tangan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SCHEDULER_STALE_AFTER_MINUTES,
  schedulerHealth,
} from "@/lib/scheduler-heartbeat";

const now = new Date("2026-08-15T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);

describe("schedulerHealth", () => {
  it("putaran barusan → ok", () => {
    const health = schedulerHealth(minutesAgo(5), now);
    expect(health.status).toBe("ok");
    expect(health.ageMinutes).toBe(5);
    expect(health.lastRunAt).toBe(minutesAgo(5).toISOString());
  });

  it("tepat di ambang masih ok — yang melewatinya baru terlambat", () => {
    expect(schedulerHealth(minutesAgo(SCHEDULER_STALE_AFTER_MINUTES), now).status).toBe("ok");
    expect(schedulerHealth(minutesAgo(SCHEDULER_STALE_AFTER_MINUTES + 1), now).status).toBe("late");
  });

  it("ambangnya dua putaran, bukan satu", () => {
    // Satu putaran terlewat karena deploy atau mesin sibuk bukan insiden, dan
    // pemantauan yang berbunyi untuk hal normal akhirnya diabaikan orang.
    expect(SCHEDULER_STALE_AFTER_MINUTES).toBe(120);
    expect(schedulerHealth(minutesAgo(90), now).status).toBe("ok");
  });

  it("belum pernah jalan → unknown, TIDAK PERNAH late", () => {
    for (const value of [null, undefined, new Date(Number.NaN)]) {
      const health = schedulerHealth(value, now);
      expect(health.status).toBe("unknown");
      expect(health.lastRunAt).toBeNull();
      expect(health.ageMinutes).toBeNull();
    }
  });

  it("tanggal di masa depan → umur 0, bukan negatif", () => {
    // Jam container dan jam basis data bisa berselisih beberapa detik; selisih
    // itu tidak boleh menjadi angka yang membingungkan pembacanya.
    const health = schedulerHealth(new Date(now.getTime() + 30_000), now);
    expect(health.ageMinutes).toBe(0);
    expect(health.status).toBe("ok");
  });

  it("ambangnya ikut dilaporkan — pembacanya tidak perlu menebak", () => {
    expect(schedulerHealth(minutesAgo(1), now).staleAfterMinutes).toBe(
      SCHEDULER_STALE_AFTER_MINUTES
    );
  });
});

describe("penjadwal sebagai layanan (#373)", () => {
  const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");

  it("ada layanan `scheduler` yang lahir bersama deploy", () => {
    expect(compose).toMatch(/^ {2}scheduler:$/m);
    expect(compose).toContain("scheduler:subscriptions");
    expect(compose).toContain("restart: unless-stopped");
  });

  /** Badan layanan `scheduler` saja, tanpa baris komentar. */
  const badanPenjadwal = () => {
    const mulai = compose.indexOf("\n  scheduler:");
    const habis = compose.indexOf("\n  conformance:");
    return compose
      .slice(mulai, habis)
      .split("\n")
      .filter((b) => !b.trim().startsWith("#"))
      .join("\n");
  };

  it("satu putaran gagal tidak mematikan putaran berikutnya", () => {
    // Loop yang mati karena satu galat mengembalikan kita persis ke kegagalan
    // senyap yang layanan ini ada untuk menutupnya.
    //
    // Diuji sebagai SIFAT, bukan sebagai string. Versi lama menuntut harfiah
    // `bun run scheduler:subscriptions || true`, jadi ia merah ketika
    // mekanismenya diperbaiki — penelannya kini sebuah fungsi yang selalu
    // `return 0` DAN menyebutkan langkah mana yang gagal. Tes yang memaku
    // implementasi menghalangi perbaikan yang justru memperkuat sifatnya.
    expect(badanPenjadwal()).toContain("return 0");
  });

  it("langkah yang MENGGANTUNG dibunuh, tidak menahan putaran berikutnya", () => {
    // Ditemukan di produksi 30 Agu 2026: `scheduler:subscriptions` menggantung
    // dua jam dengan CPU 0,09%; putaran itu tak pernah sampai ke `sleep`, dan
    // SELURUH putaran berikutnya tertahan. `|| true` melindungi dari langkah
    // yang GAGAL, bukan dari yang MENGGANTUNG — dan bedanya tidak terlihat di
    // log mana pun.
    const badan = badanPenjadwal();
    expect(badan).toMatch(/timeout -k \d+ /);
    expect(badan).toMatch(/BATAS=\d+/);
  });

  it("tiap langkah lewat pembungkus — tak ada yang dipanggil telanjang", () => {
    // Penjaga yang sebenarnya menahan kambuhnya: langkah keenam yang
    // ditambahkan tanpa pembungkus mengembalikan cacatnya utuh, dan tidak ada
    // yang akan menyadarinya sampai sesuatu menggantung lagi berbulan-bulan
    // kemudian.
    const telanjang = badanPenjadwal()
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b.startsWith("bun run "));
    expect(telanjang, "panggil lewat `langkah <nama> bun run …`").toEqual([]);
  });

  it("setiap loop layanan punya timeout — bukan hanya penjadwal", () => {
    // Kelas cacatnya milik BENTUK `while true; do … sleep N; done`, bukan milik
    // penjadwal. Cadangan harian dan pemeriksaan mingguan punya bentuk yang
    // sama, dan pada cadensi itu satu kemacetan bisa berumur berbulan-bulan.
    const loop = compose.split("\n").filter((b) => b.includes("while true"));
    expect(loop.length).toBeGreaterThan(0);
    for (const layanan of ["conformance", "backup"] as const) {
      const mulai = compose.indexOf(`\n  ${layanan}:`);
      expect(mulai, `layanan ${layanan} tidak ada`).toBeGreaterThan(-1);
      const potong = compose.slice(mulai);
      const habis = potong.indexOf("\n  ", 1) > 0 ? potong.indexOf("\n\n  ") : potong.length;
      const badan = potong.slice(0, habis > 0 ? habis : potong.length);
      expect(badan, `loop ${layanan} tanpa timeout`).toContain("timeout -k");
    }
  });

  it("menunggu migration selesai — tabelnya harus ada sebelum putaran pertama", () => {
    const service = compose.slice(compose.indexOf("\n  scheduler:"), compose.indexOf("\n  web:"));
    expect(service).toContain("service_completed_successfully");
  });
});

describe("/api/health menyebut penjadwal tanpa ikut memutuskan (#373 · doktrin #137)", () => {
  /*
   * Pengumpul bidangnya pindah ke `lib/health-report.ts` (#374) sebab
   * pembacanya kini dua — probe ini dan halaman status publik. Penjaga ini ikut
   * pindah bersama subjeknya; tidak satu pun tuntutan di bawah dilonggarkan.
   * Yang tersisa di route hanyalah satu-satunya hal yang memang milik lapisan
   * HTTP: penerjemahan "kendali tak terjangkau" menjadi 503.
   */
  const bersih = (isi: string) =>
    isi.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const code = bersih(
    readFileSync(join(process.cwd(), "src", "lib", "health-report.ts"), "utf8")
  );
  const route = bersih(
    readFileSync(join(process.cwd(), "src", "app", "api", "health", "route.ts"), "utf8")
  );

  it("melaporkan denyutnya", () => {
    expect(code).toContain("scheduler:");
    expect(code).toContain("schedulerHealth");
  });

  it("HANYA basis data kendali yang bisa membuatnya 503", () => {
    // Penagihan mati ≠ aplikasi mati. Kalau probe ini gagal karena penjadwal
    // telat, Traefik berhenti mengirim lalu lintas ke container yang masih
    // melayani setiap pembukuan pelanggan dengan sempurna.
    const failures = [...route.matchAll(/status:\s*503/g)];
    expect(failures).toHaveLength(1);

    // Yang diperiksa adalah GERBANGNYA — bagian `healthReport()` yang berjalan
    // sebelum keputusan "belum siap" diambil. `platformDb` memang diimpor di
    // atas, dan yang menentukan bukan keberadaan impornya melainkan apakah ia
    // ikut menjaga gerbang itu.
    const body = code.slice(code.indexOf("export async function healthReport()"));
    const gate = body.slice(0, body.indexOf('database: "unreachable"'));
    expect(gate).toContain("controlDb");
    expect(gate).not.toContain("platformDb");
    expect(gate).not.toContain("lastSchedulerRun");

    // Dan di route: 503 hanya untuk bentuk `error`, yang cuma lahir dari
    // gerbang kendali di atas — tidak ada bidang lain yang bisa mencapainya.
    const handler = route.slice(route.indexOf("export async function GET()"));
    expect(handler.indexOf('report.status === "error"')).toBeLessThan(
      handler.indexOf("status: 503")
    );
  });

  it("platform tak terjangkau dijawab `unknown`, bukan lemparan", () => {
    expect(code).toMatch(/catch\s*\{[\s\S]*?schedulerHealth\(null\)/);
  });
});
