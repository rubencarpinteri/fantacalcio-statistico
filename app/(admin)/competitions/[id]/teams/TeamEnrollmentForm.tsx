'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { enrollTeamsAction, unenrollTeamAction } from '../actions'

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
      {pending ? 'Salvataggio...' : label}
    </button>
  )
}

interface AvailableTeam { id: string; name: string }
interface EnrolledTeam  { id: string; team_id: string; fantasy_teams: { name: string } | null }

interface TeamEnrollmentFormProps {
  competitionId:  string
  enrolledTeams:  EnrolledTeam[]
  availableTeams: AvailableTeam[]
  competitionStatus: string
}

export function TeamEnrollmentForm({
  competitionId,
  enrolledTeams,
  availableTeams,
  competitionStatus,
}: TeamEnrollmentFormProps) {
  const enrollAction = enrollTeamsAction.bind(null, competitionId, [])

  const [enrollState, enrollFormAction] = useActionState(
    async (_prev: { error: string | null; success: boolean }, fd: FormData) => {
      const ids = fd.getAll('team_ids') as string[]
      return enrollTeamsAction(competitionId, ids)
    },
    { error: null, success: false }
  )

  const [unenrollState, unenrollFormAction] = useActionState(
    async (_prev: { error: string | null; success: boolean }, fd: FormData) => {
      const tid = fd.get('team_id') as string
      return unenrollTeamAction(competitionId, tid)
    },
    { error: null, success: false }
  )

  const isLocked = competitionStatus === 'active'

  return (
    <div className="space-y-6">
      {/* Enrolled teams */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">
          Squadre iscritte ({enrolledTeams.length})
        </h3>
        {enrolledTeams.length === 0 ? (
          <p className="text-sm text-[#55556a]">Nessuna squadra iscritta.</p>
        ) : (
          <div className="space-y-2">
            {enrolledTeams.map((et) => {
              const name = (et.fantasy_teams as unknown as { name: string } | null)?.name ?? et.team_id.slice(0, 8)
              return (
                <div key={et.id}
                  className="flex items-center justify-between rounded-lg border border-[#2e2e42] bg-[#0f0f1a] px-4 py-2.5">
                  <span className="text-sm text-white">{name}</span>
                  {!isLocked && (
                    <form action={unenrollFormAction}>
                      <input type="hidden" name="team_id" value={et.team_id} />
                      <button type="submit"
                        className="text-xs text-red-400 hover:text-red-300 transition-colors">
                        Rimuovi
                      </button>
                    </form>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {(unenrollState.error) && (
          <p className="mt-2 text-sm text-red-400">{unenrollState.error}</p>
        )}
        {isLocked && (
          <p className="mt-2 text-xs text-amber-400">
            ⚠ La competizione è attiva — non è possibile rimuovere squadre.
          </p>
        )}
      </div>

      {/* Enroll new teams */}
      {availableTeams.length > 0 && !isLocked && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-white">Iscrivi squadre</h3>
          {enrollState.error && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              {enrollState.error}
            </div>
          )}
          <form action={enrollFormAction} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {availableTeams.map((t) => (
                <label key={t.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2.5 hover:border-indigo-500/30 transition-colors">
                  <input type="checkbox" name="team_ids" value={t.id} className="accent-indigo-500" />
                  <span className="text-sm text-white">{t.name}</span>
                </label>
              ))}
            </div>
            <SubmitButton label="Iscrivi selezionate" />
          </form>
        </div>
      )}

      {availableTeams.length === 0 && !isLocked && (
        <p className="text-sm text-[#55556a]">Tutte le squadre della lega sono già iscritte.</p>
      )}
    </div>
  )
}
