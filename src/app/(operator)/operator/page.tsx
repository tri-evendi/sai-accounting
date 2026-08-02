/**
 * Daftar TENANT — konsol operator (issue #154).
 *
 * Sebelum halaman ini, TIDAK ADA satu pun UI yang membaca daftar tenant:
 * setiap pertanyaan dukungan pelanggan berarti sesi SSH. Datanya murni dari
 * basis data KENDALI (`listTenantsForOperator`), jadi halaman ini tetap hidup
 * saat `sai_platform` mati — rincian penagihan menyusul di halaman detail.
 *
 * Pencarian & saringan status lewat form GET biasa: hasilnya URL yang bisa
 * disalin ke tiket dukungan, tanpa satu pun byte JS tambahan.
 */

import Link from "next/link";
import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOperatorPage } from "@/lib/operator/guard";
import { listTenantsForOperator } from "@/lib/operator/store";
import { TENANT_STATUSES } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

const READ_ONLY_STATUSES = new Set(["suspended", "cancelled"]);

export default async function OperatorTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireOperatorPage();
  const t = await getT();
  const params = await searchParams;

  const q = params.q?.trim() ?? "";
  const status = (TENANT_STATUSES as readonly string[]).includes(params.status ?? "")
    ? params.status
    : "";

  const tenants = await listTenantsForOperator({ q, status });
  const statusLabel = (value: string) => t(`tenantSettings.status.${value}` as DictionaryKey);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("operator.tenants.heading")} ({tenants.length})
        </h1>
        <p className="text-sm text-muted-foreground">{t("operator.tenants.description")}</p>
      </div>

      <form method="get" action="/operator" className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Input
            name="q"
            label={t("operator.tenants.searchLabel")}
            placeholder={t("operator.tenants.searchPlaceholder")}
            defaultValue={q}
          />
        </div>
        <div className="w-full max-w-48">
          <Select
            name="status"
            label={t("operator.tenants.statusLabel")}
            defaultValue={status}
            options={[
              { value: "", label: t("operator.tenants.statusAll") },
              ...TENANT_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
            ]}
          />
        </div>
        <Button type="submit" variant="outline">
          {t("operator.tenants.filter")}
        </Button>
      </form>

      {tenants.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" aria-hidden="true" />}
          title={t("operator.tenants.empty")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("operator.tenants.colName")}</TableHead>
              <TableHead>{t("operator.tenants.colSlug")}</TableHead>
              <TableHead>{t("operator.tenants.colStatus")}</TableHead>
              <TableHead>{t("operator.tenants.colPlan")}</TableHead>
              <TableHead>{t("operator.tenants.colCreated")}</TableHead>
              <TableHead>{t("operator.tenants.colUsage")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/operator/tenants/${tenant.id}`}
                    className="text-primary hover:underline"
                  >
                    {tenant.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      READ_ONLY_STATUSES.has(tenant.status)
                        ? "danger"
                        : tenant.status === "active"
                          ? "success"
                          : "warning"
                    }
                  >
                    {statusLabel(tenant.status)}
                  </Badge>
                </TableCell>
                <TableCell>{tenant.planKey}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(tenant.createdAt)}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {t("operator.tenants.usageValue", {
                    companies: tenant.usage.companies,
                    maxCompanies: tenant.maxCompanies,
                    users: tenant.usage.users,
                    maxUsers: tenant.maxUsers,
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
