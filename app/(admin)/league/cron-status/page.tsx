import { requireSuperAdmin } from '@/lib/league'
import { createServiceClient } from '@/lib/supabase/service'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export const metadata = { title: 'Stato cron SportMonks' }

// Always render fresh — there's no value in caching a status page.
export const dynamic = 'force-dynamic'

const ENDPOINTS = [
  'sportmonks-ratings-tick',
  'sportmonks-fixtures-sync',
  'sportmonks-reconcile-week',
] as const

type Row = {
  id: string
  endpoint: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  status: string
  http_status: number | null
  summary: unknown
  error: string | null
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('it-IT', { timeZone: 'Europe/Rome', hour12: false })
}

function ago(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s fa`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m fa`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h fa`
  return `${Math.round(ms / 86_400_000)}d fa`
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    error: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    skipped: 'bg-ink-5/15 text-ink-4 border-hairline',
  }
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide border ${
        styles[status] ?? styles.skipped
      }`}
    >
      {status}
    </span>
  )
}

export default async function CronStatusPage() {
  await requireSuperAdmin()

  // Use service client so we get a consistent read even if RLS wiring
  // shifts in future. Page itself is super-admin-gated above.
  // `cron_runs` table exists post-migration 20260521090000; once
  // `npm run db:types` runs the `as any` casts below can be removed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = createServiceClient()

  // Latest run per endpoint (cheap — 3 endpoints, order-by index).
  const latestByEndpoint = new Map<string, Row | null>()
  for (const ep of ENDPOINTS) {
    const { data } = await db
      .from('cron_runs')
      .select('*')
      .eq('endpoint', ep)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    latestByEndpoint.set(ep, (data as Row | null) ?? null)
  }

  // Last 50 across all endpoints
  const { data: recentRaw } = await db
    .from('cron_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50)
  const recent = (recentRaw ?? []) as Row[]

  // 24h error count per endpoint
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const errorCounts = new Map<string, number>()
  for (const ep of ENDPOINTS) {
    const { count } = await db
      .from('cron_runs')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', ep)
      .eq('status', 'error')
      .gte('started_at', since24h)
    errorCounts.set(ep, count ?? 0)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-1">Stato cron SportMonks</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          Ultimo tick per endpoint, errori nelle ultime 24 ore, e cronologia
          recente. Aggiornato a ogni caricamento — F5 per refresh.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ENDPOINTS.map((ep) => {
          const row = latestByEndpoint.get(ep)
          const errs = errorCounts.get(ep) ?? 0
          return (
            <Card key={ep}>
              <CardHeader title={ep} description={row ? ago(row.started_at) : 'mai eseguito'} />
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-4">Stato</span>
                    {row ? <StatusPill status={row.status} /> : <span className="text-ink-5">—</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-4">Durata</span>
                    <span className="font-mono text-ink-1">
                      {row?.duration_ms != null ? `${row.duration_ms} ms` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-4">Errori 24h</span>
                    <span
                      className={`font-mono ${errs > 0 ? 'text-rose-400' : 'text-ink-3'}`}
                    >
                      {errs}
                    </span>
                  </div>
                  <div className="pt-1 text-[11px] text-ink-5 font-mono">
                    {row ? fmtTime(row.started_at) : '—'}
                  </div>
                  {row?.error && (
                    <div className="rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-300 font-mono whitespace-pre-wrap break-words">
                      {row.error.slice(0, 240)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader title="Ultimi 50 run" description="Cronologia trasversale a tutti gli endpoint" />
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-4">
              Nessun run registrato. Il primo tick comparirà appena cron-job.org chiama
              uno dei tre endpoint con il <code className="font-mono">CRON_SECRET</code> giusto.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-hairline text-ink-4">
                    <th className="py-2 pr-3 font-medium">Quando</th>
                    <th className="py-2 pr-3 font-medium">Endpoint</th>
                    <th className="py-2 pr-3 font-medium">Stato</th>
                    <th className="py-2 pr-3 font-medium">Durata</th>
                    <th className="py-2 pr-3 font-medium">Riassunto</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b border-hairline/40 align-top">
                      <td className="py-2 pr-3 font-mono text-ink-3 whitespace-nowrap">
                        {ago(r.started_at)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-ink-2">{r.endpoint}</td>
                      <td className="py-2 pr-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-ink-3">
                        {r.duration_ms != null ? `${r.duration_ms}ms` : '—'}
                      </td>
                      <td className="py-2 pr-3 font-mono text-ink-3 max-w-md">
                        {r.error ? (
                          <span className="text-rose-300">{r.error.slice(0, 160)}</span>
                        ) : (
                          <span className="text-ink-4 break-words">
                            {JSON.stringify(r.summary).slice(0, 160)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
