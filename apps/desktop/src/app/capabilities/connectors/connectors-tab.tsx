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

import { useMcpServers } from '../mcp/use-mcp-servers'

import { AddServerDialog } from './add-dialog'
import { ConnectorsDirectory } from './connectors-directory'
import { $abandonedConnects, $accountOperations, abandonConnect, accountOperationFor } from './data/account-operations'
import { joinLocalServers, pickAccount } from './data/join'
import { useConnectConnector, useConnectorSwitch, useDisconnectAccount } from './data/mutations'
import { seedLocalServers, startConnectorPersistence, storeLocalServers } from './data/persist'
import { prefetchConnectorTools, usePrefetchConnectedTools } from './data/prefetch'
import { useHostedConnectors, usePluginServers } from './data/queries'
import { cardKey, deriveCards, EMPTY_CONNECTORS_FILTER, forgetAbandoned, hostedCardKey, localServerName } from './derive'
import { HostedConnectorDialog } from './hosted-dialog'
import { LocalConnectorDialog } from './local-dialog'
import { RemoveServerConfirm } from './local-slots'
import { openToolsList, resetOpenedTools } from './tools-summary'
import type { ConnectorCardModel, ConnectorsFilter } from './types'

const toolsListKey = (card: ConnectorCardModel) => (card.residency === 'local' ? localServerName(card) : card.slug)

export interface ConnectorsTabProps {
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

  const local = useMemo(
    () =>
      joinLocalServers({
        servers: mcp.servers,
        status: mcp.statuses,
        toolCounts: mcp.toolCounts,
        usage: mcp.usageByServer
      }),
    [mcp.servers, mcp.statuses, mcp.toolCounts, mcp.usageByServer]
  )

  const lastKnownServers = useMemo(() => seedLocalServers(profile), [profile])
  const pluginServers = usePluginServers(profile)

  const servers = useMemo(
    () => [...(mcp.configLoading ? lastKnownServers : local), ...pluginServers],
    [lastKnownServers, local, mcp.configLoading, pluginServers]
  )

  useEffect(() => {
    if (!mcp.configLoading) {
      storeLocalServers(profile, local)
    }
  }, [local, mcp.configLoading, profile])

  const cards = useMemo(
    () =>
      deriveCards({
        hosted: forgetAbandoned(hosted.rows, new Set(abandoned)),
        local: servers,
        titles: hosted.titles
      }),
    [abandoned, hosted.rows, hosted.titles, servers]
  )

  useEffect(startConnectorPersistence, [])

  useEffect(() => {
    resetOpenedTools()
    $abandonedConnects.set([])
  }, [profile])

  usePrefetchConnectedTools(profile, cards)

  const openCard = useMemo(() => cards.find(card => cardKey(card) === openKey) ?? null, [cards, openKey])

  useOpenFromRoute(cards, setOpenKey)

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

    const url = outcome.operation.targets.find(target => target.connectUrl)?.connectUrl

    if (url) {
      void window.hermesDesktop?.openExternal?.(url)
    }

    setOpenKey(cardKey(card))
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

      case 'reconnect':

      case 'tryAgain':
        void startConnect(card, true)

        return
      case 'stopWaiting': {
        if (open) {
          void write(connector.giveUp(open.opId))

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

    setOpenKey(cardKey(card))
  }

  const busySlug = switcher.pending ?? connector.pending

  const hostedBlank = hosted.phase === 'signedOut' || hosted.phase === 'unavailable'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-2">
      <ConnectorsDirectory
        addYourOwn={
          <Button disabled={mcp.profilePending} onClick={() => setAddOpen(true)} size="xs" variant="outline">
            {copy.add.action}
          </Button>
        }
        busyKey={busySlug === null ? null : hostedCardKey(busySlug)}
        cards={cards}
        filter={filter}
        hostedFailed={hosted.phase === 'failed'}
        loading={(hosted.phase === 'loading' || mcp.configLoading) && cards.length === 0}
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
        onServerToggle={(card, next) => {
          if (card.plugin === undefined) {
            void mcp.setServerEnabled(localServerName(card), next)
          }
        }}
        onVerb={runVerb}
        selectedKey={openKey}
      />

      {openCard?.residency === 'local' ? (
        <LocalConnectorDialog
          card={openCard}
          controller={mcp}
          onClose={() => setOpenKey(null)}
          onRemoveServer={() => setRemoveServer(openCard)}
        />
      ) : null}

      {openCard?.residency === 'hosted' ? (
        <HostedConnectorDialog
          card={openCard}
          hosted={hosted}
          onClose={() => setOpenKey(null)}
          onDisconnect={() => setDisconnecting(openCard)}
          onGiveUp={opId => void write(connector.giveUp(opId))}
          onReconnect={() => void startConnect(openCard, true)}
          onToggleForMe={next => void write(switcher.setEnabled(openCard.slug, next))}
          onVerb={() => runVerb(openCard)}
          profile={profile}
          togglePending={switcher.pending === openCard.slug}
        />
      ) : null}

      <AddServerDialog controller={mcp} onOpenChange={setAddOpen} open={addOpen} profile={profile} />

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

          if (!account) {
            throw new Error(copy.page.disconnectNoAccount)
          }

          const outcome = await remover.disconnect(account.connection_id)

          if (!outcome.ok) {
            throw new Error(readableError(outcome.error, copy.page.writeFailed).message)
          }

          setOpenKey(null)
        }}
        open={disconnecting !== null}
        title={copy.dialog.disconnectTitle(disconnecting?.name ?? '')}
      />
    </div>
  )
}

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
