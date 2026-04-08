import fs from 'fs'
import path from 'path'

export type CalendarMatch = {
  matchNumber: number
  roundNumber: number
  homeTeam: string
  awayTeam: string
  label: string
  sofascoreMatchId: number | null
  fotmobMatchId: number | null
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
    const homeTeam = (parts[3] ?? '').trim()
    const awayTeam = (parts[4] ?? '').trim()
    if (isNaN(matchNumber) || isNaN(roundNumber) || !homeTeam || !awayTeam) continue
    const sofascoreRaw = (parts[6] ?? '').trim()
    const fotmobRaw = (parts[7] ?? '').trim()
    results.push({
      matchNumber,
      roundNumber,
      homeTeam,
      awayTeam,
      label: `${homeTeam} - ${awayTeam}`,
      sofascoreMatchId: sofascoreRaw ? parseInt(sofascoreRaw, 10) : null,
      fotmobMatchId: fotmobRaw ? parseInt(fotmobRaw, 10) : null,
    })
  }

  return results
}

export function getMatchesForRound(roundNumber: number): CalendarMatch[] {
  return parseCalendar().filter((m) => m.roundNumber === roundNumber)
}
