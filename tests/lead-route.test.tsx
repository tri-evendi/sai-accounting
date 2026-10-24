/**
 * `POST /api/leads` dan layar `/register` yang tertutup — diuji LEWAT ROUTE &
 * HALAMAN ASLINYA (migration platform 0016).
 *
 * Route: pagar publiknya (JSON saja, pembatas laju per sidik IP & per nomor,
 * honeypot), bahwa "terima kasih" hanya dijawab bila barisnya tersimpan, dan
 * bahwa surel tim berjalan SESUDAH jawaban tanpa bisa menggagalkannya.
 *
 * Halaman: formulirnya tampil saat pendaftaran tertutup DAN tombol
 * WhatsApp/surel tetap ada di bawahnya sebagai jalan lain.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@sai/core/i18n/client";
import type { Dictionary } from "@sai/core/i18n/dictionary";
import id from "@sai/core/i18n/dictionaries/id.json";

const state = vi.hoisted(() => ({
  limits: {} as Record<string, boolean>,
  limitThrows: false,
  created: [] as Array<Record<string, unknown>>,
  createThrows: false,
  after: [] as Array<() => unknown>,
  mailTransport: "smtp" as "smtp" | "file",
  contactEmail: "sales@sai.id" as string | undefined,
  sent: [] as Array<{ to: string; subject: string }>,
  signupOpen: false,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    state.after.push(fn);
  },
}));

vi.mock("@/lib/rate-limit-persistent", () => ({
  PERSISTENT_RATE_LIMITS: { leadIp: { windowMs: 1, maxAttempts: 5 }, leadPhone: { windowMs: 1, maxAttempts: 3 } },
  checkPersistentRateLimit: async (key: string) => {
    if (state.limitThrows) throw new Error("kendali mati");
    const kind = key.split(":")[1]!;
    return { allowed: state.limits[kind] !== false, remaining: 1 };
  },
}));

vi.mock("@sai/platform/platform-db", () => ({
  platformDb: {
    leadRequest: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (state.createThrows) throw new Error("platform mati");
        state.created.push(args.data);
        return { id: state.created.length, reference: args.data.reference };
      },
    },
  },
}));

vi.mock("@sai/platform/i18n/server", () => ({
  getRequestI18n: async () => ({ t: (key: string) => key, dictionary: id, locale: "id" }),
  getT: async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}${JSON.stringify(values)}` : key,
  getLocale: async () => "id",
}));

vi.mock("@sai/platform/mailer", () => ({
  resolveMailConfig: async () => ({ transport: state.mailTransport }),
  sendMail: async (m: { to: string; subject: string }) => {
    state.sent.push(m);
    return { transport: "smtp", detail: "x" };
  },
}));

vi.mock("@sai/platform/site-settings", () => ({
  resolveContactChannels: async () => ({
    ...(state.contactEmail ? { email: state.contactEmail } : {}),
    whatsappUrl: "https://wa.me/628111222333",
  }),
  resolveSelfServeSignupOpen: async () => state.signupOpen,
}));

vi.mock("@sai/platform/landing-settings", () => ({
  landingSettings: async () => ({ demoBookingUrl: null }),
  resolveLandingWhatsappUrl: async () => "https://wa.me/628111222333?text=Halo",
}));

/* Kulit halaman autentikasi membawa pemilih bahasa (butuh router aplikasi);
   yang diuji di sini ISI layarnya, jadi kulitnya diganti pembungkus polos. */
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ heading, children }: { heading: string; children: React.ReactNode }) => (
    <section>
      <h1>{heading}</h1>
      {children}
    </section>
  ),
}));

const { POST } = await import("@/app/api/leads/route");

const VALID = {
  kind: "quote",
  name: "Budi Santoso",
  company: "PT Contoh Sejahtera",
  phone: "+62 812-3456-7890",
  email: "budi@contoh.co.id",
  legalForm: "pt",
  companyCount: "3",
  message: "Tiga PT, 8 pengguna.",
  consent: true,
  website: "",
  source: "quote",
};

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.limits = {};
  state.limitThrows = false;
  state.created = [];
  state.createThrows = false;
  state.after = [];
  state.mailTransport = "smtp";
  state.contactEmail = "sales@sai.id";
  state.sent = [];
  state.signupOpen = false;
});

