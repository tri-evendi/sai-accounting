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
  it("defaults the full-access roles (Direktur Utama, Administrator) to ON", () => {
    expect(roleDefaultAccountantMode("managing_director")).toBe(true);
    // Administrator holds every permission; leaving it OFF here would bounce
    // it off every accounting page and make "full access" a lie.
    expect(roleDefaultAccountantMode("administrator")).toBe(true);
  });

  it("defaults finance_manager (Staff) and warehouse_head to OFF", () => {
    expect(roleDefaultAccountantMode("finance_manager")).toBe(false);
    expect(roleDefaultAccountantMode("warehouse_head")).toBe(false);
  });

  it("treats an unknown or missing role as OFF", () => {
    expect(roleDefaultAccountantMode("someone")).toBe(false);
    expect(roleDefaultAccountantMode(null)).toBe(false);
    expect(roleDefaultAccountantMode(undefined)).toBe(false);
  });
});

describe("effectiveAccountantMode — role defaults when no preference is set", () => {
  it("full-access roles with no preference → ON", () => {
    expect(effectiveAccountantMode({ role: "managing_director" })).toBe(true);
    expect(effectiveAccountantMode({ role: "managing_director", accountantMode: null })).toBe(true);
    expect(effectiveAccountantMode({ role: "administrator" })).toBe(true);
    expect(effectiveAccountantMode({ role: "administrator", accountantMode: null })).toBe(true);
  });

  it("finance_manager / warehouse_head with no preference → OFF", () => {
    expect(effectiveAccountantMode({ role: "finance_manager" })).toBe(false);
    expect(effectiveAccountantMode({ role: "warehouse_head", accountantMode: null })).toBe(false);
  });
});

describe("effectiveAccountantMode — an explicit preference overrides the default", () => {
  it("the full-access roles can turn it OFF", () => {
    expect(effectiveAccountantMode({ role: "managing_director", accountantMode: false })).toBe(false);
    expect(effectiveAccountantMode({ role: "administrator", accountantMode: false })).toBe(false);
  });

  it("finance_manager can turn it ON", () => {
    expect(effectiveAccountantMode({ role: "finance_manager", accountantMode: true })).toBe(true);
  });

  it("an explicit true/false wins regardless of role default", () => {
    expect(effectiveAccountantMode({ role: "warehouse_head", accountantMode: true })).toBe(true);
    expect(effectiveAccountantMode({ role: "managing_director", accountantMode: false })).toBe(false);
  });
});

describe("page-guard decision (requireAccountantPage)", () => {
  // The guard refuses (redirects) exactly when effective mode is OFF, AFTER the
  // role check has already run. This mirrors that second gate.
  const pageRefused = (user: AccountantModeUser) => !effectiveAccountantMode(user);

  it("serves the accounting page to the full-access roles in the default (ON) state", () => {
    expect(pageRefused({ role: "managing_director" })).toBe(false);
    expect(pageRefused({ role: "administrator" })).toBe(false);
  });

  it("refuses the accounting page to a Direktur Utama who turned Mode Akuntan OFF", () => {
    // Not just cosmetic: hiding the menu is backed by the page refusing to render.
    expect(pageRefused({ role: "managing_director", accountantMode: false })).toBe(true);
  });

  it("would refuse finance_manager/warehouse_head by mode even before the role gate turns them away", () => {
    expect(pageRefused({ role: "finance_manager" })).toBe(true);
    expect(pageRefused({ role: "warehouse_head" })).toBe(true);
  });
});
