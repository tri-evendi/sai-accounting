/**
 * Produksi tanpa SMTP harus BERBUNYI (issue #317).
 *
 * ══ KEJADIAN YANG MELAHIRKAN TES INI ════════════════════════════════════════
 * Seseorang mendaftar di produksi pada 9 Agustus 2026. Halaman menjawab "cek
 * email Anda". Surelnya ditulis ke `/app/data/mail-outbox/` 14 milidetik
 * kemudian, dan tidak seorang pun pernah membuka direktori itu. Tidak ada galat
 * di mana pun — karena memang tidak ada satu baris kode pun yang menganggap
 * keadaan itu salah.
 *
 * Perhatikan asimetrinya, dan itulah yang dikunci di sini: `guardNonProduction`
 * sudah BERTERIAK untuk kasus yang jauh lebih ringan (seseorang meminta `smtp`
 * di laptopnya), sementara keadaan yang berbahaya — PRODUKSI yang menulis
 * setiap surel ke cakram — diam total.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mailHealth } from "@/lib/mail-health";

describe("kesehatan surel", () => {
  it("PRODUKSI + transport file = keadaan yang DILAPORKAN, bukan didiamkan", () => {
    const health = mailHealth({
      transport: "file",
      source: "default",
      nodeEnv: "production",
      outboxCount: 3,
    });
    expect(health.status).toBe("not_configured");
    /* Jumlah berkasnya bukan hiasan: satu berkas = satu orang yang sedang
       menunggu surel yang tidak akan pernah datang. */
    expect(health.outboxCount).toBe(3);
  });

  it("produksi + smtp = ok", () => {
    expect(
      mailHealth({ transport: "smtp", source: "database", nodeEnv: "production", outboxCount: 0 })
        .status
    ).toBe("ok");
  });

  it("DI LUAR produksi, transport file adalah keadaan yang SAH — bukan masalah", () => {
    /* Kalau ini ikut dilaporkan sebagai kesalahan, setiap pengembang melihat
       peringatan yang sama setiap hari — dan peringatan yang selalu menyala
       berhenti dibaca justru sebelum hari ia benar-benar berarti. */
    const health = mailHealth({
      transport: "file",
      source: "default",
      nodeEnv: "development",
      outboxCount: 12,
    });
    expect(health.status).toBe("capturing_to_file");
  });

  it("kotak keluar yang tak terbaca dilaporkan `null`, bukan 0", () => {
    // 0 berarti "tidak ada yang menunggu"; `null` berarti "tidak tahu".
    // Menyamakan keduanya membuat kegagalan membaca direktori terlihat seperti
    // kabar baik.
    const health = mailHealth({
      transport: "file",
      source: "default",
      nodeEnv: "production",
      outboxCount: null,
    });
    expect(health.outboxCount).toBeNull();
    expect(health.status).toBe("not_configured");
  });

  it("hanya STATUS yang layak keluar ke permukaan publik", () => {
    /* Rambu #317: jangan bocorkan KEADAAN KONFIGURASI surel ke permukaan
       publik. `/api/health` dipanggil tanpa kredensial, jadi bentuk publiknya
       hanya satu kata — tanpa host, pengirim, sumber, maupun jumlah antrean
       yang menyiratkan volume. */
    const publik = mailHealth({
      transport: "smtp",
      source: "database",
      nodeEnv: "production",
      outboxCount: 5,
    }).public;
    expect(publik).toEqual({ status: "ok" });
  });
});

describe("peringatan sekali-bunyi", () => {
  /* `vi.stubEnv`, bukan `Object.defineProperty`: Node menolak deskriptor
     non-enumerable pada `process.env`, dan vitest memang menyediakan
     penggantinya beserta pemulihannya. */
  afterEach(async () => {
    vi.unstubAllEnvs();
    (await import("@/lib/mailer-core")).resetMailWarning();
    vi.restoreAllMocks();
  });

  const send = async () => {
    const { sendMail } = await import("@/lib/mailer-core");
    await sendMail(
      { to: "a@contoh.id", subject: "x", text: "y" },
      {
        transport: "file",
        requestedTransport: "file",
        source: "default",
        from: "x@contoh.id",
        archiveAddress: null,
        smtpUrl: null,
        smtp: null,
      }
    );
  };

  it("PRODUKSI + file → berteriak, tapi HANYA SEKALI per proses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await send();
    await send();
    await send();
    /* Sekali, bukan tiap surel: peringatan yang berulang ratusan kali sehari
       mengubur baris lain yang justru perlu dibaca. */
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toMatch(/PRODUKSI TANPA SMTP/);
  });

  it("di luar produksi TIDAK berteriak sama sekali", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await send();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("bentuk jawaban /api/auth/register TIDAK berubah (rambu #317)", () => {
  /*
   * Rambu isunya tegas: jangan "perbaiki" lapis 1. Status, isi, dan lamanya
   * jawaban harus tetap sama untuk alamat yang sudah punya akun maupun yang
   * belum — kalau tidak, cacat operasional berubah menjadi lubang enumerasi.
   *
   * Dijaga di tingkat SUMBER karena yang harus dikunci adalah BENTUKNYA, bukan
   * satu jalur eksekusi: route ini menyentuh basis data kendali, jadi
   * menjalankannya di tes menuntut MySQL, dan yang tersisa hanya akan menguji
   * mock buatan sendiri.
   */
  const source = readFileSync(
    join(__dirname, "..", "src", "app", "api", "auth", "register", "route.ts"),
    "utf8"
  );

  it("hanya SATU jawaban sukses, dan bentuknya tetap { ok: true, message }", () => {
    const sukses = source.match(/NextResponse\.json\(\{\s*ok:\s*true[^)]*\)/g) ?? [];
    expect(sukses).toHaveLength(1);
    expect(sukses[0]).toMatch(/message:/);
  });

  it("pengiriman surel TIDAK ditunggu — jawabannya tak boleh berbeda lamanya", () => {
    expect(source).toMatch(/void \(async \(\) => \{/);
  });

  it("keadaan surel tidak pernah bocor ke jawaban pendaftar", () => {
    const jawaban = source.match(/NextResponse\.json\([^;]*\)/g) ?? [];
    for (const baris of jawaban) {
      expect(baris).not.toMatch(/transport|smtp|outbox|mailHealth/i);
    }
  });
});
