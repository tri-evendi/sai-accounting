/**
 * PENJAGA #374 — cadangan yang gagal tiap hari tidak boleh tampil sehat.
 *
 * == Kegagalan yang dijaga, dan ia sudah terjadi ============================
 * Antara 28 Juli dan 23 Agustus 2026 produksi berjalan dengan pelanggan
 * sungguhan dan NOL cadangan otomatis. Layanannya hidup, menolak dengan benar
 * karena `BACKUP_ENCRYPTION_KEY` kosong, lalu `|| true` membuatnya tidur dan
 * mengulangi penolakan yang sama dua puluh enam kali.
 *
 * Kalau denyut ini mengukur umur PUTARAN TERAKHIR — yaitu cara denyut penjadwal
 * (#373) mengukur, dan cara yang paling wajar untuk menyalinnya — dua puluh enam
 * hari itu akan dilaporkan `ok` setiap harinya. Ada putaran, tiap hari, tepat
 * waktu. Yang tidak ada hasilnya.
 *
 * Berkas ini yang membuat penyalinan itu menjadi merah.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  backupHealth,
  BACKUP_STALE_AFTER_HOURS,
  type BackupAttempt,
} from "@/lib/backup-heartbeat";

const KINI = new Date("2026-08-23T12:00:00.000Z");
const jamLalu = (n: number) => new Date(KINI.getTime() - n * 3_600_000);
const gagal = (at: Date, sebab = "BACKUP_ENCRYPTION_KEY belum diset"): BackupAttempt => ({
  at,
  ok: false,
  error: sebab,
});
const berhasil = (at: Date): BackupAttempt => ({ at, ok: true });

describe("skenario yang benar-benar terjadi: 26 hari mencoba, nol berhasil", () => {
  it("percobaan tepat waktu TIDAK membuatnya sehat", () => {
    /* Percobaan terakhir 3 jam lalu — jauh di dalam ambang mana pun. Yang salah
       bukan jadwalnya; yang salah hasilnya. */
    const h = backupHealth(null, gagal(jamLalu(3)), KINI);
    expect(h.status).not.toBe("ok");
    expect(h.status).toBe("failing");
    expect(h.lastSuccessAt).toBeNull();
    expect(h.lastError).toContain("BACKUP_ENCRYPTION_KEY");
  });

  it("umurnya dihitung dari KEBERHASILAN, bukan dari percobaan", () => {
    /* Berhasil terakhir 26 hari lalu, dicoba lagi 2 jam lalu dan gagal. */
    const h = backupHealth(jamLalu(26 * 24), gagal(jamLalu(2)), KINI);
    expect(h.ageHours).toBe(26 * 24);
    expect(h.status).not.toBe("ok");
  });
});

describe("empat keadaan, empat jawaban yang berbeda", () => {
  it("belum pernah ada putaran sama sekali → unknown, BUKAN late", () => {
    /* Pemasangan yang baru lahir tidak boleh berbunyi seperti pemasangan yang
       rusak — persis cara sebuah peringatan kehilangan kepercayaan pembacanya. */
    const h = backupHealth(null, null, KINI);
    expect(h.status).toBe("unknown");
    expect(h.ageHours).toBeNull();
    expect(h.lastAttemptAt).toBeNull();
  });

  it("berhasil baru saja → ok", () => {
    const h = backupHealth(jamLalu(6), berhasil(jamLalu(6)), KINI);
    expect(h.status).toBe("ok");
    expect(h.ageHours).toBe(6);
    expect(h.lastError).toBeNull();
  });

  it("berhasil, tapi terlalu lama → late", () => {
    const h = backupHealth(jamLalu(BACKUP_STALE_AFTER_HOURS + 1), berhasil(jamLalu(BACKUP_STALE_AFTER_HOURS + 1)), KINI);
    expect(h.status).toBe("late");
  });

  it("tepat DI ambang masih ok — ambangnya batas atas, bukan batas bawah", () => {
    const h = backupHealth(jamLalu(BACKUP_STALE_AFTER_HOURS), berhasil(jamLalu(BACKUP_STALE_AFTER_HOURS)), KINI);
    expect(h.status).toBe("ok");
  });
});

describe("gagal hari ini mendahului salinan kemarin yang masih segar", () => {
  it("salinan 6 jam lalu + gagal 1 jam lalu → failing, bukan ok", () => {
    /*
     * Ini urutan keputusan yang paling mudah dibalik saat berkasnya disunting
     * lagi, dan membaliknya menyembunyikan kegagalan hari pertama di balik
     * salinan kemarin. Yang tersisa hanya `late` dua hari kemudian — peringatan
     * yang datang tepat sesudah ia berhenti berguna.
     */
    const h = backupHealth(jamLalu(6), gagal(jamLalu(1)), KINI);
    expect(h.status).toBe("failing");
    /* Dan umurnya tetap dilaporkan apa adanya: pembacanya berhak tahu bahwa
       masih ADA salinan, meski yang terakhir gagal. */
    expect(h.ageHours).toBe(6);
    expect(h.lastSuccessAt).toBe(jamLalu(6).toISOString());
  });
});

