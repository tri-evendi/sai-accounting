/**
 * Kelompok tindakan jejak tenant untuk saringan `/operator/audit/tenants`.
 *
 * AWALAN, bukan daftar tindakan: kosakata `TenantAuditAction` bertitik dan
 * berkelompok, jadi tindakan baru sekelompok (mis. `tenant.deletion.<baru>`)
 * ikut tersaring tanpa mengubah berkas ini. Tiap awalan WAJIB mencocokkan
 * minimal satu tindakan yang ada — dijaga `tests/operator-audit.test.ts`.
 */
export const TENANT_AUDIT_GROUPS = [
  "tenant.register",
  "tenant.company.",
  "tenant.invitation.",
  "tenant.user.",
  "tenant.profile.",
  "tenant.slug.",
  "tenant.plan.",
  "tenant.payment.",
  "tenant.extend",
  "tenant.suspend",
  "tenant.restore",
  "tenant.billing_mode",
  "tenant.subscription.",
  "tenant.status.",
  "tenant.export",
  "tenant.deletion.",
] as const;
