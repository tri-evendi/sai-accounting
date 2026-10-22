/**
 * Pembaca `INSERT INTO` dump MySQL — data SINTETIS saja (dump produksi tidak
 * pernah masuk repo).
 */
import { describe, expect, it } from "vitest";
import { DumpParseError, parseInsertRows } from "@/lib/mysql-dump";

const DUMP = `
CREATE TABLE \`tb_x\` (\`id\` int(11));
INSERT INTO \`tb_x\` (\`id\`, \`no\`, \`status\`, \`note\`) VALUES
(1, 'A/001', '2', 'biasa'),
(2, 'B''s 002', '-1', 'kutip \\'miring\\' dan \\\\ garis'),
(3, 'C\\n003', NULL, '');
INSERT INTO \`tb_x_0103\` (\`id\`, \`no\`) VALUES (9, 'salinan');
INSERT INTO \`tb_x\` (\`id\`, \`no\`, \`status\`, \`note\`) VALUES (4, 'D, (koma)', ' 0 ', 'x;y');
`;

describe("parseInsertRows", () => {
  const rows = parseInsertRows(DUMP, "tb_x");

  it("membaca semua INSERT tabel itu — dan HANYA tabel itu", () => {
    expect(rows.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("escape, kutip ganda, NULL, koma & titik koma di dalam string", () => {
    expect(rows[1].no).toBe("B's 002");
    expect(rows[1].note).toBe("kutip 'miring' dan \\ garis");
    expect(rows[2].no).toBe("C\n003");
    expect(rows[2].status).toBeNull();
    expect(rows[3].no).toBe("D, (koma)");
    expect(rows[3].note).toBe("x;y");
  });

  it("nilai dipulangkan sebagai TEKS apa adanya (spasi tidak dipangkas)", () => {
    expect(rows[3].status).toBe(" 0 ");
  });

  it("tabel yang tidak ada → kosong; tuple yang cacat → galat bernama", () => {
    expect(parseInsertRows(DUMP, "tb_tidak_ada")).toEqual([]);
    expect(() => parseInsertRows("INSERT INTO `t` (`a`, `b`) VALUES (1);", "t")).toThrow(DumpParseError);
  });
});
