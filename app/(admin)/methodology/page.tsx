import { requireLeagueContext } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DEFAULT_ENGINE_CONFIG, buildEngineConfig, deriveSlope } from '@/domain/engine/v1/config'
import { ratingToVotoBase } from '@/domain/engine/v1/engine'
import type { LeagueEngineConfig } from '@/types/database.types'

export const metadata = { title: 'Metodologia — Fantacalcio Statistico' }

// ─── helpers ─────────────────────────────────────────────────────────────────

function sign(n: number) {
  return n >= 0 ? `+${n}` : `${n}`
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-xs leading-relaxed text-ink-4">{children}</p>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-xs font-medium text-ink-4 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, mono, dim }: { children: React.ReactNode; right?: boolean; mono?: boolean; dim?: boolean }) {
  return (
    <td className={`px-4 py-2.5 text-sm ${right ? 'text-right' : ''} ${mono ? 'font-mono' : ''} ${dim ? 'text-ink-4' : 'text-ink-2'}`}>
      {children}
    </td>
  )
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
        {n}
      </div>
      <span className="text-sm text-ink-2">{label}</span>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function MethodologyPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const { data: dbEngCfg } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', ctx.league.id)
    .maybeSingle() as { data: LeagueEngineConfig | null }

  const cfg = buildEngineConfig(dbEngCfg ?? null)
  const slope = deriveSlope(cfg)
  const bm = cfg.bonus_malus

  const rcColor: Record<string, string> = {
    GK: 'text-yellow-400', DEF: 'text-blue-400', MID: 'text-green-400', ATT: 'text-red-400',
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  const goalRows = [
    { rc: 'GK',  label: 'Portiere',       normal: bm.goal_by_role.GK,  penalty: round1(bm.goal_by_role.GK  - bm.penalty_scored_discount) },
    { rc: 'DEF', label: 'Difensore',      normal: bm.goal_by_role.DEF, penalty: round1(bm.goal_by_role.DEF - bm.penalty_scored_discount) },
    { rc: 'MID', label: 'Centrocampista', normal: bm.goal_by_role.MID, penalty: round1(bm.goal_by_role.MID - bm.penalty_scored_discount) },
    { rc: 'ATT', label: 'Attaccante',     normal: bm.goal_by_role.ATT, penalty: round1(bm.goal_by_role.ATT - bm.penalty_scored_discount) },
  ]

  const conversionRows: Array<{ rating: number; label: string; isAnchor?: boolean }> = [
    { rating: 3.00,  label: 'minimo SportMonks' },
    { rating: 4.50,  label: 'pessima prova' },
    { rating: 5.50,  label: 'brutta prova' },
    { rating: 6.00,  label: 'sotto la media' },
    { rating: 6.45,  label: 'tipica (mode SportMonks)' },
    { rating: cfg.pivot_rating, label: 'baseline kickoff · pivot', isAnchor: true },
    { rating: 6.72,  label: 'media SportMonks' },
    { rating: 7.00,  label: 'buona prova' },
    { rating: 7.50,  label: 'molto buona' },
    { rating: 8.00,  label: 'ottima' },
    { rating: 9.00,  label: 'top' },
    { rating: 10.00, label: 'massimo SportMonks · ancoraggio', isAnchor: true },
  ]

  return (
    <div className="space-y-8 pb-12">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ink-1">Metodologia di calcolo</h1>
        <p className="mt-1 text-sm text-ink-4">
          Motore <span className="font-mono text-indigo-300">{cfg.engine_version}</span> — &ldquo;Pivot + Bonus&rdquo;: una sola retta più il bonus/malus.
        </p>
      </div>

      {/* ── One-liner ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="In una frase" />
        <CardContent>
          <p className="text-sm leading-relaxed text-ink-2">
            Il <strong className="text-ink-1">voto base</strong> nasce da una retta che ancora la <strong className="text-ink-1">baseline SportMonks {cfg.pivot_rating.toFixed(2)}</strong> alla{' '}
            <strong className="text-ink-1">sufficienza italiana {cfg.pivot_vote.toFixed(2)}</strong>, con il punto massimo (10 → 10) fissato per costruzione.
            Sopra il voto base si sommano i bonus e malus della partita.
            Il <strong className="text-ink-1">fantavoto finale</strong> è il risultato, cappato tra {cfg.voto_min.toFixed(0)} e {cfg.voto_max.toFixed(0)}.
          </p>
        </CardContent>
      </Card>

      {/* ── Pipeline overview ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Pipeline di calcolo" description="Il percorso dal voto SportMonks al fantavoto finale" />
        <CardContent>
          <div className="space-y-3">
            <Step n={1} label="Recupero voto SportMonks (unica fonte)" />
            <Step n={2} label={`Gate minuti: < ${cfg.minutes_min_for_voto}' → s.v. (NV) salvo evento decisivo (gol, assist, rosso…)`} />
            <Step n={3} label={`Voto base = ${cfg.pivot_vote.toFixed(2)} + ${slope.toFixed(4)} × (rating − ${cfg.pivot_rating.toFixed(2)}), cappato 1–10`} />
            <Step n={4} label="Bonus / Malus: gol, assist, cartellini, rigori, clean sheet…" />
            <Step n={5} label="Fantavoto = clamp(voto_base + bonus_malus, 1, 10)" />
          </div>
          <div className="mt-5 rounded-lg border border-hairline bg-transparent px-4 py-3 font-mono text-xs text-ink-3">
            <span className="text-ink-1">Fantavoto</span>
            {' = clamp( '}
            <span className="text-indigo-300">voto_base</span>
            {' + '}
            <span className="text-emerald-300">bonus_malus</span>
            {' , 1, 10 )'}
          </div>
        </CardContent>
      </Card>

      {/* ── Fonte: SportMonks ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Fonte di voto: SportMonks" description="L'unica piattaforma usata per il calcolo del voto base" />
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-hairline bg-transparent p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-4">Baseline kickoff</p>
              <p className="font-mono text-2xl font-bold text-ink-1">6.50</p>
              <p className="mt-1 text-xs text-ink-4">
                Ogni giocatore parte da 6.50 al fischio d&apos;inizio: è il valore neutro, prima di qualsiasi azione.
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-transparent p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-4">Tipica (mode)</p>
              <p className="font-mono text-2xl font-bold text-ink-1">6.45</p>
              <p className="mt-1 text-xs text-ink-4">
                Il voto finale più comune. Una prestazione &ldquo;senza note&rdquo; tende a chiudere leggermente sotto il baseline.
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-transparent p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-4">Media storica</p>
              <p className="font-mono text-2xl font-bold text-ink-1">6.72</p>
              <p className="mt-1 text-xs text-ink-4">
                La media di tutti i voti finali. È sopra il mode perché la coda delle prestazioni eccellenti la tira verso l&apos;alto.
              </p>
            </div>
          </div>
          <Note>
            Il voto SportMonks si aggiorna ogni minuto durante la partita e incorpora 51 statistiche
            (gol, tiri, passaggi chiave, duelli, salvataggi, ecc.). Fonte:{' '}
            <a href="https://www.sportmonks.com/blogs/player-ratings" className="text-indigo-300 hover:underline" target="_blank" rel="noreferrer">
              sportmonks.com/blogs/player-ratings
            </a>.
          </Note>
        </CardContent>
      </Card>

      {/* ── Pivot + Tabella di conversione ────────────────────────────────── */}
      <Card>
        <CardHeader title="Voto base: la retta del pivot" description={`SportMonks ${cfg.pivot_rating.toFixed(2)} → voto ${cfg.pivot_vote.toFixed(2)}; SportMonks 10 → voto 10`} />
        <CardContent>
          <div className="mb-4 rounded-lg border border-hairline bg-transparent px-4 py-3 font-mono text-sm">
            <span className="text-indigo-300">voto_base</span>
            {' = '}
            <span className="text-ink-3">{cfg.pivot_vote.toFixed(2)}</span>
            {' + '}
            <span className="text-amber-300">{slope.toFixed(4)}</span>
            {' × ( rating − '}
            <span className="text-ink-3">{cfg.pivot_rating.toFixed(2)}</span>
            {' )'}
          </div>

          <TableWrap>
            <thead>
              <tr className="border-b border-hairline">
                <Th>Voto SportMonks</Th>
                <Th>Note</Th>
                <Th right>Voto base</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {conversionRows.map((r) => {
                const vb = ratingToVotoBase(r.rating, cfg)
                return (
                  <tr key={r.rating} className={`hover:bg-glass-1 ${r.isAnchor ? 'bg-indigo-500/5' : ''}`}>
                    <Td mono>{r.rating.toFixed(2)}</Td>
                    <Td dim>{r.label}</Td>
                    <Td right mono>
                      <span className={r.isAnchor ? 'text-indigo-300 font-semibold' : 'text-ink-1'}>
                        {vb.toFixed(2)}
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
          <Note>
            Le due righe in evidenza sono i due punti che definiscono la retta:
            il <strong className="text-ink-2">pivot</strong> ({cfg.pivot_rating.toFixed(2)} → {cfg.pivot_vote.toFixed(2)}) e
            l&apos;<strong className="text-ink-2">ancoraggio massimo</strong> (10 → 10). Tutto il resto è interpolazione lineare.
          </Note>
        </CardContent>
      </Card>

      {/* ── Gate minuti ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Gate minuti" description="Quando il voto SportMonks non viene considerato" />
        <CardContent className="p-0">
          <TableWrap>
            <thead>
              <tr className="border-b border-hairline">
                <Th>Minuti giocati</Th>
                <Th>Trattamento</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              <tr className="hover:bg-glass-1">
                <Td>{`< ${cfg.minutes_min_for_voto}', senza evento decisivo`}</Td>
                <Td dim>NV (s.v.) — non contribuisce al totale di squadra</Td>
              </tr>
              <tr className="hover:bg-glass-1">
                <Td>{`< ${cfg.minutes_min_for_voto}', con evento decisivo`}</Td>
                <Td dim>Voto base = 6.00, solo bonus/malus (es. ingresso e gol immediato)</Td>
              </tr>
              <tr className="hover:bg-glass-1">
                <Td>{`≥ ${cfg.minutes_min_for_voto}', con voto SportMonks`}</Td>
                <Td dim>Formula del pivot applicata normalmente</Td>
              </tr>
              <tr className="hover:bg-glass-1">
                <Td>{`≥ ${cfg.minutes_min_for_voto}', voto SportMonks non ancora disponibile`}</Td>
                <Td dim>Voto base = 6.00 + bonus/malus (es. partita in corso)</Td>
              </tr>
            </tbody>
          </TableWrap>
        </CardContent>
      </Card>

      {/* ── Bonus / Malus ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Bonus e Malus" description="Contributi fissi per eventi di partita" />
        <CardContent className="p-0">

          {/* Goals */}
          <div className="border-b border-hairline px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-4">Gol segnati</p>
            <TableWrap>
              <thead>
                <tr className="border-b border-hairline">
                  <Th>Ruolo</Th>
                  <Th right>Gol normale</Th>
                  <Th right>Gol su rigore</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {goalRows.map((g) => (
                  <tr key={g.rc} className="hover:bg-glass-1">
                    <Td>
                      <span className={`font-mono text-xs font-bold ${rcColor[g.rc]}`}>{g.rc}</span>
                      <span className="ml-2 text-ink-3">{g.label}</span>
                    </Td>
                    <Td right mono><span className="text-emerald-400">{sign(g.normal)}</span></Td>
                    <Td right mono><span className="text-emerald-400">{sign(g.penalty)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <p className="mt-2 text-xs text-ink-4">
              Gol su rigore = bonus ruolo − {bm.penalty_scored_discount}.
              Doppietta: +{bm.brace_bonus} aggiuntivo.
              Tripletta: +{bm.hat_trick_bonus} aggiuntivo (sostituisce il bonus doppietta).
            </p>
          </div>

          {/* Events */}
          <div className="border-b border-hairline px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-4">Altri eventi</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
              {[
                { label: 'Assist',            val: bm.assist,         cond: null },
                { label: 'Autorete',          val: bm.own_goal,        cond: null },
                { label: 'Ammonizione',       val: bm.yellow_card,     cond: null },
                { label: 'Espulsione',        val: bm.red_card,        cond: null },
                { label: 'Rigore fallito',    val: bm.penalty_missed,  cond: null },
                { label: 'Rigore parato',     val: bm.penalty_saved,   cond: 'solo GK' },
              ].map(({ label, val, cond }) => (
                <div key={label} className="flex items-center justify-between gap-2 rounded px-2 py-1.5">
                  <span className="text-sm text-ink-2">{label}</span>
                  <div className="flex items-center gap-1.5">
                    {cond && <span className="text-xs text-ink-4">({cond})</span>}
                    <span className={`font-mono text-sm font-semibold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {sign(val)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clean sheet */}
          <div className="border-b border-hairline px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-4">Clean sheet</p>
            <div className="space-y-1.5">
              {[
                { rc: 'GK',  val: bm.clean_sheet_by_role.GK  ?? 0 },
                { rc: 'DEF', val: bm.clean_sheet_by_role.DEF ?? 0 },
              ].map(({ rc, val }) => (
                <div key={rc} className="flex items-center gap-3">
                  <span className={`font-mono text-xs font-bold ${rcColor[rc]}`}>{rc}</span>
                  <span className="text-sm text-emerald-400 font-mono font-semibold">{sign(val)}</span>
                  <span className="text-xs text-ink-4">se ≥ {bm.clean_sheet_min_minutes}&apos; giocati</span>
                </div>
              ))}
            </div>
          </div>

          {/* Goals conceded */}
          <div className="px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-4">Goal subiti (per goal)</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className={`font-mono text-xs font-bold ${rcColor.GK}`}>GK</span>
                <span className="text-sm text-red-400 font-mono font-semibold">{sign(bm.goals_conceded_by_role.GK ?? 0)}</span>
                <span className="text-xs text-ink-4">sempre (nessun minimo)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-mono text-xs font-bold ${rcColor.DEF}`}>DEF</span>
                <span className="text-sm text-red-400 font-mono font-semibold">{sign(bm.goals_conceded_by_role.DEF ?? 0)}</span>
                <span className="text-xs text-ink-4">se ≥ {bm.goals_conceded_def_min_minutes}&apos; giocati</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Note generali ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Note generali" />
        <CardContent>
          <ul className="space-y-2 text-sm text-ink-3">
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                I voti sono marcati come <strong className="text-ink-2">provvisori</strong> quando le statistiche non sono ancora confermate da SportMonks.
                Un calcolo con voti provvisori è valido ma potrebbe cambiare dopo una nuova pubblicazione.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Se SportMonks non ha ancora pubblicato il voto (es. partita in corso), il giocatore riceve <strong className="text-ink-2">voto base 6.0</strong> con il solo contributo del B/M.
                Questo caso è indicato con <span className="text-sky-400">⚡</span> nella pagina calcoli.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Gli <strong className="text-ink-2">override manuali</strong> sostituiscono il fantavoto calcolato dal motore. Un override è indicato con <span className="text-orange-400">★</span>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Il <strong className="text-ink-2">fantavoto di squadra</strong> è la somma dei fantavoti dei titolari in campo, con sostituzione automatica dalla panchina per i giocatori NV (logica Mantra MASTER).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Pivot, bonus, malus e gate minuti sono <strong className="text-ink-2">personalizzabili per lega</strong> dalla sezione{' '}
                <a href="/league/engine-config" className="text-indigo-300 hover:underline">Configurazione motore</a>.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

    </div>
  )
}
