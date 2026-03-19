'use client'

import { useState, useTransition, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { parseRosterCsvAction, confirmImportAction } from './actions'
import type { ParsedRow } from './actions'
import type { RatingClass } from '@/types/database.types'

interface Team {
  id: string
  name: string
}

type Step = 'upload' | 'preview' | 'done'

const RATING_CLASS_OPTIONS: RatingClass[] = ['GK', 'DEF', 'MID', 'ATT']

export function ImportPreview({ teams }: { teams: Team[] }) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [overrides, setOverrides] = useState<Record<number, RatingClass>>({})
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [filename, setFilename] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<{
    success: boolean
    imported_count: number
    skipped_count: number
    error: string | null
  } | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setFilename(file.name)
  }

  function handleParse() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setParseError('Seleziona un file CSV.')
      return
    }
    const formData = new FormData()
    formData.set('file', file)

    startTransition(async () => {
      const result = await parseRosterCsvAction(formData)
      if (result.error) {
        setParseError(result.error)
        return
      }
      setParseError(null)
      setRows(result.rows)
      // Pre-fill overrides with auto-resolved classes
      const pre: Record<number, RatingClass> = {}
      for (const row of result.rows) {
        if (row.resolved_rating_class) {
          pre[row.rowIndex] = row.resolved_rating_class
        }
      }
      setOverrides(pre)
      setStep('preview')
    })
  }

  function setOverride(rowIndex: number, rc: RatingClass) {
    setOverrides((prev) => ({ ...prev, [rowIndex]: rc }))
  }

  const validRows = rows.filter(
    (r) => !r.parse_error && r.mantra_roles.length > 0 && overrides[r.rowIndex]
  )
  const errorRows = rows.filter((r) => r.parse_error || r.mantra_roles.length === 0)
  const unconfirmedRows = rows.filter(
    (r) => !r.parse_error && r.needs_confirmation && !overrides[r.rowIndex]
  )

  function handleConfirm() {
    startTransition(async () => {
      const payload = {
        team_id: selectedTeamId || null,
        filename,
        rows: validRows.map((r) => ({
          full_name: r.full_name,
          club: r.club,
          mantra_roles: r.mantra_roles,
          primary_mantra_role: r.primary_mantra_role,
          rating_class: overrides[r.rowIndex]!,
        })),
      }
      const result = await confirmImportAction(payload)
      setSubmitResult(result)
      setStep('done')
    })
  }

  // ---- Step: Upload -------------------------------------------------------
  if (step === 'upload') {
    return (
      <Card>
        <CardHeader
          title="Importa rosa da CSV"
          description="Formato supportato: colonne Nome, Squadra, Ruolo (separati da / o ,)"
        />
        <CardContent className="space-y-4">
          {parseError && <Alert variant="error">{parseError}</Alert>}

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                File CSV
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-[#8888aa] file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
              />
            </div>

            {teams.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                  Assegna alla squadra (opzionale)
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">— Nessuna squadra —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[#2e2e42] bg-[#111118] p-4">
            <p className="mb-2 text-xs font-medium text-[#8888aa]">Formato CSV atteso:</p>
            <pre className="text-xs text-[#55556a]">
{`Nome,Squadra,Ruolo
Marco Rossi,Milan,Dc/E
Lorenzo Verde,Juventus,M/C
Anna Bianchi,Inter,Por`}
            </pre>
          </div>

          <Button
            variant="primary"
            loading={isPending}
            onClick={handleParse}
          >
            Analizza file
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ---- Step: Preview -------------------------------------------------------
  if (step === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Anteprima importazione</h2>
            <p className="text-sm text-[#8888aa]">
              {rows.length} righe trovate ·{' '}
              <span className="text-green-400">{validRows.length} valide</span>
              {errorRows.length > 0 && (
                <> · <span className="text-red-400">{errorRows.length} con errori</span></>
              )}
              {unconfirmedRows.length > 0 && (
                <> · <span className="text-amber-400">{unconfirmedRows.length} da confermare</span></>
              )}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setStep('upload')}>
            ← Cambia file
          </Button>
        </div>

        {unconfirmedRows.length > 0 && (
          <Alert variant="warning" title="Ruoli ambigui — conferma richiesta">
            I giocatori evidenziati hanno ruoli che richiedono conferma manuale del rating class.
          </Alert>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2e2e42] text-left">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">#</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Nome</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Squadra</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Ruoli</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Rating Class</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e2a]">
                  {rows.map((row) => {
                    const hasError = Boolean(row.parse_error)
                    const needsConfirm = row.needs_confirmation && !hasError
                    const isConfirmed = Boolean(overrides[row.rowIndex])

                    return (
                      <tr
                        key={row.rowIndex}
                        className={[
                          hasError ? 'bg-red-500/5' : needsConfirm && !isConfirmed ? 'bg-amber-500/5' : '',
                        ].join('')}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-[#55556a]">
                          {row.rowIndex + 2}
                        </td>
                        <td className="px-4 py-2.5 text-white">{row.full_name || '—'}</td>
                        <td className="px-4 py-2.5 text-[#8888aa]">{row.club || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {row.mantra_roles.map((r) => (
                              <Badge key={r} variant="muted" className="text-xs">
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {hasError ? (
                            <span className="text-xs text-[#55556a]">—</span>
                          ) : (
                            <select
                              value={overrides[row.rowIndex] ?? ''}
                              onChange={(e) => setOverride(row.rowIndex, e.target.value as RatingClass)}
                              className={[
                                'rounded border px-2 py-1 text-xs bg-[#1a1a24] focus:outline-none focus:border-indigo-500',
                                needsConfirm && !isConfirmed
                                  ? 'border-amber-500/60 text-amber-400'
                                  : 'border-[#2e2e42] text-white',
                              ].join(' ')}
                            >
                              <option value="">— Seleziona —</option>
                              {RATING_CLASS_OPTIONS.map((rc) => (
                                <option key={rc} value={rc}>
                                  {rc}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {hasError ? (
                            <span className="text-xs text-red-400" title={row.parse_error ?? ''}>
                              Errore
                            </span>
                          ) : needsConfirm && !isConfirmed ? (
                            <span className="text-xs text-amber-400" title={row.confirmation_reason ?? ''}>
                              Da confermare
                            </span>
                          ) : isConfirmed ? (
                            <Badge variant="success" className="text-xs">OK</Badge>
                          ) : (
                            <Badge variant="muted" className="text-xs">Pronto</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Error details */}
        {errorRows.length > 0 && (
          <Alert variant="error" title={`${errorRows.length} righe con errori (verranno saltate)`}>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              {errorRows.map((r) => (
                <li key={r.rowIndex}>{r.parse_error}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="flex items-center gap-4">
          <Button
            variant="primary"
            loading={isPending}
            disabled={validRows.length === 0 || unconfirmedRows.length > 0}
            onClick={handleConfirm}
          >
            Importa {validRows.length} giocator{validRows.length === 1 ? 'e' : 'i'}
          </Button>
          {unconfirmedRows.length > 0 && (
            <p className="text-xs text-amber-400">
              Conferma il rating class per tutti i giocatori evidenziati prima di procedere.
            </p>
          )}
        </div>
      </div>
    )
  }

  // ---- Step: Done ---------------------------------------------------------
  return (
    <div className="space-y-4">
      {submitResult?.success ? (
        <Alert variant="success" title="Importazione completata">
          {submitResult.imported_count} giocator{submitResult.imported_count === 1 ? 'e importato' : 'i importati'}
          {submitResult.skipped_count > 0 && ` · ${submitResult.skipped_count} saltati`}.
        </Alert>
      ) : (
        <Alert variant="error" title="Importazione fallita">
          {submitResult?.error ?? 'Errore sconosciuto.'}
        </Alert>
      )}

      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            setStep('upload')
            setRows([])
            setOverrides({})
            setSubmitResult(null)
            setFilename('')
            if (fileRef.current) fileRef.current.value = ''
          }}
        >
          Nuova importazione
        </Button>
        <a
          href="/players"
          className="self-center text-sm text-indigo-400 hover:underline"
        >
          Vai ai giocatori →
        </a>
      </div>
    </div>
  )
}
