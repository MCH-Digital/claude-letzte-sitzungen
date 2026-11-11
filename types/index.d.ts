export type Sitzung = {
  id: string
  title: string
  project: string
  isRunning: boolean
  lastActivityAt: string
  link?: string
  /** Anfang der letzten Nachricht (Claude oder du). */
  vorschau?: string
  /** Wer zuletzt geschrieben hat; 'frage' = Claude fragt dich etwas. */
  zuletzt?: 'claude' | 'frage' | 'du'
  /** lastActivityAt, zu dem vorschau/zuletzt geholt wurden. */
  detailStand?: string
}

export type Daten = { rows: Sitzung[]; fehler: string; stand: number; farben: Record<string, string> }

declare module 'claude-code' {
  interface PluginState {
    'letzte-sitzungen': { daten: Daten }
  }
}
