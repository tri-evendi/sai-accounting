"use client";

/**
 * Dialog — primitif dialog umum (bisa ditutup) di atas Radix UI, pola shadcn.
 *
 * Beda dari `AlertDialog` (konfirmasi, tak bisa ditutup dengan klik-luar):
 * Dialog ini bisa ditutup lewat X, klik-luar, dan Escape — cocok untuk panel
 * non-destruktif seperti PRATINJAU DOKUMEN. Radix memberi focus trap, body
 * scroll-lock, dan pengembalian fokus.
 */
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          // Scrim overlay memang hitam transparan, bukan permukaan bertema.
          // eslint-disable-next-line no-restricted-syntax
          "fixed inset-0 z-[60] bg-black/50",
          "animate-overlay-in motion-reduce:animate-none"
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[60] flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-xl border border-border bg-card shadow-xl focus:outline-none",
          "animate-dialog-in motion-reduce:animate-none",
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label="Tutup"
            className="absolute right-3 top-3 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription };
