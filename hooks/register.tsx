import type { EngineInterface, Register } from 'claude-code'

import type { Daten, Sitzung } from '../types'

const PANE = 'letzte-sitzungen'
const ANZAHL = 8
const RESERVE = 12

// Stille Läufe: Endet eine Sitzung mit einer Claude-Nachricht, die mit „OK:“ beginnt,
// gab es nichts zu tun (z. B. ein geplanter Lauf ohne Befund). Solche Sitzungen blendet
// das Panel aus. Läufe mit Problemen enden anders und bleiben sichtbar.
function istStill(s: Sitzung): boolean {
  return !s.isRunning && s.zuletzt !== 'du' && (s.vorschau ?? '').startsWith('OK:')
}
const LEER: Daten = { rows: [], fehler: '', stand: 0, farben: {} }
const daten = { plugin: 'letzte-sitzungen', key: 'daten' } as const

function vor(iso: string, jetzt: number): string {
  const min = Math.max(0, Math.round((jetzt - Date.parse(iso)) / 60000))
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const std = Math.floor(min / 60)
  if (std < 24) return `vor ${std} Std.`
  return `vor ${Math.floor(std / 24)} T.`
}

function projekt(cwd: unknown): string {
  if (typeof cwd !== 'string' || cwd === '') return ''
  if (cwd.includes('scratch-workspaces')) return 'ohne Ordner'
  const teile = cwd.split(/[\\/]/).filter(Boolean)
  return teile[teile.length - 1] ?? ''
}

// Gedeckte, deutlich verschiedene Farbtöne. Jedes Projekt bekommt beim ersten
// Auftauchen die am wenigsten benutzte Farbe; die Zuordnung wird pro Nutzer
// dauerhaft gemerkt ($.store), sodass ein Projekt seine Farbe behält.
const PALETTE = [
  '#4a7396', // Taubenblau
  '#b8693f', // Orange
  '#4f8a68', // Salbeigrün
  '#8a5a9e', // Violett
  '#a0566e', // Altrosa
  '#3f8585', // Petrol
  '#9a8150', // Sand
  '#5a6b9c', // Graublau
  '#7d7f45', // Oliv
  '#8a6a4f', // Braun
  '#6e5b9a', // Lila
  '#a06450', // Terrakotta
]
const GRAU = '#5f6670' // „ohne Ordner“ und Rückfall
const GRUEN_LAEUFT = '#86efac'
const GELB_WARTET = '#fde68a'
const STORE_FARBEN = 'farben'

async function farbenMerken($: EngineInterface, projekte: string[]): Promise<Record<string, string>> {
  const gespeichert = await $.store.get(STORE_FARBEN)
  const farben: Record<string, string> =
    gespeichert && typeof gespeichert === 'object' ? { ...(gespeichert as Record<string, string>) } : {}
  let neu = false
  for (const p of projekte) {
    if (!p || p === 'ohne Ordner' || farben[p]) continue
    const zaehler = new Map(PALETTE.map(f => [f, 0]))
    for (const f of Object.values(farben)) zaehler.set(f, (zaehler.get(f) ?? 0) + 1)
    let beste = PALETTE[0] ?? GRAU
    for (const f of PALETTE) if ((zaehler.get(f) ?? 0) < (zaehler.get(beste) ?? 0)) beste = f
    farben[p] = beste
    neu = true
  }
  if (neu) await $.store.set(STORE_FARBEN, farben)
  return farben
}

function farbeFuer(farben: Record<string, string>, projektName: string): string {
  if (!projektName || projektName === 'ohne Ordner') return GRAU
  return farben[projektName] ?? GRAU
}

// Etwas heller für den Hover.
function aufhellen(hex: string, anteil: number): string {
  const n = parseInt(hex.slice(1), 16)
  const kanal = (v: number) => Math.round(v + (255 - v) * anteil).toString(16).padStart(2, '0')
  return `#${kanal((n >> 16) & 255)}${kanal((n >> 8) & 255)}${kanal(n & 255)}`
}

