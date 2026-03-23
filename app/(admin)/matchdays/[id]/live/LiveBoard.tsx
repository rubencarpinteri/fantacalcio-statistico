'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { triggerLiveRefreshAction } from './actions'
import type { LiveScoresResponse, LiveTeamRow, LivePlayerRow } from '@/app/api/matchdays/[id]/live-scores/route'

const POLL_INTERVAL_MS = 60_000

// ── Helpers ───────────────────────────────────────────────────

function roleColor(role: string | null): string {
  switch (role) {
    case 'Por': return 'bg-amber-500/20 text-amber-300'
    case 'Dc': case 'Dd': case 'Ds': return 'bg-blue-500/20 text-blue-300'
    case 'M': case 'C': case 'T': return 'bg-green-500/20 text-green-300'
    case 'W': return 'bg-teal-500/20 text-teal-300'
    case 'A': case 'Pc': return 'bg-red-500/20 text-red-300'
    default: return 'bg-[#2e2e42] text-[#8888aa]'
  }
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s fa`
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`
  return `${Math.floor(diff / 3600)}h fa`
}

function EventBadges({ p }: { p: LivePlayerRow }) {
  const parts: React.ReactNode[] = []
  if (p.goals_scored > 0) parts.push(<span key="g" className="text-green-400">⚽{p.goals_scored > 1 ? `×${p.goals_scored}` : ''}</span>)
  if (p.assists > 0) parts.push(<span key="a" className="text-blue-400">🅰{p.assists > 1 ? `×${p.assists}` : ''}</span>)
  if (p.own_goals > 0) parts.push(<span key="og" className="text-red-500">OG</span>)
  if (p.yellow_cards > 0) parts.push(<span key="y" className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-sm" />)
  if (p.red_cards > 0) parts.push(<span key="r" className="inline-block w-2.5 h-3.5 bg-red-500 rounded-sm" />)
  if (p.penalties_scored > 0) parts.push(<span key="ps" className="text-green-400 text-xs">R+</span>)
  if (p.saves >= 5) parts.push(<span key="sv" className="text-indigo-400 text-xs">Sv{p.saves}</span>)
  return parts.length > 0 ? <span className="flex items-center gap-1">{parts}</span> : null
}

// ── Team card (board view) ─────────────────────────────────────

function TeamCard({
  team,
  rank,
  onClick,
}: {
  team: LiveTeamRow
  rank: number
  onClick: () => void
}) {
  const topScorer = [...team.players]
    .filter((p) => !p.is_bench && p.fantavoto != null)
    .sort((a, b) => (b.fantavoto ?? 0) - (a.fantavoto ?? 0))[0]

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-[#2e2e42] bg-[#111118] p-4 hover:border-indigo-500/50 hover:bg-[#16161f] transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums w-5 ${
            rank === 1 ? 'text-amber-400' : rank <= 3 ? 'text-indigo-300' : 'text-[#55556a]'
          }`}>
            {rank}
          </span>
          <span className="font-semibold text-white truncate">{team.team_name}</span>
        </div>
        <span className="font-mono text-2xl font-bold text-white tabular-nums shrink-0">
          {team.total_fantavoto.toFixed(2)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-[#55556a]">
        <span>{team.player_count} titolari</span>
        {team.nv_count > 0 && (
          <span className="text-amber-400">{team.nv_count} NV</span>
        )}
        {team.players.length === 0 && (
          <span className="text-[#3a3a52]">nessuna formazione</span>
        )}
      </div>

      {topScorer && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[#8888aa]">
          <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${roleColor(topScorer.assigned_mantra_role)}`}>
            {topScorer.assigned_mantra_role ?? '?'}
          </span>
          <span className="truncate">{topScorer.player_name}</span>
          <span className="font-mono text-white ml-auto shrink-0">
            {topScorer.fantavoto?.toFixed(2)}
          </span>
        </div>
      )}

      <div className="mt-2 text-xs text-indigo-400">Dettaglio →</div>
    </button>
  )
}

// ── Player row (detail view) ──────────────────────────────────

