import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { useDataTable } from "@/components/data-table/data-table-provider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PAGE_SIZES = [10, 20, 30, 40, 50]

// Ported from data-table.openstatus.dev's /default route, which keeps this
// footer in its app rather than the registry. The page count comes from the
// table's own paginated row model, so it follows the client-side filters.
export function DataTablePagination() {
  const { table, pagination } = useDataTable()
  const pageCount = table.getPageCount()

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 lg:gap-x-8">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">Rows per page</p>
        <Select
          value={String(pagination.pageSize)}
          onValueChange={(value) => {
            if (value) table.setPageSize(Number(value))
          }}
        >
          <SelectTrigger size="sm" className="w-18">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top">
            {PAGE_SIZES.map((pageSize) => (
              <SelectItem key={pageSize} value={String(pageSize)}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm font-medium">
        Page {pagination.pageIndex + 1} of {Math.max(pageCount, 1)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          className="hidden lg:inline-flex"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to first page</span>
          <ChevronsLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to previous page</span>
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to next page</span>
          <ChevronRightIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          className="hidden lg:inline-flex"
          onClick={() => table.setPageIndex(pageCount - 1)}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to last page</span>
          <ChevronsRightIcon />
        </Button>
      </div>
    </div>
  )
}
