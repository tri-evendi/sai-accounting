/**
 * Mode Akuntan (issue #11) — the pure decision that drives BOTH the client
 * sidebar/navbar and the server page guards.
 *
 * No DB, no auth, no mocks (matching the suite's style): `effectiveAccountantMode`
 * is a pure function of {role, accountantMode}, so the sidebar's menu filter and
 * the `requireAccountantPage` guard's redirect are the same decision tested here.
 */
import { describe, expect, it } from "vitest";
import {
  effectiveAccountantMode,
  roleDefaultAccountantMode,
  type AccountantModeUser,
} from "@/lib/accountant-mode";

describe("roleDefaultAccountantMode", () => {
  it("defaults bos (Manager/akuntan) to ON", () => {
    expect(roleDefaultAccountantMode("bos")).toBe(true);
  });

  it("defaults core (Staff) and ptg to OFF", () => {
    expect(roleDefaultAccountantMode("core")).toBe(false);
    expect(roleDefaultAccountantMode("ptg")).toBe(false);
  });

  it("treats an unknown or missing role as OFF", () => {
    expect(roleDefaultAccountantMode("someone")).toBe(false);
    expect(roleDefaultAccountantMode(null)).toBe(false);
    expect(roleDefaultAccountantMode(undefined)).toBe(false);
  });
});

describe("effectiveAccountantMode — role defaults when no preference is set", () => {
  it("bos with no preference → ON", () => {
    expect(effectiveAccountantMode({ role: "bos" })).toBe(true);
    expect(effectiveAccountantMode({ role: "bos", accountantMode: null })).toBe(true);
  });

  it("core / ptg with no preference → OFF", () => {
    expect(effectiveAccountantMode({ role: "core" })).toBe(false);
    expect(effectiveAccountantMode({ role: "ptg", accountantMode: null })).toBe(false);
  });
});

describe("effectiveAccountantMode — an explicit preference overrides the default", () => {
  it("bos can turn it OFF", () => {
    expect(effectiveAccountantMode({ role: "bos", accountantMode: false })).toBe(false);
  });

  it("core can turn it ON", () => {
    expect(effectiveAccountantMode({ role: "core", accountantMode: true })).toBe(true);
  });

  it("an explicit true/false wins regardless of role default", () => {
    expect(effectiveAccountantMode({ role: "ptg", accountantMode: true })).toBe(true);
    expect(effectiveAccountantMode({ role: "bos", accountantMode: false })).toBe(false);
  });
});

describe("page-guard decision (requireAccountantPage)", () => {
  // The guard refuses (redirects) exactly when effective mode is OFF, AFTER the
  // role check has already run. This mirrors that second gate.
  const pageRefused = (user: AccountantModeUser) => !effectiveAccountantMode(user);

  it("serves the accounting page to a bos in the default (ON) state", () => {
    expect(pageRefused({ role: "bos" })).toBe(false);
  });

  it("refuses the accounting page to a bos who turned Mode Akuntan OFF", () => {
    // Not just cosmetic: hiding the menu is backed by the page refusing to render.
    expect(pageRefused({ role: "bos", accountantMode: false })).toBe(true);
  });

  it("would refuse a core/ptg by mode even before the role gate turns them away", () => {
    expect(pageRefused({ role: "core" })).toBe(true);
    expect(pageRefused({ role: "ptg" })).toBe(true);
  });
});
