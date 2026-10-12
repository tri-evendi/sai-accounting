/**
 * PENJAGA CADANGAN — aturan yang mengubah status diam menjadi surel.
 *
 * Yang dijaga di sini BUKAN bunyi kalimatnya, melainkan tiga hal yang bisa
 * membuat alarm ini sia-sia tanpa satu pun galat:
 *
 *   1. Status yang BERBUNYI harus mencakup "tidak ada putaran sama sekali".
 *      Itu bentuk kegagalan paling mahal karena tidak melapor diri — dan
 *      `backup_runs` pernah 0 baris selama berbulan-bulan.
 *   2. `local_only` harus tetap berbunyi. Jaring sementara yang berhenti
 *      berbunyi adalah jaring yang dilupakan sebagai permanen.
 *   3. Sidik jari peredam tidak boleh memuat waktu atau pesan galat. Sebab yang
 *      berubah sedikit setiap hari akan lolos dari peredam, dan kotak masuk yang
 *      penuh berhenti dibaca — kegagalan yang bentuknya sama dengan tidak ada
 *      alarm.
 */
import { describe, expect, it } from "vitest";
import { decideBackupAlert, type WatchdogInput } from "@/lib/backup-watchdog";
import type { BackupHealthStatus } from "@/lib/backup-heartbeat";

function input(over: Partial<WatchdogInput> = {}): WatchdogInput {
  return {
    status: "ok",
    lastSuccessAt: "2026-10-12T00:00:00.000Z",
    lastAttemptAt: "2026-10-12T00:00:00.000Z",
    lastError: null,
    ageHours: 2,
    staleAfterHours: 48,
    ...over,
  };
}

describe("penjaga cadangan: siapa yang berbunyi", () => {
  it("`ok` adalah SATU-SATUNYA status yang diam", () => {
    expect(decideBackupAlert(input({ status: "ok" })).alert).toBe(false);
  });

  it.each<BackupHealthStatus>(["failing", "late", "unknown", "local_only"])(
    "`%s` berbunyi",
    (status) => {
      expect(decideBackupAlert(input({ status })).alert).toBe(true);
    }
  );

  it("`unknown` berbunyi — ketiadaan putaran adalah kegagalan yang paling sunyi", () => {
    const putusan = decideBackupAlert(
      input({ status: "unknown", lastSuccessAt: null, lastAttemptAt: null, ageHours: null })
    );
    expect(putusan.alert).toBe(true);
    expect(putusan.body).toContain("TIDAK ADA SATU PUN PUTARAN");
    // Kalimatnya harus memberi perintah yang bisa dijalankan, bukan hanya kabar.
    expect(putusan.body).toContain("docker compose logs");
  });

  it("`local_only` berbunyi, dan menyebut APA yang sudah & BELUM dilindungi", () => {
    const putusan = decideBackupAlert(input({ status: "local_only", lastSuccessAt: null }));
    expect(putusan.alert).toBe(true);
    expect(putusan.body).toContain("kehilangan mesin");
    expect(putusan.body).toContain("BACKUP_S3_BUCKET");
    // Kunci enkripsi yang hanya hidup di mesin yang hilang = cadangan yang tak
    // bisa dipulihkan. Peringatan itu harus ikut, sebab ia tidak terlihat sendiri.
    expect(putusan.body).toContain("BACKUP_ENCRYPTION_KEY");
  });

  it("`failing` membawa sebab dari skripnya, bukan kalimat umum", () => {
    const putusan = decideBackupAlert(
      input({ status: "failing", lastError: "unggah gagal — cadangan lama TIDAK dipangkas." })
    );
    expect(putusan.body).toContain("unggah gagal");
  });

  it("`failing` tanpa sebab tetap bisa dikirim", () => {
    const putusan = decideBackupAlert(input({ status: "failing", lastError: null }));
    expect(putusan.alert).toBe(true);
    expect(putusan.body).toContain("tidak disebutkan");
  });

  it("`failing` membedakan 'pernah berhasil' dari 'belum pernah sama sekali'", () => {
    const pernah = decideBackupAlert(
      input({ status: "failing", lastSuccessAt: "2026-10-10T00:00:00.000Z", ageHours: 50 })
    );
    const belum = decideBackupAlert(
      input({ status: "failing", lastSuccessAt: null, ageHours: null })
    );
    expect(pernah.body).toContain("2026-10-10");
    expect(belum.body).toContain("BELUM PERNAH");
  });

  it("`late` menyebut umur DAN ambangnya — tanpa keduanya angka itu tak bisa dinilai", () => {
    const putusan = decideBackupAlert(
      input({ status: "late", ageHours: 73, staleAfterHours: 48 })
    );
    expect(putusan.body).toContain("73");
    expect(putusan.body).toContain("48");
  });
});

describe("penjaga cadangan: peredam", () => {
  it("sidik jarinya status, bukan waktu atau pesan", () => {
    const a = decideBackupAlert(input({ status: "failing", lastError: "sebab A pukul 01:00" }));
    const b = decideBackupAlert(input({ status: "failing", lastError: "sebab B pukul 02:00" }));
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toBe("backup:failing");
  });

  it("status yang BERBEDA punya sidik jari berbeda — perubahan keadaan tidak boleh ikut diredam", () => {
    const sidik = new Set(
      (["failing", "late", "unknown", "local_only"] as BackupHealthStatus[]).map(
        (status) => decideBackupAlert(input({ status })).fingerprint
      )
    );
    expect(sidik.size).toBe(4);
  });

  it("yang diam tidak membawa sidik jari — tidak ada yang perlu diredam", () => {
    const putusan = decideBackupAlert(input({ status: "ok" }));
    expect(putusan.fingerprint).toBe("");
    expect(putusan.subject).toBe("");
    expect(putusan.body).toBe("");
  });
});

describe("penjaga cadangan: subjek bisa disaring di kotak masuk", () => {
  it("statusnya ada di subjek", () => {
    expect(decideBackupAlert(input({ status: "late" })).subject).toBe("[SAI] cadangan: late");
  });

  it("badan surel selalu memuat keadaan apa adanya, apa pun statusnya", () => {
    for (const status of ["failing", "late", "unknown", "local_only"] as BackupHealthStatus[]) {
      const body = decideBackupAlert(input({ status })).body;
      expect(body).toContain("keadaan apa adanya");
      expect(body).toContain(`status            : ${status}`);
    }
  });

  it("tidak pernah memuat kredensial — hanya NAMA variabel yang kurang", () => {
    const body = decideBackupAlert(input({ status: "local_only" })).body;
    // Nama variabel boleh; nilai tidak akan pernah masuk sebab putusan ini murni
    // dan tidak pernah membaca environment.
    expect(body).not.toMatch(/AWS_SECRET_ACCESS_KEY=/);
    expect(body).not.toMatch(/password/i);
  });
});
