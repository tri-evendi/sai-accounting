/**
 * Master Consignee (issue #22) — the pure helper + Zod surface.
 *
 * `normalizeConsigneeName` is the single normalisation the 0016 backfill's dedup
 * mirrors (trim + collapse whitespace), and `consigneeSchema` is what the API
 * accepts. No DB here — just the input contract.
 */
import { describe, expect, it } from "vitest";
import { normalizeConsigneeName } from "@/lib/consignee";
import { consigneeSchema } from "@/lib/validations/finance";

describe("normalizeConsigneeName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeConsigneeName("  ACME LTD  ")).toBe("ACME LTD");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeConsigneeName("ACME    TRADING\tCO")).toBe("ACME TRADING CO");
    expect(normalizeConsigneeName("A\n\nB")).toBe("A B");
  });

  it("returns empty string for nullish or blank input", () => {
    expect(normalizeConsigneeName(null)).toBe("");
    expect(normalizeConsigneeName(undefined)).toBe("");
    expect(normalizeConsigneeName("   ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeConsigneeName("  Foo   Bar  ");
    expect(normalizeConsigneeName(once)).toBe(once);
  });
});

describe("consigneeSchema", () => {
  it("accepts a minimal payload and defaults isActive to true", () => {
    const parsed = consigneeSchema.parse({ name: "Guangxi Kangwei" });
    expect(parsed.name).toBe("Guangxi Kangwei");
    expect(parsed.isActive).toBe(true);
  });

  it("normalises the name (trim + collapse) on parse", () => {
    const parsed = consigneeSchema.parse({ name: "  Foshan   Taste  Co  " });
    expect(parsed.name).toBe("Foshan Taste Co");
  });

  it("rejects an empty / whitespace-only name", () => {
    expect(consigneeSchema.safeParse({ name: "" }).success).toBe(false);
    expect(consigneeSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    expect(consigneeSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("carries optional fields through and respects an explicit isActive", () => {
    const parsed = consigneeSchema.parse({
      name: "Sunwing Logistics",
      country: "China",
      contact: "Mr. Liu",
      address: "RM J 13/F Jinan Building",
      notes: "freight forwarder",
      isActive: false,
    });
    expect(parsed).toMatchObject({
      country: "China",
      contact: "Mr. Liu",
      address: "RM J 13/F Jinan Building",
      notes: "freight forwarder",
      isActive: false,
    });
  });
});
