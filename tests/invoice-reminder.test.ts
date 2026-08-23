/**
 * Pengingat jatuh tempo KE PELANGGAN (issue #467) — sifat yang dikunci.
 *
 * Fitur ini satu-satunya di buku yang berbicara ke ORANG LUAR atas nama
 * pengguna, jadi yang diuji di sini bukan "apakah ia mengirim" melainkan
 * terutama **kapan ia TIDAK mengirim**:
 *
 *   • menyalakan fitur tidak menyapu tunggakan lama (jendela toleransi);
 *   • satu titik untuk satu tanggal jatuh tempo berbunyi TEPAT SEKALI;
 *   • faktur tanpa jatuh tempo atau tanpa alamat surel dilewati dengan tenang;
 *   • jatuh tempo yang DIUBAH melahirkan kunci baru — dan itu memang benar.
 */
import { describe, expect, it } from "vitest";

import {
  GRACE_DAYS,
  REMINDER_POINTS,
  buildReminderMessage,
  dueKeyOf,
  parseReminderPoints,
  planInvoiceReminders,
  reminderKey,
  serializeReminderPoints,
  type ReminderCandidate,
} from "@/lib/invoice-reminder";
import id from "@/lib/i18n/dictionaries/id.json";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const invoice = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  invoiceId: 1,
  dueDate: day("2026-08-20"),
  email: "pelanggan@contoh.co.id",
  ...over,
});

const plan = (today: string, candidates: ReminderCandidate[], sudahTerkirim?: Set<string>) =>
  planInvoiceReminders({
    candidates,
    today: day(today),
    points: REMINDER_POINTS,
    sudahTerkirim,
  });

describe("titik pengingat", () => {
  it("H-3 berbunyi tepat tiga hari sebelum jatuh tempo", () => {
    expect(plan("2026-08-17", [invoice()]).map((p) => p.point)).toEqual(["before_3"]);
  });

  it("H+1 dan H+7 berbunyi pada harinya masing-masing, tidak bertumpuk", () => {
    expect(plan("2026-08-21", [invoice()]).map((p) => p.point)).toEqual(["after_1"]);
    expect(plan("2026-08-27", [invoice()]).map((p) => p.point)).toEqual(["after_7"]);
  });

  it("hari jatuh tempo itu sendiri TIDAK berbunyi — itu bukan salah satu titiknya", () => {
    expect(plan("2026-08-20", [invoice()])).toEqual([]);
  });

  it("jam tidak menentukan apa pun — perbandingannya per HARI", () => {
    const sore = new Date("2026-08-17T23:59:00.000Z");
    const hasil = planInvoiceReminders({
      candidates: [invoice()],
      today: sore,
      points: REMINDER_POINTS,
    });
    expect(hasil.map((p) => p.point)).toEqual(["before_3"]);
  });
});

describe("jendela toleransi — penjaga hari pertama", () => {
  it("penjadwal yang mati semalam tidak menghanguskan pengingatnya", () => {
    // H-3 jatuh 17 Agu; 18 dan 19 masih di dalam jendela.
    expect(plan("2026-08-18", [invoice()]).map((p) => p.point)).toEqual(["before_3"]);
    expect(plan("2026-08-19", [invoice()]).map((p) => p.point)).toEqual(["before_3"]);
  });

  it("di luar jendela ia HILANG, bukan menumpuk", () => {
    // 17 + GRACE_DAYS = 19; 20 sudah lewat, dan 20 juga bukan titik mana pun.
    expect(GRACE_DAYS).toBe(2);
    expect(plan("2026-08-20", [invoice()])).toEqual([]);
  });

  it("MENYALAKAN FITUR TIDAK MENYAPU TUNGGAKAN LAMA — sifat terpenting di sini", () => {
    /* Buku dengan 80 faktur yang jatuh tempo berbulan-bulan lalu. Tanpa
       jendela, putaran pertama akan mengirim ratusan surel ke pelanggan
       sungguhan dalam satu tekanan tombol. */
    const lama = Array.from({ length: 80 }, (_, i) =>
      invoice({ invoiceId: i + 1, dueDate: day("2026-04-15") })
    );
    expect(plan("2026-08-23", lama)).toEqual([]);
  });
});