describe("POST /api/leads", () => {
  it("isian sah → tersimpan (nomor dinormalkan, sidik IP bukan IP) → nomor rujukan", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reference).toMatch(/^SAI-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    expect(state.created).toHaveLength(1);
    const row = state.created[0]!;
    expect(row).toMatchObject({
      phone: "6281234567890",
      kind: "quote",
      legalForm: "pt",
      companyCount: 3,
      source: "quote",
      locale: "id",
    });
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
    expect(row.consentAt).toBeInstanceOf(Date);
  });

  it("surel tim dikirim SESUDAH jawaban, ke alamat kontak", async () => {
    await POST(req(VALID));
    expect(state.sent).toHaveLength(0);
    expect(state.after).toHaveLength(1);
    await state.after[0]!();
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]!.to).toBe("sales@sai.id");
  });

  it("surel belum disetel → barisnya TETAP tersimpan dan jawabannya tetap sukses", async () => {
    state.mailTransport = "file";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(state.created).toHaveLength(1);
    await state.after[0]!();
    expect(state.sent).toHaveLength(0);
    log.mockRestore();
  });

  it("honeypot terisi → dijawab sukses TANPA menyimpan atau mengirim apa pun", async () => {
    const res = await POST(req({ ...VALID, website: "http://spam.example" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reference: null });
    expect(state.created).toHaveLength(0);
    expect(state.after).toHaveLength(0);
  });

  it("bukan JSON → 415, tanpa menyentuh apa pun", async () => {
    const res = await POST(req("name=x", { "content-type": "application/x-www-form-urlencoded" }));
    expect(res.status).toBe(415);
    expect(state.created).toHaveLength(0);
  });

  it("isian tidak sah → 400 dengan galat per isian", async () => {
    const res = await POST(req({ ...VALID, phone: "12", consent: false }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(Object.keys(data.details.fieldErrors)).toEqual(expect.arrayContaining(["phone", "consent"]));
    expect(state.created).toHaveLength(0);
  });

  it("pembatas laju per IP → 429 SEBELUM validasi; per nomor → 429 sebelum menyimpan", async () => {
    state.limits.ip = false;
    expect((await POST(req({ garbage: true }))).status).toBe(429);
    state.limits = { phone: false };
    expect((await POST(req(VALID))).status).toBe(429);
    expect(state.created).toHaveLength(0);
  });

  it("pembatas laju tak terjangkau → 503 (gagal-tertutup, bukan diam-diam mengizinkan)", async () => {
    state.limitThrows = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(req(VALID))).status).toBe(503);
    err.mockRestore();
  });

  it("gagal menyimpan → 503, tidak pernah 'terima kasih' palsu", async () => {
    state.createThrows = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req(VALID));
    expect(res.status).toBe(503);
    expect(state.after).toHaveLength(0);
    err.mockRestore();
  });
});

describe("/register saat pendaftaran tertutup", { timeout: 30_000 }, () => {
  async function render(params: Record<string, string> = {}) {
    const { default: RegisterPage } = await import("@/app/(app)/(auth)/register/page");
    const tree = await RegisterPage({ searchParams: Promise.resolve(params) });
    return renderToStaticMarkup(
      <LocaleProvider locale="id" dictionary={id as Dictionary}>
        {tree}
      </LocaleProvider>
    );
  }

  it("formulir tampil; tombol WhatsApp & surel TETAP ada di bawahnya", async () => {
    const html = await render();
    expect(html).toContain('aria-label="Formulir permintaan demo atau penawaran"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('id="lead-consent"');
    /* honeypot ada, tersembunyi dari pembaca layar dan Tab */
    expect(html).toMatch(/<input[^>]*id="lead-website"[^>]*tabindex="-1"/);
    expect(html.indexOf("auth.lead.orContact")).toBeGreaterThan(html.indexOf('name="phone"'));
    expect(html).toContain('href="https://wa.me/628111222333?text=Halo"');
    expect(html).toContain('href="mailto:sales@sai.id"');
  });

  it("?quote=1 memilih 'Penawaran harga' sebagai kebutuhan bawaan", async () => {
    const html = await render({ quote: "1" });
    expect(html).toContain('name="kind" value="quote"');
    expect(await render()).toContain('name="kind" value="demo"');
  });
});
