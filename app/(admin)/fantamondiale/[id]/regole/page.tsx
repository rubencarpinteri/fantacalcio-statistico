import { requireFMContext } from '@/lib/fantamondiale/server'
import type { FMCompetitionConfig } from '@/domain/fantamondiale/config/schema'
import { DEFAULT_FM_CONFIG } from '@/domain/fantamondiale/config/defaults'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-hairline bg-glass-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export default async function RegolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)

  const config = (ctx.config?.config as FMCompetitionConfig | null) ?? DEFAULT_FM_CONFIG

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold text-ink-1">Regole</h2>
        <p className="mt-0.5 text-[11px] text-ink-4">Configurazione ufficiale della competizione</p>
      </div>

      <Section title="Rosa e Budget">
        <div className="space-y-2 text-[13px] text-ink-2">
          <div className="flex justify-between">
            <span className="text-ink-4">Giocatori per rosa</span>
            <span className="font-medium text-ink-1">{config.squad.pool_size}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Budget</span>
            <span className="font-medium text-ink-1">{config.squad.budget_default} crediti</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Titolari</span>
            <span className="font-medium text-ink-1">{config.squad.starters}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Formazioni consentite</span>
            <span className="font-medium text-ink-1 text-right">{config.formations.join(', ')}</span>
          </div>
        </div>
      </Section>

      <Section title="Motore di calcolo">
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-ink-4">Media FotMob</span>
            <span className="font-medium text-ink-1 tabular-nums">{config.engine.fotmob_mean}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Std FotMob</span>
            <span className="font-medium text-ink-1 tabular-nums">{config.engine.fotmob_std}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Std voto base target</span>
            <span className="font-medium text-ink-1 tabular-nums">{config.engine.target_vote_std}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Soglia minuti</span>
            <span className="font-medium text-ink-1 tabular-nums">{config.engine.minutes_threshold} min</span>
          </div>
        </div>
      </Section>

      <Section title="Bonus calcio">
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-ink-4">Gol (P)</span>
            <span className="font-medium text-emerald-400 tabular-nums">+{config.football.goal.P}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Gol (D)</span>
            <span className="font-medium text-emerald-400 tabular-nums">+{config.football.goal.D}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Gol (C)</span>
            <span className="font-medium text-emerald-400 tabular-nums">+{config.football.goal.C}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Gol (A)</span>
            <span className="font-medium text-emerald-400 tabular-nums">+{config.football.goal.A}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Assist</span>
            <span className="font-medium text-emerald-400 tabular-nums">+{config.football.assist}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Clean sheet (P, ≥{config.football.clean_sheet.min_minutes}′)</span>
            <span className="font-medium text-indigo-400 tabular-nums">+{config.football.clean_sheet.P}</span>
          </div>
          {config.football.clean_sheet.D > 0 && (
            <div className="flex justify-between">
              <span className="text-ink-4">Clean sheet (D)</span>
              <span className="font-medium text-indigo-400 tabular-nums">+{config.football.clean_sheet.D}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-ink-4">Ammonizione</span>
            <span className="font-medium text-amber-400 tabular-nums">{config.football.yellow_card}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Espulsione</span>
            <span className="font-medium text-rose-400 tabular-nums">{config.football.red_card}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Doppietta bonus</span>
            <span className="font-medium text-emerald-400 tabular-nums">+{config.football.brace_bonus}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Hat-trick bonus</span>
            <span className="font-medium text-emerald-400 tabular-nums">+{config.football.hat_trick_bonus}</span>
          </div>
        </div>
      </Section>

      <Section title="Penalità popolarità">
        <p className="mb-3 text-[11px] text-ink-5">
          Riduzione % sul punteggio totale in base alla % di squadre che schierano quel giocatore nel turno.
        </p>
        <div className="space-y-1">
          {config.popularity_brackets.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="text-ink-4 w-24 tabular-nums">
                {b.min_pct}–{b.max_pct}%
              </span>
              <div className="flex-1 h-1 rounded-full bg-glass-3 overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${b.pct}%` }} />
              </div>
              <span className="font-semibold text-rose-400 tabular-nums w-10 text-right">−{b.pct}%</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Bonus MVP">
        <p className="mb-3 text-[11px] text-ink-5">
          Bonus per Man of the Match FotMob, inversamente proporzionale alla popolarità del giocatore.
        </p>
        <div className="space-y-1">
          {config.mvp_bonus_brackets.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="text-ink-4 w-24 tabular-nums">
                {b.min_pct}–{b.max_pct}%
              </span>
              <div className="flex-1 h-1 rounded-full bg-glass-3 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${b.pct}%` }} />
              </div>
              <span className="font-semibold text-indigo-400 tabular-nums w-10 text-right">+{b.pct}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Allenatore — Matrice Tier × Risultato">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-hairline">
                <th className="pb-2 text-left text-ink-4 font-medium">Tier</th>
                <th className="pb-2 text-center text-emerald-400 font-medium">Vittoria</th>
                <th className="pb-2 text-center text-ink-4 font-medium">Pareggio</th>
                <th className="pb-2 text-center text-rose-400 font-medium">Sconfitta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(['tier_1', 'tier_2', 'tier_3', 'tier_4'] as const).map((tier) => {
                const row = config.coach_tier_matrix[tier]
                return (
                  <tr key={tier}>
                    <td className="py-1.5 text-ink-2 font-medium">{tier.replace('_', ' ').toUpperCase()}</td>
                    <td className="py-1.5 text-center tabular-nums text-emerald-400 font-semibold">
                      {row.win >= 0 ? '+' : ''}{row.win}
                    </td>
                    <td className="py-1.5 text-center tabular-nums text-ink-3">
                      {row.draw >= 0 ? '+' : ''}{row.draw}
                    </td>
                    <td className="py-1.5 text-center tabular-nums text-rose-400">
                      {row.loss >= 0 ? '+' : ''}{row.loss}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Battle Royale">
        <div className="space-y-2 text-[13px]">
          <p className="text-[11px] text-ink-5">
            Ogni turno ogni squadra affronta tutte le altre. Vittoria = 3 pts, Pareggio = 1 pt, Sconfitta = 0 pts.
          </p>
          <div className="flex justify-between">
            <span className="text-ink-4">Win</span>
            <span className="font-semibold text-emerald-400">+{config.battle_royale.win_points} pts</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Pareggio</span>
            <span className="font-semibold text-ink-3">+{config.battle_royale.draw_points} pts</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-4">Sconfitta</span>
            <span className="font-semibold text-rose-400">+{config.battle_royale.loss_points} pts</span>
          </div>
          <div className="mt-2">
            <p className="text-[10px] text-ink-4 mb-1">Soglie goal (punteggio → gol)</p>
            <div className="flex flex-wrap gap-1">
              {config.battle_royale.goal_thresholds.map((t, i) => (
                <span key={i} className="rounded bg-glass-2 border border-hairline px-2 py-0.5 text-[10px] tabular-nums text-ink-2">
                  ≥{t} → {i + 1}G
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
