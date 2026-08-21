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

describe("isian alamat arsip di panel operator", () => {
  const SCHEMA_SOURCE = readFileSync(
    join(process.cwd(), "src/lib/validations/operator.ts"),
    "utf8"
  );

  it("dialirkan menembus keempat lapisannya", () => {
    /* Isian yang berhenti di salah satu lapisan adalah isian yang tampil di
       layar lalu diam-diam tidak tersimpan — bentuk kegagalan yang paling lama
       tidak ketahuan, sebab layarnya terlihat benar. */
    const lapisan = [
      "src/lib/validations/operator.ts",
      "src/app/(app)/(operator)/operator/mail/actions.ts",
      "src/lib/mail-settings.ts",
      "src/components/operator/mail-settings-form.tsx",
    ];
    for (const rel of lapisan) {
      expect(
        readFileSync(join(process.cwd(), rel), "utf8"),
        `${rel} tidak menyebut archiveAddress`
      ).toContain("archiveAddress");
    }
  });

  it("menerima alamat kosong — itulah cara mencabutnya", async () => {
    const { mailSettingsSchema } = await import("@/lib/validations/operator");
    const dasar = {
      transport: "file" as const,
      fromAddress: "SAI <no-reply@contoh.id>",
    };

    expect(mailSettingsSchema.safeParse({ ...dasar, archiveAddress: "" }).success).toBe(true);
    expect(mailSettingsSchema.safeParse(dasar).success).toBe(true);
  });

  it("menolak yang bukan alamat telanjang", async () => {
    const { mailSettingsSchema } = await import("@/lib/validations/operator");
    const dasar = {
      transport: "file" as const,
      fromAddress: "SAI <no-reply@contoh.id>",
    };

    /* "Nama <alamat>" sah sebagai header From, tapi sebagai BCC ia hanya satu
       bentuk lagi yang bisa salah. Begitu pula daftar berkoma. */
    for (const buruk of ["Arsip <arsip@contoh.id>", "a@contoh.id, b@contoh.id", "bukan-email"]) {
      expect(
        mailSettingsSchema.safeParse({ ...dasar, archiveAddress: buruk }).success,
        buruk
      ).toBe(false);
    }
  });

  it("keterangannya menyebutkan pengecualian token akses", () => {
    /* Orang yang memasang alamat di sini berhak tahu bahwa surel atur-ulang
       kata sandi TIDAK ikut disalin — kalau tidak, ia akan menyimpulkan
       arsipnya bocor justru saat ia bekerja benar. */
    void SCHEMA_SOURCE;
    const id = JSON.parse(
      readFileSync(join(process.cwd(), "src/lib/i18n/dictionaries/id.json"), "utf8")
    );
    const hint = id.operator.mail.archiveAddressHint as string;
    expect(hint.toLowerCase()).toContain("token");
    expect(hint.toLowerCase()).toContain("bcc");
  });
});
