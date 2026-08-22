/**
 * Kabar "faktur jatuh tempo" (tindak lanjut #416 — pusat pemberitahuan).
 *
 * Yang diuji di sini bukan bahwa kalimatnya bagus, melainkan tiga sifat yang
 * kalau rusak akan rusak dengan SUNYI:
 *
 *   1. **Cadensi.** Bentuk `dedupeKey` adalah satu-satunya yang menahan
 *      produser per-jam supaya tidak mengomel. Kunci yang tanpa sengaja memuat
 *      tanggal HARI INI berarti 24 kabar sehari, dan tak satu pun tes yang
 *      melihat isi kalimat akan menangkapnya.
 *   2. **Batas jendela.** "Akan jatuh tempo" dan "sudah lewat" harus bertemu
 *      persis di tanggal jatuh temponya — tanpa celah (hari yang tak
 *      diberitakan sama sekali) dan tanpa tumpang tindih (satu faktur dua kabar).
 *   3. **Kejujuran angka.** Faktur valas tanpa kurs tidak punya nilai rupiah;
 *      menjumlahkannya pada face value adalah bug yang sudah pernah diperbaiki
 *      di halaman Piutang (#35) dan tidak boleh lahir kembali lewat kotak masuk.
 */
import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS } from "@/lib/notifications";
import {
  DUE_SOON_DAYS,
  INVOICE_DUE_KINDS,
  hariKunci,
  pekanKunci,
  planInvoiceDueDigests,
  type DueInvoiceRow,
} from "@/lib/invoice-due-digest";

const HARI_INI = new Date(2026, 7, 25); // 25 Agu 2026, Selasa

/** Tanggal N hari dari `HARI_INI` (negatif = ke belakang). */
const geser = (hari: number) => new Date(2026, 7, 25 + hari);

function faktur(over: Partial<DueInvoiceRow> = {}): DueInvoiceRow {
  return {
    documentNo: "INV-001",
    partyName: "CV Maju",
    dueDate: HARI_INI,
    outstandingBase: 1_000_000,
    status: "unpaid",
    ...over,
  };
}

function rencana(invoices: DueInvoiceRow[], asOf: Date = HARI_INI) {
  return planInvoiceDueDigests({
    companyId: 8,
    companyName: "PT Saro",
    basePath: "/t/acme/pt-saro",
    invoices,
    asOf,
  });
}

describe("kosakata jenis", () => {
  it("setiap jenis yang diterbitkan modul ini dikenal pusat pemberitahuan", () => {
    for (const kind of INVOICE_DUE_KINDS) {
      expect(NOTIFICATION_KINDS as readonly string[]).toContain(kind);
    }
  });

  it("snake_case — konvensi enum-like docs/DATABASE.md", () => {
    for (const kind of INVOICE_DUE_KINDS) expect(kind).toMatch(/^[a-z][a-z_]*$/);
  });
});

describe("diam saat memang tidak ada kabar", () => {
  it("tanpa faktur sama sekali", () => {
    expect(rencana([])).toEqual([]);
  });

  it("faktur lunas bukan kabar, seberapa pun tuanya", () => {
    expect(rencana([faktur({ dueDate: geser(-400), status: "paid" })])).toEqual([]);
  });

  it("tanpa tanggal jatuh tempo — TIDAK diperlakukan sebagai jatuh tempo hari ini", () => {
    /* `due_date` NULL berarti tidak diketahui (lihat lib/receivables.ts).
       Menebaknya berarti alarm palsu, yang persis dihindari sejak #12. */
    expect(rencana([faktur({ dueDate: null })])).toEqual([]);
  });

  it("masih jauh — di luar jendela tiga hari", () => {
    expect(rencana([faktur({ dueDate: geser(DUE_SOON_DAYS + 1) })])).toEqual([]);
  });
});