describe("yang dilewati dengan tenang", () => {
  it("faktur tanpa tanggal jatuh tempo tidak pernah diingatkan", () => {
    // Tanggal yang dikarang berarti menuduh pelanggan terlambat terhadap
    // kesepakatan yang tidak pernah ada.
    expect(plan("2026-08-17", [invoice({ dueDate: null })])).toEqual([]);
  });

  it("pelanggan tanpa alamat surel dilewati — alamatnya tidak pernah ditebak", () => {
    expect(plan("2026-08-17", [invoice({ email: null })])).toEqual([]);
    expect(plan("2026-08-17", [invoice({ email: "   " })])).toEqual([]);
  });
});

describe("idempotensi", () => {
  it("yang sudah pernah terkirim tidak diusulkan lagi", () => {
    const sudah = new Set([reminderKey(1, "before_3", "2026-08-20")]);
    expect(plan("2026-08-17", [invoice()], sudah)).toEqual([]);
  });

  it("kunci memakai TANGGAL JATUH TEMPO, bukan hari ini — jadi tak berulang harian", () => {
    const [rencana] = plan("2026-08-18", [invoice()]);
    expect(rencana.dueKey).toBe("2026-08-20");
    expect(dueKeyOf(day("2026-08-20"))).toBe("2026-08-20");
  });

  it("jatuh tempo yang DIUBAH melahirkan kunci baru — dan itu memang benar", () => {
    const sudah = new Set([reminderKey(1, "before_3", "2026-08-20")]);
    const digeser = invoice({ dueDate: day("2026-09-10") });
    expect(plan("2026-09-07", [digeser], sudah).map((p) => p.dueKey)).toEqual(["2026-09-10"]);
  });
});

describe("daftar titik aktif", () => {
  it("kosong/NULL = SEMUA titik (pola enabled_modules)", () => {
    expect(parseReminderPoints(null).map((p) => p.key)).toEqual(["before_3", "after_1", "after_7"]);
    expect(parseReminderPoints("  ").map((p) => p.key)).toEqual(["before_3", "after_1", "after_7"]);
  });

  it("token asing DIABAIKAN, tidak menjatuhkan yang lain", () => {
    expect(parseReminderPoints("before_3,ngawur,after_7").map((p) => p.key)).toEqual([
      "before_3",
      "after_7",
    ]);
  });

  it("hanya titik yang dipilih yang berbunyi", () => {
    const hasil = planInvoiceReminders({
      candidates: [invoice()],
      today: day("2026-08-21"),
      points: parseReminderPoints("before_3"),
    });
    expect(hasil).toEqual([]);
  });

  it("bentuk simpannya selalu urutan deklarasi, jadi kolomnya stabil", () => {
    expect(serializeReminderPoints(["after_7", "before_3"])).toBe("before_3,after_7");
    expect(serializeReminderPoints(["ngawur"])).toBe("");
  });
});

describe("kalimatnya", () => {
  const pesan = (point: "before_3" | "after_1" | "after_7") =>
    buildReminderMessage({
      dictionary: id,
      point,
      invoiceNo: "INV/2026/08/1",
      customerName: "PT Contoh",
      amountText: "Rp 5.500.000",
      dueDateText: "20 Agustus 2026",
      companyName: "PT Penjual",
    });

  it("menyebut nomor, nominal, dan tanggalnya — bukan ringkasan", () => {
    const { subject, text } = pesan("after_1");
    expect(subject).toContain("INV/2026/08/1");
    expect(text).toContain("Rp 5.500.000");
    expect(text).toContain("20 Agustus 2026");
    expect(text).toContain("PT Contoh");
    expect(text.trimEnd().endsWith("PT Penjual")).toBe(true);
  });

  it("tiga titik = tiga kalimat berbeda; tak satu pun mengancam", () => {
    const teks = (["before_3", "after_1", "after_7"] as const).map((p) => pesan(p).text);
    expect(new Set(teks).size).toBe(3);
    for (const t of teks) {
      expect(t).not.toMatch(/denda|sanksi|hukum|tuntut/i);
      // Nada dijaga: setiap pengingat menyediakan jalan keluar yang sopan.
      expect(t.length).toBeGreaterThan(40);
    }
  });

  it("H-3 dan H+1 mempersilakan mengabaikan bila sudah dibayar", () => {
    expect(pesan("before_3").text).toMatch(/abaikan/i);
    expect(pesan("after_1").text).toMatch(/abaikan/i);
  });
});
