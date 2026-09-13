import { SidebarTrigger } from "@/components/ui/sidebar"

/** Temporary page body for routes whose screens are not designed yet. */
export function PagePlaceholder({ title }: { title: string }) {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">{title}</h1>
      </header>
      <main className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {title} is not designed yet.
      </main>
    </>
  )
}
