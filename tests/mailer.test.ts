/**
 * Pengirim surel (issue #136) — sifat yang dikunci di sini adalah JANJI MODE
 * PENGEMBANGAN: di luar produksi surel TIDAK PERNAH terkirim sungguhan, apa
 * pun isi environment-nya. Transport `file` menangkap pesan ke berkas .eml
 * yang bisa dibuka dan diperiksa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sendMail } from "@/lib/mailer";

let outbox: string;

beforeEach(async () => {
  outbox = await mkdtemp(path.join(tmpdir(), "sai-mail-"));
  process.env.MAIL_OUTBOX_DIR = outbox;
});

afterEach(async () => {
  delete process.env.MAIL_OUTBOX_DIR;
  delete process.env.MAIL_TRANSPORT;
  delete process.env.SMTP_URL;
  await rm(outbox, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("transport file (bawaan)", () => {
  it("menangkap surel ke berkas .eml berisi penerima, subjek, dan isi", async () => {
    const result = await sendMail({
      to: "budi@example.co.id",
      subject: "Atur ulang kata sandi",
      text: "Buka tautan berikut: https://contoh/reset-password?token=abc",
    });

    expect(result.transport).toBe("file");
    const files = await readdir(outbox);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.eml$/);

    const eml = await readFile(path.join(outbox, files[0]), "utf8");
    expect(eml).toContain("To: budi@example.co.id");
    expect(eml).toContain("Subject: Atur ulang kata sandi");
    expect(eml).toContain("reset-password?token=abc");
  });

  it("MAIL_TRANSPORT=smtp DIABAIKAN di luar produksi — tidak pernah mengirim sungguhan", async () => {
    // NODE_ENV vitest = "test"; inilah keadaan yang dijaga.
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_URL = "smtp://user:pass@smtp.example.com:587";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendMail({ to: "x@example.com", subject: "uji", text: "isi" });

    expect(result.transport).toBe("file");
    expect(await readdir(outbox)).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });
});
