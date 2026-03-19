import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ImportPreview } from './ImportPreview'

export const metadata = { title: 'Importa Rosa' }

export default async function RosterImportPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Fetch fantasy teams for the assignment selector
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .order('name')

  // Fetch recent import batches
  const { data: batches } = await supabase
    .from('roster_import_batches')
    .select('id, filename, row_count, success_count, error_count, created_at')
    .eq('league_id', ctx.league.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Importa Rosa</h1>
        <p className="text-sm text-[#8888aa]">
          Importa giocatori da un file CSV. I giocatori già presenti verranno aggiornati.
        </p>
      </div>

      <ImportPreview teams={teams ?? []} />

      {/* Import history */}
      {batches && batches.length > 0 && (
        <Card>
          <CardHeader
            title="Importazioni recenti"
            description="Ultimi 10 batch importati"
          />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42] text-left">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">File</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Righe</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Importati</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Errori</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2a]">
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="px-4 py-2.5 font-mono text-xs text-white">
                      {batch.filename}
                    </td>
                    <td className="px-4 py-2.5 text-[#8888aa]">{batch.row_count}</td>
                    <td className="px-4 py-2.5 text-green-400">{batch.success_count}</td>
                    <td className="px-4 py-2.5 text-red-400">
                      {batch.error_count > 0 ? batch.error_count : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[#55556a] text-xs">
                      {new Intl.DateTimeFormat('it-IT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(batch.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
