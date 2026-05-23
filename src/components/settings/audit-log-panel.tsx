"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AuditEntry {
  id: number;
  username: string;
  action: string;
  entity: string;
  entityId: number | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  "finance.create": "Finance transaction",
  "stock.in": "Stock in",
  "stock.out": "Stock out",
  "item.create": "New item",
  "auth.password_change": "Password changed",
};

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/audit?page=${page}&perPage=15`);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.status === 403 ? "Access denied" : "Failed to load audit log");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setLogs(data.logs);
      setTotalPages(data.totalPages);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security audit log</CardTitle>
        <p className="text-xs text-gray-500 font-normal mt-1">
          Finance, stock, and account changes (manager only)
        </p>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        )}
        {loading ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No audit entries yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2 pr-4 font-medium text-gray-500">Time</th>
                  <th className="py-2 pr-4 font-medium text-gray-500">User</th>
                  <th className="py-2 pr-4 font-medium text-gray-500">Action</th>
                  <th className="py-2 pr-4 font-medium text-gray-500">Details</th>
                  <th className="py-2 font-medium text-gray-500">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td className="py-2 pr-4 font-medium">{log.username}</td>
                    <td className="py-2 pr-4">
                      {ACTION_LABELS[log.action] || log.action}
                    </td>
                    <td className="py-2 pr-4 text-gray-600 max-w-xs truncate">
                      {formatDetails(log)}
                    </td>
                    <td className="py-2 text-gray-400 text-xs">{log.ipAddress || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-2 border-t">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDetails(log: AuditEntry): string {
  const d = log.details;
  if (!d) return `ID ${log.entityId ?? "—"}`;
  if (typeof d.description === "string") return d.description;
  if (typeof d.itemName === "string") {
    return `${d.itemName} · ${d.quantity ?? ""} ${d.type ?? ""}`.trim();
  }
  if (typeof d.name === "string") return String(d.name);
  return JSON.stringify(d).slice(0, 80);
}
