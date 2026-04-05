import { requireLeagueContext } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DEFAULT_ENGINE_CONFIG } from '@/domain/engine/v1/config'
import type { LeagueEngineConfig } from '@/types/database.types'

export const metadata = { title: 'Metodologia — Fantacalcio Statistico' }

const cfg = DEFAULT_ENGINE_CONFIG

// ─── helpers ─────────────────────────────────────────────────────────────────

function sign(n: number) {
  return n >= 0 ? `+${n}` : `${n}`
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
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const { data: dbEngCfg } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', ctx.league.id)
    .maybeSingle() as { data: LeagueEngineConfig | null }

  const bm = cfg.bonus_malus

  // Effective values: DB row if present, else DEFAULT_ENGINE_CONFIG
  const eff = {
    minutes_factor_threshold: dbEngCfg?.minutes_factor_threshold ?? cfg.minutes_factor.threshold,
    minutes_factor_partial:   dbEngCfg?.minutes_factor_partial   ?? cfg.minutes_factor.partial,
    minutes_factor_full:      dbEngCfg?.minutes_factor_full      ?? cfg.minutes_factor.full,

    role_multiplier_gk:  dbEngCfg?.role_multiplier_gk  ?? cfg.role_multiplier.GK,
    role_multiplier_def: dbEngCfg?.role_multiplier_def ?? cfg.role_multiplier.DEF,
    role_multiplier_mid: dbEngCfg?.role_multiplier_mid ?? cfg.role_multiplier.MID,
    role_multiplier_att: dbEngCfg?.role_multiplier_att ?? cfg.role_multiplier.ATT,

    goal_gk:  dbEngCfg?.goal_bonus_gk  ?? bm.goal_by_role.GK,
    goal_def: dbEngCfg?.goal_bonus_def ?? bm.goal_by_role.DEF,
    goal_mid: dbEngCfg?.goal_bonus_mid ?? bm.goal_by_role.MID,
    goal_att: dbEngCfg?.goal_bonus_att ?? bm.goal_by_role.ATT,

    penalty_scored_discount: dbEngCfg?.penalty_scored_discount ?? bm.penalty_scored_discount,
    brace_bonus:             dbEngCfg?.brace_bonus             ?? bm.brace_bonus,
    hat_trick_bonus:         dbEngCfg?.hat_trick_bonus         ?? bm.hat_trick_bonus,

    assist:         dbEngCfg?.assist         ?? bm.assist,
    own_goal:       dbEngCfg?.own_goal       ?? bm.own_goal,
    yellow_card:    dbEngCfg?.yellow_card    ?? bm.yellow_card,
    red_card:       dbEngCfg?.red_card       ?? bm.red_card,
    penalty_missed: dbEngCfg?.penalty_missed ?? bm.penalty_missed,
    penalty_saved:  dbEngCfg?.penalty_saved  ?? bm.penalty_saved,

    clean_sheet_gk:           dbEngCfg?.clean_sheet_gk           ?? (bm.clean_sheet_by_role.GK  ?? 0),
    clean_sheet_def:          dbEngCfg?.clean_sheet_def          ?? (bm.clean_sheet_by_role.DEF ?? 0),
    clean_sheet_min_minutes:  dbEngCfg?.clean_sheet_min_minutes  ?? bm.clean_sheet_min_minutes,

    goals_conceded_gk:               dbEngCfg?.goals_conceded_gk               ?? (bm.goals_conceded_by_role.GK  ?? 0),
    goals_conceded_def:              dbEngCfg?.goals_conceded_def              ?? (bm.goals_conceded_by_role.DEF ?? 0),
    goals_conceded_def_min_minutes:  dbEngCfg?.goals_conceded_def_min_minutes  ?? bm.goals_conceded_def_min_minutes,
  }

  const roleRows = [
    { rc: 'GK',  label: 'Portiere',       mult: eff.role_multiplier_gk  },
    { rc: 'DEF', label: 'Difensore',      mult: eff.role_multiplier_def },
    { rc: 'MID', label: 'Centrocampista', mult: eff.role_multiplier_mid },
    { rc: 'ATT', label: 'Attaccante',     mult: eff.role_multiplier_att },
  ]

  const rcColor: Record<string, string> = {
    GK: 'text-yellow-400', DEF: 'text-blue-400', MID: 'text-green-400', ATT: 'text-red-400',
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  const goalRows = [
    { rc: 'GK',  label: 'Portiere',       normal: eff.goal_gk,  penalty: round1(eff.goal_gk  - eff.penalty_scored_discount) },
    { rc: 'DEF', label: 'Difensore',      normal: eff.goal_def, penalty: round1(eff.goal_def - eff.penalty_scored_discount) },
    { rc: 'MID', label: 'Centrocampista', normal: eff.goal_mid, penalty: round1(eff.goal_mid - eff.penalty_scored_discount) },
    { rc: 'ATT', label: 'Attaccante',     normal: eff.goal_att, penalty: round1(eff.goal_att - eff.penalty_scored_discount) },
  ]

  void SectionTitle

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
        <CardHeader title="Pipeline di calcolo" description="Il percorso dal voto FotMob al fantavoto finale" />
        <CardContent>
          <div className="space-y-3">
            <Step n={1} label="Recupero voti da FotMob (unica fonte)" />
            <Step n={2} label={`z-score FotMob: z = (voto − ${cfg.source_normalization.mean}) / ${cfg.source_normalization.std}`} />
            <Step n={3} label={`Fattore minuti: NV se 0', ×${eff.minutes_factor_partial} se 1–${eff.minutes_factor_threshold - 1}', ×${eff.minutes_factor_full} se ≥ ${eff.minutes_factor_threshold}'`} />
            <Step n={4} label={`Voto base: b₀ = ${cfg.base_score} + ${cfg.scale_factor} × z_adjusted`} />
            <Step n={5} label="Moltiplicatore ruolo: amplifica/comprime lo scostamento da 6.0" />
            <Step n={6} label="Bonus / Malus: gol, assist, cartellini, rigori, clean sheet…" />
            <Step n={7} label="Fantavoto finale = voto_base + bonus_malus" />
          </div>
          <div className="mt-5 rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-4 py-3 font-mono text-xs text-[#8888aa]">
            <span className="text-white">Fantavoto</span>
            {' = '}
            <span className="text-indigo-300">voto_base</span>
            {' + '}
            <span className="text-emerald-300">bonus_malus</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Fonte: FotMob ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Fonte di voto: FotMob" description="L'unica piattaforma usata per il calcolo del voto base" />
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[#55556a]">Media storica</p>
              <p className="font-mono text-2xl font-bold text-white">{cfg.source_normalization.mean.toFixed(2)}</p>
              <p className="mt-1 text-xs text-[#55556a]">
                Corrisponde al voto &quot;sufficiente&quot; su FotMob (confermato dalle fasce cromatiche della piattaforma).
                Un giocatore con voto {cfg.source_normalization.mean} riceve z = 0 → voto base 6.0.
              </p>
            </div>
            <div className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[#55556a]">Deviazione standard (σ)</p>
              <p className="font-mono text-2xl font-bold text-white">{cfg.source_normalization.std.toFixed(2)}</p>
              <p className="mt-1 text-xs text-[#55556a]">
                Controlla la &quot;sensibilità&quot; della formula: σ più grande → le differenze di voto pesano meno.
                Con σ = {cfg.source_normalization.std}, un voto di {(cfg.source_normalization.mean + cfg.source_normalization.std).toFixed(1)} (+1σ) produce z ≈ +1 → voto base ≈ 7.15.
              </p>
            </div>
          </div>
          <Note>
            Il voto FotMob incorpora già tutti i contributi difensivi (tackle, intercetti, salvataggi…) in un singolo numero.
            La formula si basa su di esso come segnale sintetico, senza correzioni aggiuntive.
          </Note>
        </CardContent>
      </Card>

      {/* ── Normalizzazione ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Normalizzazione z-score" description="Come viene convertito il voto FotMob in uno scostamento dalla media" />
        <CardContent>
          <div className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-4 py-3 font-mono text-sm">
            <span className="text-indigo-300">z</span>
            {' = ( '}
            <span className="text-white">voto_fotmob</span>
            {' − '}
            <span className="text-[#8888aa]">{cfg.source_normalization.mean}</span>
            {' ) / '}
            <span className="text-[#8888aa]">{cfg.source_normalization.std}</span>
          </div>
          <Note>
            Uno z-score pari a 0 corrisponde esattamente al giocatore medio (voto {cfg.source_normalization.mean} su FotMob).
            Valori positivi indicano una prestazione sopra la media, valori negativi sotto.
            Se FotMob non ha ancora pubblicato il voto (es. partita in corso), il giocatore riceve voto base 6.0 + B/M.
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
                <Td>1 – {eff.minutes_factor_threshold - 1} minuti</Td>
                <Td right mono><Pill color="indigo">× {eff.minutes_factor_partial}</Pill></Td>
                <Td right dim>Partecipazione parziale — z ridotto</Td>
              </tr>
              <tr className="hover:bg-[#0f0f1a]">
                <Td>≥ {eff.minutes_factor_threshold} minuti</Td>
                <Td right mono><Pill color="emerald">× {eff.minutes_factor_full}</Pill></Td>
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
              voto_base = b₁ cappato tra {cfg.voto_base_cap_min} e {cfg.voto_base_cap_max}
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
            GK e DEF sono amplificati perché il loro voto FotMob è il segnale principale (raramente segnano).
            ATT è leggermente compresso perché gol e assist sono già conteggiati nel B/M.
            Valori modificabili da{' '}
            <a href="/league/engine-config" className="text-indigo-300 hover:underline">Configurazione motore</a>.
          </Note>
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
              Gol su rigore = bonus ruolo − {eff.penalty_scored_discount}.
              Doppietta: +{eff.brace_bonus} aggiuntivo.
              Tripletta: +{eff.hat_trick_bonus} aggiuntivo (sostituisce il bonus doppietta).
            </p>
          </div>

          {/* Events */}
          <div className="border-b border-[#1e1e2e] px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#55556a]">Altri eventi</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
              {[
                { label: 'Assist',            val: eff.assist,         cond: null },
                { label: 'Autorete',          val: eff.own_goal,        cond: null },
                { label: 'Ammonizione',       val: eff.yellow_card,     cond: null },
                { label: 'Espulsione',        val: eff.red_card,        cond: null },
                { label: 'Rigore fallito',    val: eff.penalty_missed,  cond: null },
                { label: 'Rigore parato',     val: eff.penalty_saved,   cond: 'solo GK' },
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
                { rc: 'GK',  val: eff.clean_sheet_gk },
                { rc: 'DEF', val: eff.clean_sheet_def },
              ].map(({ rc, val }) => (
                <div key={rc} className="flex items-center gap-3">
                  <span className={`font-mono text-xs font-bold ${rcColor[rc]}`}>{rc}</span>
                  <span className="text-sm text-emerald-400 font-mono font-semibold">{sign(val)}</span>
                  <span className="text-xs text-[#55556a]">se ≥ {eff.clean_sheet_min_minutes}&apos; giocati</span>
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
                <span className="text-sm text-red-400 font-mono font-semibold">{sign(eff.goals_conceded_gk)}</span>
                <span className="text-xs text-[#55556a]">sempre (nessun minimo)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-mono text-xs font-bold ${rcColor.DEF}`}>DEF</span>
                <span className="text-sm text-red-400 font-mono font-semibold">{sign(eff.goals_conceded_def)}</span>
                <span className="text-xs text-[#55556a]">se ≥ {eff.goals_conceded_def_min_minutes}&apos; giocati</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Note generali ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Note generali" />
        <CardContent>
          <ul className="space-y-2 text-sm text-[#8888aa]">
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                I voti sono marcati come <strong className="text-[#c8c8e8]">provvisori</strong> quando le statistiche non sono ancora confermate da FotMob.
                Un calcolo con voti provvisori è valido ma potrebbe cambiare dopo una nuova pubblicazione.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Se FotMob non ha ancora pubblicato il voto (es. partita in corso), il giocatore riceve <strong className="text-[#c8c8e8]">voto base 6.0</strong> con il solo contributo del B/M.
                Questo caso è indicato con <span className="text-sky-400">⚡</span> nella pagina calcoli.
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
                Il <strong className="text-[#c8c8e8]">fantavoto di squadra</strong> è la somma dei fantavoti dei titolari in campo, con sostituzione automatica dalla panchina per i giocatori NV (logica Mantra MASTER).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-indigo-300">·</span>
              <span>
                Bonus/malus, fattore minuti e moltiplicatori di ruolo sono <strong className="text-[#c8c8e8]">personalizzabili per lega</strong> dalla sezione{' '}
                <a href="/league/engine-config" className="text-indigo-300 hover:underline">Configurazione motore</a>.
                Tutti i valori in questa pagina riflettono la configurazione attiva della tua lega.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

    </div>
  )
}
