import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { AuditAction } from '@/types/database.types'

export const metadata = { title: 'Audit Log' }

const PAGE_SIZE = 50

const ACTION_LABEL: Record<AuditAction, string> = {
  roster_import:                  'Import rosa',
  roster_edit:                    'Modifica rosa',
  player_create:                  'Crea giocatore',
  player_role_change:             'Cambio ruolo',
  player_rating_class_change:     'Cambio classe voto',
  player_transfer:                'Trasferimento',
  matchday_create:                'Crea giornata',
  matchday_status_change:         'Cambio stato giornata',
  matchday_reopen:                'Riapri giornata',
  lineup_save:                    'Salva formazione',
  lineup_submit:                  'Invia formazione',
  lineup_lock:                    'Blocca formazione',
  stats_edit:                     'Modifica statistiche',
  ratings_edit:                   'Modifica voti',
  calculation_draft:              'Calcolo bozza',
  calculation_publish:            'Pubblica calcolo',
  override_create:                'Crea override',
  override_remove:                'Rimuovi override',
  league_settings_change:         'Impostazioni lega',
  formation_settings_change:      'Impostazioni formazione',
  ambiguous_role_change:          'Cambio regola ruolo',
  user_role_change:               'Cambio ruolo utente',
  competition_create:             'Crea competizione',
  competition_status_change:      'Cambio stato competizione',
  competition_round_compute:      'Calcola turno',
  competition_calendario_generate:'Genera calendario',
  rosa_assign:                    'Assegna giocatore rosa',
  rosa_release:                   'Rilascia giocatore rosa',
  pool_import:                    'Import pool giocatori',
}

const ACTION_COLOR: Partial<Record<AuditAction, string>> = {
  calculation_publish:        'text-emerald-400',
  override_create:            'text-amber-400',
  override_remove:            'text-red-400',
  matchday_status_change:     'text-indigo-300',
  competition_round_compute:  'text-indigo-300',
  competition_create:         'text-indigo-300',
}

const ENTITY_LABEL: Record<string, string> = {
  league:              'Lega',
  player:              'Giocatore',
  league_player:       'Giocatore rosa',
  matchday:            'Giornata',
  lineup:              'Formazione',
  stats:               'Statistiche',
  calculation_run:     'Calcolo',
  score_override:      'Override',
  formation:           'Formazione',
  competition:         'Competizione',
  competition_round:   'Turno',
  roster_import_batch: 'Import batch',
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()
  const { page: pageParam, action: actionParam } = await searchParams

  const page = Math.max(1, parseInt(pageParam ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('audit_logs')
    .select('id, created_at, actor_user_id, action_type, entity_type, entity_id, after_json, metadata_json', {
      count: 'exact',
    })
    .eq('league_id', ctx.league.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (actionParam) {
    query = query.eq('action_type', actionParam as AuditAction)
  }

  const { data: logs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  // Resolve actor usernames
  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_user_id).filter((id): id is string => id != null))]
  const { data: profiles } = actorIds.length > 0
    ? await supabase.from('profiles').select('id, username').in('id', actorIds)
    : { data: [] }
  const actorMap = new Map((profiles ?? []).map((p) => [p.id, p.username]))

  const logList = logs ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-[#8888aa]">
            Registro delle operazioni · {ctx.league.name}
            {count != null && (
              <span className="ml-2 text-[#55556a]">({count.toLocaleString('it-IT')} voci totali)</span>
            )}
          </p>
        </div>

        {/* Action filter */}
        <form method="GET" className="flex items-center gap-2">
          <select
            name="action"
            defaultValue={actionParam ?? ''}
            className="rounded-lg border border-[#2e2e42] bg-[#0f0f1a] px-3 py-1.5 text-sm text-[#f0f0fa] focus:border-indigo-500 focus:outline-none"
            onChange={(e) => {
              // client-side change — handled by form submit
              void e
            }}
          >
            <option value="">Tutte le azioni</option>
            {(Object.keys(ACTION_LABEL) as AuditAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 text-sm text-indigo-300 hover:bg-indigo-500/20"
          >
            Filtra
          </button>
          {actionParam && (
            <a
              href="/audit"
              className="rounded-lg px-3 py-1.5 text-sm text-[#55556a] hover:text-white"
            >
              ✕
            </a>
          )}
        </form>
      </div>

      <Card>
        {logList.length === 0 ? (
          <CardContent>
            <p className="py-8 text-center text-sm text-[#55556a]">
              Nessun log trovato{actionParam ? ' per questa azione' : ''}.
            </p>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Data/Ora</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Utente</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Azione</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Entità</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Dettagli</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {logList.map((log) => {
                  const details = (log.after_json ?? log.metadata_json) as Record<string, unknown> | null
                  const detailStr = details
                    ? Object.entries(details)
                        .filter(([, v]) => v !== null && v !== undefined)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                        .join(' · ')
                    : null

                  const actionColor = ACTION_COLOR[log.action_type as AuditAction] ?? 'text-[#8888aa]'

                  return (
                    <tr key={log.id} className="hover:bg-[#0f0f1a]">
                      <td className="px-4 py-2.5 text-[#55556a] whitespace-nowrap text-xs">
                        {new Date(log.created_at).toLocaleString('it-IT', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-[#8888aa] text-xs">
                        {log.actor_user_id ? (actorMap.get(log.actor_user_id) ?? '—') : 'sistema'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium ${actionColor}`}>
                          {ACTION_LABEL[log.action_type as AuditAction] ?? log.action_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#55556a]">
                        {ENTITY_LABEL[log.entity_type] ?? log.entity_type}
                        {log.entity_id && (
                          <span className="ml-1 font-mono text-[10px] text-[#3a3a52]">
                            {log.entity_id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 max-w-xs truncate text-xs text-[#55556a]" title={detailStr ?? undefined}>
                        {detailStr ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#55556a]">
            Pagina {page} di {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/audit?page=${page - 1}${actionParam ? `&action=${actionParam}` : ''}`}
                className="rounded-lg border border-[#2e2e42] px-3 py-1.5 text-[#8888aa] hover:bg-[#1a1a24] hover:text-white"
              >
                ← Precedente
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/audit?page=${page + 1}${actionParam ? `&action=${actionParam}` : ''}`}
                className="rounded-lg border border-[#2e2e42] px-3 py-1.5 text-[#8888aa] hover:bg-[#1a1a24] hover:text-white"
              >
                Successiva →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