describe("jendela akan-jatuh-tempo", () => {
  it("hari terjauh yang masih diberitakan adalah H-3", () => {
    const [d] = rencana([faktur({ dueDate: geser(DUE_SOON_DAYS) })]);
    expect(d.kind).toBe("invoice_due_soon");
  });

  it("jatuh tempo HARI INI masuk 'akan', bukan 'lewat' — belum tertunggak", () => {
    const hasil = rencana([faktur({ dueDate: HARI_INI })]);
    expect(hasil.map((d) => d.kind)).toEqual(["invoice_due_soon"]);
    expect(hasil[0].title).toContain("hari ini");
  });

  it("sehari sesudahnya menjadi 'lewat', dan hanya itu", () => {
    const hasil = rencana([faktur({ dueDate: geser(-1) })]);
    expect(hasil.map((d) => d.kind)).toEqual(["invoice_overdue"]);
  });

  it("satu faktur tak pernah menghasilkan dua kabar sekaligus", () => {
    for (let h = -5; h <= 5; h += 1) {
      const hasil = rencana([faktur({ dueDate: geser(h) })]);
      expect(hasil.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("cadensi — bentuk kunci dedupe", () => {
  it("kabar 'akan' dikunci TANGGAL JATUH TEMPO, bukan hari ia diterbitkan", () => {
    /* Inilah yang membuat faktur jatuh tempo 25 Agu berbunyi sekali, bukan
       empat kali (22, 23, 24, 25). Diterbitkan dari tiga hari yang berbeda,
       kuncinya harus tetap sama persis. */
    const jatuhTempo = new Date(2026, 7, 25);
    const kunci = new Set(
      [-3, -2, -1, 0].map(
        (h) => rencana([faktur({ dueDate: jatuhTempo })], geser(h))[0]?.dedupeKey
      )
    );
    expect(kunci.size).toBe(1);
    expect([...kunci][0]).toBe(`company:8:soon:${hariKunci(jatuhTempo)}`);
  });

  it("dua tanggal jatuh tempo yang berbeda = dua kabar terpisah", () => {
    const hasil = rencana([
      faktur({ documentNo: "INV-A", dueDate: geser(1) }),
      faktur({ documentNo: "INV-B", dueDate: geser(2) }),
    ]);
    expect(hasil).toHaveLength(2);
    expect(new Set(hasil.map((d) => d.dedupeKey)).size).toBe(2);
  });

  it("faktur berbeda dengan tanggal jatuh tempo SAMA diringkas jadi satu kabar", () => {
    const hasil = rencana([
      faktur({ documentNo: "INV-A" }),
      faktur({ documentNo: "INV-B" }),
      faktur({ documentNo: "INV-C" }),
      faktur({ documentNo: "INV-D" }),
    ]);
    expect(hasil).toHaveLength(1);
    expect(hasil[0].title).toContain("4 faktur");
    // Tiga disebut namanya, sisanya diringkas — badan kabar bukan daftar isi.
    expect(hasil[0].body).toContain("INV-A, INV-B, INV-C, dan 1 lainnya");
  });

  it("tunggakan berbunyi sekali per PEKAN, bukan sekali per hari", () => {
    const tertunggak = [faktur({ dueDate: geser(-30) })];
    const senin = new Date(2026, 7, 24);
    const jumat = new Date(2026, 7, 28);
    const pekanDepan = new Date(2026, 7, 31);

    expect(rencana(tertunggak, senin)[0].dedupeKey).toBe(
      rencana(tertunggak, jumat)[0].dedupeKey
    );
    expect(rencana(tertunggak, pekanDepan)[0].dedupeKey).not.toBe(
      rencana(tertunggak, senin)[0].dedupeKey
    );
  });

  it("seluruh tunggakan masuk SATU kabar, berapa pun jumlah fakturnya", () => {
    const banyak = Array.from({ length: 80 }, (_, i) =>
      faktur({ documentNo: `INV-${i}`, dueDate: geser(-(i + 1)) })
    );
    const hasil = rencana(banyak);
    expect(hasil).toHaveLength(1);
    expect(hasil[0].title).toContain("80 faktur");
    // Yang terlama yang disebut — itu yang paling menuntut tindakan.
    expect(hasil[0].body).toContain("INV-79");
    expect(hasil[0].body).toContain("80 hari");
  });
});

describe("pekanKunci", () => {
  it("mengikuti ISO-8601: pekan milik Kamisnya", () => {
    // 31 Des 2026 adalah Kamis → pekan 53 tahun 2026; 1 Jan 2027 (Jumat) ikut.
    expect(pekanKunci(new Date(2026, 11, 31))).toBe("2026-W53");
    expect(pekanKunci(new Date(2027, 0, 1))).toBe("2026-W53");
  });

  it("hari-hari dalam satu pekan berbagi kunci yang sama", () => {
    const senin = new Date(2026, 7, 24);
    const minggu = new Date(2026, 7, 30);
    expect(pekanKunci(senin)).toBe(pekanKunci(minggu));
    expect(pekanKunci(new Date(2026, 7, 31))).not.toBe(pekanKunci(senin));
  });
});

describe("kejujuran angka", () => {
  it("valas tanpa kurs dihitung sebagai faktur, tapi tidak dijumlahkan", () => {
    const hasil = rencana([
      faktur({ documentNo: "INV-IDR", outstandingBase: 5_000_000 }),
      faktur({ documentNo: "INV-USD", outstandingBase: null }),
    ]);
    expect(hasil[0].title).toContain("2 faktur");
    expect(hasil[0].body).toContain("5.000.000");
    expect(hasil[0].body).toContain("tidak ikut dijumlahkan");
  });

  it("tanpa baris valas, tak ada kalimat penjelas yang menggantung", () => {
    const hasil = rencana([faktur()]);
    expect(hasil[0].body).not.toContain("tidak ikut dijumlahkan");
  });
});

describe("tautan & batas kolom", () => {
  it("tunggakan menuju Piutang yang SUDAH tersaring, bukan daftar penuh", () => {
    const [d] = rencana([faktur({ dueDate: geser(-10) })]);
    expect(d.href).toBe("/t/acme/pt-saro/receivables?overdue=1");
  });

  it("kabar 'akan' menuju halaman Piutang perusahaan itu", () => {
    const [d] = rencana([faktur()]);
    expect(d.href).toBe("/t/acme/pt-saro/receivables");
  });

  it("nama PT yang panjang tidak membuat barisnya ditolak DB", () => {
    /* `title` VarChar(150), `body` VarChar(1000). Dipotong di kode, bukan
       dibiarkan sampai ke MariaDB — sql_mode ketat MENOLAK barisnya, dan
       kabarnya lenyap tanpa jejak. */
    const hasil = planInvoiceDueDigests({
      companyId: 8,
      companyName: "PT ".padEnd(300, "Panjang "),
      basePath: "/t/acme/pt-panjang",
      invoices: Array.from({ length: 40 }, (_, i) =>
        faktur({ documentNo: `INV-${"X".repeat(40)}-${i}` })
      ),
      asOf: HARI_INI,
    });
    for (const d of hasil) {
      expect(d.title.length).toBeLessThanOrEqual(150);
      expect(d.body.length).toBeLessThanOrEqual(1000);
    }
  });
});
