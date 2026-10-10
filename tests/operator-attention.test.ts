/**
 * Penjaga daftar "PERLU DITANGANI" di ringkasan konsol operator.
 *
 * Yang dijaga bukan "daftarnya bagus" — itu tidak bisa diperiksa mesin.
 * Yang dijaga tiga aturan yang kalau hilang membuat daftarnya berhenti menjawab
 * pertanyaan yang membuatnya ada (`pages/operator.md`: *"kecepatan menjawab
 * 'apa yang perlu ditangani hari ini'"*):
 *
 *   1. **nol tidak punya baris** — begitu angka nol ikut masuk, daftarnya
 *      kembali menjadi enam belas ubin berbobot sama yang baru saja dibongkar;
 *   2. **penjadwal di atas** — ia MENJELASKAN baris lain, dan daftar yang
 *      menaruhnya di bawah membuat orang menindaklanjuti gejala;
 *   3. **tiap baris punya tujuan**, kecuali satu yang memang tidak boleh punya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  attentionItems,
  SCHEDULER_STALE_MINUTES,
  type AttentionInput,
} from "@/lib/operator/attention";
import { SCHEDULER_STALE_AFTER_MINUTES } from "@/lib/scheduler-heartbeat";

const SEKARANG = new Date("2026-10-11T08:00:00.000Z");

/** Keadaan paling tenang yang mungkin: tidak ada apa pun yang menuntut. */
function tenang(): AttentionInput {
  return {
    control: { byStatus: { active: 12 }, trialsEndingSoon: 0, trialsExpired: 0 },
    platform: {
      overdueInvoices: 0,
      lastRun: { finishedAt: new Date(SEKARANG.getTime() - 5 * 60_000), status: "ok", errorCount: 0 },
    },
  };
}

describe("nol tidak punya baris", () => {
  it("semuanya nol → daftar KOSONG, bukan enam baris nol", () => {
    expect(attentionItems(tenang(), SEKARANG)).toEqual([]);
  });

  it("satu angka naik → tepat satu baris", () => {
    const input = tenang();
    input.control.trialsExpired = 3;
    const items = attentionItems(input, SEKARANG);
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("trialsExpired");
    expect(items[0].count).toBe(3);
  });

  it("status yang tidak dikenal di `byStatus` tidak melahirkan baris", () => {
    const input = tenang();
    input.control.byStatus = { active: 9, pending_setup: 4 };
    expect(attentionItems(input, SEKARANG)).toEqual([]);
  });
});

describe("penjadwal berdiri paling atas", () => {
  it("belum pernah jalan → baris pertama, dan ia `danger`", () => {
    const input = tenang();
    input.platform!.lastRun = null;
    input.control.trialsExpired = 9;
    input.platform!.overdueInvoices = 4;
    const items = attentionItems(input, SEKARANG);
    expect(items[0].key).toBe("schedulerNever");
    expect(items[0].tone).toBe("danger");
    /* Baris lain tetap ada — penjadwal menjelaskan, bukan menyembunyikan. */
    expect(items.map((i) => i.key)).toContain("trialsExpired");
  });

  it("putaran terakhir bergalat → satu baris, membawa jumlah galatnya", () => {
    const input = tenang();
    input.platform!.lastRun = {
      finishedAt: new Date(SEKARANG.getTime() - 60_000),
      status: "ok",
      errorCount: 2,
    };
    const items = attentionItems(input, SEKARANG);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "schedulerFailing", count: 2 });
  });

  it("putaran terakhir BASI (lewat ambang) → baris yang sama", () => {
    const input = tenang();
    input.platform!.lastRun = {
      finishedAt: new Date(SEKARANG.getTime() - (SCHEDULER_STALE_MINUTES + 1) * 60_000),
      status: "ok",
      errorCount: 0,
    };
    expect(attentionItems(input, SEKARANG).map((i) => i.key)).toEqual(["schedulerFailing"]);
  });

  it("tepat DI ambang belum basi — batasnya '>', bukan '>='", () => {
    const input = tenang();
    input.platform!.lastRun = {
      finishedAt: new Date(SEKARANG.getTime() - SCHEDULER_STALE_MINUTES * 60_000),
      status: "ok",
      errorCount: 0,
    };
    expect(attentionItems(input, SEKARANG)).toEqual([]);
  });

  it("basi DAN bergalat tetap SATU baris — tindakannya satu", () => {
    const input = tenang();
    input.platform!.lastRun = {
      finishedAt: new Date(SEKARANG.getTime() - 10 * 60 * 60_000),
      status: "error",
      errorCount: 3,
    };
    expect(attentionItems(input, SEKARANG)).toHaveLength(1);
  });

  it("platform MATI → tidak ada baris penjadwal sama sekali", () => {
    /* Halaman sudah mengatakan "tak terjangkau" sebagai kalimat tersendiri;
       baris "penjadwal tak diketahui" di sini hanya mengulangnya. */
    const input = tenang();
    input.platform = null;
    input.control.trialsExpired = 2;
    expect(attentionItems(input, SEKARANG).map((i) => i.key)).toEqual(["trialsExpired"]);
  });
});