function PlayerRow({ p }: { p: LivePlayerRow }) {
  const isNV = p.fantavoto === null && !p.is_bench
  const isBenchUsed = p.sub_status === 'bench_used'
  const isBenchUnused = p.sub_status === 'bench_unused'
  const isBenchNV = p.sub_status === 'bench_nv'
  const isSubbedOut = p.sub_status === 'nv_subbed'

  return (
    <tr className={`border-b border-[#1a1a24] text-xs ${
      isBenchUsed ? 'bg-indigo-500/5' :
      isBenchUnused || isBenchNV ? 'opacity-50' :
      isNV ? 'opacity-60' : ''
    }`}>
      {/* Role */}
      <td className="px-3 py-2 w-10">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${roleColor(p.assigned_mantra_role)}`}>
          {p.assigned_mantra_role ?? '?'}
        </span>
      </td>

      {/* Name + sub indicator */}
      <td className="px-2 py-2">
        <div className="flex items-center gap-1.5">
          {isBenchUsed && (
            <span className="text-indigo-400 text-[10px]">↑</span>
          )}
          {isSubbedOut && (
            <span className="text-red-400 text-[10px]">↓</span>
          )}
          <span className={`font-medium ${
            isBenchUsed ? 'text-indigo-300' :
            isSubbedOut ? 'text-[#55556a] line-through' :
            isNV ? 'text-[#55556a]' : 'text-[#f0f0fa]'
          }`}>
            {p.player_name}
          </span>
          {isBenchUsed && p.extended_penalty < 0 && (
            <span className="text-red-400 text-[10px]">−1</span>
          )}
        </div>
        {p.minutes_played > 0 && (
          <span className="text-[#55556a]">{p.minutes_played}&apos;</span>
        )}
      </td>

      {/* Events */}
      <td className="px-2 py-2">
        <EventBadges p={p} />
      </td>

      {/* SS | FM */}
      <td className="px-2 py-2 text-right font-mono text-[#8888aa] whitespace-nowrap">
        {p.sofascore_rating != null ? p.sofascore_rating.toFixed(1) : '—'}
        <span className="mx-0.5 text-[#2e2e42]">|</span>
        {p.fotmob_rating != null ? p.fotmob_rating.toFixed(2) : '—'}
      </td>

      {/* Fantavoto */}
      <td className="px-3 py-2 text-right font-mono font-bold w-16">
        {isNV || isSubbedOut ? (
          <span className="text-[#55556a] font-normal">NV</span>
        ) : isBenchNV ? (
          <span className="text-[#55556a] font-normal">NV</span>
        ) : p.fantavoto != null ? (
          <span className={
            p.fantavoto >= 7.5 ? 'text-green-400' :
            p.fantavoto >= 6.0 ? 'text-white' : 'text-red-400'
          }>
            {p.fantavoto.toFixed(2)}
          </span>
        ) : (
          <span className="text-[#3a3a52]">—</span>
        )}
      </td>
    </tr>
  )
}

// ── Team detail panel ─────────────────────────────────────────

function TeamDetail({ team, onBack }: { team: LiveTeamRow; onBack: () => void }) {
  const starters = team.players.filter((p) => !p.is_bench)
  const bench = team.players.filter((p) => p.is_bench)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-[#8888aa] hover:text-indigo-400"
        >
          ← Tutti i punteggi
        </button>
      </div>

      <div className="rounded-xl border border-[#2e2e42] bg-[#111118] p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-white">{team.team_name}</h2>
          <span className="font-mono text-3xl font-bold text-white">
            {team.total_fantavoto.toFixed(2)}
          </span>
        </div>
        <div className="mt-1 flex gap-3 text-xs text-[#55556a]">
          <span>{team.player_count} titolari</span>
          {team.nv_count > 0 && (
            <span className="text-amber-400">{team.nv_count} NV senza cambio</span>
          )}
        </div>
      </div>

      {/* Starters */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#55556a]">
          Titolari
        </p>
        <div className="overflow-x-auto rounded-lg border border-[#2e2e42]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2e2e42] text-[10px] uppercase tracking-wider text-[#55556a]">
                <th className="px-3 py-2 text-left">Ruolo</th>
                <th className="px-2 py-2 text-left">Giocatore</th>
                <th className="px-2 py-2 text-left">Eventi</th>
                <th className="px-2 py-2 text-right">SS | FM</th>
                <th className="px-3 py-2 text-right">FV</th>
              </tr>
            </thead>
            <tbody>
              {starters.map((p) => (
                <PlayerRow key={p.player_id} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#55556a]">
            Panchina
          </p>
          <div className="overflow-x-auto rounded-lg border border-[#2e2e42]">
            <table className="w-full">
              <tbody>
                {bench.map((p) => (
                  <PlayerRow key={p.player_id} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {team.players.length === 0 && (
        <p className="text-sm text-[#55556a]">Nessuna formazione inviata.</p>
      )}
    </div>
  )
}

// ── Main LiveBoard component ──────────────────────────────────

export function LiveBoard({
  matchdayId,
  matchdayName,
  isAdmin,
  initialData,
}: {
  matchdayId: string
  matchdayName: string
  isAdmin: boolean
  initialData: LiveScoresResponse
}) {
  const [data, setData] = useState<LiveScoresResponse>(initialData)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [lastPollTime, setLastPollTime] = useState<Date>(new Date())
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [, forceRender] = useState(0)

  // Poll the GET route every 60s
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/matchdays/${matchdayId}/live-scores`, {
        cache: 'no-store',
      })
      if (res.ok) {
        const json = (await res.json()) as LiveScoresResponse
        setData(json)
        setLastPollTime(new Date())
      }
    } catch {
      // silent — keep showing last known data
    }
  }, [matchdayId])

  useEffect(() => {
    const id = setInterval(poll, POLL_INTERVAL_MS)
    // Also tick the "X min fa" display every 30s
    const tick = setInterval(() => forceRender((n) => n + 1), 30_000)
    return () => { clearInterval(id); clearInterval(tick) }
  }, [poll])

  function handleManualRefresh() {
    setRefreshError(null)
    startTransition(async () => {
      const result = await triggerLiveRefreshAction(matchdayId)
      if (result.ok) {
        await poll()
      } else {
        setRefreshError(result.error ?? 'Errore sconosciuto')
      }
    })
  }

  const selectedTeam = selectedTeamId
    ? data.teams.find((t) => t.team_id === selectedTeamId) ?? null
    : null

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {data.refreshed_at ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <span className="text-[#8888aa]">
                Aggiornato {timeAgo(data.refreshed_at)}
                <span className="ml-1 text-[#3a3a52]">· si aggiorna ogni 60s</span>
              </span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-[#3a3a52]" />
              <span className="text-[#55556a]">Nessun dato live</span>
            </>
          )}
        </div>

        {isAdmin && (
          <button
            onClick={handleManualRefresh}
            disabled={isPending}
            className="rounded-lg border border-[#2e2e42] bg-[#111118] px-3 py-1.5 text-xs font-medium text-[#8888aa] hover:border-indigo-500/50 hover:text-indigo-400 disabled:opacity-40"
          >
            {isPending ? 'Aggiornamento…' : '↻ Aggiorna ora'}
          </button>
        )}
      </div>

      {refreshError && (
        <p className="text-sm text-red-400">{refreshError}</p>
      )}

      {/* No data state */}
      {data.teams.length === 0 && (
        <div className="rounded-xl border border-[#2e2e42] bg-[#111118] px-6 py-10 text-center">
          <p className="text-[#55556a]">
            Nessun punteggio live disponibile per <span className="text-white">{matchdayName}</span>.
          </p>
          {isAdmin && (
            <p className="mt-2 text-xs text-[#3a3a52]">
              Clicca &ldquo;Aggiorna ora&rdquo; per avviare il primo calcolo live,
              oppure configura il cron su cron-job.org per aggiornamenti automatici ogni 5 minuti.
            </p>
          )}
        </div>
      )}

      {/* Detail view */}
      {selectedTeam && (
        <TeamDetail team={selectedTeam} onBack={() => setSelectedTeamId(null)} />
      )}

      {/* Full board grid */}
      {!selectedTeam && data.teams.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.teams.map((team, idx) => (
            <TeamCard
              key={team.team_id}
              team={team}
              rank={idx + 1}
              onClick={() => setSelectedTeamId(team.team_id)}
            />
          ))}
        </div>
      )}

      {/* Setup hint for admin */}
      {isAdmin && data.teams.length > 0 && !selectedTeam && (
        <div className="rounded-lg border border-[#2e2e42] bg-[#0f0f1a] px-4 py-3 text-xs text-[#55556a] space-y-1">
          <p className="font-medium text-[#8888aa]">Aggiornamento automatico</p>
          <p>
            Su Vercel Hobby il cron non è disponibile. Configura un task su{' '}
            <span className="text-indigo-400">cron-job.org</span> che chiama:
          </p>
          <code className="block rounded bg-[#1a1a24] px-3 py-1.5 font-mono text-[#f0f0fa]">
            GET /api/cron/live-ratings
            <br />
            Authorization: Bearer {'<'}CRON_SECRET{'>'}
          </code>
          <p>ogni 5 minuti mentre la giornata è in corso.</p>
        </div>
      )}
    </div>
  )
}
