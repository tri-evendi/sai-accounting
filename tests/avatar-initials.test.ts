/**
 * Inisial avatar mengabaikan tanda baca di depan kata. Sapuan visual 21 Okt
 * 2026 memotret avatar "S(" untuk "Sapuan Visual (agen)".
 */
import { describe, expect, it } from "vitest";
import { initials } from "@/components/layout/user-menu";

describe("initials", () => {
  it.each([
    ["Sapuan Visual (agen)", "SA"],
    ["Budi (Gudang)", "BG"],
    ["Rika - Admin", "RA"],
    ["siti", "S"],
    ["  ", ""],
    ["(—)", ""],
    ["王 小明", "王小"],
  ])("%s → %s", (name, want) => {
    expect(initials(name)).toBe(want);
  });
});
