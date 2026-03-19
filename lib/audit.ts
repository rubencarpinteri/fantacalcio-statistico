import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, AuditAction, Json } from '@/types/database.types'

interface WriteAuditLogParams {
  supabase: SupabaseClient<Database>
  leagueId: string | null
  actorUserId: string
  actionType: AuditAction
  entityType: string
  entityId?: string
  beforeJson?: Json
  afterJson?: Json
  metadataJson?: Json
}

/**
 * Writes a single audit log entry.
 * Should be called from every server action that mutates important data.
 * Errors are silently swallowed to prevent audit failures from blocking
 * the primary operation — but they are logged to the server console.
 */
export async function writeAuditLog({
  supabase,
  leagueId,
  actorUserId,
  actionType,
  entityType,
  entityId,
  beforeJson,
  afterJson,
  metadataJson,
}: WriteAuditLogParams): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    league_id: leagueId,
    actor_user_id: actorUserId,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId ?? null,
    before_json: beforeJson ?? null,
    after_json: afterJson ?? null,
    metadata_json: metadataJson ?? null,
  })

  if (error) {
    console.error('[audit] Failed to write audit log:', {
      actionType,
      entityType,
      entityId,
      error: error.message,
    })
  }
}
