/**
 * Validasi anti-salah (issue #6) — memanusiakan pesan + pencegahan sebelum kirim.
 *
 * Aturan yang dijaga: tidak ada satu pun keluaran Zod mentah berbahasa Inggris
 * yang boleh sampai ke layar, dan larangan yang sudah ada di server (periode
 * tertutup, stok tidak cukup, angka negatif) harus berbunyi sama persis di UI.
 */
import { describe, expect, it } from "vitest";
import {
  FIELD_LABELS,
  closedPeriodIssue,
  fieldLabel,
  humanizeFieldMessage,
  isLargeStockOut,
  largeStockOutMessage,
  monthLabel,
  negativeValueIssue,
  stockShortfallMessage,
  matchesConfirmPhrase,
} from "@/lib/form-guards";
import { findStockShortfalls } from "@/lib/delivery-orders";

describe("label lapangan", () => {
  it("menerjemahkan nama field payload menjadi bahasa tugas", () => {
    expect(fieldLabel("counterAccountId")).toBe("Kategori (akun lawan)");
    expect(fieldLabel("rate")).toBe("Kurs");
    expect(fieldLabel("top1")).toBe("Termin pembayaran 1");
  });

  it("jatuh kembali dengan sopan untuk field tak dikenal", () => {
    expect(fieldLabel("gizmoId")).toBe("gizmoId");
    expect(fieldLabel(null)).toBe("Isian ini");
    expect(fieldLabel(undefined)).toBe("Isian ini");
  });

  it("tidak punya label kosong", () => {
    for (const [key, label] of Object.entries(FIELD_LABELS)) {
      expect(label.trim().length, key).toBeGreaterThan(0);
    }
  });
});

describe("humanizeFieldMessage", () => {
  it("mengubah 'is required' menjadi kalimat Indonesia", () => {
    expect(humanizeFieldMessage("contractNo", "Contract number is required")).toBe(
      "Nomor kontrak wajib diisi."
    );
    expect(humanizeFieldMessage("date", "Required")).toBe("Tanggal wajib diisi.");
  });

  it("mengubah keluhan angka Zod v4 menjadi petunjuk yang bisa ditindaklanjuti", () => {
    expect(humanizeFieldMessage("debit", "Invalid input: expected number, received NaN")).toBe(
      "Uang Masuk harus berupa angka. Hapus huruf atau tanda yang bukan angka."
    );
  });

  it("membedakan 'harus > 0' dari 'tidak boleh negatif'", () => {
    expect(humanizeFieldMessage("amount", "Amount must be positive")).toBe(
      "Jumlah harus lebih besar dari 0."
    );
    expect(humanizeFieldMessage("bags", "Bags must be 0 or more")).toBe(
      "Jumlah bags tidak boleh negatif — isi 0 atau lebih."
    );
  });

  it("menerjemahkan aturan gabungan debit/kredit", () => {
    expect(humanizeFieldMessage("debit", "Either debit or credit must be greater than 0")).toBe(
      "Isi salah satu: Uang Masuk atau Uang Keluar. Salah satunya harus lebih dari 0."
    );
  });

  it("menangani tanggal, email, dan baris barang kosong", () => {
    expect(humanizeFieldMessage("date", "Invalid date")).toContain("tanggal yang benar");
    expect(humanizeFieldMessage("email", "Invalid email")).toContain("nama@perusahaan.com");
    expect(humanizeFieldMessage("items", "At least one item is required")).toBe(
      "Tambahkan minimal satu baris barang sebelum menyimpan."
    );
  });

  it("MEMBIARKAN pesan yang memang sudah ditulis manusiawi", () => {
    expect(humanizeFieldMessage("counterAccountId", "Akun lawan wajib dipilih")).toBe(
      "Akun lawan wajib dipilih."
    );
    const panjang =
      "Kontrak ini sudah dipakai oleh 2 faktur, jadi tidak bisa dihapus. Batalkan kontraknya saja.";
    expect(humanizeFieldMessage(null, panjang)).toBe(panjang);
  });

  it("tidak pernah meneruskan sisa jargon Inggris ke layar", () => {
    const hasil = humanizeFieldMessage("rate", "Unrecognized key: 'foo'");
    expect(hasil).toBe("Kurs belum benar. Periksa lagi isiannya.");
    expect(humanizeFieldMessage("rate", "")).toBe("Kurs belum benar. Periksa lagi isiannya.");
    expect(humanizeFieldMessage("rate", null)).toBe("Kurs belum benar. Periksa lagi isiannya.");
  });
});