// Frisch kräftig, älter als eine Stunde blass.
function zeitStil(iso: string, jetzt: number): { color?: string; bold?: boolean; dim?: boolean } {
  const min = (jetzt - Date.parse(iso)) / 60000
  if (min < 15) return { color: 'suggestion', bold: true }
  if (min < 60) return { color: 'suggestion' }
  return { dim: true }
}

async function holen($: EngineInterface): Promise<Daten> {
  const stand = await $.clock.now()
  try {
    // Mehr holen als angezeigt wird, weil stille Läufe („OK:“) danach wegfallen.
    const res = await $.mcp.call('ccd_session_mgmt', 'list_sessions', { limit: ANZAHL + RESERVE })
    const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    if (res.isError) return { rows: [], fehler: text || 'Fehler beim Abruf', stand, farben: {} }
    const raw = JSON.parse(text) as Record<string, unknown>[]
    const rows: Sitzung[] = raw.map(r => ({
      id: String(r.sessionId),
      title: String(r.title ?? '(ohne Titel)'),
      project: projekt(r.cwd),
      isRunning: r.isRunning === true,
      lastActivityAt: String(r.lastActivityAt ?? ''),
      link: typeof r.link === 'string' ? r.link : undefined,
    }))
    const mitInfos = (await mitDetails($, rows)).filter(r => !istStill(r)).slice(0, ANZAHL)
    const farben = await farbenMerken($, mitInfos.map(r => r.project))
    return { rows: mitInfos, fehler: '', stand, farben }
  } catch (err) {
    return { rows: [], fehler: err instanceof Error ? err.message : String(err), stand, farben: {} }
  }
}

// Liest das Ende einer Sitzung: letzte Nachricht als Vorschau und wer zuletzt dran war.
// Nur neu, wenn sich in der Sitzung seit dem letzten Abruf etwas getan hat.
async function mitDetails($: EngineInterface, rows: Sitzung[]): Promise<Sitzung[]> {
  const { value: alt = LEER } = await $.state.get(daten)
  const cache = new Map(alt.rows.map(r => [r.id, r]))
  return Promise.all(
    rows.map(async r => {
      const vorher = cache.get(r.id)
      if (vorher && vorher.detailStand === r.lastActivityAt) {
        return { ...r, vorschau: vorher.vorschau, zuletzt: vorher.zuletzt, detailStand: vorher.detailStand }
      }
      try {
        const res = await $.mcp.call('ccd_session_mgmt', 'list_events', { session_id: r.id, limit: 6 })
        if (res.isError) return vorher ? { ...r, vorschau: vorher.vorschau, zuletzt: vorher.zuletzt } : r
        const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
        const letzte = letzteNachricht(text)
        if (!letzte) return { ...r, detailStand: r.lastActivityAt }
        return { ...r, ...letzte, detailStand: r.lastActivityAt }
      } catch {
        return vorher ? { ...r, vorschau: vorher.vorschau, zuletzt: vorher.zuletzt } : r
      }
    }),
  )
}

function letzteNachricht(text: string): { vorschau: string; zuletzt: 'claude' | 'frage' | 'du' } | undefined {
  // Nachrichten beginnen mit "[assistant] " oder "[user] " am Zeilenanfang.
  const teile = text.split(/^\[(assistant|user)\] /m)
  for (let i = teile.length - 2; i >= 1; i -= 2) {
    const rolle = teile[i]
    const inhalt = (teile[i + 1] ?? '').trim()
    if (!inhalt) continue
    const vorschau = kurz(inhalt, 180)
    if (rolle === 'user') return { vorschau, zuletzt: 'du' }
    const absaetze = inhalt.split(/\n\s*\n/).map(a => a.trim()).filter(Boolean)
    const schluss = absaetze[absaetze.length - 1] ?? ''
    return { vorschau, zuletzt: schluss.includes('?') ? 'frage' : 'claude' }
  }
  return undefined
}

function kurz(md: string, max: number): string {
  const flach = md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flach.length > max ? `${flach.slice(0, max - 1).trimEnd()}…` : flach
}