describe("jam yang bergeser tidak melahirkan angka yang membingungkan", () => {
  it("keberhasilan bertanggal MASA DEPAN → umur 0, bukan negatif", () => {
    const h = backupHealth(new Date(KINI.getTime() + 3_600_000), berhasil(KINI), KINI);
    expect(h.ageHours).toBe(0);
    expect(h.status).toBe("ok");
  });

  it("tanggal tak sah diperlakukan sebagai tidak ada", () => {
    const h = backupHealth(new Date("bukan tanggal"), null, KINI);
    expect(h.status).toBe("unknown");
    expect(h.ageHours).toBeNull();
  });
});

describe("ambangnya dilaporkan, bukan disembunyikan", () => {
  it("ikut keluar supaya pembacanya tidak menebak", () => {
    expect(backupHealth(null, null, KINI).staleAfterHours).toBe(BACKUP_STALE_AFTER_HOURS);
  });

  it("lebih longgar dari jadwalnya sendiri", () => {
    /* Jadwalnya 24 jam. Ambang yang sama persis akan berbunyi setiap kali satu
       putaran terlewat karena deploy — dan pemantauan yang berbunyi untuk hal
       normal adalah pemantauan yang akhirnya diabaikan. */
    expect(BACKUP_STALE_AFTER_HOURS).toBeGreaterThan(24);
  });
});

/*
 * ── Rantai sebabnya, bukan hanya putusannya ────────────────────────────────
 *
 * Fungsi di atas boleh sempurna dan tetap tidak menyelamatkan siapa pun bila
 * tidak ada yang MEMANGGILNYA, atau bila `backup.sh` tidak pernah meninggalkan
 * jejak untuk dibacanya. Dua mata rantai itu disebut namanya di sini — pola
 * yang sama dengan `tests/layout-chrome-antd.test.tsx`.
 */
describe("rantainya utuh: direkam, lalu ditanyai dari luar", () => {
  const baca = (rel: string) =>
    readFileSync(join(__dirname, "..", rel), "utf8");

  it("`backup.sh` merekam pada jalur GAGAL", () => {
    /* Inilah mata rantai yang hilang sampai #374: `die` hanya menulis stderr,
       dan `|| true` di compose menelannya. */
    const sh = baca("scripts/backup.sh");
    const die = sh.slice(sh.indexOf("die() {"), sh.indexOf("die() {") + 200);
    expect(die).toMatch(/rekam gagal/);
  });

  it("`backup.sh` merekam pada jalur BERHASIL, beserta ukurannya", () => {
    /* Cadangan yang "berhasil" tapi 0 byte adalah kegagalan yang paling
       meyakinkan bentuknya; satu-satunya angka yang bisa membantahnya adalah
       ukurannya sendiri. */
    const sh = baca("scripts/backup.sh");
    expect(sh).toMatch(/rekam ok "\$\(basename "\$SEALED"\)" "\$UKURAN"/);
  });

  it("merekam tidak boleh menggagalkan mencadangkan", () => {
    /* Cadangan yang BERHASIL dikirim lalu dilaporkan gagal semata-mata karena
       platform tak terjangkau adalah kebalikan dari yang diminta #374. */
    expect(baca("scripts/backup.sh")).toMatch(/record:backup "\$@" \) >\/dev\/null 2>&1 \|\| true/);
    expect(baca("scripts/record-backup-run.ts")).toMatch(/process\.exit\(0\)/);
  });

  it("probe kesehatan menyebut `backup:`", () => {
    /* Kunci ditulis eksplisit di route-nya justru supaya penjaga ini bisa
       membacanya — catatan yang sama sudah berdiri untuk `scheduler:`. */
    const route = baca("src/app/api/health/route.ts");
    expect(route).toMatch(/^\s+backup: backupStatus,$/m);
    expect(route).toMatch(/backupHealth\(/);
  });

  it("probe TIDAK menjatuhkan dirinya karena cadangan bermasalah", () => {
    /*
     * Doktrin #137. Traefik akan berhenti mengirim lalu lintas ke container yang
     * sebenarnya melayani seluruh pembukuan pelanggan dengan baik — masalah
     * cadangan diubah menjadi pemadaman layanan, yang justru membuat cadangannya
     * lebih dibutuhkan.
     */
    const route = baca("src/app/api/health/route.ts");
    const g = route.slice(route.indexOf("export async function GET()"));
    /* Satu-satunya 503 di GET adalah basis data KENDALI, dan ia diputuskan
       sebelum denyut mana pun dibaca. */
    expect((g.match(/status: 503/g) ?? []).length).toBe(1);
    expect(g.indexOf("status: 503")).toBeLessThan(g.indexOf("lastBackup()"));
  });
});
