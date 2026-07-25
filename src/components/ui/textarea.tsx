/**
 * Textarea — primitif isian multi-baris, seragam dengan `TextInput`.
 *
 * Sebelumnya tiap halaman mengetik ulang kelas `<textarea>` sendiri (border,
 * fokus, padding) sehingga gaya mudah menyimpang. Ini menyatukannya memakai
 * token semantik yang sama dengan `input.tsx`. Bare (tanpa pembungkus
 * label/error) agar bisa dipakai di dalam `FormControl` pola `Form` shadcn.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm",
        "placeholder:text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
        "focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
