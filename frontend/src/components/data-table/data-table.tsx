import * as React from "react"
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnVisibilityState,
  PaginationState,
  RowData,
  SortingState,
  TableOptions,
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
   * Classes for every body row. A row that opens a page gets `relative` here,
   * so a cell's link can stretch over the whole row (see milestone-columns).
   */
  rowClassName?: string
}

// One shared array: a fresh `[]` default per render would change the
// provider's memoized context value, re-rendering every consumer each time.
const NO_FILTER_FIELDS: never[] = []

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
  rowClassName,
}: DataTableProps<TData>) {
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>(defaultColumnFilters)
  const [sorting, setSorting] = React.useState<SortingState>(defaultSorting)
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<ColumnVisibilityState>(getColumnVisibilityKey(tableId), {})

  // Memoized because v9's `useTable` hands back a new table whenever the
  // options object changes identity, and DataTableProvider memoizes on it.
  // Pagination is left on its defaults: with client-side row models the page
  // index resets by itself when the filters or sorting change.
  const tableOptions = React.useMemo(
    () => ({
      features: dataTableFeatures,
      data,
      columns,
      getRowId,
      state: { columnFilters, sorting, columnVisibility, pagination },
      onColumnFiltersChange: setColumnFilters,
      onSortingChange: setSorting,
      onColumnVisibilityChange: setColumnVisibility,
      onPaginationChange: setPagination,
      enableColumnFilters: true,
    }),
    [
      data,
      columns,
      getRowId,
      columnFilters,
      sorting,
      columnVisibility,
      pagination,
      setColumnVisibility,
    ]
  )

  const table = useTable(tableOptions)
  const rows = table.getRowModel().rows

  return (
    <DataTableProvider
      table={table}
      columns={columns}
      filterFields={filterFields}
      columnFilters={columnFilters}
      sorting={sorting}
      columnVisibility={columnVisibility}
      pagination={pagination}
    >
      <div className="flex w-full flex-col gap-4">
        <DataTableToolbar />
        <div className="rounded-xl border">
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
                    className="h-24 text-center text-muted-foreground"
                  >
                    {emptyMessage}
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
