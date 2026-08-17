/**
 * PENGATURAN SUREL DARI KONSOL (issue #169) — sifat yang dikunci di sini:
 *
 *   1. kata sandi tersimpan TERENKRIPSI: tidak pernah ada baris yang memuat
 *      teks aslinya, dan tidak pernah keluar lewat tampilan;
 *   2. menyimpan TANPA mengetik ulang kata sandi MEMPERTAHANKAN yang lama —
 *      layar hanya pernah melihat `••••`, jadi "simpan" ≠ "kosongkan";
 *   3. tanpa `SETTINGS_ENCRYPTION_KEY` penyimpanan DITOLAK — gagal-tertutup,
 *      bukan disimpan mentah dan bukan dilewati diam-diam;
 *   4. urutan sumber BASIS DATA → ENVIRONMENT → `file`, termasuk yang paling
 *      mudah salah: `sai_platform` yang MATI tidak boleh mematikan surel
 *      selama env terisi (doktrin "penagihan mati ≠ aplikasi mati");
 *   5. uji kirim melaporkan BERHASIL maupun GAGAL beserta alasan yang terbaca
 *      manusia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  EncryptionKeyError,
  encryptionKeyAvailable,
  openSecret,
  sealSecret,
} from "@/lib/settings-crypto";
import {
  invalidateMailSettingsCache,
  mailSettingsView,
  recordMailTestResult,
  redactSecret,
  saveMailSettings,
  storedMailPassword,
  type MailSettingsClient,
  type MailSettingsRow,
} from "@/lib/mail-settings";
import { resolveMailConfig, sendMail } from "@/lib/mailer-core";

/** Kunci uji — 64 karakter heksadesimal, seperti `openssl rand -hex 32`. */
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

const PASSWORD = "rahasia-smtp-yang-sangat-panjang-123";

function baseRow(overrides: Partial<MailSettingsRow> = {}): MailSettingsRow {
  return {
    transport: "smtp",
    host: "smtp.contoh.id",
    port: 587,
    username: "no-reply@contoh.id",
    fromAddress: "SAI Accounting <no-reply@contoh.id>",
    passwordCiphertext: null,
    passwordIv: null,
    passwordTag: null,
    lastTestAt: null,
    lastTestTo: null,
    lastTestStatus: null,
    lastTestMessage: null,
    updatedBy: "vyn",
    updatedAt: new Date("2026-08-02T10:00:00Z"),
    ...overrides,
  };
}

/** Klien platform in-memory — cukup untuk singleton `mail_settings`. */
function fakeClient(initial: MailSettingsRow | null = null) {
  const state = {
    row: initial,
    upserts: [] as { create: Record<string, unknown>; update: Record<string, unknown> }[],
    updates: [] as Record<string, unknown>[],
  };
  const client: MailSettingsClient = {
    mailSetting: {
      findUnique: async () => state.row,
      upsert: async (args) => {
        state.upserts.push({ create: args.create, update: args.update });
        state.row = state.row
          ? ({ ...state.row, ...args.update } as MailSettingsRow)
          : ({ ...baseRow(), ...args.create } as MailSettingsRow);
        return state.row;
      },
      update: async (args) => {
        state.updates.push(args.data);
        state.row = { ...(state.row as MailSettingsRow), ...args.data } as MailSettingsRow;
        return state.row;
      },
    },
  };
  return { state, client };
}

/** Klien yang MATI: setiap sentuhan melempar — persis `platformDb` saat
 *  `PLATFORM_DATABASE_URL` kosong atau basisnya tumbang. */
function deadClient(): MailSettingsClient {
  const boom = async () => {
    throw new Error("PLATFORM_DATABASE_URL is not set");
  };
  return { mailSetting: { findUnique: boom, upsert: boom, update: boom } } as MailSettingsClient;
}

beforeEach(() => {
  process.env.SETTINGS_ENCRYPTION_KEY = KEY_A;
  invalidateMailSettingsCache();
});