describe("urutan = urutan mendesaknya", () => {
  it("enam keadaan sekaligus berurut sebagaimana tertulis di kepala modul", () => {
    const items = attentionItems(
      {
        control: {
          byStatus: { past_due: 2, suspended: 1, cancelled: 1 },
          trialsEndingSoon: 5,
          trialsExpired: 9,
        },
        platform: { overdueInvoices: 4, lastRun: null },
      },
      SEKARANG
    );
    expect(items.map((i) => i.key)).toEqual([
      "schedulerNever",
      "trialsExpired",
      "invoicesOverdue",
      "tenantsPastDue",
      "tenantsSuspended",
      "trialsEndingSoon",
    ]);
  });

  it("uji coba yang AKAN berakhir berdiri paling bawah, dan ia bukan bahaya", () => {
    const input = tenang();
    input.control.trialsEndingSoon = 5;
    const items = attentionItems(input, SEKARANG);
    expect(items).toHaveLength(1);
    expect(items[0].tone).toBe("info");
  });
});

describe("tiap baris punya tujuan — kecuali yang memang tidak boleh", () => {
  it("buku terkunci menjumlahkan DUA status, jadi ia TANPA `href`", () => {
    /* Saringan daftar tenant hanya menerima satu status; menautkannya akan
       mendaratkan orang di daftar yang jumlahnya berbeda dari angka yang baru
       saja ia tekan. */
    const input = tenang();
    input.control.byStatus = { suspended: 3, cancelled: 2 };
    const items = attentionItems(input, SEKARANG);
    expect(items[0]).toMatchObject({ key: "tenantsSuspended", count: 5 });
    expect(items[0].href).toBeUndefined();
  });

  it("baris lain semuanya membawa `href`", () => {
    const items = attentionItems(
      {
        control: { byStatus: { past_due: 1 }, trialsEndingSoon: 1, trialsExpired: 1 },
        platform: { overdueInvoices: 1, lastRun: null },
      },
      SEKARANG
    );
    for (const item of items) {
      expect(item.href, item.key).toBeTruthy();
    }
  });
});

describe("kamus & ambang", () => {
  const dict = JSON.parse(
    readFileSync(join(__dirname, "..", "src/lib/i18n/dictionaries/id.json"), "utf8")
  ) as { operator: { attention: Record<string, string> } };

  it("setiap kunci baris punya label DAN kalimat sebabnya", () => {
    /* Baris tanpa "kenapa" adalah angka lain di layar yang sudah penuh angka:
       yang membuatnya bisa ditindaklanjuti justru kalimat keduanya. */
    const semua = attentionItems(
      {
        control: { byStatus: { past_due: 1, suspended: 1 }, trialsEndingSoon: 1, trialsExpired: 1 },
        platform: { overdueInvoices: 1, lastRun: null },
      },
      SEKARANG
    ).map((i) => i.key);
    /* `schedulerFailing` tidak bisa muncul bersama `schedulerNever`; ia
       diperiksa terpisah supaya daftar kuncinya tetap lengkap. */
    for (const key of [...semua, "schedulerFailing"]) {
      expect(dict.operator.attention[key], `label ${key}`).toBeTruthy();
      expect(dict.operator.attention[`${key}Why`], `sebab ${key}`).toBeTruthy();
    }
    expect(dict.operator.attention.allClear).toBeTruthy();
  });

  it("ambang basi adalah ambang DENYUT, bukan salinan kedua", () => {
    /* Dua ambang untuk satu pertanyaan ("apakah penjadwal masih hidup?")
       berarti /api/health dan konsol bisa berbeda pendapat tentang mesin yang
       sama. Penjaganya identitas, bukan kesamaan angka: kalau #373 mengubah
       ambangnya, konsol ikut berubah tanpa ada yang harus ingat. */
    expect(SCHEDULER_STALE_MINUTES).toBe(SCHEDULER_STALE_AFTER_MINUTES);
    const src = readFileSync(join(__dirname, "..", "src/lib/operator/attention.ts"), "utf8");
    expect(src).toContain('from "@/lib/scheduler-heartbeat"');
  });
});
