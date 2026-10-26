import * as React from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { ExternalLinkIcon, GitBranchIcon, RefreshCwIcon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { submitOnce, useAppForm } from "@/lib/form"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  submitGitHubManifest,
  useGitHubConnection,
  type GitHubManifestSubmission,
  type ManagedGitHubConnection,
} from "@/lib/github"

export type GitHubResult =
  | "connected"
  | "pending"
  | "registration_failed"
  | "installation_failed"

const CALLBACK_MESSAGES: Record<GitHubResult, string> = {
  connected:
    "GitHub installation connected. Repository access is listed below.",
  pending:
    "GitHub installation is pending confirmation or approval. After GitHub completes it, use Refresh below to check repository access.",
  registration_failed:
    "GitHub App registration could not be completed. Check whether the app was created on GitHub before trying again. If it is already listed below, use Install on GitHub.",
  installation_failed:
    "The installation could not be refreshed. Try Refresh below, or start Install on GitHub again from this page.",
}

export function GitHubSettings({ result }: { result?: GitHubResult }) {
  const { data, error, isLoading, mutate } = useGitHubConnection()

  return (
    <section className="grid gap-4" aria-labelledby="github-heading">
      <div className="grid gap-1">
        <h2
          id="github-heading"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <GitBranchIcon className="size-5" />
          GitHub
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect this site's own GitHub App and choose which repositories it
          may access. Each project then connects one repository and turns on
          Issue sync in its own settings.
        </p>
      </div>
      {result ? (
        <p
          role={
            result === "connected" || result === "pending" ? "status" : "alert"
          }
          className="rounded-xl border p-3 text-sm"
        >
          {CALLBACK_MESSAGES[result]}
        </p>
      ) : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          Loading GitHub connection…
        </p>
      ) : error ? (
        <div className="grid gap-2">
          <p role="alert" className="text-sm text-destructive">
            {frappeErrorMessage(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            Retry
          </Button>
        </div>
      ) : data?.message.can_manage ? (
        <ManageGitHub connection={data.message} onRefresh={() => mutate()} />
      ) : (
        <p className="text-sm text-muted-foreground">
          A System Manager can connect GitHub for this site.
        </p>
      )}
    </section>
  )
}

function ManageGitHub({
  connection,
  onRefresh,
}: {
  connection: ManagedGitHubConnection
  onRefresh: () => Promise<unknown>
}) {
  const create = useFrappePostCall<{ message: GitHubManifestSubmission }>(
    "setu.api.github.start_app_creation"
  )
  const install = useFrappePostCall<{ message: { url: string } }>(
    "setu.api.github.get_install_url"
  )
  const refresh = useFrappePostCall("setu.api.github.refresh_connection")
  const rebind = useFrappePostCall("setu.api.github.confirm_site_url")
  const disconnect = useFrappePostCall("setu.api.github.disconnect")
  const [confirmingDisconnect, setConfirmingDisconnect] = React.useState(false)
  const [confirmingRebind, setConfirmingRebind] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [leaving, setLeaving] = React.useState(false)

  React.useEffect(() => {
    // Back from GitHub may restore this document from the browser's cache.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLeaving(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  const busy =
    leaving ||
    create.loading ||
    install.loading ||
    refresh.loading ||
    rebind.loading ||
    disconnect.loading
  const activeInstallations = connection.installations.filter(
    (installation) => !installation.removed
  )
  const repositories = connection.repositories.filter(
    (repository) => repository.available
  )
  const ready = !connection.configuration_error && !connection.url_changed
  const requestError =
    create.error ||
    install.error ||
    refresh.error ||
    rebind.error ||
    disconnect.error

  async function run(action: () => Promise<unknown>) {
    setActionError(null)
    try {
      await action()
    } catch {
      // The SDK error is rendered below. Do not leave a rejected event promise.
      return
    }
    await onRefresh().catch(() => {
      setActionError(
        "The action completed, but connection status could not be refreshed. Reload this page."
      )
    })
  }

  const form = useAppForm({
    defaultValues: { owner_type: "Organization", organization: "" },
    onSubmit: async ({ value }) => {
      if (leaving) return
      setActionError(null)
      // SDK failures are rendered from its hook state; don't read that state
      // from this async closure, where it may still contain a previous error.
      const response = await create
        .call({
          owner_type: value.owner_type,
          organization: value.organization.trim(),
        })
        .catch(() => null)
      if (!response) return

      setLeaving(true)
      try {
        submitGitHubManifest(response.message)
      } catch (error) {
        setLeaving(false)
        setActionError(
          error instanceof Error ? error.message : "Could not open GitHub."
        )
      }
    },
  })

  return (
    <div className="grid gap-4 rounded-2xl border p-4">
      {connection.configuration_error ? (
        <p role="alert" className="text-sm text-destructive">
          {connection.configuration_error}
        </p>
      ) : null}
      {connection.public_url ? (
        <p className="text-xs break-all text-muted-foreground">
          Public site: {connection.public_url}
        </p>
      ) : null}
      {requestError || actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError || (requestError && frappeErrorMessage(requestError))}
        </p>
      ) : null}

      {!connection.configured ? (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!leaving) void submitOnce(form)
          }}
        >
          <form.Field name="owner_type">
            {(field) => (
              <div className="grid gap-2">
                <label
                  htmlFor="github-owner-type"
                  className="text-sm font-medium"
                >
                  GitHub App owner
                </label>
                <select
                  id="github-owner-type"
                  className="h-9 rounded-xl border bg-background px-3 text-sm"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    form.resetField("organization")
                  }}
                  disabled={busy}
                >
                  <option value="Organization">
                    Organization (recommended)
                  </option>
                  <option value="User">Personal account</option>
                </select>
              </div>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.owner_type}>
            {(ownerType) =>
              ownerType === "Organization" ? (
                <form.Field
                  name="organization"
                  validators={{
                    onChange: ({ value }) =>
                      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(
                        value.trim()
                      )
                        ? undefined
                        : "Enter the GitHub organization login.",
                  }}
                >
                  {(field) => (
                    <div className="grid gap-2">
                      <label
                        htmlFor="github-organization"
                        className="text-sm font-medium"
                      >
                        Organization login
                      </label>
                      <Input
                        id="github-organization"
                        placeholder="your-organization"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby="github-organization-error"
                        disabled={busy}
                      />
                      <span
                        id="github-organization-error"
                        className="text-xs text-destructive"
                      >
                        {field.state.meta.errors.join(" ")}
                      </span>
                    </div>
                  )}
                </form.Field>
              ) : null
            }
          </form.Subscribe>
          <p className="text-xs text-muted-foreground">
            You need permission to create a GitHub App for this owner. The
            private app can only be installed on that account. GitHub will ask
            which repositories it may access; credentials stay on this Envision
            site.
          </p>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                disabled={!ready || busy || !canSubmit || isSubmitting}
              >
                <GitBranchIcon />
                {isSubmitting || leaving
                  ? "Opening GitHub…"
                  : "Create GitHub App"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <a
                href={`https://github.com/apps/${connection.app_slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              >
                {connection.app_slug}
                <ExternalLinkIcon className="size-3" />
              </a>
              <p className="text-xs text-muted-foreground">
                Owner: {connection.owner_login} ·{" "}
                {activeInstallations.length
                  ? "Installed"
                  : "App created, not installed"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !ready}
              onClick={() =>
                void run(async () => {
                  const response = await install.call({})
                  window.location.assign(response.message.url)
                })
              }
            >
              {activeInstallations.length
                ? "Manage repository access"
                : "Install on GitHub"}
              <ExternalLinkIcon />
            </Button>
          </div>

          {connection.url_changed && connection.public_url ? (
            <div className="grid gap-3 rounded-xl bg-muted p-3 text-sm">
              <p className="font-medium">The site's public address changed.</p>
              <p>
                In this GitHub App's settings, update the post-installation
                Setup URL below. Then confirm; Envision will update the webhook
                URL automatically. Do this only on the original site, not a
                restored clone that would compete with it.
              </p>
              <a
                href="https://github.com/settings/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Open GitHub App settings (organization-owned apps are under the
                organization's settings)
              </a>
              <p className="text-xs break-all">
                Setup URL: {connection.callback_urls.setup}
              </p>
              {connection.binding_changed ? (
                <p>
                  This site also looks like a copy of the site that connected
                  GitHub. Confirming makes it the only site that syncs Issues.
                </p>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => rebind.call({ setup_url_updated: true }))
                }
              >
                I updated the Setup URL — confirm new address
              </Button>
            </div>
          ) : null}

          {connection.binding_changed && !connection.url_changed ? (
            <div className="grid gap-3 rounded-xl bg-muted p-3 text-sm">
              <p className="font-medium">
                This site looks like a copy of the site that connected GitHub.
              </p>
              <p>
                Issue sync is stopped here, so two sites never write the same
                Issues. Confirm only if this site should own the integration
                from now on, after disconnecting or retiring the original.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  rebind.reset()
                  setConfirmingRebind(true)
                }}
              >
                This site owns GitHub sync now…
              </Button>
            </div>
          ) : null}

          {connection.missing_events.length ? (
            <p role="alert" className="text-sm text-destructive">
              The app doesn't receive these webhook events:{" "}
              {connection.missing_events.join(", ")}. In the app's settings on
              GitHub, open Permissions & events, subscribe to them, then
              Refresh.
            </p>
          ) : null}

          {activeInstallations.some(
            (installation) => installation.suspended
          ) ? (
            <p role="alert" className="text-sm text-destructive">
              GitHub suspended this installation. Restore access on GitHub, then
              refresh.
            </p>
          ) : null}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                Accessible repositories ({repositories.length})
              </h3>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !ready}
                onClick={() => void run(() => refresh.call({}))}
              >
                <RefreshCwIcon />
                {refresh.loading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            {repositories.length ? (
              <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
                {repositories.map((repository) => (
                  <li
                    key={repository.name}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <a
                      href={repository.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all underline-offset-4 hover:underline"
                    >
                      {repository.full_name}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {repository.private ? "Private" : "Public"}
                      {repository.archived ? " · Archived" : ""}
                      {!repository.has_issues ? " · Issues disabled" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Install the app and select a test repository on GitHub, then
                refresh.
              </p>
            )}
          </div>
          <div className="grid gap-1 border-t pt-3 text-xs text-muted-foreground">
            {connection.last_delivery ? (
              <>
                <p>
                  Last verified webhook: {connection.last_delivery.event}
                  {connection.last_delivery.action
                    ? ` / ${connection.last_delivery.action}`
                    : ""}
                  {" · "}
                  {connection.last_delivery.status}
                  {" · "}
                  {connection.last_delivery.creation}
                </p>
                {connection.last_delivery.error ? (
                  <p>{connection.last_delivery.error}</p>
                ) : null}
              </>
            ) : (
              <p>
                No verified webhook received yet. Use GitHub's webhook settings
                to send a ping.
              </p>
            )}
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || !ready}
            onClick={() => {
              disconnect.reset()
              setConfirmingDisconnect(true)
            }}
          >
            Disconnect GitHub
          </Button>
        </>
      )}

      <AlertDialog
        open={confirmingDisconnect}
        onOpenChange={(open) => {
          if (!busy) setConfirmingDisconnect(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
            <AlertDialogDescription>
              This uninstalls the app from its connected account and removes
              this site's credentials. It does not delete repositories or
              Issues. The app registration remains on GitHub; delete it there if
              no longer needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {connection.project_routes > 0 ? (
            <p className="text-sm">
              It also removes{" "}
              {connection.project_routes === 1
                ? "1 project's repository connection"
                : `${connection.project_routes} projects' repository connections`}
              .{" "}
              {connection.sync_links > 0
                ? `${connection.sync_links === 1 ? "1 synced task pauses" : `${connection.sync_links} synced tasks pause`} and keeps its Issue. Reconnecting the same repositories and turning sync on again resumes them.`
                : "No tasks sync through them."}
            </p>
          ) : null}
          {disconnect.error ? (
            <p role="alert" className="text-sm text-destructive">
              {frappeErrorMessage(disconnect.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await disconnect.call({})
                  setConfirmingDisconnect(false)
                })
              }
            >
              {disconnect.loading ? "Disconnecting…" : "Disconnect"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmingRebind}
        onOpenChange={(open) => {
          if (!busy) setConfirmingRebind(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Make this site the one that syncs?
            </AlertDialogTitle>
            <AlertDialogDescription>
              From now on this site writes to GitHub with this app. If the
              original site still runs with the same app, both would change the
              same Issues: disconnect or retire it first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rebind.error ? (
            <p role="alert" className="text-sm text-destructive">
              {frappeErrorMessage(rebind.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  // The same confirmation as a changed address: it rebinds
                  // the site and re-registers the webhook URL.
                  await rebind.call({ setup_url_updated: true })
                  setConfirmingRebind(false)
                })
              }
            >
              {rebind.loading ? "Confirming…" : "This site owns it"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
