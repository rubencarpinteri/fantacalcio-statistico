'use client'

import { useState, useTransition } from 'react'
import { parseAndMatchAction, confirmLineupImportAction, saveTeamLegheAliasAction } from './actions'
import type {
  TeamLineupPreview,
  ParseAndMatchResult,
  ConfirmedTeamLineup,
  ConfirmedPlayer,
  ConfirmLineupImportResult,
} from './actions'

interface Props {
  matchdayId: string
  matchdayName: string
}

type Step = 'paste' | 'preview' | 'done'

export function LineupTextImport({ matchdayId, matchdayName }: Props) {
  const [step, setStep] = useState<Step>('paste')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<TeamLineupPreview[]>([])
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string }[]>([])
  // teamOverrides: index in preview[] → manually-selected teamId
  const [teamOverrides, setTeamOverrides] = useState<Record<number, string>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<ConfirmLineupImportResult | null>(null)
  const [isParsing, startParse] = useTransition()
  const [isConfirming, startConfirm] = useTransition()

  // ── Step 1 → 2: parse and match ───────────────────────────────────────────
  function handleAnalyze() {
    setParseError(null)
    setTeamOverrides({})
    startParse(async () => {
      const res: ParseAndMatchResult = await parseAndMatchAction(matchdayId, text)
      if (!res.ok) {
        setParseError(res.error ?? 'Errore sconosciuto.')
        return
      }
      setPreview(res.teams)
      setAvailableTeams(res.availableTeams)
      setStep('preview')
    })
  }

  // A team is "ready" if either canImport is true, OR the team was only blocked
  // because it wasn't matched AND the admin has manually selected a team override.
  function isEffectivelyReady(team: TeamLineupPreview, idx: number): boolean {
    if (team.canImport) return true
    const override = teamOverrides[idx]
    if (!override) return false
    // Check that the only blocking errors are the team-not-found error
    const nonTeamErrors = team.errors.filter(
      (e) => !e.startsWith('Squadra non trovata')
    )
    return nonTeamErrors.length === 0 && !!team.formationId && team.players.every(
      (p) => !p.isBench ? (p.playerId && p.slotId) : true
    )
  }

  // ── Step 2 → 3: confirm import ────────────────────────────────────────────
  function handleConfirm() {
    const lineups: ConfirmedTeamLineup[] = preview
      .flatMap((t, idx) => {
        if (!isEffectivelyReady(t, idx)) return []
        const overrideTeamId = teamOverrides[idx]
        const resolvedTeamId = overrideTeamId ?? t.teamId!
        const overrideTeam = overrideTeamId
          ? availableTeams.find((at) => at.id === overrideTeamId)
          : null
        return [{
          teamId:      resolvedTeamId,
          teamName:    overrideTeam?.name ?? t.teamDbName ?? t.inputName,
          formationId: t.formationId!,
          players: t.players
            .filter((p) => p.playerId && p.slotId)
            .map((p): ConfirmedPlayer => ({
              playerId:     p.playerId!,
              slotId:       p.slotId!,
              assignedRole: p.assignedRole,
              isBench:      p.isBench,
              benchOrder:   p.benchOrder,
            })),
        }]
      })

    startConfirm(async () => {
      const res = await confirmLineupImportAction(matchdayId, lineups)
      setResult(res)
      setStep('done')
    })
  }

  const readyCount = preview.filter((t, idx) => isEffectivelyReady(t, idx)).length
  const errorCount = preview.filter((t, idx) => !isEffectivelyReady(t, idx)).length

  // ─── STEP 1: PASTE ────────────────────────────────────────────────────────
  if (step === 'paste') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-[#8888aa] mb-3">
            Copia il testo delle formazioni da Leghe e incollalo qui sotto.
            Puoi incollare tutte le 5 sfide (10 squadre) in un unico blocco.
          </p>
          <div className="rounded-lg border border-[#2e2e42] bg-[#0d0d14] p-3 text-xs text-[#55556a] font-mono mb-3">
            Formato atteso: <span className="text-indigo-400">#SQUADRA# (3-4-2-1): P1; P2, P3; ... (panchina: B1, B2, ...)</span>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`#OFF# (3-4-2-1):\tMaignan; Heggem; Buongiorno, Romagnoli; ...\t(panchina:\tPellegrino M., ...)\t\t---\t\t#Isamu Martire# (3-4-2-1):\t...`}
          rows={12}
          className="w-full rounded-lg border border-[#2e2e42] bg-[#0d0d14] px-4 py-3 text-sm text-[#e0e0f0] placeholder-[#383850] font-mono resize-y focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
          spellCheck={false}
        />

        {parseError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {parseError}
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={!text.trim() || isParsing}
          className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isParsing ? 'Analisi in corso…' : 'Analizza formazioni →'}
        </button>
      </div>
    )
  }

  // ─── STEP 2: PREVIEW ──────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="space-y-5">
        {/* Summary bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#8888aa]">
              Trovate <span className="text-white font-semibold">{preview.length}</span> squadre
            </span>
            {readyCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                ✓ {readyCount} pronte
              </span>
            )}
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                ✗ {errorCount} con errori
              </span>
            )}
          </div>
          <button
            onClick={() => { setStep('paste'); setPreview([]) }}
            className="text-xs text-[#55556a] hover:text-indigo-400"
          >
            ← Modifica testo
          </button>
        </div>

        {/* Team cards */}
        <div className="space-y-3">
          {preview.map((team, ti) => (
            <TeamCard
              key={ti}
              team={team}
              isReady={isEffectivelyReady(team, ti)}
              availableTeams={availableTeams}
              teamOverride={teamOverrides[ti] ?? null}
              onTeamOverride={(id) => setTeamOverrides((prev) => ({ ...prev, [ti]: id }))}
            />
          ))}
        </div>

        {/* Confirm button */}
        {readyCount > 0 && (
          <div className="flex items-center gap-4 pt-2 border-t border-[#1e1e2e]">
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isConfirming
                ? 'Importazione in corso…'
                : `Conferma importazione (${readyCount} squadr${readyCount === 1 ? 'a' : 'e'})`}
            </button>
            {errorCount > 0 && (
              <p className="text-xs text-[#8888aa]">
                {errorCount} squadr{errorCount === 1 ? 'a' : 'e'} con errori verranno saltate.
              </p>
            )}
          </div>
        )}

        {readyCount === 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            Nessuna squadra pronta per l&apos;importazione. Correggi gli errori sopra e riprova.
          </div>
        )}
      </div>
    )
  }

  // ─── STEP 3: DONE ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {result?.ok ? (
        <>
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
            <p className="text-sm font-medium text-green-400">
              Importazione completata: {result.imported} formazioni salvate.
            </p>
            {result.skipped > 0 && (
              <p className="mt-1 text-xs text-amber-400">{result.skipped} squadre saltate per errori.</p>
            )}
          </div>

          <div className="space-y-1.5">
            {result.details.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={d.ok ? 'text-green-400' : 'text-red-400'}>{d.ok ? '✓' : '✗'}</span>
                <span className={d.ok ? 'text-white' : 'text-[#8888aa]'}>{d.teamName}</span>
                {d.error && <span className="text-xs text-red-400">— {d.error}</span>}
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <a
              href={`/matchdays/${matchdayId}/all-lineups`}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Vedi tutte le formazioni →
            </a>
            <button
              onClick={() => { setStep('paste'); setText(''); setPreview([]); setResult(null) }}
              className="rounded-lg border border-[#2e2e42] px-4 py-2 text-sm text-[#8888aa] hover:text-white hover:border-[#3e3e52]"
            >
              Nuova importazione
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {result?.error ?? 'Errore durante l\'importazione.'}
        </div>
      )}
    </div>
  )
}

