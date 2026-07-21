import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConsigneesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;

  const [consignees, totalCount] = await Promise.all([
    prisma.consignee.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.consignee.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Consignees ({totalCount})</h1>
        <Link href="/consignees/new">
          <Button>+ New Consignee</Button>
        </Link>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 font-medium text-gray-500">Country</th>
                <th className="px-6 py-3 font-medium text-gray-500">Contact</th>
                <th className="px-6 py-3 font-medium text-gray-500">Address</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {consignees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No consignees yet
                  </td>
                </tr>
              ) : (
                consignees.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <Link href={`/consignees/${c.id}`} className="text-blue-600 hover:underline font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-500">{c.country || "-"}</td>
                    <td className="px-6 py-3 text-gray-500">{c.contact || "-"}</td>
                    <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{c.address || "-"}</td>
                    <td className="px-6 py-3">
                      {c.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default">Inactive</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/consignees" searchParams={params} />
      </Card>
    </div>
  );
}