afterEach(() => {
  delete process.env.SETTINGS_ENCRYPTION_KEY;
  delete process.env.MAIL_TRANSPORT;
  delete process.env.SMTP_URL;
  delete process.env.MAIL_FROM;
  invalidateMailSettingsCache();
  vi.restoreAllMocks();
});

/* ══ 1. Enkripsi ═══════════════════════════════════════════════════════════ */

describe("enkripsi rahasia (AES-256-GCM)", () => {
  it("segel bisa dibuka kembali, dan sandi-teksnya bukan teks aslinya", () => {
    const sealed = sealSecret(PASSWORD);
    expect(sealed.ciphertext).not.toContain(PASSWORD);
    expect(openSecret(sealed)).toBe(PASSWORD);
  });

  it("IV baru setiap kali — kata sandi yang sama tidak menghasilkan segel kembar", () => {
    const a = sealSecret(PASSWORD);
    const b = sealSecret(PASSWORD);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("kunci yang BERGANTI tidak membuka segel lama — gagal, bukan kata sandi lain", () => {
    const sealed = sealSecret(PASSWORD);
    process.env.SETTINGS_ENCRYPTION_KEY = KEY_B;
    expect(() => openSecret(sealed)).toThrow();
  });

  it("sandi-teks yang DIUBAH orang di basis data ditolak tag autentikasinya", () => {
    const sealed = sealSecret(PASSWORD);
    const tampered = Buffer.from(sealed.ciphertext, "base64");
    tampered[0] ^= 0xff;
    expect(() =>
      openSecret({ ...sealed, ciphertext: tampered.toString("base64") })
    ).toThrow();
  });

  it("kunci hilang / panjangnya salah = GAGAL-TERTUTUP, bukan enkripsi lemah", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(encryptionKeyAvailable()).toBe(false);
    expect(() => sealSecret(PASSWORD)).toThrow(EncryptionKeyError);

    process.env.SETTINGS_ENCRYPTION_KEY = "terlalu-pendek";
    expect(encryptionKeyAvailable()).toBe(false);
    expect(() => sealSecret(PASSWORD)).toThrow(EncryptionKeyError);

    // Bukan heksadesimal, walau panjangnya 64 karakter.
    process.env.SETTINGS_ENCRYPTION_KEY = "z".repeat(64);
    expect(encryptionKeyAvailable()).toBe(false);
    expect(() => sealSecret(PASSWORD)).toThrow(EncryptionKeyError);
  });
});

/* ══ 2. Simpan ═════════════════════════════════════════════════════════════ */

describe("saveMailSettings — kata sandi tidak pernah mentah", () => {
  it("menyimpan sandi-teks + IV + tag; teks aslinya tidak ada di baris mana pun", async () => {
    const { state, client } = fakeClient();

    const result = await saveMailSettings(
      { platform: client },
      {
        transport: "smtp",
        host: "smtp.contoh.id",
        port: 587,
        username: "no-reply@contoh.id",
        fromAddress: "SAI <no-reply@contoh.id>",
        password: PASSWORD,
        updatedBy: "vyn",
      }
    );

    expect(result).toEqual({ outcome: "saved", passwordChanged: true });
    // Seluruh muatan yang menuju basis data diperiksa sebagai satu teks:
    // tidak ada satu pun tempat kata sandi bisa menyelinap.
    expect(JSON.stringify(state.upserts)).not.toContain(PASSWORD);
    expect(state.row?.passwordCiphertext).toBeTruthy();
    expect(state.row?.passwordIv).toBeTruthy();
    expect(state.row?.passwordTag).toBeTruthy();
    // …dan tetap bisa dibuka lagi saat surel benar-benar dikirim.
    expect(storedMailPassword(state.row as MailSettingsRow)).toBe(PASSWORD);
  });

  it("menyimpan TANPA mengetik ulang kata sandi = kata sandi lama dipertahankan", async () => {
    const sealed = sealSecret(PASSWORD);
    const { state, client } = fakeClient(
      baseRow({
        passwordCiphertext: sealed.ciphertext,
        passwordIv: sealed.iv,
        passwordTag: sealed.tag,
      })
    );

    const result = await saveMailSettings(
      { platform: client },
      {
        transport: "smtp",
        host: "smtp.lain.id",
        port: 465,
        username: "no-reply@contoh.id",
        fromAddress: "SAI <no-reply@contoh.id>",
        password: "",
        updatedBy: "vyn",
      }
    );

    expect(result).toEqual({ outcome: "saved", passwordChanged: false });
    // Ketiga kolom kata sandi TIDAK ikut dalam `update` — bukan ditimpa null.
    const update = state.upserts[0].update;
    expect(Object.keys(update)).not.toContain("passwordCiphertext");
    expect(state.row?.host).toBe("smtp.lain.id");
    expect(storedMailPassword(state.row as MailSettingsRow)).toBe(PASSWORD);
  });

  it("menghapus kata sandi hanya bila DIMINTA eksplisit", async () => {
    const sealed = sealSecret(PASSWORD);
    const { state, client } = fakeClient(
      baseRow({
        passwordCiphertext: sealed.ciphertext,
        passwordIv: sealed.iv,
        passwordTag: sealed.tag,
      })
    );

    await saveMailSettings(
      { platform: client },
      {
        transport: "smtp",
        host: "smtp.contoh.id",
        port: 587,
        username: null,
        fromAddress: "SAI <no-reply@contoh.id>",
        clearPassword: true,
        updatedBy: "vyn",
      }
    );

    expect(state.row?.passwordCiphertext).toBeNull();
    expect(storedMailPassword(state.row as MailSettingsRow)).toBeNull();
  });

  it("tanpa SETTINGS_ENCRYPTION_KEY: penyimpanan DITOLAK — nol tulisan, nol kata sandi mentah", async () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    const { state, client } = fakeClient();

    const result = await saveMailSettings(
      { platform: client },
      {
        transport: "smtp",
        host: "smtp.contoh.id",
        port: 587,
        username: "no-reply@contoh.id",
        fromAddress: "SAI <no-reply@contoh.id>",
        password: PASSWORD,
        updatedBy: "vyn",
      }
    );

    expect(result.outcome).toBe("encryption_key_missing");
    if (result.outcome === "encryption_key_missing") {
      expect(result.reason).toContain("SETTINGS_ENCRYPTION_KEY");
      // Alasannya untuk manusia — dan tidak memuat kata sandinya.
      expect(result.reason).not.toContain(PASSWORD);
    }
    // Tidak ada satu pun tulisan: bukan pengaturan setengah jadi, dan jelas
    // bukan kata sandi mentah.
    expect(state.upserts).toHaveLength(0);
    expect(state.row).toBeNull();
  });
});

