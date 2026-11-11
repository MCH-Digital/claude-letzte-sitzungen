# Letzte Sitzungen

Eine Mod für die Claude-Desktop-App (Code-Tab). Neben dem Chat öffnet sich ein Panel mit den sechs zuletzt aktiven Sitzungen. Wer an mehreren Projekten gleichzeitig arbeitet, findet so die Sitzung mit dem letzten Ergebnis, ohne in der Seitenleiste zu suchen.

Jede Sitzung erscheint als farbige Karte mit:

- Titel (Klick öffnet die Sitzung)
- Projektordner und „vor X Min.“
- „● läuft“, solange Claude dort arbeitet
- „? wartet auf dich“, wenn Claude am Ende eine Frage gestellt hat
- Anfang der letzten Nachricht als Vorschau

Jedes Projekt bekommt beim ersten Auftauchen eine eigene Farbe und behält sie. Die Zuordnung wird pro Nutzer gespeichert. Die Liste aktualisiert sich alle 30 Sekunden. Mit `/sitzungen` geht das Panel wieder auf, wenn es geschlossen wurde.

Das Öffnen per Klick funktioniert unter Windows.

## Installieren

In der Desktop-App: neben dem Eingabefeld auf **+** klicken, dann **Plugins**, **Add marketplace** mit `MCH-Digital/claude-letzte-sitzungen`, dann **Add plugin**.

Im Terminal, in einer Claude-Code-Sitzung:

```
/plugin install letzte-sitzungen --marketplace MCH-Digital/claude-letzte-sitzungen
```

Die Frage `Add marketplace?` mit `y` bestätigen und den Bereich „user“ wählen.

Oder aus einer Shell:

```
claude plugin install letzte-sitzungen --marketplace MCH-Digital/claude-letzte-sitzungen
```

Danach geht das Panel in jeder neu gestarteten Sitzung auf.
