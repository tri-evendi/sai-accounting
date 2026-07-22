/**
 * Card (issue #50) — permukaan konten, token semantik.
 *
 * **Tanpa CVA, dan itu disengaja.** Card tidak punya sumbu varian nyata: 426
 * pemakaian `<Card*>` mengatur jaraknya lewat `className` dengan nilai yang
 * beragam (p-4, p-6, px-0, py-8, …), yang sudah ditangani `cn()` + tailwind-merge.
 * Memaksakan CVA di sini berarti mengarang API yang tak seorang pun pakai;
 * shadcn/ui sendiri juga tidak memakai CVA untuk Card. Sumbu varian nyata ada
 * di `Button`, `Badge`, `Input`, dan `Select` — di sana CVA dipakai.
 *
 * Struktur visualnya sengaja DIPERTAHANKAN apa adanya (header bergaris bawah),
 * bukan diganti tata letak Card bawaan shadcn, supaya 82 file pemakainya tidak
 * berubah rupa — yang bergeser hanya warnanya, dari kelas mentah ke token.
 *
 * Radius `rounded-lg` = 12px, sesuai ketentuan card di MASTER.md.
 */

import { cn } from "@/lib/utils";

type DivProps = React.ComponentProps<"div">;

function Card({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-header"
      className={cn("border-b border-border px-6 py-4", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: DivProps) {
  return (
    <div data-slot="card-content" className={cn("px-6 py-4", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-3 border-t border-border px-6 py-4", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription };
