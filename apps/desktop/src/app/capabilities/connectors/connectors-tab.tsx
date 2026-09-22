import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { HermesGateway, ProfileScope } from '@/hermes'
import { useI18n } from '@/i18n'
import { $freeTierStatus } from '@/store/free-tier'
import { openFreeTierSignIn } from '@/store/free-tier-sign-in'
import { notifyError, readableError } from '@/store/notifications'

import { installBundledEntry } from '../mcp/install-catalog-entry'
import { useMcpServers } from '../mcp/use-mcp-servers'

import { AddServerDialog } from './add-dialog'
import { ConnectorsDirectory } from './connectors-directory'
import { $abandonedConnects, $accountOperations, abandonConnect, accountOperationFor } from './data/account-operations'
import { joinBundledEntries, joinLocalServers, pickAccount } from './data/join'
import { useConnectConnector, useConnectorSwitch, useDisconnectAccount } from './data/mutations'
import { seedLocalServers, startConnectorPersistence, storeLocalServers } from './data/persist'
import { prefetchConnectorTools, usePrefetchConnectedTools } from './data/prefetch'
import { useHostedConnectors } from './data/queries'
import { deriveCards, EMPTY_CONNECTORS_FILTER, forgetAbandoned, localServerName } from './derive'
import { HostedConnectorDialog } from './hosted-dialog'
import { LocalConnectorDialog } from './local-dialog'
import { RemoveServerConfirm } from './local-slots'
import { openToolsList } from './tools-summary'
import type { ConnectorCardModel, ConnectorsFilter } from './types'

/** Stable across an install: a card that gains a server on this Mac keeps the key its dialog was opened with. */
const cardKey = (card: ConnectorCardModel) => (card.ways.hosted ? card.slug : `local:${card.slug}`)

/** The list the card's own dialog shows, named as `ToolsList` remembers it. */
const toolsListKey = (card: ConnectorCardModel) => (card.residency === 'local' ? localServerName(card) : card.slug)

export interface ConnectorsTabProps {
  /** Only backs the live `reload.mcp` RPC; withheld for a cross-backend scope. */
  gateway: HermesGateway | null
  profile: ProfileScope
}

export function ConnectorsTab({ gateway, profile }: ConnectorsTabProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage

  const hosted = useHostedConnectors(profile)
  const mcp = useMcpServers({ gateway, profile })
  const operations = useStore($accountOperations)
  const abandoned = useStore($abandonedConnects)
  const freeTier = useStore($freeTierStatus)

  const connector = useConnectConnector(profile)
  const switcher = useConnectorSwitch(profile)
  const remover = useDisconnectAccount(profile)

  const [filter, setFilter] = useState<ConnectorsFilter>(EMPTY_CONNECTORS_FILTER)
  const [openKey, setOpenKey] = useState<null | string>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [removeServer, setRemoveServer] = useState<null | ConnectorCardModel>(null)
  const [disconnecting, setDisconnecting] = useState<null | ConnectorCardModel>(null)
  const [installing, setInstalling] = useState<null | string>(null)

  const local = useMemo(
    () =>
      joinLocalServers({
        catalog: mcp.catalog,
        servers: mcp.servers,
        status: mcp.statuses,
        toolCounts: mcp.toolCounts,
        usage: mcp.usageByServer
      }),
    [mcp.catalog, mcp.servers, mcp.statuses, mcp.toolCounts, mcp.usageByServer]
  )

  const bundled = useMemo(() => joinBundledEntries(mcp.availableCatalog), [mcp.availableCatalog])

  // The config read answers seconds after the first paint, so the last known servers hold the group.
  const lastKnownServers = useMemo(() => seedLocalServers(profile), [profile])
  const servers = mcp.configLoading ? lastKnownServers : local

  useEffect(() => {
    if (!mcp.configLoading) {
      storeLocalServers(profile, local)
    }
  }, [local, mcp.configLoading, profile])

  const cards = useMemo(
    () =>
      deriveCards({
        bundled,
        hosted: forgetAbandoned(hosted.rows, new Set(abandoned)),
        local: servers,
        titles: hosted.titles
      }),
    [abandoned, bundled, hosted.rows, hosted.titles, servers]
  )

  useEffect(startConnectorPersistence, [])
  usePrefetchConnectedTools(profile, cards)

  const openCard = useMemo(() => cards.find(card => cardKey(card) === openKey) ?? null, [cards, openKey])

  useOpenFromRoute(cards, setOpenKey)

  /** Report a refused write once: the hooks answer with an outcome rather than throwing. */
  const write = async (pending: Promise<{ error?: unknown; ok: boolean }>) => {
    const outcome = await pending

    if (!outcome.ok) {
      notifyError(outcome.error, copy.page.writeFailed)
    }
  }

  const startConnect = async (card: ConnectorCardModel, reconnect: boolean) => {
    const outcome = await connector.connect(card.slug, { reconnect })

    if (!outcome.ok) {
      notifyError(outcome.error, t.connectors.connectErrorFor(card.name))

      return
    }

    // The first target's link is minted with the reply and nowhere else.
    const url = outcome.operation.targets.find(target => target.connectUrl)?.connectUrl

    if (url) {
      void window.hermesDesktop?.openExternal?.(url)
    }

    setOpenKey(cardKey(card))
  }

  const bundledEntry = (card: ConnectorCardModel) =>
    mcp.availableCatalog.find(candidate => candidate.name === card.ways.local?.entryName) ?? null

  /** Install a bundled entry from its card or its dialog. Nothing is painted as installed before the call returns. */
  const startInstall = async (card: ConnectorCardModel, env: Record<string, string>) => {
    const entry = bundledEntry(card)

    if (!entry) {
      return
    }

    setInstalling(card.slug)

    try {
      await installBundledEntry(entry, env, profile)
      // The new server only exists once the config and the catalog have been re-read.
      await mcp.onCatalogInstalled()
      setOpenKey(cardKey(card))
    } catch (error) {
      notifyError(error, t.settings.mcp.catalogInstallFailed(card.name))
    } finally {
      setInstalling(null)
    }
  }

  const runVerb = (card: ConnectorCardModel) => {
    const open = accountOperationFor(operations, card.slug)

    switch (card.verb) {
      case 'authenticate':
        void mcp.authenticate(localServerName(card))

        return

      case 'connect':
        void startConnect(card, false)

        return

      // An entry that asks for credentials cannot install from a card: the fields live in the dialog.
      case 'install':
        if (card.ways.local?.entryName && card.ways.local.needsEnv !== true) {
          void startInstall(card, {})

          return
        }

        break

      case 'reconnect':
        void startConnect(card, true)

        return
      // The operation dies with this window; the pending account outlives it, so the row itself has to go.
      case 'stopWaiting': {
        if (open) {
          void connector.giveUp(open.opId)

          return
        }

        abandonConnect([card.slug])

        const pending = pickAccount(hosted.accounts, card.slug)

        if (pending) {
          void write(remover.disconnect(pending.connection_id))
        }

        return
      }

      case 'turnBackOn':
        void write(switcher.setEnabled(card.slug, true))

        return

      default:
        break
    }

    // openLogs, a stopWaiting nothing here holds, and any later verb: the dialog is always a true answer.
    setOpenKey(cardKey(card))
  }

  const startAdd = () => {
    mcp.addServer()
    setAddOpen(true)
  }

  // Nothing hosted can be reached at all; the servers on this Mac are unaffected and still render.
  const hostedBlank = hosted.phase === 'signedOut' || hosted.phase === 'unavailable'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-2">
      <ConnectorsDirectory
        addYourOwn={
          <Button disabled={mcp.profilePending} onClick={startAdd} size="xs" variant="outline">
            {copy.add.title}
          </Button>
        }
        // Every write a card's verb can start: the switch's `Turn back on`, a connect, and an install.
        busySlug={installing ?? switcher.pending ?? connector.pending}
        cards={cards}
        filter={filter}
        hostedFailed={hosted.phase === 'failed'}
        loading={hosted.phase === 'loading' && cards.length === 0}
        notices={
          <>
            {hostedBlank ? (
              <p className="flex shrink-0 items-center gap-1 text-[0.7rem] text-(--ui-text-tertiary)">
                {copy.page.signInLine}
                <Button onClick={() => openFreeTierSignIn()} size="xs" variant="text">
                  {copy.page.signIn}
                </Button>
              </p>
            ) : null}

            {/* The apps answer for a free-tier identity; only what a sign-in would add is worth a line. */}
            {!hostedBlank && freeTier?.has_guest === true ? (
              <p className="shrink-0 text-[0.7rem] text-(--ui-text-tertiary)">{copy.page.freeTierNote}</p>
            ) : null}
          </>
        }
        onFilterChange={setFilter}
        onOpen={card => setOpenKey(cardKey(card))}
        onPrefetch={card => {
          if (card.ways.hosted) {
            prefetchConnectorTools(profile, card.slug)
          }
        }}
        onRetryHosted={hosted.refetch}
        onServerToggle={(card, next) => void mcp.setServerEnabled(localServerName(card), next)}
        onVerb={runVerb}
        selectedSlug={openCard?.slug ?? null}
      />

      {openCard?.residency === 'local' ? (
        <LocalConnectorDialog
          card={openCard}
          controller={mcp}
          installFields={bundledEntry(openCard)?.required_env}
          installing={installing === openCard.slug}
          onClose={() => setOpenKey(null)}
          onConnect={() => void startConnect(openCard, false)}
          onInstall={env => void startInstall(openCard, env)}
          onReconnect={() => void startConnect(openCard, true)}
          onRemoveServer={() => setRemoveServer(openCard)}
        />
      ) : null}

      {openCard?.residency === 'hosted' ? (
        <HostedConnectorDialog
          card={openCard}
          connectPending={connector.pending === openCard.slug}
          controller={mcp}
          hosted={hosted}
          installFields={bundledEntry(openCard)?.required_env}
          installing={installing === openCard.slug}
          onClose={() => setOpenKey(null)}
          onConnect={() => void startConnect(openCard, false)}
          onDisconnect={() => setDisconnecting(openCard)}
          onGiveUp={opId => void connector.giveUp(opId)}
          onInstall={env => void startInstall(openCard, env)}
          onReconnect={() => void startConnect(openCard, true)}
          onRemoveServer={() => setRemoveServer(openCard)}
          onToggleForMe={next => void write(switcher.setEnabled(openCard.slug, next))}
          onVerb={() => runVerb(openCard)}
          profile={profile}
          togglePending={switcher.pending === openCard.slug}
        />
      ) : null}

      <AddServerDialog controller={mcp} onOpenChange={setAddOpen} open={addOpen} />

      <RemoveServerConfirm
        card={removeServer}
        controller={mcp}
        onClose={() => setRemoveServer(null)}
        onRemoved={() => setOpenKey(null)}
      />

      <ConfirmDialog
        confirmLabel={copy.dialog.disconnect}
        description={copy.dialog.disconnectBody}
        destructive
        onClose={() => setDisconnecting(null)}
        onConfirm={async () => {
          const card = disconnecting
          const account = card ? pickAccount(hosted.accounts, card.slug) : null

          if (account) {
            const outcome = await remover.disconnect(account.connection_id)

            // Throwing keeps `ConfirmDialog` open with the reason inline; swallowing it would close over a live connection.
            if (!outcome.ok) {
              throw new Error(readableError(outcome.error, copy.page.writeFailed).message)
            }
          }

          setOpenKey(null)
        }}
        open={disconnecting !== null}
        title={copy.dialog.disconnectTitle(disconnecting?.name ?? '')}
      />
    </div>
  )
}

/** The params are dropped only once the card they name exists. */
function useOpenFromRoute(cards: readonly ConnectorCardModel[], open: (key: string) => void): void {
  const { hash, pathname, search } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(search)
    const server = params.get('server')
    const slug = params.get('connector')

    if (!server && !slug) {
      return
    }

    const target = server
      ? cards.find(card => card.residency === 'local' && card.slug === server)
      : cards.find(card => card.slug === slug)

    if (!target) {
      return
    }

    // A link that names a tool lands on the list itself, not on the summary above it.
    if (params.get('tool')) {
      openToolsList(toolsListKey(target))
    }

    open(cardKey(target))
    params.delete('server')
    params.delete('connector')
    params.delete('tool')

    const query = params.toString()
    navigate({ hash, pathname, search: query ? `?${query}` : '' }, { replace: true })
  }, [cards, hash, navigate, open, pathname, search])
}
