import * as React from "react"
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnVisibilityState,
  PaginationState,
  RowData,
  SortingState,
  TableOptions,
  Updater,
} from "@tanstack/react-table"
import { flexRender, useTable } from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/custom/table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableProvider } from "@/components/data-table/data-table-provider"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type { DataTableFilterField } from "@/components/data-table/types"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { getColumnVisibilityKey } from "@/lib/constants/local-storage"
import { dataTableFeatures, type DataTableFeatures } from "@/lib/table/features"
import { DEFAULT_PAGE_SIZE } from "@/lib/table/pagination"
import { cn } from "@/lib/utils"

export interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
  filterFields?: DataTableFilterField<TData>[]
  /** Namespaces the remembered column visibility. */
  tableId: string
  /** Filters and sort the URL held when the table mounted. */
  defaultColumnFilters?: ColumnFiltersState
  defaultSorting?: SortingState
  getRowId?: TableOptions<DataTableFeatures, TData>["getRowId"]
  emptyMessage?: string
  /**
   * Shown instead of `emptyMessage` when no row is left to show. It renders
   * inside DataTableProvider, so it can read the filters and clear them
   * through `useDataTable`.
   */
  empty?: React.ReactNode
  /** The page the URL held when the table mounted. */
  defaultPagination?: PaginationState
  /**
   * Keeps the page and page size in the store (the URL) as well, under the
   * schema's `page` and `size` keys. The table then turns the page itself:
   * back to the first one when the filters or the sort change, and onto the
   * last one when the page it is on no longer exists.
   */
  syncPagination?: boolean
  /** Classes for the bordered box around the table. */
  className?: string
  /**
   * Classes for every body row. A row that opens a page gets `relative` here,
   * so a cell's link can stretch over the whole row (see milestone-columns).
   */
  rowClassName?: string
}

// One shared array: a fresh `[]` default per render would change the
// provider's memoized context value, re-rendering every consumer each time.
const NO_FILTER_FIELDS: never[] = []

const FIRST_PAGE: PaginationState = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
}

function toFirstPage(pagination: PaginationState): PaginationState {
  return pagination.pageIndex === 0
    ? pagination
    : { ...pagination, pageIndex: 0 }
}

/**
 * The paginated, client-side table from data-table.openstatus.dev's /default
 * route (the registry only ships the infinite one). Every row is in `data`,
 * so filtering, sorting and paging all run in the browser through the row
 * models registered in lib/table/features.ts. Filter state reaches the URL
 * through DataTableProvider's store sync and the nuqs adapter the caller
 * mounts around this component.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  filterFields = NO_FILTER_FIELDS,
  tableId,
  defaultColumnFilters = [],
  defaultSorting = [],
  getRowId,
  emptyMessage = "No results.",
  empty,
  defaultPagination = FIRST_PAGE,
  syncPagination = false,
  className,
  rowClassName,
}: DataTableProps<TData>) {
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>(defaultColumnFilters)
  const [sorting, setSorting] = React.useState<SortingState>(defaultSorting)
  const [pagination, setPagination] =
    React.useState<PaginationState>(defaultPagination)
  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<ColumnVisibilityState>(getColumnVisibilityKey(tableId), {})

  // Memoized because v9's `useTable` hands back a new table whenever the
  // options object changes identity, and DataTableProvider memoizes on it.
  // Without `syncPagination`, pagination is left on its defaults: with
  // client-side row models the page index resets by itself when the filters
  // or sorting change. That reset also fires when `data` changes, and skips
  // the first computation only, so a URL-held page turns it off and resets
  // on filter and sort changes alone.
  // https://tanstack.com/table/latest/docs/guide/pagination#auto-reset-page-index
  const onColumnFiltersChange = React.useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      setColumnFilters(updater)
      if (syncPagination) setPagination(toFirstPage)
    },
    [syncPagination]
  )
  const onSortingChange = React.useCallback(
    (updater: Updater<SortingState>) => {
      setSorting(updater)
      if (syncPagination) setPagination(toFirstPage)
    },
    [syncPagination]
  )
  const tableOptions = React.useMemo(
    () => ({
      features: dataTableFeatures,
      data,
      columns,
      getRowId,
      state: { columnFilters, sorting, columnVisibility, pagination },
      onColumnFiltersChange,
      onSortingChange,
      onColumnVisibilityChange: setColumnVisibility,
      onPaginationChange: setPagination,
      enableColumnFilters: true,
      autoResetPageIndex: syncPagination ? false : undefined,
    }),
    [
      data,
      columns,
      getRowId,
      columnFilters,
      sorting,
      columnVisibility,
      pagination,
      onColumnFiltersChange,
      onSortingChange,
      setColumnVisibility,
      syncPagination,
    ]
  )

  const table = useTable(tableOptions)
  const rows = table.getRowModel().rows

  // A page past the end (fewer rows than when the URL was written, or a page
  // typed by hand) moves to the last page there is. Set during render, so the
  // empty page is never painted.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const lastPageIndex = Math.max(table.getPageCount() - 1, 0)
  if (syncPagination && pagination.pageIndex > lastPageIndex) {
    setPagination({ ...pagination, pageIndex: lastPageIndex })
  }

  return (
    <DataTableProvider
      table={table}
      columns={columns}
      filterFields={filterFields}
      columnFilters={columnFilters}
      sorting={sorting}
      columnVisibility={columnVisibility}
      pagination={pagination}
      syncPagination={syncPagination}
    >
      <div className="flex w-full flex-col gap-4">
        <DataTableToolbar />
        <div className={cn("rounded-xl border", className)}>
          <Table>
            <TableHeader className="bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={header.column.columnDef.meta?.headerClassName}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow key={row.id} className={rowClassName}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cell.column.columnDef.meta?.cellClassName}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className={cn(
                      "text-center",
                      !empty && "h-24 text-muted-foreground"
                    )}
                  >
                    {empty ?? emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DataTablePagination />
      </div>
    </DataTableProvider>
  )
}
