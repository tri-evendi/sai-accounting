/**
 * Paginasi audit log (issue #60).
 *
 * Regresi utama: dulu hanya 5000 baris terakhir yang dibaca, sehingga
 * `totalCount` salah dan entri di atas 5000 tak terjangkau. Test ini mengunci
 * bahwa paginasi mencakup SELURUH entri, newest-first, dan menghitung total
 * dengan benar.
 */

import { describe, it, expect } from "vitest";
import { paginateAuditLines } from "@/lib/audit";

function line(i: number, action = "item.create") {
  return JSON.stringify({
    id: `${i}`,
    userId: "1",
    username: "u",
    action,
    entity: "user",
    ipAddress: null,
    createdAt: new Date(2020, 0, 1, 0, 0, i).toISOString(),
  });
}

describe("paginateAuditLines", () => {
  it("menghitung SELURUH entri, bukan hanya 5000 terakhir", () => {
    const lines = Array.from({ length: 6000 }, (_, i) => line(i));
    const r = paginateAuditLines(lines, { page: 1, perPage: 20 });
    expect(r.totalCount).toBe(6000); // dulu terpotong jadi 5000
    expect(r.totalPages).toBe(300);
  });

  it("entri di atas batas lama tetap terjangkau lewat paginasi", () => {
    const lines = Array.from({ length: 6000 }, (_, i) => line(i));
    // Halaman terakhir memuat entri PALING TUA (baris 0..) — dulu tak terjangkau.
    const last = paginateAuditLines(lines, { page: 300, perPage: 20 });
    expect(last.logs).toHaveLength(20);
    expect(last.logs.at(-1)?.id).toBe("0"); // entri tertua benar-benar tercapai
  });

  it("newest-first: halaman 1 memuat entri terbaru", () => {
    const lines = Array.from({ length: 100 }, (_, i) => line(i));
    const r = paginateAuditLines(lines, { page: 1, perPage: 10 });
    expect(r.logs[0].id).toBe("99");
    expect(r.logs.at(-1)?.id).toBe("90");
  });

  it("filter action menghitung total atas hasil terfilter", () => {
    const lines = [
      ...Array.from({ length: 30 }, (_, i) => line(i, "stock.in")),
      ...Array.from({ length: 20 }, (_, i) => line(100 + i, "stock.out")),
    ];
    const r = paginateAuditLines(lines, { page: 1, perPage: 20, action: "stock.out" });
    expect(r.totalCount).toBe(20);
    expect(r.logs.every((e) => e.action === "stock.out")).toBe(true);
  });

  it("baris rusak dilewati, tidak menggagalkan paginasi", () => {
    const lines = [line(1), "{ bukan json", line(2)];
    const r = paginateAuditLines(lines, { page: 1, perPage: 20 });
    expect(r.totalCount).toBe(2);
  });

  it("kosong → nol total, nol halaman", () => {
    const r = paginateAuditLines([], { page: 1, perPage: 20 });
    expect(r).toMatchObject({ totalCount: 0, totalPages: 0, logs: [] });
  });
});
