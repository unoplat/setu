import {
  useFrappeGetCall,
  type Key,
  type SWRConfiguration,
} from "frappe-react-sdk"

/**
 * What a confirm states before something is deleted or archived: "3 linked
 * tasks stay", "2 subtasks are archived with it". The number is the reason to
 * read the confirm, so it is fetched each time one opens and only shown once
 * that fetch has answered.
 *
 * - The hook lives in the confirm's body, which the dialog mounts only while
 *   it is open (Base UI unmounts a closed popup), so a closed confirm fetches
 *   nothing and no conditional `null` key is needed.
 * - The key names the record, so one record's count never stands in for
 *   another's, and `dedupingInterval: 0` makes every mount a fresh request.
 * - A count cached from an earlier open is held back while the fresh one is
 *   in flight (`isValidating`): the confirm says "Counting…" rather than a
 *   number that may have changed since.
 * - frappe-react-sdk bundles its own SWR, so its cache is reached only through
 *   the SDK's exports (`useSWRConfig`), never `swr` itself.
 * https://swr.vercel.app/docs/revalidation
 */
const FRESH: SWRConfiguration = {
  revalidateOnMount: true,
  revalidateOnFocus: false,
  dedupingInterval: 0,
}

export function useConfirmCount<T>(
  method: string,
  params: Record<string, string>,
  key: Key
) {
  const { data, error, isValidating, mutate } = useFrappeGetCall<{
    message: T
  }>(method, params, key, FRESH)
  return {
    /** The fresh answer, or undefined until it arrives. */
    value: data && !isValidating ? data.message : undefined,
    error: isValidating ? undefined : error,
    retry: () => void mutate(),
  }
}

/** "1 task", "3 tasks". */
export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}
