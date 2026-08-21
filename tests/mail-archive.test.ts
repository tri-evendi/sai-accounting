/**
 * Salinan senyap surel keluar (BCC arsip) — dan garis yang TIDAK boleh dilewati.
 *
 * Pemilik ingin melihat setiap pesan yang keluar. Itu sah, dan dipasang di SATU
 * tempat (`sendViaSmtp`) supaya tak ada pengirim yang bisa lupa.
 *
 * Yang tidak sah adalah menyalin surel yang membawa TOKEN AKSES. Tautan
 * atur-ulang kata sandi di dalam kotak arsip berarti siapa pun yang bisa
 * membaca kotak itu dapat mengambil alih akun mana pun — dan "hanya pemilik
 * yang membacanya" adalah asumsi tentang kotak surel pihak ketiga yang tidak
 * bisa dijamin kode ini.
 *
 * Karena itu pengecualiannya ditegakkan TES, bukan kehati-hatian pemanggil.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { archiveFor, type MailConfig, type MailMessage } from "@/lib/mailer-core";

const CONFIG: MailConfig = {
  transport: "smtp",
  requestedTransport: "smtp",
  source: "database",
  from: "SAI <no-reply@contoh.id>",
  archiveAddress: "arsip@contoh.id",
  smtpUrl: null,
  smtp: { host: "smtp.contoh.id", port: 465, secure: true, user: null, pass: null },
};

const PESAN: MailMessage = { to: "pelanggan@contoh.id", subject: "Halo", text: "isi" };

describe("aturan salinan arsip", () => {
  it("surel biasa ikut disalin", () => {
    expect(archiveFor(PESAN, CONFIG)).toBe("arsip@contoh.id");
  });

  it("surel bertoken TIDAK PERNAH disalin", () => {
    expect(archiveFor({ ...PESAN, sensitive: true }, CONFIG)).toBeNull();
  });

  it("tanpa alamat arsip, tidak ada yang disalin", () => {
    expect(archiveFor(PESAN, { ...CONFIG, archiveAddress: null })).toBeNull();
  });

  it("bawaannya menyalin — arsip yang bolong lebih buruk daripada arsip penuh", () => {
    /* Penanda yang harus diingat untuk MENYALAKAN pengarsipan akan membuat
       arsipnya berlubang tanpa ada yang tahu. Yang perlu diingat adalah
       pengecualiannya, dan pengecualiannya diuji di bawah. */
    expect(archiveFor({ ...PESAN, sensitive: undefined }, CONFIG)).toBe("arsip@contoh.id");
  });
});

describe("setiap pengirim bertoken menandai dirinya sensitif", () => {
  /* Daftar ini adalah kontraknya. Berkas BARU yang mengirim token akses wajib
     ditambahkan ke sini — dan tes akan berbunyi begitu ada `sendMail` di
     dalamnya yang lupa menandai. */
  const BERTOKEN = [
    "src/app/api/auth/forgot-password/route.ts",
    "src/app/api/tenant/invitations/route.ts",
    "src/app/api/auth/register/route.ts",
    "src/app/api/tenant/deletion-request/route.ts",
  ];

  for (const rel of BERTOKEN) {
    it(rel, () => {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      const panggilan = (source.match(/sendMail\(\{/g) ?? []).length;
      const ditandai = (source.match(/sensitive: true,/g) ?? []).length;

      expect(panggilan).toBeGreaterThan(0);
      expect(
        ditandai,
        `${panggilan} panggilan sendMail, hanya ${ditandai} yang menandai sensitive: true`
      ).toBe(panggilan);
    });
  }
});

describe("BCC, bukan CC", () => {
  it("pemasangannya memakai bcc", () => {
    /* CC menampilkan alamat arsip kepada SETIAP pelanggan penerima, dan alamat
       yang sudah tersebar tidak bisa ditarik kembali. */
    const source = readFileSync(join(process.cwd(), "src/lib/mailer-core.ts"), "utf8");
    expect(source).toMatch(/\bbcc:/);
    expect(source).not.toMatch(/^\s*cc:/m);
  });
});