describe("tampilan pengaturan — kata sandi tidak pernah sampai ke client", () => {
  it("hanya `hasPassword`, bukan nilainya dan bukan sandi-teksnya", () => {
    const sealed = sealSecret(PASSWORD);
    const view = mailSettingsView(
      baseRow({
        passwordCiphertext: sealed.ciphertext,
        passwordIv: sealed.iv,
        passwordTag: sealed.tag,
      })
    );

    expect(view.hasPassword).toBe(true);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain(sealed.ciphertext);
  });

  it("kata sandi tersimpan yang tak bisa dibuka → null + galat di log, bukan lemparan", () => {
    const sealed = sealSecret(PASSWORD);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SETTINGS_ENCRYPTION_KEY = KEY_B;

    const value = storedMailPassword(
      baseRow({
        passwordCiphertext: sealed.ciphertext,
        passwordIv: sealed.iv,
        passwordTag: sealed.tag,
      })
    );

    expect(value).toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it("penyensor rahasia menutup kata sandi yang menyelinap ke pesan galat", () => {
    expect(redactSecret(`535 login gagal untuk ${PASSWORD}`, PASSWORD)).not.toContain(PASSWORD);
    expect(redactSecret("host tidak dikenal", null)).toBe("host tidak dikenal");
  });
});

/* ══ 3. Urutan sumber: BASIS DATA → ENV → file ═════════════════════════════ */

describe("urutan sumber konfigurasi surel", () => {
  it("basis data MENGALAHKAN environment", async () => {
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_URL = "smtp://env:rahasia@smtp.env.id:587";
    process.env.MAIL_FROM = "Env <env@contoh.id>";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sealed = sealSecret(PASSWORD);
    const { client } = fakeClient(
      baseRow({
        host: "smtp.basisdata.id",
        passwordCiphertext: sealed.ciphertext,
        passwordIv: sealed.iv,
        passwordTag: sealed.tag,
      })
    );

    const config = await resolveMailConfig(client);

    expect(config.source).toBe("database");
    expect(config.requestedTransport).toBe("smtp");
    expect(config.from).toBe("SAI Accounting <no-reply@contoh.id>");
    expect(config.smtp?.host).toBe("smtp.basisdata.id");
    expect(config.smtp?.pass).toBe(PASSWORD);
    expect(config.smtpUrl).toBeNull();
    // Pengaman non-produksi tetap berdiri, sumber mana pun.
    expect(config.transport).toBe("file");
    expect(warn).toHaveBeenCalled();
  });

  it("PLATFORM MATI → jatuh ke environment; surel tetap jalan", async () => {
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_URL = "smtp://env:rahasia@smtp.env.id:587";
    process.env.MAIL_FROM = "Env <env@contoh.id>";
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = await resolveMailConfig(deadClient());

    expect(config.source).toBe("env");
    expect(config.requestedTransport).toBe("smtp");
    expect(config.smtpUrl).toBe("smtp://env:rahasia@smtp.env.id:587");
    expect(config.from).toBe("Env <env@contoh.id>");
  });

  it("belum ada baris DAN env kosong → transport `file`", async () => {
    const { client } = fakeClient(null);
    const config = await resolveMailConfig(client);

    expect(config.source).toBe("default");
    expect(config.transport).toBe("file");
    expect(config.smtp).toBeNull();
    expect(config.smtpUrl).toBeNull();
  });

  it("baris SETENGAH JADI (smtp tanpa host) tidak mengalahkan environment", async () => {
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_URL = "smtp://env:rahasia@smtp.env.id:587";
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { client } = fakeClient(baseRow({ host: null }));
    const config = await resolveMailConfig(client);

    expect(config.source).toBe("env");
  });

  it("baris transport `file` tetap MENGALAHKAN env — mematikan SMTP dari konsol berhasil", async () => {
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_URL = "smtp://env:rahasia@smtp.env.id:587";

    const { client } = fakeClient(baseRow({ transport: "file" }));
    const config = await resolveMailConfig(client);

    expect(config.source).toBe("database");
    expect(config.transport).toBe("file");
    expect(config.requestedTransport).toBe("file");
  });

  it("satu query per TTL, bukan satu query per surel", async () => {
    const { state, client } = fakeClient(baseRow({ transport: "file" }));
    const spy = vi.spyOn(state.row ? client.mailSetting : client.mailSetting, "findUnique");

    await resolveMailConfig(client);
    await resolveMailConfig(client);
    await resolveMailConfig(client);
    expect(spy).toHaveBeenCalledTimes(1);

    invalidateMailSettingsCache();
    await resolveMailConfig(client);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

/* ══ 4. Uji kirim: berhasil DAN gagal, dengan alasannya ════════════════════ */

describe("uji kirim melaporkan hasilnya", () => {
  let outbox: string;

  beforeEach(async () => {
    outbox = await mkdtemp(path.join(tmpdir(), "sai-mail-169-"));
    process.env.MAIL_OUTBOX_DIR = outbox;
  });

  afterEach(async () => {
    delete process.env.MAIL_OUTBOX_DIR;
    await rm(outbox, { recursive: true, force: true });
  });

  it("BERHASIL: transport dan rinciannya kembali sebagai bukti", async () => {
    const { client } = fakeClient(baseRow({ transport: "file" }));
    const config = await resolveMailConfig(client);

    const sent = await sendMail(
      { to: "operator@contoh.id", subject: "Uji kirim", text: "isi percobaan" },
      config
    );

    expect(sent.transport).toBe("file");
    expect(sent.detail).toContain(outbox);
    expect(await readdir(outbox)).toHaveLength(1);
  });

  it("GAGAL: alasannya terbaca manusia, bukan kegagalan senyap", async () => {
    /* Port 1 di localhost: ditolak seketika, tanpa DNS dan tanpa jaringan
     * keluar — kegagalan SMTP yang sungguhan, bukan mock. */
    let reason: string | null = null;
    try {
      await sendMail(
        { to: "operator@contoh.id", subject: "Uji kirim", text: "isi percobaan" },
        {
          transport: "smtp",
          requestedTransport: "smtp",
          source: "database",
          from: "SAI <no-reply@contoh.id>",
          smtpUrl: null,
          smtp: { host: "127.0.0.1", port: 1, secure: false, user: "x", pass: PASSWORD },
        }
      );
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }

    // Kegagalan yang DILAPORKAN, bukan kegagalan senyap: ada kalimatnya.
    expect(reason).not.toBeNull();
    expect((reason as string).length).toBeGreaterThan(0);
    // Alasan yang dilaporkan tidak boleh memuat kata sandi (jaring `redactSecret`).
    expect(redactSecret(reason as string, PASSWORD)).not.toContain(PASSWORD);
  }, 20_000);

  it("hasil uji dicatat di baris yang SUDAH ada — dan tidak melahirkan baris baru", async () => {
    const kosong = fakeClient(null);
    await recordMailTestResult(
      { platform: kosong.client },
      { to: "operator@contoh.id", status: "ok", message: "terkirim" }
    );
    // Uji atas konfigurasi ENV tidak boleh diam-diam membuat baris basis data
    // yang lalu MENGALAHKAN env itu sendiri.
    expect(kosong.state.updates).toHaveLength(0);
    expect(kosong.state.row).toBeNull();

    const ada = fakeClient(baseRow());
    await recordMailTestResult(
      { platform: ada.client },
      { to: "operator@contoh.id", status: "error", message: "535 autentikasi ditolak" }
    );
    expect(ada.state.row?.lastTestStatus).toBe("error");
    expect(ada.state.row?.lastTestMessage).toContain("535");
    expect(ada.state.row?.lastTestTo).toBe("operator@contoh.id");
  });
});

/* ══ 5. Layar & jejak — lapisan logika tanpa layar bukan hasil kerja ═══════ */

describe("halaman /operator/mail benar-benar memasang panelnya", () => {
  it("halaman dijaga penjaga bidang operator dan merender <MailSettingsForm />", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      path.join(__dirname, "..", "src", "app", "(app)", "(operator)", "operator", "mail", "page.tsx"),
      "utf8"
    );
    expect(src).toContain("requireOperatorPage()");
    expect(src).toContain("<MailSettingsForm");
    expect(src).toContain('from "@/components/operator/mail-settings-form"');
  });

  it("server action-nya menjaga bidangnya sendiri dan mencatat jejak tanpa kata sandi", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      path.join(__dirname, "..", "src", "app", "(app)", "(operator)", "operator", "mail", "actions.ts"),
      "utf8"
    );
    expect(src).toContain("requireOperatorActionSession(");
    expect(src).toContain('action: "operator.mail.update"');
    expect(src).toContain('action: "operator.mail.test"');
    // Nilai kata sandi tidak pernah masuk `details` jejak — hanya penandanya.
    const auditBlocks = src
      .split("writeOperatorAuditLog(")
      .slice(1)
      .map((block) => block.slice(0, block.indexOf("});")));
    expect(auditBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of auditBlocks) {
      expect(block).not.toContain("data.password");
      expect(block).not.toContain("config.smtp");
    }
    expect(src).toContain("passwordChanged");
  });
});
