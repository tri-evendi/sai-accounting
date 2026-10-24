/**
 * PERMINTAAN PENAWARAN / DEMO dari halaman publik (`lead_requests`, migration
 * platform 0016) — aturan murni, skema formulir, penyimpanan, surel ke tim,
 * dan retensi.
 *
 * Yang dijaga di sini adalah hal-hal yang kegagalannya DIAM: nomor yang
 * ditebak (pesan ke orang lain), rujukan kembar (dua prospek satu nomor),
 * surel tim yang menggagalkan permintaan, atau data pribadi yang tidak pernah
 * dikosongkan.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  LEAD_REFERENCE_PATTERN,
  LEAD_TRANSITIONS,
  appendLeadNote,
  generateLeadReference,
  leadRetentionCutoffs,
  leadTransitionAllowed,
  normalizeLeadReference,
  sanitizeLeadSource,
} from "@sai/core/lead-request";
import { applyLeadRetention, LEAD_RETENTION_ACTOR } from "@sai/platform/lead-retention";
import {
  createLeadRequest,
  hashClientIp,
  leadNotificationMail,
  notifyTeamOfLead,
  type LeadCreateClient,
  type StoredLead,
} from "@/lib/lead-intake";
import { toLeadRecord } from "@/lib/lead-record";
import { emptyLeadForm, leadFormSchema, type LeadFormInput } from "@/lib/validations/lead";

function isian(over: Partial<LeadFormInput> = {}): LeadFormInput {
  return {
    ...emptyLeadForm("demo", "contact_page"),
    name: "Budi Santoso",
    company: "PT Contoh Sejahtera",
    phone: "0812-3456-7890",
    consent: true,
    ...over,
  };
}

function galat(over: Partial<LeadFormInput> | Record<string, unknown>): string[] {
  const r = leadFormSchema.safeParse({ ...isian(), ...over });
  return r.success ? [] : r.error.issues.map((i) => String(i.path[0]));
}

describe("skema formulir — satu skema untuk formulir dan route", () => {
  it("isian minimal (nama, perusahaan, nomor, persetujuan) lolos", () => {
    expect(leadFormSchema.safeParse(isian()).success).toBe(true);
  });

  it("nama, perusahaan, dan nomor wajib", () => {
    expect(galat({ name: "  " })).toContain("name");
    expect(galat({ company: "" })).toContain("company");
    expect(galat({ phone: "" })).toContain("phone");
  });

  it("nomor Indonesia dalam berbagai gaya diterima; yang ditebak ditolak", () => {
    for (const ok of ["0812-3456-7890", "+62 812 3456 7890", "62 812 3456 7890", "81234567890"]) {
      expect(galat({ phone: ok }), ok).toEqual([]);
    }
    for (const bad of ["12345", "0812 ext 4", "+62 0812 3456 7890", "0812/+62813", "abc"]) {
      expect(galat({ phone: bad }), bad).toContain("phone");
    }
    expect(galat({ phone: "0".repeat(31) })).toContain("phone");
  });

  it("surel opsional — kosong boleh, salah bentuk ditolak", () => {
    expect(galat({ email: "" })).toEqual([]);
    expect(galat({ email: "budi@contoh.co.id" })).toEqual([]);
    expect(galat({ email: "budi@" })).toContain("email");
    expect(galat({ email: `${"a".repeat(190)}@x.id` })).toContain("email");
  });

  it("persetujuan dihubungi WAJIB (UU PDP)", () => {
    expect(galat({ consent: false as unknown as true })).toContain("consent");
  });

  it("batas panjang: nama, perusahaan, pesan", () => {
    expect(galat({ name: "a".repeat(101) })).toContain("name");
    expect(galat({ company: "a".repeat(151) })).toContain("company");
    expect(galat({ message: "a".repeat(2001) })).toContain("message");
    expect(galat({ message: "a".repeat(2000) })).toEqual([]);
  });

  it("jumlah perusahaan: kosong atau 1–1000", () => {
    expect(galat({ companyCount: "" })).toEqual([]);
    expect(galat({ companyCount: "12" })).toEqual([]);
    for (const bad of ["0", "1001", "-1", "2,5", "dua"]) expect(galat({ companyCount: bad }), bad).toContain("companyCount");
  });

  it("jenis & bentuk usaha hanya dari kosakata", () => {
    expect(galat({ kind: "lainnya" })).toContain("kind");
    expect(galat({ legalForm: "koperasi" })).toContain("legalForm");
    expect(galat({ legalForm: "pt_perorangan" })).toEqual([]);
  });

  it("honeypot DITERIMA skema (route yang menolaknya diam-diam), tapi dibatasi panjangnya", () => {
    expect(galat({ website: "http://spam.example" })).toEqual([]);
    expect(galat({ website: "x".repeat(201) })).toContain("website");
  });
});

describe("toLeadRecord — server tidak mempercayai isian", () => {
  it("nomor dinormalkan, surel dikecilkan, kosong → null, angka → number", () => {
    const r = toLeadRecord(isian({ email: "Budi@Contoh.CO.ID", companyCount: "3", legalForm: "cv" }));
    expect(r).toMatchObject({
      phone: "6281234567890",
      email: "budi@contoh.co.id",
      companyCount: 3,
      legalForm: "cv",
      message: null,
      source: "contact_page",
    });
    expect(toLeadRecord(isian()).email).toBeNull();
    expect(toLeadRecord(isian()).legalForm).toBeNull();
  });

  it("karakter kendali dibuang; baris baru di pesan dipertahankan", () => {
    const r = toLeadRecord(
      isian({ name: "Budi\u0000\u0007 Santoso", message: "baris 1\r\nbaris 2\u0000" })
    );
    expect(r.name).toBe("Budi Santoso");
    expect(r.message).toBe("baris 1\nbaris 2");
  });

  it("sumber disaring — teks URL yang aneh jatuh ke sumber bawaan", () => {
    expect(toLeadRecord(isian({ source: "hero_cta" })).source).toBe("hero_cta");
    expect(toLeadRecord(isian({ source: "<script>" })).source).toBe("contact_page");
    expect(toLeadRecord(isian({ source: "" }), "quote").source).toBe("quote");
  });
});

describe("aturan murni", () => {
  it("sanitizeLeadSource", () => {
    expect(sanitizeLeadSource("Pricing-Card")).toBe("pricing-card");
    expect(sanitizeLeadSource("a b")).toBeNull();
    expect(sanitizeLeadSource("x".repeat(41))).toBeNull();
    expect(sanitizeLeadSource(["a"])).toBeNull();
  });

  it("nomor rujukan: SAI- + 6 huruf tanpa huruf yang mirip", () => {
    const seen = new Set<string>();
    const acak = (n: number) => new Uint8Array(randomBytes(n));
    for (let i = 0; i < 500; i++) {
      const ref = generateLeadReference(acak);
      expect(ref).toMatch(LEAD_REFERENCE_PATTERN);
      expect(ref.slice(4)).not.toMatch(/[01ILOU]/);
      seen.add(ref);
    }
    expect(seen.size).toBeGreaterThan(490);
    expect(normalizeLeadReference(" sai-7k3m9q ")).toBe("SAI-7K3M9Q");
    expect(normalizeLeadReference("SAI-7K3M9")).toBeNull();
  });

  it("peralihan status: spam dari mana pun, selesai bisa dibuka lagi, tidak kembali ke baru kecuali dari spam", () => {
    expect(leadTransitionAllowed("baru", "dihubungi")).toBe(true);
    expect(leadTransitionAllowed("dihubungi", "selesai")).toBe(true);
    expect(leadTransitionAllowed("selesai", "dihubungi")).toBe(true);
    expect(leadTransitionAllowed("spam", "baru")).toBe(true);
    for (const s of ["baru", "dihubungi", "selesai"] as const) expect(LEAD_TRANSITIONS[s]).toContain("spam");
    expect(leadTransitionAllowed("dihubungi", "baru")).toBe(false);
    expect(leadTransitionAllowed("selesai", "baru")).toBe(false);
    expect(leadTransitionAllowed("baru", "baru")).toBe(false);
    expect(leadTransitionAllowed("baru", "hilang")).toBe(false);
  });

  it("catatan: terbaru di atas, berstempel; yang tertua dibuang bila melampaui batas", () => {
    const at = new Date("2026-10-25T03:04:00Z");
    const a = appendLeadNote(null, { operator: "vyn", text: "sudah ditelepon", at });
    expect(a).toBe("[2026-10-25 03:04 UTC · vyn] sudah ditelepon");
    const b = appendLeadNote(a, { operator: "ana", text: "demo Kamis", at });
    expect(b.split("\n")[0]).toContain("demo Kamis");
    let panjang: string | null = null;
    for (let i = 0; i < 20; i++) panjang = appendLeadNote(panjang, { operator: "x", text: "y".repeat(400), at });
    expect(panjang!.length).toBeLessThanOrEqual(4000);
  });

  it("batas retensi: 12 bulan untuk yang ditutup, 24 bulan untuk yang terbengkalai", () => {
    const { closedBefore, openBefore } = leadRetentionCutoffs(new Date("2026-10-25T00:00:00Z"));
    expect(closedBefore.toISOString()).toBe("2025-10-25T00:00:00.000Z");
    expect(openBefore.toISOString()).toBe("2024-10-25T00:00:00.000Z");
  });
});

/* ───────────────────────────── Penyimpanan ─────────────────────────────── */

