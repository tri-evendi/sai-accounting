/**
 * PENJAGA PENJADWAL & KESESUAIAN — sisa P1-1
 *
 * Yang dijaga di sini bukan bunyi kalimatnya, melainkan empat hal yang bisa
 * membuat alarm ini sia-sia tanpa satu pun galat:
 *
 *   1. `findings` harus BERBUNYI. Temuan yang tidak pernah diketuk ke pintu
 *      siapa pun sama saja dengan tidak diperiksa — dan itulah bagaimana 1.439
 *      temuan bisa berumur tanpa ada yang tahu.
 *   2. "Tidak ada putaran sama sekali" harus berbunyi sekeras "putaran gagal".
 *   3. Buku yang GAGAL DIPERIKSA tidak boleh terbaca sebagai buku yang bersih.
 *   4. Sidik jari peredam harus BERBEDA per komponen. Kalau sama, cadangan yang
 *      gagal sebulan akan MENYEMBUNYIKAN penjadwal yang baru macet hari ini.
 */
import { describe, expect, it } from "vitest";
import {
  decideSchedulerAlert,
  decideConformanceAlert,
  type SchedulerWatchdogInput,
  type ConformanceWatchdogInput,
} from "@/lib/health-watchdog";
import { decideBackupAlert } from "@/lib/backup-watchdog";
import type { SchedulerHealthStatus } from "@/lib/scheduler-heartbeat";
import type { ConformanceHealthStatus } from "@/lib/conformance-heartbeat";

function sched(over: Partial<SchedulerWatchdogInput> = {}): SchedulerWatchdogInput {
  return {
    status: "ok",
    lastRunAt: "2026-10-12T12:00:00.000Z",
    ageMinutes: 5,
    staleAfterMinutes: 120,
    ...over,
  };
}

function conf(over: Partial<ConformanceWatchdogInput> = {}): ConformanceWatchdogInput {
  return {
    status: "ok",
    lastRunAt: "2026-10-12T12:00:00.000Z",
    ageHours: 2,
    findingCount: 0,
    companiesFailed: 0,
    staleAfterHours: 24 * 9,
    ...over,
  };
}

describe("penjaga penjadwal", () => {
  it("`ok` diam", () => {
    expect(decideSchedulerAlert(sched({ status: "ok" })).alert).toBe(false);
  });

  it.each<SchedulerHealthStatus>(["late", "unknown"])("`%s` berbunyi", (status) => {
    expect(decideSchedulerAlert(sched({ status })).alert).toBe(true);
  });

  it("`late` menyebut KEMACETAN, bukan hanya kegagalan", () => {
    /*
     * Pembedaan yang menentukan tindakan: langkah yang MENGGANTUNG tidak
     * meninggalkan baris log, container tetap "Up", dan log terakhir tetap
     * berbunyi "selesai tanpa masalah". Orang yang hanya disuruh "periksa log"
     * akan melihat log yang bersih lalu menyimpulkan tidak ada masalah.
     */
    const body = decideSchedulerAlert(sched({ status: "late", ageMinutes: 190 })).body;
    expect(body).toMatch(/KEMACETAN/);
    expect(body).toContain("docker top");
    expect(body).toContain("190");
    expect(body).toContain("120");
  });

  it("`unknown` menyebut apa yang BERHENTI, bukan hanya bahwa ia tak diketahui", () => {
    const body = decideSchedulerAlert(
      sched({ status: "unknown", lastRunAt: null, ageMinutes: null })
    ).body;
    expect(body).toContain("Langganan");
    expect(body).toContain("(belum pernah)");
  });
});

describe("penjadwal HIDUP tapi pekerjaannya GAGAL — titik buta versi pertama", () => {
  /*
   * Keadaan yang paling mudah lolos, dan ia ADA di produksi: 5 putaran berstatus
   * `error` (Agu 2026) yang semuanya dilaporkan `ok` oleh denyut. Sebab denyut
   * menjawab "apakah penjadwalnya hidup" — dan jawabannya memang `ok`.
   *
   * Versi pertama penjaga ini hanya membaca `finishedAt`, jadi ia mewarisi titik
   * buta yang sama persis. Tes ini yang menahannya kembali.
   */
  it("denyut `ok` + putaran `error` → BERBUNYI", () => {
    const putusan = decideSchedulerAlert(
      sched({ status: "ok", statusPutaran: "error", jumlahGalat: 3 })
    );
    expect(putusan.alert).toBe(true);
    expect(putusan.body).toContain("3");
    expect(putusan.body, "harus menjelaskan kenapa denyutnya tetap ok").toMatch(
      /BENAR untuk pertanyaan yang ia jawab/
    );
  });

  it("sidik jarinya TERPISAH dari `scheduler:late`", () => {
    /* Keduanya menuntut tindakan berbeda — macet vs pekerjaan gagal — dan satu
       tidak boleh meredam yang lain lewat kunci peredam yang sama. */
    const galat = decideSchedulerAlert(sched({ status: "ok", statusPutaran: "error" }));
    const telat = decideSchedulerAlert(sched({ status: "late" }));
    expect(galat.fingerprint).toBe("scheduler:errors");
    expect(telat.fingerprint).toBe("scheduler:late");
  });

  it("denyut `ok` + putaran `ok` tetap DIAM", () => {
    expect(
      decideSchedulerAlert(sched({ status: "ok", statusPutaran: "ok", jumlahGalat: 0 })).alert
    ).toBe(false);
  });

  it("belum ada putaran sama sekali tidak dilaporkan sebagai galat", () => {
    /* `statusPutaran: null` berarti "tidak ada barisnya" — itu `unknown`, bukan
       `error`. Melebur keduanya membuat pemasangan baru berbunyi seperti
       pemasangan yang rusak. */
    const putusan = decideSchedulerAlert(
      sched({ status: "unknown", lastRunAt: null, ageMinutes: null, statusPutaran: null })
    );
    expect(putusan.fingerprint).toBe("scheduler:unknown");
  });

  it("putaran `error` pada denyut yang TELAT tetap dilaporkan sebagai telat", () => {
    /* Kalau keduanya salah, yang lebih mendesak adalah penjadwal yang tidak
       berjalan — pekerjaan yang gagal tidak relevan kalau putarannya sendiri
       sudah tidak sampai. */
    const putusan = decideSchedulerAlert(sched({ status: "late", statusPutaran: "error" }));
    expect(putusan.fingerprint).toBe("scheduler:late");
  });
});

