"use client";

/**
 * AlertDialog (issue #51) — primitif dialog konfirmasi di atas Radix UI,
 * mengikuti pola shadcn/ui tetapi ditata dengan palet aplikasi ini.
 *
 * Dipakai lewat `ConfirmDialog` untuk hampir semua kasus; primitif ini
 * diekspor terpisah agar dialog konfirmasi bentuk lain bisa dirakit tanpa
 * mengulang overlay/fokus/scroll-lock.
 *
 * Yang diberikan Radix dan TIDAK boleh dirakit tangan lagi:
 *   • focus trap sungguhan (Tab/Shift-Tab terkurung di dialog);
 *   • body scroll-lock selama terbuka;
 *   • Escape menutup, fokus kembali ke elemen pemicunya;
 *   • `role="alertdialog"` + pelabelan otomatis dari Title/Description.
 *
 * Sesuai semantik AlertDialog, klik di luar TIDAK menutup — konfirmasi
 * destruktif harus dijawab, bukan hilang karena salah klik.
 */

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-[60] bg-black/50",
        "animate-overlay-in motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
          "rounded-xl bg-card p-6 shadow-xl focus:outline-none",
          "animate-dialog-in motion-reduce:animate-none",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-6 flex justify-end gap-3", className)} {...props} />;
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

const AlertDialogAction = AlertDialogPrimitive.Action;
const AlertDialogCancel = AlertDialogPrimitive.Cancel;

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
