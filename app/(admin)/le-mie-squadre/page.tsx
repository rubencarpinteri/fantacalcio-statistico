import { requireLeagueContext } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TeamCard } from './TeamCard'
import { ProfileEditor } from './ProfileEditor'

export const metadata = { title: 'Le mie squadre' }

export default async function MyTeamsPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  // Profile + Serie A teams (in this league) + FM teams (any tournament,
  // joined to fm_league_competition + fm_competition for the display label).
  const [profileRes, serieARes, fmRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', ctx.userId)
      .single(),
    supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('manager_id', ctx.userId)
      .eq('league_id', ctx.league.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('fm_fantasy_team')
      .select(`
        id,
        name,
        league_competition_id,
        fm_league_competition!inner (
          league_id,
          fm_competition:fm_competition_id ( name, edition )
        )
      `)
      .eq('manager_id', ctx.userId),
  ])

  // Competitions the league participates in (Serie A list — to label each
  // Serie A fantasy team with the competitions it's enrolled in).
  const { data: serieACompsRes } = await supabase
    .from('competitions')
    .select('id, name, type, status')
    .eq('league_id', ctx.league.id)
    .neq('status', 'cancelled')

  type CompetitionTeam = { team_id: string; competition_id: string }
  const teamIds = (serieARes.data ?? []).map((t) => t.id)
  const { data: enrolmentsRes } = teamIds.length > 0
    ? await supabase
        .from('competition_teams')
        .select('team_id, competition_id')
        .in('team_id', teamIds)
    : { data: [] as CompetitionTeam[] }

  type FMTeamRow = {
    id: string
    name: string
    league_competition_id: string
    fm_league_competition: {
      league_id: string
      fm_competition: { name: string; edition: string } | { name: string; edition: string }[] | null
    } | {
      league_id: string
      fm_competition: { name: string; edition: string } | { name: string; edition: string }[] | null
    }[]
  }

  const profile = profileRes.data
  const serieATeams = serieARes.data ?? []
  const fmTeamsRaw = (fmRes.data ?? []) as FMTeamRow[]
  const serieAComps = serieACompsRes ?? []
  const enrolments = (enrolmentsRes ?? []) as CompetitionTeam[]

  // Only FM teams whose parent fm_league_competition belongs to THIS Lega.
  const fmTeams = fmTeamsRaw
    .map((r) => {
      const join = Array.isArray(r.fm_league_competition)
        ? r.fm_league_competition[0]
        : r.fm_league_competition
      if (!join || join.league_id !== ctx.league.id) return null
      const comp = Array.isArray(join.fm_competition)
        ? join.fm_competition[0]
        : join.fm_competition
      return {
        id: r.id,
        name: r.name,
        competitionName: comp?.name ?? 'Competizione internazionale',
        competitionEdition: comp?.edition ?? null,
      }
    })
    .filter((t): t is { id: string; name: string; competitionName: string; competitionEdition: string | null } => t !== null)

  // Map team_id → list of Serie A competition labels it's enrolled in.
  const SERIE_A_TYPE_LABEL: Record<string, string> = {
    campionato:    'Campionato',
    battle_royale: 'Battle Royal',
    coppa:         'Coppa',
  }
  const compById = new Map(serieAComps.map((c) => [c.id, c]))
  const enrolmentsByTeam = new Map<string, string[]>()
  for (const e of enrolments) {
    const c = compById.get(e.competition_id)
    if (!c) continue
    const label = `${SERIE_A_TYPE_LABEL[c.type] ?? c.type} · ${c.name}`
    const arr = enrolmentsByTeam.get(e.team_id) ?? []
    enrolmentsByTeam.set(e.team_id, [...arr, label])
  }

  const totalTeams = serieATeams.length + fmTeams.length

  return (
    <div className="space-y-7">
      <div>
        <h1
          className="font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
        >
          <span className="font-semibold">Le mie squadre</span>
        </h1>
        <p className="mt-1 text-[13px] text-ink-3">
          {totalTeams === 0
            ? 'Non hai ancora squadre. Iscriviti a una competizione dalla dashboard.'
            : `${totalTeams} ${totalTeams === 1 ? 'squadra' : 'squadre'} in ${ctx.league.name}.`}
        </p>
      </div>

      {/* Legend — establishes the color code up front */}
      <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Livello nazionale
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-indigo-700 ring-1 ring-indigo-500/30 dark:text-indigo-300">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" /> Livello internazionale
        </span>
        <span className="text-ink-5">— il colore identifica il livello della competizione a cui appartiene la squadra.</span>
      </div>

      {/* Nazionale section */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
          <span className="inline-block h-1.5 w-6 rounded-full bg-emerald-500" />
          Livello nazionale · Serie A
        </h2>
        {serieATeams.length === 0 ? (
          <EmptyTeamSlot
            text="Nessuna squadra di Serie A. Iscriviti dalla dashboard a un Campionato, Coppa o Battle Royal."
            tone="emerald"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {serieATeams.map((t) => {
              const enrolledIn = enrolmentsByTeam.get(t.id) ?? []
              const subLabel = enrolledIn.length > 0
                ? enrolledIn.join(' · ')
                : 'Non ancora iscritta a competizioni'
              return (
                <TeamCard
                  key={t.id}
                  teamId={t.id}
                  name={t.name}
                  level="nazionale"
                  competitionLabel="Serie A"
                  competitionSubLabel={subLabel}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Internazionale section */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
          <span className="inline-block h-1.5 w-6 rounded-full bg-indigo-500" />
          Livello internazionale · Mondiali · Europei · Nations
        </h2>
        {fmTeams.length === 0 ? (
          <EmptyTeamSlot
            text="Nessuna squadra in competizioni internazionali. Iscrivi la tua Lega a un torneo dalla dashboard."
            tone="indigo"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {fmTeams.map((t) => (
              <TeamCard
                key={t.id}
                teamId={t.id}
                name={t.name}
                level="internazionale"
                competitionLabel={t.competitionName}
                competitionSubLabel={t.competitionEdition}
              />
            ))}
          </div>
        )}
      </section>

      {/* Profile editor */}
      <Card>
        <CardHeader
          title="Il mio profilo"
          description="Il nome e lo username visibili agli altri membri della Lega."
        />
        <CardContent>
          <ProfileEditor
            initialFullName={profile?.full_name ?? ''}
            initialUsername={profile?.username ?? ''}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyTeamSlot({ text, tone }: { text: string; tone: 'emerald' | 'indigo' }) {
  const ring = tone === 'emerald'
    ? 'border-emerald-500/20'
    : 'border-indigo-500/20'
  return (
    <div className={`rounded-2xl border border-dashed ${ring} bg-glass-1 px-5 py-6 text-center backdrop-blur-xl`}>
      <p className="text-[12.5px] text-ink-4">{text}</p>
    </div>
  )
}