describe("periode terkunci — cermin UI dari assertPeriodOpen", () => {
  const closed = [
    { year: 2026, month: 3 },
    { year: 2025, month: 12 },
  ];

  it("menolak tanggal di bulan yang sudah ditutup dan menyebut nama bulannya", () => {
    const pesan = closedPeriodIssue("2026-03-17", closed);
    expect(pesan).toContain("Maret 2026");
    expect(pesan).toContain("Tutup Periode");
  });

  it("membiarkan tanggal di bulan yang masih terbuka", () => {
    expect(closedPeriodIssue("2026-04-01", closed)).toBeNull();
    expect(closedPeriodIssue("2026-02-28", closed)).toBeNull();
  });

  it("tidak mengarang larangan dari tanggal kosong atau tak terbaca", () => {
    expect(closedPeriodIssue("", closed)).toBeNull();
    expect(closedPeriodIssue(null, closed)).toBeNull();
    expect(closedPeriodIssue("bukan-tanggal", closed)).toBeNull();
    expect(closedPeriodIssue("2026-13-01", closed)).toBeNull();
  });

  it("tidak melarang apa pun ketika belum ada periode yang ditutup", () => {
    expect(closedPeriodIssue("2026-03-17", [])).toBeNull();
  });

  it("memakai nama bulan Indonesia yang sama dengan periodLabel", () => {
    expect(monthLabel(2026, 3)).toBe("Maret 2026");
    expect(monthLabel(2026, 12)).toBe("Desember 2026");
  });

  it("bisa menamai isian lain, mis. tanggal jatuh tempo", () => {
    expect(closedPeriodIssue("2025-12-05", closed, "Tanggal jatuh tempo")).toContain(
      "Tanggal jatuh tempo"
    );
  });
});

describe("angka negatif", () => {
  it("melaporkan isian negatif pertama sesuai urutan yang diberikan", () => {
    const hasil = negativeValueIssue([
      { field: "debit", value: 0 },
      { field: "credit", value: -5 },
      { field: "rate", value: -1 },
    ]);
    expect(hasil?.field).toBe("credit");
    expect(hasil?.message).toContain("Uang Keluar tidak boleh negatif");
  });

  it("meloloskan nol dan bilangan positif", () => {
    expect(negativeValueIssue([{ field: "debit", value: 0 }, { field: "credit", value: 12 }])).toBeNull();
  });

  it("mengabaikan nilai yang bukan bilangan (isian kosong)", () => {
    expect(negativeValueIssue([{ field: "quantity", value: Number.NaN }])).toBeNull();
  });

  it("menghormati label khusus", () => {
    const hasil = negativeValueIssue([{ field: "quantity", value: -2, label: "Jumlah keluar" }]);
    expect(hasil?.message).toContain("Jumlah keluar");
  });
});

describe("stok tidak cukup — cermin UI dari assertStockAvailable", () => {
  it("memakai bentuk kekurangan yang sama dengan penjaga server", () => {
    const shortfalls = findStockShortfalls(
      [{ itemId: 1, itemName: "Kopi Arabika", kg: 1200 }],
      new Map([[1, 800]])
    );
    const pesan = stockShortfallMessage(shortfalls);
    expect(pesan).toContain("Kopi Arabika");
    expect(pesan).toContain("1.200");
    expect(pesan).toContain("800");
    expect(pesan).toContain("Tambah / Kurangi Stok");
  });

  it("diam ketika stok mencukupi", () => {
    const shortfalls = findStockShortfalls(
      [{ itemId: 1, itemName: "Kopi Arabika", kg: 500 }],
      new Map([[1, 800]])
    );
    expect(stockShortfallMessage(shortfalls)).toBeNull();
  });
});

describe("pengeluaran stok besar", () => {
  it("minta konfirmasi mulai setengah dari stok tersedia", () => {
    expect(isLargeStockOut(500, 1000)).toBe(true);
    expect(isLargeStockOut(499, 1000)).toBe(false);
    expect(isLargeStockOut(1000, 1000)).toBe(true);
  });

  it("tidak minta konfirmasi untuk jumlah/stok yang tidak masuk akal", () => {
    expect(isLargeStockOut(0, 1000)).toBe(false);
    expect(isLargeStockOut(-5, 1000)).toBe(false);
    expect(isLargeStockOut(10, 0)).toBe(false);
  });

  it("menjelaskan sisa stok setelahnya dalam format id-ID", () => {
    const pesan = largeStockOutMessage("Kopi Arabika", 800, 1000);
    expect(pesan).toContain("Kopi Arabika");
    expect(pesan).toContain("1.000");
    expect(pesan).toContain("200");
    expect(pesan).toContain("HPP");
  });
});

describe("matchesConfirmPhrase — gesekan pada tindakan tak bisa dibatalkan (#6)", () => {
  it("tanpa frasa, tidak ada gesekan tambahan", () => {
    expect(matchesConfirmPhrase("", undefined)).toBe(true);
    expect(matchesConfirmPhrase("", null)).toBe(true);
    expect(matchesConfirmPhrase("apa pun", "")).toBe(true);
  });

  it("cocok persis", () => {
    expect(matchesConfirmPhrase("KTR-2026-001", "KTR-2026-001")).toBe(true);
  });

  it("mengabaikan spasi di ujung dan huruf besar/kecil — tujuannya kesadaran, bukan ketelitian mengetik", () => {
    expect(matchesConfirmPhrase("  ktr-2026-001 ", "KTR-2026-001")).toBe(true);
    expect(matchesConfirmPhrase("INV.2026.07.00003", "inv.2026.07.00003")).toBe(true);
  });

  it("menolak nomor dokumen yang MIRIP — justru itu inti gesekannya", () => {
    expect(matchesConfirmPhrase("KTR-2026-002", "KTR-2026-001")).toBe(false);
    expect(matchesConfirmPhrase("KTR-2026-01", "KTR-2026-001")).toBe(false);
    expect(matchesConfirmPhrase("", "KTR-2026-001")).toBe(false);
    // Spasi di TENGAH tetap dianggap beda: itu nomor yang lain.
    expect(matchesConfirmPhrase("KTR 2026 001", "KTR-2026-001")).toBe(false);
  });
});
