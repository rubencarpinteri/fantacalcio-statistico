import fs from 'fs'
import path from 'path'

export type CalendarMatch = {
  matchNumber: number
  roundNumber: number
  homeTeam: string
  awayTeam: string
  label: string
  /** SportMonks fixture ID — null when the CSV column is empty (e.g. legacy 25/26 file). */
  sportmonksFixtureId: number | null
  /** ISO UTC kickoff time, parsed from "dd/MM/yyyy HH:mm" in Europe/Rome. */
  kickoffAt: string | null
}

// Parse "23/08/2025 16:30" assuming Europe/Rome wall-clock and return UTC ISO.
// CEST (UTC+2) runs from last Sunday of March to last Sunday of October;
// CET (UTC+1) the rest of the year. Serie A timestamps in the calendar
// are local Italian time, so we apply the offset in effect on the date.
function parseRomeToUtc(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, dd, mm, yyyy, hh, mi] = m
  const day = Number(dd), month = Number(mm), year = Number(yyyy)
  const hour = Number(hh), minute = Number(mi)
  const lastSunday = (y: number, monthIdx: number) => {
    const d = new Date(Date.UTC(y, monthIdx + 1, 0))
    return d.getUTCDate() - d.getUTCDay()
  }
  const dstStart = lastSunday(year, 2)   // March
  const dstEnd = lastSunday(year, 9)     // October
  const inDst =
    (month > 3 && month < 10) ||
    (month === 3 && day >= dstStart) ||
    (month === 10 && day < dstEnd)
  const offsetHours = inDst ? 2 : 1
  return new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute)).toISOString()
}

function parseCalendar(): CalendarMatch[] {
  const filePath = path.join(process.cwd(), '_data', 'SerieAcalendar2526.csv')
  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  const lines = text.trim().split('\n').slice(1)
  const results: CalendarMatch[] = []

  for (const line of lines) {
    const parts = line.split(',')
    const matchNumber = parseInt(parts[0] ?? '', 10)
    const roundNumber = parseInt(parts[1] ?? '', 10)
    const dateRaw = (parts[2] ?? '').trim()
    const homeTeam = (parts[3] ?? '').trim()
    const awayTeam = (parts[4] ?? '').trim()
    if (isNaN(matchNumber) || isNaN(roundNumber) || !homeTeam || !awayTeam) continue
    // Column 7 (0-indexed): SportMonks fixture ID. The legacy 25/26 CSV
    // had SofaScore at col 6 and FotMob at col 7 — both ignored now.
    const sportmonksRaw = (parts[7] ?? '').trim()
    results.push({
      matchNumber,
      roundNumber,
      homeTeam,
      awayTeam,
      label: `${homeTeam} - ${awayTeam}`,
      sportmonksFixtureId: sportmonksRaw ? parseInt(sportmonksRaw, 10) : null,
      kickoffAt: parseRomeToUtc(dateRaw),
    })
  }

  return results
}

export function getMatchesForRound(roundNumber: number): CalendarMatch[] {
  return parseCalendar().filter((m) => m.roundNumber === roundNumber)
}
