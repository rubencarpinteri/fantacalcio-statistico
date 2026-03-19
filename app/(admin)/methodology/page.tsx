import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DEFAULT_ENGINE_CONFIG } from '@/domain/engine/v1/config'

export const metadata = { title: 'Metodologia — Fantacalcio Statistico' }

const cfg = DEFAULT_ENGINE_CONFIG

// ─── helpers ─────────────────────────────────────────────────────────────────

function sign(n: number) {
  return n >= 0 ? `+${n}` : `${n}`
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

// ─── sub-components (all RSC-safe, no hooks) ─────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-base font-semibold text-white">{children}</h2>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-xs leading-relaxed text-[#55556a]">{children}</p>
  )
}

function Pill({ children, color = 'gray' }: { children: React.ReactNode; color?: 'gray' | 'indigo' | 'amber' | 'emerald' | 'red' }) {
  const cls = {
    gray:    'bg-[#1a1a24] text-[#8888aa]',
    indigo:  'bg-indigo-500/10 text-indigo-300',
    amber:   'bg-amber-500/10 text-amber-300',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    red:     'bg-red-500/10 text-red-400',
  }[color]
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-mono font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-xs font-medium text-[#55556a] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, mono, dim }: { children: React.ReactNode; right?: boolean; mono?: boolean; dim?: boolean }) {
  return (
    <td className={`px-4 py-2.5 text-sm ${right ? 'text-right' : ''} ${mono ? 'font-mono' : ''} ${dim ? 'text-[#55556a]' : 'text-[#c8c8e8]'}`}>
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

// ─── pipeline step badge ──────────────────────────────────────────────────────

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
        {n}
      </div>
      <span className="text-sm text-[#c8c8e8]">{label}</span>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function MethodologyPage() {
  await requireLeagueContext()

  const sourceRows = [
    { name: 'SofaScore', key: 'sofascore', weight: cfg.source_weights.sofascore, mean: cfg.source_normalization.sofascore.mean, std: cfg.source_normalization.sofascore.std },
    { name: 'FotMob',    key: 'fotmob',    weight: cfg.source_weights.fotmob,    mean: cfg.source_normalization.fotmob.mean,    std: cfg.source_normalization.fotmob.std    },
    { name: 'WhoScored', key: 'whoscored', weight: cfg.source_weights.whoscored, mean: cfg.source_normalization.whoscored.mean, std: cfg.source_normalization.whoscored.std  },
  ] as const

  const roleRows = [
    { rc: 'GK',  label: 'Portiere',   mult: cfg.role_multiplier.GK  },
    { rc: 'DEF', label: 'Difensore',  mult: cfg.role_multiplier.DEF },
    { rc: 'MID', label: 'Centrocampista', mult: cfg.role_multiplier.MID },
    { rc: 'ATT', label: 'Attaccante', mult: cfg.role_multiplier.ATT },
  ]

  const rcColor: Record<string, string> = {
    GK: 'text-yellow-400', DEF: 'text-blue-400', MID: 'text-green-400', ATT: 'text-red-400',
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  const goalRows = [
    { rc: 'GK',  label: 'Portiere',       normal: cfg.bonus_malus.goal_by_role.GK,  penalty: round1(cfg.bonus_malus.goal_by_role.GK  - cfg.bonus_malus.penalty_scored_discount) },
    { rc: 'DEF', label: 'Difensore',      normal: cfg.bonus_malus.goal_by_role.DEF, penalty: round1(cfg.bonus_malus.goal_by_role.DEF - cfg.bonus_malus.penalty_scored_discount) },
    { rc: 'MID', label: 'Centrocampista', normal: cfg.bonus_malus.goal_by_role.MID, penalty: round1(cfg.bonus_malus.goal_by_role.MID - cfg.bonus_malus.penalty_scored_discount) },
    { rc: 'ATT', label: 'Attaccante',     normal: cfg.bonus_malus.goal_by_role.ATT, penalty: round1(cfg.bonus_malus.goal_by_role.ATT - cfg.bonus_malus.penalty_scored_discount) },
  ]

  // Partial<Record<...>> access returns number | undefined — coerce to null for uniform display
  const w = {
    gk: cfg.defensive.GK.weights,
    def: cfg.defensive.DEF.weights,
  }
  const gkDefRows: Array<{ stat: string; key: string; gk: number | null; def: number | null }> = [
    { stat: 'Parate',                  key: 'saves',                 gk: w.gk.saves                 ?? null, def: null },
    { stat: 'Goal subiti',             key: 'goals_conceded',        gk: w.gk.goals_conceded         ?? null, def: null },
    { stat: 'Tackle vinti',            key: 'tackles_won',           gk: null,                                def: w.def.tackles_won           ?? null },
    { stat: 'Intercettazioni',         key: 'interceptions',         gk: null,                                def: w.def.interceptions         ?? null },
    { stat: 'Respinte',                key: 'clearances',            gk: null,                                def: w.def.clearances            ?? null },
    { stat: 'Tiri bloccati',           key: 'blocks',                gk: null,                                def: w.def.blocks                ?? null },
    { stat: 'Duelli aerei vinti',      key: 'aerial_duels_won',      gk: null,                                def: w.def.aerial_duels_won      ?? null },
    { stat: 'Dribblati',               key: 'dribbled_past',         gk: null,                                def: w.def.dribbled_past         ?? null },
    { stat: 'Errore → gol avversario', key: 'error_leading_to_goal', gk: w.gk.error_leading_to_goal  ?? null, def: w.def.error_leading_to_goal ?? null },
  ]

  const adv = cfg.advanced_bonus

  return (
    <div className="space-y-8 pb-12">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Metodologia di calcolo</h1>
        <p className="mt-1 text-sm text-[#55556a]">
          Motore <span className="font-mono text-indigo-300">{cfg.engine_version}</span> — come viene calcolato il fantavoto di ogni giocatore.
        </p>
      </div>

      {/* ── Pipeline overview ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Pipeline di calcolo" description="Il percorso dal voto fonte al fantavoto finale" />
        <CardContent>
          <div className="space-y-3">
            <Step n={1} label="Recupero voti dalle fonti (SofaScore · FotMob · WhoScored)" />
            <Step n={2} label="Normalizzazione a z-score per ciascuna fonte disponibile" />
            <Step n={3} label="Media ponderata degli z-score → z_combined" />
            <Step n={4} label="Fattore minuti: NV se 0', ×0.5 se 1–44', ×1.0 se ≥ 45'" />
            <Step n={5} label={`Voto base: b₀ = ${cfg.base_score} + ${cfg.scale_factor} × z_adjusted`} />
            <Step n={6} label="Moltiplicatore ruolo: amplifica/comprime lo scostamento da 6.0" />
            <Step n={7} label="Correzione difensiva (solo GK / DEF) — statistiche di fase difensiva" />
            <Step n={8} label="Bonus / Malus: gol, assist, cartellini, rigori, clean sheet…" />
            <Step n={9} label="Fantavoto finale = somma di tutti i contributi precedenti" />
          </div>
          <div className="mt-5 rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-4 py-3 font-mono text-xs text-[#8888aa]">
            <span className="text-white">Fantavoto</span>
            {' = '}
            <span className="text-indigo-300">voto_base</span>
            {' + '}
            <span className="text-blue-300">corr_difensiva</span>
            {' + '}
            <span className="text-emerald-300">bonus_malus</span>
            {adv.enabled && (
              <>
                {' + '}
                <span className="text-amber-300">bonus_avanzati</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Fonti & pesi ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Fonti di voto e pesi" description="Le tre piattaforme di statistica e il loro contributo al voto combinato" />
        <CardContent className="p-0">
          <TableWrap>
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <Th>Fonte</Th>
                <Th right>Peso</Th>
                <Th right>Media storica</Th>
                <Th right>Deviazione standard</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {sourceRows.map((s) => (
                <tr key={s.key} className="hover:bg-[#0f0f1a]">
                  <Td><span className="font-medium text-white">{s.name}</span></Td>
                  <Td right mono>
                    <span className="font-semibold text-indigo-300">{pct(s.weight)}</span>
                  </Td>
                  <Td right mono>{s.mean.toFixed(2)}</Td>
                  <Td right mono>{s.std.toFixed(2)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="border-t border-[#1e1e2e] px-4 py-3">
            <Note>
              Il peso di ciascuna fonte viene <strong className="text-[#c8c8e8]">ri-normalizzato</strong> tra le sole fonti disponibili per quel giocatore in quella giornata.
              Se una fonte manca, il suo peso viene ridistribuito proporzionalmente sulle restanti.
              Quando è disponibile <strong className="text-[#c8c8e8]">una sola fonte</strong>, lo z-score viene moltiplicato per {cfg.one_source_shrink} (riduzione del {Math.round((1 - cfg.one_source_shrink) * 100)}%) per contenere l&apos;incertezza.
            </Note>
          </div>
        </CardContent>
      </Card>

      {/* ── Normalizzazione ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Normalizzazione z-score" description="Come viene convertito il voto fonte in uno scostamento dalla media" />
        <CardContent>
          <div className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-4 py-3 font-mono text-sm">
            <span className="text-indigo-300">z</span>
            {' = ( '}
            <span className="text-white">voto_fonte</span>
            {' − '}
            <span className="text-[#8888aa]">media</span>
            {' ) / '}
            <span className="text-[#8888aa]">σ</span>
          </div>
          <Note>
            La normalizzazione consente di comparare voti provenienti da scale diverse: SofaScore e FotMob usano medie simili ma dispersioni differenti, WhoScored tende a essere più conservativa.
            Uno z-score pari a 0 corrisponde esattamente al giocatore medio; valori positivi indicano una prestazione sopra la media.
          </Note>
        </CardContent>
      </Card>

      {/* ── Fattore minuti ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Fattore minuti" description="Come il minutaggio incide sul peso dello z-score" />
        <CardContent className="p-0">
          <TableWrap>
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <Th>Minuti giocati</Th>
                <Th right>Fattore</Th>
                <Th right>Effetto</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              <tr className="hover:bg-[#0f0f1a]">
                <Td>0 minuti</Td>
                <Td right mono><Pill color="gray">NV</Pill></Td>
                <Td right dim>Non valutato — non contribuisce al totale di squadra</Td>
              </tr>
              <tr className="hover:bg-[#0f0f1a]">
                <Td>1 – 44 minuti</Td>
                <Td right mono><Pill color="indigo">× 0.5</Pill></Td>
                <Td right dim>Partecipazione parziale — z ridotto a metà</Td>
              </tr>
              <tr className="hover:bg-[#0f0f1a]">
                <Td>≥ 45 minuti</Td>
                <Td right mono><Pill color="emerald">× 1.0</Pill></Td>
                <Td right dim>Partecipazione piena — z invariato</Td>
              </tr>
            </tbody>
          </TableWrap>
        </CardContent>
      </Card>

      {/* ── Voto base & moltiplicatore ruolo ─────────────────────────────── */}
      <Card>
        <CardHeader title="Voto base e moltiplicatore di ruolo" description="Il passaggio dallo z-score al voto su scala Mantra" />
        <CardContent>
          <div className="mb-4 space-y-2 rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-4 py-3 font-mono text-sm">
            <div>
              <span className="text-indigo-300">b₀</span>
              {' = '}
              <span className="text-[#8888aa]">{cfg.base_score}</span>
              {' + '}
              <span className="text-[#8888aa]">{cfg.scale_factor}</span>
              {' × '}
              <span className="text-white">z_adjusted</span>
            </div>
            <div>
              <span className="text-indigo-300">b₁</span>
              {' = '}
              <span className="text-[#8888aa]">{cfg.base_score}</span>
              {' + '}
              <span className="text-amber-300">moltiplicatore</span>
              {' × ( '}
              <span className="text-indigo-300">b₀</span>
              {' − '}
              <span className="text-[#8888aa]">{cfg.base_score}</span>
              {' )'}
            </div>
            <div className="pt-1 text-xs text-[#55556a]">
              voto_base = cappato tra {cfg.voto_base_cap_min} e {cfg.voto_base_cap_max}
            </div>
          </div>

          <TableWrap>
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <Th>Ruolo</Th>
                <Th right>Moltiplicatore</Th>
                <Th right>Interpretazione</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {roleRows.map((r) => (
                <tr key={r.rc} className="hover:bg-[#0f0f1a]">
                  <Td>
                    <span className={`font-mono text-xs font-bold ${rcColor[r.rc]}`}>{r.rc}</span>
                    <span className="ml-2 text-[#8888aa]">{r.label}</span>
                  </Td>
                  <Td right mono>
                    <span className={r.mult > 1 ? 'text-emerald-400' : r.mult < 1 ? 'text-amber-400' : 'text-white'}>
                      {r.mult.toFixed(2)}
                    </span>
                  </Td>
                  <Td right dim>
                    {r.mult > 1.0
                      ? `Amplifica lo scostamento da 6.0 del ${Math.round((r.mult - 1) * 100)}%`
                      : r.mult < 1.0
                        ? `Comprime lo scostamento da 6.0 del ${Math.round((1 - r.mult) * 100)}%`
                        : 'Nessuna modifica'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Note>
            Il moltiplicatore agisce sulla <strong className="text-[#c8c8e8]">distanza dalla soglia di sufficienza</strong> (6.0), non sull&apos;intera scala.
            Un portiere con b₀ = 7.5 ottiene b₁ = 6.0 + 1.15 × 1.5 = 7.725.
            Un attaccante con b₀ = 7.5 ottiene b₁ = 6.0 + 0.97 × 1.5 = 7.455.
          </Note>
        </CardContent>
      </Card>

      {/* ── Correzione difensiva ──────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Correzione difensiva"
          description="Aggiustamento basato su statistiche difensive — solo per GK e DEF"
        />
        <CardContent className="p-0">
          <TableWrap>
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <Th>Statistica</Th>
                <Th right>
                  <span className={`font-bold ${rcColor.GK}`}>GK</span>
                </Th>
                <Th right>
                  <span className={`font-bold ${rcColor.DEF}`}>DEF</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {gkDefRows.map((row) => {
                const showGk  = row.gk  !== null && row.gk  !== undefined
                const showDef = row.def !== null && row.def !== undefined
                if (!showGk && !showDef) return null
                const gkVal  = row.gk  as number | null
                const defVal = row.def as number | null
                return (
                  <tr key={row.key} className="hover:bg-[#0f0f1a]">
                    <Td>{row.stat}</Td>
                    <Td right mono>
                      {showGk
                        ? <span className={gkVal! >= 0 ? 'text-emerald-400' : 'text-red-400'}>{sign(gkVal!)}</span>
                        : <span className="text-[#2e2e42]">—</span>}
                    </Td>
                    <Td right mono>
                      {showDef
                        ? <span className={defVal! >= 0 ? 'text-emerald-400' : 'text-red-400'}>{sign(defVal!)}</span>
                        : <span className="text-[#2e2e42]">—</span>}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#2e2e42]">
                <Td dim>Cap correzione</Td>
                <Td right mono>
                  <span className="text-[#8888aa]">[{cfg.defensive.GK.cap_min}, +{cfg.defensive.GK.cap_max}]</span>
                </Td>
                <Td right mono>
                  <span className="text-[#8888aa]">[{cfg.defensive.DEF.cap_min}, +{cfg.defensive.DEF.cap_max}]</span>
                </Td>
              </tr>
            </tfoot>
          </TableWrap>
          <div className="border-t border-[#1e1e2e] px-4 py-3">
            <Note>
              La correzione viene calcolata come somma pesata delle statistiche, poi cappata nell&apos;intervallo indicato.
              Il cap impedisce che una singola giornata eccezionale (o disastrosa) distorca eccessivamente il punteggio.
              Per i DEF, le statistiche della correzione si aggiungono ai bonus/malus ordinari (clean sheet, goal subiti).
            </Note>
          </div>
        </CardContent>
      </Card>

      {/* ── Bonus / Malus ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Bonus e Malus" description="Contributi fissi per eventi di partita" />
        <CardContent className="p-0">

          {/* Goals */}
          <div className="border-b border-[#1e1e2e] px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#55556a]">Gol segnati</p>
            <TableWrap>
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <Th>Ruolo</Th>
                  <Th right>Gol normale</Th>
                  <Th right>Gol su rigore</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {goalRows.map((g) => (
                  <tr key={g.rc} className="hover:bg-[#0f0f1a]">
                    <Td>
                      <span className={`font-mono text-xs font-bold ${rcColor[g.rc]}`}>{g.rc}</span>
                      <span className="ml-2 text-[#8888aa]">{g.label}</span>
                    </Td>
                    <Td right mono><span className="text-emerald-400">{sign(g.normal)}</span></Td>
                    <Td right mono><span className="text-emerald-400">{sign(g.penalty)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <p className="mt-2 text-xs text-[#55556a]">
              Gol su rigore = bonus ruolo − {cfg.bonus_malus.penalty_scored_discount}.
              Doppietta: +{cfg.bonus_malus.brace_bonus} aggiuntivo.
              Tripletta: +{cfg.bonus_malus.hat_trick_bonus} aggiuntivo (sostituisce il bonus doppietta).
            </p>
          </div>

          {/* Events */}
          <div className="border-b border-[#1e1e2e] px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#55556a]">Altri eventi</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
              {[
                { label: 'Assist',            val: cfg.bonus_malus.assist,         cond: null },
                { label: 'Autorete',          val: cfg.bonus_malus.own_goal,        cond: null },
                { label: 'Ammonizione',       val: cfg.bonus_malus.yellow_card,     cond: null },
                { label: 'Espulsione',        val: cfg.bonus_malus.red_card,        cond: null },
                { label: 'Rigore fallito',    val: cfg.bonus_malus.penalty_missed,  cond: null },
                { label: 'Rigore parato',     val: cfg.bonus_malus.penalty_saved,   cond: 'solo GK' },
              ].map(({ label, val, cond }) => (
                <div key={label} className="flex items-center justify-between gap-2 rounded px-2 py-1.5">
                  <span className="text-sm text-[#c8c8e8]">{label}</span>
                  <div className="flex items-center gap-1.5">
                    {cond && <span className="text-xs text-[#55556a]">({cond})</span>}
                    <span className={`font-mono text-sm font-semibold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {sign(val)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clean sheet */}
          <div className="border-b border-[#1e1e2e] px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#55556a]">Clean sheet</p>
            <div className="space-y-1.5">
              {[
                { rc: 'GK',  val: cfg.bonus_malus.clean_sheet_by_role.GK  ?? 0 },
                { rc: 'DEF', val: cfg.bonus_malus.clean_sheet_by_role.DEF ?? 0 },
              ].map(({ rc, val }) => (
                <div key={rc} className="flex items-center gap-3">
                  <span className={`font-mono text-xs font-bold ${rcColor[rc]}`}>{rc}</span>
                  <span className="text-sm text-emerald-400 font-mono font-semibold">{sign(val)}</span>
                  <span className="text-xs text-[#55556a]">se ≥ {cfg.bonus_malus.clean_sheet_min_minutes}&apos; giocati</span>
                </div>
              ))}
            </div>
          </div>

          {/* Goals conceded */}
          <div className="px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#55556a]">Goal subiti (per goal)</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className={`font-mono text-xs font-bold ${rcColor.GK}`}>GK</span>
                <span className="text-sm text-red-400 font-mono font-semibold">{sign(cfg.bonus_malus.goals_conceded_by_role.GK  ?? 0)}</span>
                <span className="text-xs text-[#55556a]">sempre (nessun minimo)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-mono text-xs font-bold ${rcColor.DEF}`}>DEF</span>
                <span className="text-sm text-red-400 font-mono font-semibold">{sign(cfg.bonus_malus.goals_conceded_by_role.DEF ?? 0)}</span>
                <span className="text-xs text-[#55556a]">se ≥ {cfg.bonus_malus.goals_conceded_def_min_minutes}&apos; giocati</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Bonus avanzati ────────────────────────────────────────────────── */}
      {adv.enabled && (
        <Card>
          <CardHeader
            title="Bonus avanzati"
            description={`Ricompensano prestazioni tecniche eccezionali — cap totale +${adv.total_cap}`}
          />
          <CardContent className="p-0">
            <div className="divide-y divide-[#1e1e2e]">

              {/* Creative */}
              <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Visione di gioco</p>
                    <p className="mt-0.5 text-xs text-[#55556a]">
                      ≥ {adv.creative_key_passes_threshold} passaggi chiave
                      <span className="mx-1.5 text-[#2e2e42]">oppure</span>
                      ≥ {adv.creative_expected_assists_threshold} xA attesi
                    </p>
                  </div>
                  <Pill color="emerald">{sign(adv.creative_bonus)}</Pill>
                </div>
              </div>

              {/* Dribbling */}
              <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Dribbling</p>
                    <p className="mt-0.5 text-xs text-[#55556a]">
                      ≥ {adv.dribbling_successful_threshold} dribbling riusciti
                      <span className="mx-1.5 text-[#2e2e42]">e</span>
                      ≥ {adv.dribbling_success_rate_threshold}% di successo
                    </p>
                  </div>
                  <Pill color="emerald">{sign(adv.dribbling_bonus)}</Pill>
                </div>
              </div>

              {/* Passing */}
              <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Controllo del palleggio</p>
                    <p className="mt-0.5 text-xs text-[#55556a]">
                      ≥ {adv.passing_completed_threshold} passaggi completati
                      <span className="mx-1.5 text-[#2e2e42]">e</span>
                      ≥ {adv.passing_accuracy_threshold}% accuratezza
                      <span className="mx-1.5 text-[#2e2e42]">e</span>
                      (≥ {adv.passing_final_third_threshold} nel terzo avversario
                      <span className="mx-1.5 text-[#2e2e42]">oppure</span>
                      ≥ {adv.passing_progressive_threshold} progressivi)
                    </p>
                  </div>
                  <Pill color="emerald">{sign(adv.passing_bonus)}</Pill>
                </div>
              </div>

            </div>
            <div className="border-t border-[#1e1e2e] px-4 py-3">
              <Note>
                I bonus avanzati sono <strong className="text-[#c8c8e8]">indipendenti</strong> tra loro — tutti e tre possono scattare nella stessa partita.
                Il totale è tuttavia cappato a <strong className="text-[#c8c8e8]">+{adv.total_cap}</strong> per evitare distorsioni eccessive.
              </Note>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Note generali ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Note generali" />
        <CardContent>
          <ul className="space-y-2 text-sm text-[#8888aa]">
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                I voti sono marcati come <strong className="text-[#c8c8e8]">provvisori</strong> quando le statistiche non sono ancora confermate dalle fonti.
                Un calcolo con voti provvisori è valido ma potrebbe cambiare dopo una nuova pubblicazione.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Gli <strong className="text-[#c8c8e8]">override manuali</strong> sostituiscono il fantavoto calcolato dal motore.
                Gli intermediari (z-score, voto base, B/M) restano visibili per trasparenza.
                Un override è indicato con <span className="text-orange-400">★</span> nella pagina risultati.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Il <strong className="text-[#c8c8e8]">fantavoto di squadra</strong> è la somma dei fantavoti dei titolari (no panchina).
                I giocatori NV contribuiscono 0 al totale — non viene applicata nessuna sostituzione automatica dalla panchina in questa versione.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Tutti i valori in questa pagina riflettono la configurazione <span className="font-mono text-indigo-300">{cfg.engine_version}</span> attiva.
                Qualsiasi modifica futura ai parametri si rifletterà automaticamente qui.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

    </div>
  )
}