async function oeffnen($: EngineInterface, link: string | undefined): Promise<void> {
  if (!link || !link.startsWith('claude://')) return
  try {
    await $.process.run(['rundll32', 'url.dll,FileProtocolHandler', link], { timeoutMs: 10000 })
  } catch (err) {
    $.ui.toast(`Konnte die Sitzung nicht öffnen: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Holt die Liste und schreibt sie. Bei einem Fehler bleibt die alte Liste stehen;
// `leise` blendet den Fehler aus (Start, solange die App-Schnittstelle noch verbindet).
async function aktualisieren($: EngineInterface, leise: boolean): Promise<boolean> {
  const neu = await holen($)
  if (neu.fehler === '') {
    await $.state.set(daten, neu)
    return true
  }
  const { value: alt = LEER } = await $.state.get(daten)
  await $.state.set(daten, {
    rows: alt.rows,
    fehler: leise ? alt.fehler : neu.fehler,
    stand: alt.rows.length > 0 ? alt.stand : neu.stand,
    farben: alt.farben,
  })
  return false
}

// Beim Start ist die App-Schnittstelle oft noch nicht verbunden: mehrmals neu versuchen.
const WARTEZEITEN = [1000, 2000, 3000, 5000, 8000, 12000]
function startVersuch($: EngineInterface, nr: number): void {
  const letzter = nr >= WARTEZEITEN.length
  void aktualisieren($, !letzter).then(ok => {
    if (ok || letzter) return
    $.clock.after(WARTEZEITEN[nr] ?? 5000, () => startVersuch($, nr + 1))
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sitzungen', description: 'Panel mit den letzten Sitzungen öffnen' })
    void $.ui.open({ id: PANE, title: 'Letzte Sitzungen' })
    startVersuch($, 0)
    $.clock.every(30000, () => void aktualisieren($, false))
    return next(e)
  })

  on('command.run', { command: 'sitzungen' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Letzte Sitzungen' })
    await aktualisieren($, false)
    return { text: 'Panel „Letzte Sitzungen“ geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { value: d = LEER } = await $.state.get(daten)

    return (
      <Box flexDirection="column" gap={1}>
        {d.fehler !== '' && <Text color="red">Abruf fehlgeschlagen: {d.fehler}</Text>}
        {d.rows.length === 0 && d.fehler === '' && <Text dimColor>Verbinde mit der App …</Text>}
        {d.rows.map(s => {
          const farbe = farbeFuer(d.farben ?? {}, s.project)
          const zeit = zeitStil(s.lastActivityAt, d.stand)
          return (
            <Box
              key={`karte-${s.id}`}
              flexDirection="column"
              width="100%"
              paddingX={1}
              paddingY={1}
              backgroundColor={farbe}
              hover={{ backgroundColor: aufhellen(farbe, 0.15) }}
            >
              <Button key={`oeffnen-${s.id}`} plain onPress={() => void oeffnen($, s.link)}>
                {`${s.title}  ↗`}
              </Button>
              <Box flexDirection="column" paddingLeft={2}>
              <Text wrap="truncate-end">
                <Text bold>{s.project || 'ohne Projekt'}</Text>
                <Text dimColor>{' · '}</Text>
                <Text bold={zeit.bold} dimColor={zeit.dim}>
                  {vor(s.lastActivityAt, d.stand)}
                </Text>
                {s.isRunning && (
                  <Text color={GRUEN_LAEUFT} bold>
                    {'  ● läuft'}
                  </Text>
                )}
                {!s.isRunning && s.zuletzt === 'frage' && (
                  <Text color={GELB_WARTET} bold>
                    {'  ? wartet auf dich'}
                  </Text>
                )}
              </Text>
              {s.vorschau && (
                <Text italic>
                  {s.zuletzt === 'du' ? 'Du: ' : ''}
                  {s.vorschau}
                </Text>
              )}
              </Box>
            </Box>
          )
        })}
        <Button
          key="neu-laden"
          onPress={async () => {
            await aktualisieren($, false)
          }}
        >
          Aktualisieren
        </Button>
      </Box>
    )
  })
}
