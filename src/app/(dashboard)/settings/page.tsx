"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ROLE_LABELS, APP_NAME, COMPANY_NAME, type Role } from "@/lib/constants";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";

export default function SettingsPage() {
  const { data: session } = useSession();

  if (!session) return null;

  const isManager = session.user.role === "bos";

  return (
    <div className={isManager ? "max-w-5xl" : "max-w-2xl"}>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="text-sm text-gray-900">{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Username</dt>
              <dd className="text-sm text-gray-900">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Role</dt>
              <dd className="text-sm text-gray-900">
                {ROLE_LABELS[session.user.role as Role] || session.user.role}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <Link href="/change-password">
              <Button variant="secondary">Change Password</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {isManager && (
        <div className="mb-6">
          <AuditLogPanel />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">{APP_NAME}</p>
          <p className="text-sm text-gray-500 mt-1">{COMPANY_NAME}</p>
          <p className="text-sm text-gray-400 mt-2">
            Contract & Inventory Management System
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