function klienPalsu(tabrakan = 0) {
  const refs = new Set<string>();
  const calls: unknown[] = [];
  let sisa = tabrakan;
  const client: LeadCreateClient = {
    leadRequest: {
      create: vi.fn(async (args) => {
        calls.push(args.data);
        if (sisa > 0 || refs.has(args.data.reference)) {
          sisa--;
          throw Object.assign(new Error("Unique constraint"), { code: "P2002", meta: { target: ["reference"] } });
        }
        refs.add(args.data.reference);
        return { id: refs.size, reference: args.data.reference };
      }),
    },
  };
  return { client, calls, refs };
}

describe("createLeadRequest — rujukan unik, persetujuan dicap", () => {
  const record = toLeadRecord(isian());

  it("menyimpan dengan rujukan, consent_at = sekarang, sidik IP, bahasa", async () => {
    const { client, calls } = klienPalsu();
    const now = new Date("2026-10-25T05:00:00Z");
    const lead = await createLeadRequest(client, record, { ipHash: "ab".repeat(32), locale: "id" }, { now });
    expect(lead.reference).toMatch(LEAD_REFERENCE_PATTERN);
    expect(calls[0]).toMatchObject({ consentAt: now, ipHash: "ab".repeat(32), locale: "id", phone: "6281234567890" });
  });

  it("rujukan yang bertabrakan dicoba ulang dengan nomor baru", async () => {
    const { client, calls } = klienPalsu(2);
    const lead = await createLeadRequest(client, record, { ipHash: null, locale: null });
    expect(calls).toHaveLength(3);
    expect(lead.reference).toMatch(LEAD_REFERENCE_PATTERN);
  });

  it("dua permintaan dengan pembangkit yang sama tetap mendapat rujukan BERBEDA", async () => {
    const { client } = klienPalsu();
    const tetap = (n: number) => new Uint8Array(n).fill(7);
    let k = 0;
    const kadang = (n: number) => (k++ < 2 ? tetap(n) : new Uint8Array(n).fill(9));
    const a = await createLeadRequest(client, record, { ipHash: null, locale: null }, { randomBytes: kadang });
    const b = await createLeadRequest(client, record, { ipHash: null, locale: null }, { randomBytes: kadang });
    expect(a.reference).not.toBe(b.reference);
  });

  it("tabrakan terus-menerus → melempar (route menjawab 503, bukan 'terima kasih' palsu)", async () => {
    const { client } = klienPalsu(99);
    await expect(createLeadRequest(client, record, { ipHash: null, locale: null })).rejects.toThrow(/bertabrakan/);
  });

  it("galat lain TIDAK dicoba ulang", async () => {
    const create = vi.fn(async () => {
      throw new Error("koneksi putus");
    });
    await expect(
      createLeadRequest({ leadRequest: { create } } as unknown as LeadCreateClient, record, { ipHash: null, locale: null })
    ).rejects.toThrow("koneksi putus");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("sidik IP: berkunci, deterministik, bukan alamatnya", () => {
    const a = hashClientIp("203.0.113.7", "k1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(hashClientIp("203.0.113.7", "k1"));
    expect(a).not.toBe(hashClientIp("203.0.113.7", "k2"));
    expect(a).not.toContain("203");
  });
});

/* ───────────────────────────── Surel ke tim ───────────────────────────── */

const LEAD: StoredLead = {
  ...toLeadRecord(isian({ message: "Kami punya 3 PT", companyCount: "3" })),
  id: 1,
  reference: "SAI-7K3M9Q",
  createdAt: new Date("2026-10-25T05:00:00Z"),
};

function mailDeps(over: { to?: string; transport?: "smtp" | "file"; fail?: boolean } = {}) {
  const sendMail = vi.fn(async () => {
    if (over.fail) throw new Error("SMTP menolak");
    return { transport: "smtp" as const, detail: "id-1" };
  });
  return {
    sendMail,
    deps: {
      recipient: async () => ("to" in over ? over.to : "sales@sai.id"),
      resolveMailConfig: async () => ({ transport: over.transport ?? "smtp" }) as never,
      sendMail,
    },
  };
}

describe("notifyTeamOfLead — surel tim tidak pernah menggagalkan permintaan", () => {
  it("SMTP tersetel + alamat ada → terkirim ke alamat kontak, berisi rujukan", async () => {
    const { deps, sendMail } = mailDeps();
    expect(await notifyTeamOfLead(deps, LEAD)).toBe("sent");
    const pesan = (sendMail.mock.calls[0] as unknown as [{ to: string; subject: string; text: string }])[0];
    expect(pesan.to).toBe("sales@sai.id");
    expect(pesan.subject).toContain("SAI-7K3M9Q");
    expect(pesan.text).toContain("+6281234567890");
    expect(pesan.text).toContain("Kami punya 3 PT");
  });

  it("tanpa alamat kontak → dilewati diam-diam", async () => {
    const { deps, sendMail } = mailDeps({ to: undefined });
    expect(await notifyTeamOfLead(deps, LEAD)).toBe("skipped_no_recipient");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("surel belum disetel (transport file) → dilewati, tidak menulis data pribadi ke berkas", async () => {
    const { deps, sendMail } = mailDeps({ transport: "file" });
    expect(await notifyTeamOfLead(deps, LEAD)).toBe("skipped_mail_not_configured");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("SMTP gagal → 'failed', tidak melempar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = mailDeps({ fail: true });
    await expect(notifyTeamOfLead(deps, LEAD)).resolves.toBe("failed");
    spy.mockRestore();
  });

  it("pesan prospek masuk sebagai TEKS, bukan HTML", () => {
    const m = leadNotificationMail({ ...LEAD, message: "<b>halo</b>" });
    expect(m).not.toHaveProperty("html");
    expect(m.text).toContain("<b>halo</b>");
  });
});

/* ───────────────────────────── Retensi ─────────────────────────────────── */

describe("applyLeadRetention — UU PDP", () => {
  it("menganonimkan selesai/spam > 12 bulan dan yang terbengkalai > 24 bulan (lalu menutupnya)", async () => {
    const updateMany = vi.fn(async () => ({ count: 2 }));
    const now = new Date("2026-10-25T00:00:00Z");
    const r = await applyLeadRetention({ leadRequest: { updateMany } }, now);
    expect(r).toEqual({ closed: 2, abandoned: 2 });
    const [tutup, terbengkalai] = updateMany.mock.calls as unknown as [
      [{ where: Record<string, unknown>; data: Record<string, unknown> }],
      [{ where: Record<string, unknown>; data: Record<string, unknown> }],
    ];
    expect(tutup[0].where).toMatchObject({
      anonymizedAt: null,
      status: { in: ["selesai", "spam"] },
      handledAt: { lt: new Date("2025-10-25T00:00:00Z") },
    });
    expect(tutup[0].data).toMatchObject({ phone: "", email: null, message: null, notes: null, ipHash: null, anonymizedAt: now });
    expect(tutup[0].data).not.toHaveProperty("status");
    expect(terbengkalai[0].where).toMatchObject({
      status: { in: ["baru", "dihubungi"] },
      createdAt: { lt: new Date("2024-10-25T00:00:00Z") },
    });
    expect(terbengkalai[0].data).toMatchObject({ status: "selesai", handledBy: LEAD_RETENTION_ACTOR, handledAt: now });
  });
});
