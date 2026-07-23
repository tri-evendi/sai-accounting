"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { Trash2, UserPlus, RotateCcw } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/constants";

interface User {
  id: number;
  username: string;
  name: string | null;
  role: string;
  status: number;
  createdAt: string;
}

export function UsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function fetchUsers() {
    const res = await fetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
    } else if (res.status === 403) {
      setError("You do not have permission to manage users.");
    }
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      const res = await fetch("/api/users");
      if (cancelled) return;
      if (res.ok) {
        setUsers(await res.json());
      } else if (res.status === 403) {
        setError("You do not have permission to manage users.");
      }
      setLoading(false);
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const body = {
      username: formData.get("username"),
      password: formData.get("password"),
      name: formData.get("name"),
      role: formData.get("role"),
    };

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create user");
    } else {
      toast("User created successfully");
      setShowCreate(false);
      await fetchUsers();
    }
    setCreating(false);
  }

  async function handleDelete(userId: number) {
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (res.ok) {
      toast("User deleted");
      await fetchUsers();
    } else {
      const data = await res.json();
      toast(data.error || "Failed to delete user", "error");
    }
  }

  async function handleResetPassword(userId: number) {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "changeme123" }),
    });
    if (res.ok) {
      toast("Password reset to 'changeme123'. User must change on next login.");
      await fetchUsers();
    } else {
      toast("Failed to reset password", "error");
    }
  }

  if (loading) return <PageLoader message="Loading users..." />;
  if (error && users.length === 0) {
    return <div className="rounded-md bg-destructive-soft p-4 text-sm text-destructive-strong">{error}</div>;
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        actions={
          <Button onClick={() => setShowCreate(!showCreate)}>
            <UserPlus className="h-4 w-4 mr-1" /> {showCreate ? "Cancel" : "New User"}
          </Button>
        }
      />

      {error && <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>}

      {/* Create User Form */}
      {showCreate && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Create New User</CardTitle></CardHeader>
          <div className="px-6 pb-6">
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
              <Input id="username" name="username" label="Username" required autoFocus />
              <Input id="password" name="password" type="password" label="Password (min 8 chars)" required />
              <Input id="name" name="name" label="Display Name" />
              <Select
                id="role" name="role" label="Role"
                options={[
                  { value: "core", label: "Staff (core)" },
                  { value: "bos", label: "Manager (bos)" },
                  { value: "ptg", label: "PTG Department" },
                ]}
              />
              <div className="sm:col-span-2">
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create User"}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      {/* Users Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Username</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Role</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border hover:bg-muted">
                  <td className="px-6 py-3 font-medium text-foreground">{user.username}</td>
                  <td className="px-6 py-3 text-foreground">{user.name || "-"}</td>
                  <td className="px-6 py-3">
                    <Badge variant={user.role === ROLES.BOS ? "success" : "default"}>
                      {ROLE_LABELS[user.role as Role] || user.role}
                    </Badge>
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={user.status === 1 ? "warning" : "success"}>
                      {user.status === 1 ? "Must Change Password" : "Active"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <ConfirmDialog
                        title="Reset Password"
                        message={`Reset password for "${user.username}" to "changeme123"? They will be forced to change it on next login.`}
                        confirmLabel="Reset"
                        confirmVariant="primary"
                        onConfirm={() => handleResetPassword(user.id)}
                        trigger={
                          <button className="p-1.5 text-muted-foreground hover:text-primary rounded hover:bg-primary/10" title="Reset password">
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        }
                      />
                      <ConfirmDialog
                        title="Delete User"
                        message={`Are you sure you want to delete user "${user.username}"? This cannot be undone.`}
                        confirmLabel="Delete"
                        onConfirm={() => handleDelete(user.id)}
                        trigger={
                          <button className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive-soft" title="Delete user">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
