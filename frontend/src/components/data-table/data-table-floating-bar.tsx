"use client"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useHotKey } from "@/hooks/use-hot-key"
import { boxRadiusClassName } from "@/lib/style"
import type { DataTableFeatures } from "@/lib/table/features"
import { cn } from "@/lib/utils"
import type { Row, RowData, Table as TTable } from "@tanstack/react-table"
import { X } from "lucide-react"
import * as React from "react"
import { useDataTable } from "./data-table-provider"
import { TOOLTIP_DELAY } from "./ui-compat"

interface DataTableFloatingBarProps<TData extends RowData> {
  children: (props: {
    rows: Row<DataTableFeatures, TData>[]
    table: TTable<DataTableFeatures, TData>
  }) => React.ReactNode
}

export function DataTableFloatingBar<TData extends RowData>({
  children,
}: DataTableFloatingBarProps<TData>) {
  const { table, rowSelection } = useDataTable<TData, unknown>()
  const selectedRowCount = Object.keys(rowSelection).length

  const selectedRows = React.useMemo(() => {
    return table.getFilteredSelectedRowModel().rows
    // rowSelection is not used directly but serves as an invalidation trigger
  }, [table, rowSelection])

  useHotKey(() => table.resetRowSelection(), "x", { shift: true })

  if (selectedRowCount === 0) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit">
      <div
        className={cn(
          "flex items-center gap-2 border border-border bg-background px-4 py-2.5 shadow-lg",
          boxRadiusClassName
        )}
      >
        <div className="flex items-center gap-1">
          <span className="text-sm whitespace-nowrap text-muted-foreground">
            {selectedRowCount} selected
          </span>
          <TooltipProvider {...TOOLTIP_DELAY}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => table.resetRowSelection()}
                    className="p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Deselect all"
                  />
                }
              >
                <X className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-nowrap">
                  Deselect all <Kbd className="ms-1">⌘ ⇧ X</Kbd>
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="me-1 h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          {children({ rows: selectedRows, table })}
        </div>
      </div>
    </div>
  )
}
