import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AMBIGUOUS_ROLES, ALL_MANTRA_ROLES, DEFAULT_ROLE_MAP } from '@/domain/roles/defaultRoleMap'
import { RoleRuleForm } from './RoleRuleForm'
import { DeleteRuleButton } from './DeleteRuleButton'

export const metadata = { title: 'Regole Ruoli Ambigui' }

export default async function RoleRulesPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: rules } = await supabase
    .from('role_classification_rules')
    .select('*')
    .eq('league_id', ctx.league.id)
    .order('mantra_role')

  const existingRulesMap = Object.fromEntries(
    (rules ?? []).map((r) => [r.mantra_role, r])
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Regole Ruoli Ambigui</h1>
        <p className="mt-0.5 text-sm text-[#8888aa]">
          Configura la classificazione statistica dei ruoli Mantra che non hanno un mapping univoco.
          Queste regole vengono applicate durante l&apos;importazione delle rose come valore di default.
          Puoi sempre sovrascrivere il rating class per ogni singolo giocatore.
        </p>
      </div>

      {/* Legend: what the rating class affects */}
      <Card>
        <CardHeader title="Effetti del rating class" />
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <InfoRow
              label="Moltiplicatore ruolo"
              detail="GK ×1.15 · DEF ×1.10 · MID ×1.00 · ATT ×0.97"
            />
            <InfoRow
              label="Correzione difensiva"
              detail="DEF cap ±1.5/−1.0 · MID cap ±0.8 · GK cap +1.2/−1.0 · ATT nessuna"
            />
            <InfoRow
              label="Clean sheet bonus"
              detail="GK +0.8 · DEF +0.5 (min 60') · MID/ATT nessuno"
            />
            <InfoRow
              label="Gol subiti malus"
              detail="GK −0.4/gol · DEF −0.15/gol (min 60') · altri nessuno"
            />
          </div>
        </CardContent>
      </Card>

      {/* Ambiguous roles requiring configuration */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8888aa]">
          Ruoli che richiedono configurazione
        </h2>

        {[...AMBIGUOUS_ROLES].map((role) => {
          const existing = existingRulesMap[role]
          return (
            <Card key={role}>
              <CardHeader
                title={`Ruolo: ${role}`}
                description={
                  role === 'E'
                    ? "Esterno / Wing-back — può giocare come terzino (DEF) o come ala difensiva (MID)"
                    : `Configurazione per il ruolo ${role}`
                }
                action={
                  existing ? (
                    <Badge variant="success">Configurato</Badge>
                  ) : (
                    <Badge variant="warning">Non configurato</Badge>
                  )
                }
              />
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    {existing ? (
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-[#8888aa]">Classificazione corrente:</p>
                        <Badge variant="accent">{existing.default_rating_class}</Badge>
                        <DeleteRuleButton ruleId={existing.id} mantraRole={role} />
                      </div>
                    ) : (
                      <p className="text-sm text-amber-400">
                        ⚠ Nessuna regola configurata. Giocatori con ruolo &quot;{role}&quot; richiederanno
                        conferma manuale durante l&apos;importazione.
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <RoleRuleForm
                      mantraRole={role}
                      currentClass={existing?.default_rating_class}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Reference: unambiguous roles */}
      <Card>
        <CardHeader
          title="Ruoli con mapping univoco"
          description="Questi ruoli hanno una classificazione fissa e non richiedono configurazione."
        />
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ALL_MANTRA_ROLES.filter((r) => !AMBIGUOUS_ROLES.has(r)).map((role) => (
              <div
                key={role}
                className="flex items-center gap-1.5 rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-1.5"
              >
                <span className="text-sm font-medium text-white">{role}</span>
                <span className="text-xs text-[#55556a]">→</span>
                <span className="text-xs font-medium text-indigo-400">
                  {DEFAULT_ROLE_MAP[role]}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function InfoRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-[#f0f0fa]">{label}</p>
      <p className="mt-0.5 font-mono text-xs text-[#55556a]">{detail}</p>
    </div>
  )
}
