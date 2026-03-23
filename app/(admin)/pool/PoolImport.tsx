'use client'

import { useState, useTransition } from 'react'
import { parsePoolDataAction, confirmPoolImportAction } from './actions'
import type { ParsedPlayer, ParsePoolResult } from './actions'

// ============================================================
// Rating class badge
// ============================================================

const RC_COLORS: Record<string, string> = {
  GK:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  DEF: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  MID: 'bg-green-500/20 text-green-300 border-green-500/30',
  ATT: 'bg-red-500/20 text-red-300 border-red-500/30',
}

function RCBadge({ rc }: { rc: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono font-bold',
        RC_COLORS[rc] ?? 'bg-[#2e2e42] text-[#8888aa] border-[#3a3a52]',
      ].join(' ')}
    >
      {rc}
    </span>
  )
}

// ============================================================
// Step indicator
// ============================================================

const STEPS = [
  { label: 'SofaScore' },
  { label: 'FotMob' },
  { label: 'Leghe CSV' },
  { label: 'Anteprima' },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center">
          <div
            className={[
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
              i < current
                ? 'bg-indigo-500 text-white'
                : i === current
                ? 'border-2 border-indigo-500 bg-indigo-500/10 text-indigo-300'
                : 'border border-[#2e2e42] bg-[#13131e] text-[#55556a]',
            ].join(' ')}
          >
            {i < current ? '✓' : i + 1}
          </div>
          <span
            className={[
              'ml-2 text-xs',
              i === current ? 'text-[#f0f0fa]' : 'text-[#55556a]',
            ].join(' ')}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <div className="mx-3 h-px w-6 bg-[#2e2e42]" />
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Main component
// ============================================================

export function PoolImport() {
  const [step, setStep] = useState(0)
  const [ssRaw, setSsRaw] = useState('')
  const [fmRaw, setFmRaw] = useState('')
  const [legheCSV, setLegheCSV] = useState('')
  const [parseResult, setParseResult] = useState<ParsePoolResult | null>(null)
  const [importResult, setImportResult] = useState<{
    imported: number
    updated: number
    error: string | null
  } | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  // ---- Step 3 → Step 4: parse ----
  function handleAnalyze() {
    startParsing(async () => {
      const fd = new FormData()
      fd.set('sofascore_raw', ssRaw)
      fd.set('fotmob_raw', fmRaw)
      fd.set('leghe_csv', legheCSV)
      const result = await parsePoolDataAction(fd)
      setParseResult(result)
      if (!result.error) {
        setStep(3)
      }
    })
  }

  // ---- Step 4: confirm import ----
  function handleConfirm() {
    if (!parseResult?.preview) return
    startImporting(async () => {
      const result = await confirmPoolImportAction(parseResult.preview, '2024-25')
      setImportResult(result)
    })
  }

  return (
    <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d18] p-6">
      <div className="mb-6">
        <StepIndicator current={step} />
      </div>

      {/* ---- Step 0: SofaScore ---- */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#f0f0fa]">
              Incolla la tabella da SofaScore (Serie A stats)
            </label>
            <p className="mb-2 text-xs text-[#55556a]">
              Vai su SofaScore → Serie A → Statistiche, seleziona tutto il contenuto della pagina e incolla qui. Il parser cercherà i link ai profili giocatore.
            </p>
            <textarea
              rows={10}
              value={ssRaw}
              onChange={(e) => setSsRaw(e.target.value)}
              placeholder="https://www.sofascore.com/football/player/name/123456 ..."
              className="w-full resize-y rounded-lg border border-[#2e2e42] bg-[#13131e] px-3 py-2 font-mono text-xs text-[#f0f0fa] placeholder-[#55556a] outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Avanti →
            </button>
          </div>
        </div>
      )}

      {/* ---- Step 1: FotMob ---- */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#f0f0fa]">
              Incolla la tabella da FotMob (Serie A stats)
            </label>
            <p className="mb-2 text-xs text-[#55556a]">
              Vai su FotMob → Serie A → Stats, seleziona tutto il contenuto della pagina e incolla qui. Il parser cercherà i link ai profili giocatore.
            </p>
            <textarea
              rows={10}
              value={fmRaw}
              onChange={(e) => setFmRaw(e.target.value)}
              placeholder="https://www.fotmob.com/en-GB/players/605224/name ..."
              className="w-full resize-y rounded-lg border border-[#2e2e42] bg-[#13131e] px-3 py-2 font-mono text-xs text-[#f0f0fa] placeholder-[#55556a] outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="rounded-lg border border-[#2e2e42] px-4 py-2 text-sm text-[#8888aa] hover:bg-[#1a1a24] hover:text-[#f0f0fa] transition-colors"
            >
              ← Indietro
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Avanti →
            </button>
          </div>
        </div>
      )}

      {/* ---- Step 2: Leghe CSV ---- */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#f0f0fa]">
              Incolla il CSV da Leghe Fantacalcio
            </label>
            <p className="mb-2 text-xs text-[#55556a]">
              Esporta i giocatori dalla tua piattaforma (formato: <span className="font-mono">Nome;Squadra;Ruolo</span> oppure <span className="font-mono">Id;Nome;Squadra;Ruolo;Quota</span>). I ruoli Mantra supportati: P, Dc, Dd, Ds, E, M, C, T, W, A, Pc.
            </p>
            <textarea
              rows={12}
              value={legheCSV}
              onChange={(e) => setLegheCSV(e.target.value)}
              placeholder={'Id;Nome;Squadra;Ruolo;Quota\n1;Locatelli Manuel;Juventus;C;12\n2;Dimarco Federico;Inter;Ds/E;28'}
              className="w-full resize-y rounded-lg border border-[#2e2e42] bg-[#13131e] px-3 py-2 font-mono text-xs text-[#f0f0fa] placeholder-[#55556a] outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>

          {parseResult?.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {parseResult.error}
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-[#2e2e42] px-4 py-2 text-sm text-[#8888aa] hover:bg-[#1a1a24] hover:text-[#f0f0fa] transition-colors"
            >
              ← Indietro
            </button>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isParsing}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {isParsing ? 'Analisi in corso…' : 'Analizza →'}
            </button>
          </div>
        </div>
      )}

      {/* ---- Step 3: Preview & Confirm ---- */}
      {step === 3 && parseResult && (
        <div className="space-y-5">
          {/* Stats summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Totale', value: parseResult.stats.total, color: 'text-white' },
              { label: 'Con SS ID', value: parseResult.stats.matched_ss, color: 'text-green-400' },
              { label: 'Con FM ID', value: parseResult.stats.matched_fm, color: 'text-green-400' },
              { label: 'Entrambi', value: parseResult.stats.matched_both, color: 'text-indigo-400' },
              {
                label: 'Da completare',
                value: parseResult.stats.needs_roles,
                color: parseResult.stats.needs_roles > 0 ? 'text-amber-400' : 'text-[#55556a]',
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-[#2e2e42] bg-[#13131e] px-3 py-2 text-center"
              >
                <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
                <div className="mt-0.5 text-xs text-[#55556a]">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Warning for missing roles */}
          {parseResult.stats.needs_roles > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              ⚠ {parseResult.stats.needs_roles} giocatori senza ruoli — verranno importati con rating_class derivata da zero ruoli (MID di default). Potrai aggiornare i ruoli dalla pagina Giocatori.
            </div>
          )}

          {/* Preview table */}
          <div>
            <p className="mb-2 text-xs text-[#55556a]">
              Anteprima dei primi 20 giocatori su {parseResult.preview.length}
            </p>
            <div className="overflow-x-auto rounded-lg border border-[#2e2e42]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2e2e42] text-left">
                    {['Nome', 'Squadra', 'Ruoli', 'Classe', 'SS', 'FM'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-[#8888aa]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e2a]">
                  {parseResult.preview.slice(0, 20).map((p, idx) => (
                    <tr key={idx} className="hover:bg-[#13131e]">
                      <td className="px-3 py-2 font-medium text-white">{p.full_name}</td>
                      <td className="px-3 py-2 text-[#8888aa]">{p.club || '—'}</td>
                      <td className="px-3 py-2">
                        {p.mantra_roles.length > 0 ? (
                          <span className="text-xs text-[#f0f0fa]">{p.mantra_roles.join('/')}</span>
                        ) : (
                          <span className="text-xs text-[#55556a]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <RCBadge rc={p.rating_class} />
                      </td>
                      <td className="px-3 py-2">
                        {p.sofascore_id ? (
                          <span className="text-xs text-green-400">✓ {p.sofascore_id}</span>
                        ) : (
                          <span className="text-xs text-[#55556a]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.fotmob_id ? (
                          <span className="text-xs text-green-400">✓ {p.fotmob_id}</span>
                        ) : (
                          <span className="text-xs text-[#55556a]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import result */}
          {importResult && (
            <div
              className={[
                'rounded-lg border px-4 py-3 text-sm',
                importResult.error
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : 'border-green-500/30 bg-green-500/10 text-green-400',
              ].join(' ')}
            >
              {importResult.error
                ? `Errore: ${importResult.error}`
                : `Importazione completata — ${importResult.imported} giocatori nel pool.`}
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => { setStep(2); setParseResult(null); setImportResult(null) }}
              className="rounded-lg border border-[#2e2e42] px-4 py-2 text-sm text-[#8888aa] hover:bg-[#1a1a24] hover:text-[#f0f0fa] transition-colors"
            >
              ← Modifica dati
            </button>
            {!importResult?.imported ? (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isImporting || parseResult.preview.length === 0}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
              >
                {isImporting ? 'Importazione…' : `Conferma Importazione (${parseResult.preview.length})`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStep(0)
                  setSsRaw('')
                  setFmRaw('')
                  setLegheCSV('')
                  setParseResult(null)
                  setImportResult(null)
                }}
                className="rounded-lg bg-[#1a1a24] border border-[#2e2e42] px-4 py-2 text-sm text-[#f0f0fa] hover:bg-[#22222e] transition-colors"
              >
                Nuova importazione
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Re-export for convenience
export type { ParsedPlayer }
