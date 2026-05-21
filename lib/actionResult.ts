/**
 * Canonical server-action result envelope.
 *
 * Every server action returns this shape (extended with extra data fields
 * when needed). Client components consume it via React 19's `useActionState`
 * — keeping the shape uniform means every form can branch on `error` and
 * surface `success` the same way.
 *
 * Extend with extra fields per action:
 *   Promise<ActionResult & { competition_id?: string }>
 */
export interface ActionResult {
  error: string | null
  success: boolean
}

/** Convenience builder for the failure case. */
export function actionError(error: string): ActionResult {
  return { error, success: false }
}

/** Convenience builder for the success case. */
export function actionOk<T extends object = object>(extra?: T): ActionResult & T {
  return { error: null, success: true, ...(extra ?? ({} as T)) }
}