describe("penjaga kesesuaian data", () => {
  it("`ok` diam", () => {
    expect(decideConformanceAlert(conf({ status: "ok" })).alert).toBe(false);
  });

  it.each<ConformanceHealthStatus>(["findings", "late", "unknown"])(
    "`%s` berbunyi",
    (status) => {
      expect(decideConformanceAlert(conf({ status })).alert).toBe(true);
    }
  );

  it("`findings` BERBUNYI meski temuannya bisa bertahan berbulan-bulan", () => {
    /* Keputusan yang paling mudah salah: membuatnya diam supaya kotak masuk
       tenang memindahkan masalahnya ke tempat yang tidak terlihat. */
    const putusan = decideConformanceAlert(conf({ status: "findings", findingCount: 1439 }));
    expect(putusan.alert).toBe(true);
    expect(putusan.body).toContain("1439");
    expect(putusan.body).toContain("/operator/conformance");
  });

  it("`findings` menjelaskan ini BUKAN galat aplikasi", () => {
    /* Tanpa itu, penerimanya akan mencari bug di kode — padahal yang perlu
       diperbaiki adalah DATA. */
    expect(decideConformanceAlert(conf({ status: "findings", findingCount: 7 })).body).toMatch(
      /bukan galat aplikasi/i
    );
  });

  it("buku yang GAGAL diperiksa disebut eksplisit, bukan dilebur ke 'basi'", () => {
    const body = decideConformanceAlert(
      conf({ status: "late", companiesFailed: 3, ageHours: 300 })
    ).body;
    expect(body).toContain("3 BUKU GAGAL DIPERIKSA");
    expect(body, "buku tak terperiksa ≠ buku bersih").toMatch(/tidak sama dengan/);
  });

  it("`late` tanpa buku gagal memakai kalimat yang berbeda", () => {
    const body = decideConformanceAlert(conf({ status: "late", companiesFailed: 0 })).body;
    expect(body).toMatch(/TERLALU LAMA/);
    expect(body).not.toContain("BUKU GAGAL");
  });
});

describe("peredam: tiga komponen tidak boleh saling meredam", () => {
  it("sidik jarinya berbeda antar komponen", () => {
    /*
     * Kalau kuncinya satu untuk semua, cadangan yang gagal selama sebulan akan
     * MENYEMBUNYIKAN penjadwal yang baru macet hari ini — alarm yang meredam
     * alarm lain adalah bentuk kegagalan yang paling sulit disadari.
     */
    const sidik = new Set([
      decideBackupAlert({
        status: "failing",
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastError: null,
        ageHours: null,
        staleAfterHours: 48,
      }).fingerprint,
      decideSchedulerAlert(sched({ status: "late" })).fingerprint,
      decideConformanceAlert(conf({ status: "findings" })).fingerprint,
    ]);
    expect(sidik.size).toBe(3);
  });

  it("sidik jarinya memuat status — perubahan keadaan tidak ikut diredam", () => {
    expect(decideSchedulerAlert(sched({ status: "late" })).fingerprint).toBe("scheduler:late");
    expect(decideSchedulerAlert(sched({ status: "unknown" })).fingerprint).toBe(
      "scheduler:unknown"
    );
    expect(decideConformanceAlert(conf({ status: "findings" })).fingerprint).toBe(
      "conformance:findings"
    );
  });

  it("sidik jarinya TIDAK memuat angka yang berubah tiap putaran", () => {
    /* Jumlah temuan bergerak sedikit tiap hari. Sidik jari yang memuatnya akan
       lolos dari peredam setiap kali — yaitu tidak ada peredaman sama sekali. */
    const a = decideConformanceAlert(conf({ status: "findings", findingCount: 1439 }));
    const b = decideConformanceAlert(conf({ status: "findings", findingCount: 1440 }));
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("yang diam tidak membawa sidik jari", () => {
    expect(decideSchedulerAlert(sched({ status: "ok" })).fingerprint).toBe("");
    expect(decideConformanceAlert(conf({ status: "ok" })).fingerprint).toBe("");
  });
});

describe("subjek bisa disaring di kotak masuk", () => {
  it("menyebut komponen DAN statusnya", () => {
    expect(decideSchedulerAlert(sched({ status: "late" })).subject).toBe("[SAI] penjadwal: late");
    expect(decideConformanceAlert(conf({ status: "findings" })).subject).toBe(
      "[SAI] kesesuaian: findings"
    );
  });

  it("badan surel selalu memuat keadaan apa adanya + catatan peredam", () => {
    for (const putusan of [
      decideSchedulerAlert(sched({ status: "late" })),
      decideConformanceAlert(conf({ status: "findings" })),
    ]) {
      expect(putusan.body).toContain("keadaan apa adanya");
      expect(putusan.body).toMatch(/paling cepat 24 jam lagi/);
    }
  });
});