// ─── TeamCard ─────────────────────────────────────────────────────────────────

interface TeamCardProps {
  team: TeamLineupPreview
  isReady: boolean
  availableTeams: { id: string; name: string }[]
  teamOverride: string | null
  onTeamOverride: (id: string) => void
}

function TeamCard({ team, isReady, availableTeams, teamOverride, onTeamOverride }: TeamCardProps) {
  const [expanded, setExpanded] = useState(!isReady)
  const [aliasSaved, setAliasSaved] = useState(false)
  const starters = team.players.filter((p) => !p.isBench)
  const bench    = team.players.filter((p) => p.isBench)

  const statusBorder = isReady
    ? team.warnings.length > 0
      ? 'border-amber-500/30'
      : 'border-green-500/30'
    : 'border-red-500/30'

  const statusBg = isReady
    ? team.warnings.length > 0
      ? 'bg-amber-500/5'
      : 'bg-green-500/5'
    : 'bg-red-500/5'

  // Show team picker when team wasn't auto-matched
  const needsTeamPicker = !team.teamId

  return (
    <div className={`rounded-xl border ${statusBorder} ${statusBg}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Status dot */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isReady
              ? team.warnings.length > 0 ? 'bg-amber-400' : 'bg-green-400'
              : 'bg-red-400'
          }`} />

          <span className="text-sm font-semibold text-white truncate">
            {teamOverride
              ? availableTeams.find((t) => t.id === teamOverride)?.name ?? team.inputName
              : team.teamDbName ?? team.inputName}
          </span>

          {(team.teamDbName ?? teamOverride) && (team.teamDbName ?? teamOverride) !== team.inputName && (
            <span className="text-xs text-[#55556a] truncate">← "{team.inputName}"</span>
          )}

          <span className="text-xs text-[#8888aa] flex-shrink-0">{team.formationStr}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {isReady && team.warnings.length === 0 && (
            <span className="text-xs text-green-400">✓ pronta</span>
          )}
          {isReady && team.warnings.length > 0 && (
            <span className="text-xs text-amber-400">{team.warnings.length} avvisi</span>
          )}
          {!isReady && (
            <span className="text-xs text-red-400">{team.errors.length} errori</span>
          )}
          <span className="text-[#555570] text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#1e1e2e] px-4 py-3 space-y-3">
          {/* Manual team picker for unmatched teams */}
          {needsTeamPicker && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-2">
              <p className="text-xs text-amber-400">
                ⚠ Squadra "{team.inputName}" non trovata. Seleziona manualmente:
              </p>
              <select
                value={teamOverride ?? ''}
                onChange={async (e) => {
                  const id = e.target.value
                  onTeamOverride(id)
                  setAliasSaved(false)
                  // Auto-save the alias so next imports map this name automatically
                  if (id) {
                    await saveTeamLegheAliasAction(id, team.inputName)
                    setAliasSaved(true)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded border border-[#2e2e42] bg-[#0d0d14] px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500/60"
              >
                <option value="">— scegli squadra —</option>
                {availableTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {aliasSaved && (
                <p className="text-xs text-green-400">
                  ✓ Alias salvato — le prossime importazioni mapperanno automaticamente "{team.inputName}"
                </p>
              )}
            </div>
          )}

          {/* Errors (excluding team-not-found when override is set) */}
          {team.errors.filter((e) => !(needsTeamPicker && teamOverride && e.startsWith('Squadra non trovata'))).length > 0 && (
            <ul className="space-y-1">
              {team.errors
                .filter((e) => !(needsTeamPicker && teamOverride && e.startsWith('Squadra non trovata')))
                .map((e, i) => (
                  <li key={i} className="text-xs text-red-400">✗ {e}</li>
                ))}
            </ul>
          )}

          {/* Warnings */}
          {team.warnings.length > 0 && (
            <ul className="space-y-1">
              {team.warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-400">⚠ {w}</li>
              ))}
            </ul>
          )}

          {/* Starters table */}
          <div>
            <p className="text-xs font-medium text-[#55556a] uppercase tracking-wide mb-1.5">
              Titolari ({starters.length})
            </p>
            <div className="space-y-0.5">
              {starters.map((p, i) => (
                <PlayerRow key={i} player={p} />
              ))}
            </div>
          </div>

          {/* Bench table */}
          {bench.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#55556a] uppercase tracking-wide mb-1.5">
                Panchina ({bench.length})
              </p>
              <div className="space-y-0.5">
                {bench.map((p, i) => (
                  <PlayerRow key={i} player={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PlayerRow({ player }: { player: import('./actions').PlayerPreview }) {
  const matched = !!player.playerId
  const hasSlot = !!player.slotId
  const isProblematic = !matched || (!player.isBench && !hasSlot)

  return (
    <div className={`flex items-center gap-2 text-xs px-2 py-0.5 rounded ${
      isProblematic ? 'bg-red-500/10' : ''
    }`}>
      {player.isBench && player.benchOrder != null && (
        <span className="text-[#383850] w-4 text-right flex-shrink-0">{player.benchOrder}.</span>
      )}
      {!player.isBench && (
        <span className={`w-8 flex-shrink-0 font-mono ${
          player.assignedRole
            ? player.isExtendedSlot ? 'text-amber-400' : 'text-[#8888aa]'
            : 'text-red-400'
        }`}>
          {player.assignedRole ?? '—'}
        </span>
      )}
      <span className={matched ? 'text-white' : 'text-red-400'}>
        {player.dbName ?? player.inputName}
      </span>
      {player.dbName && player.dbName !== player.inputName && (
        <span className="text-[#383850]">← "{player.inputName}"</span>
      )}
      {matched && !player.isBench && !hasSlot && (
        <span className="text-red-400 ml-auto">no slot</span>
      )}
    </div>
  )
}
