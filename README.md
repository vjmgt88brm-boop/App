# Trainingslog

Web-App (PWA) zum Tracken von **Krafttraining** (Gewicht × Wiederholungen) und **Läufen** (Distanz, Zeit, Pace) – mit Übersicht, Trainingskalender, Diagrammen und Bestleistungen. Keine Abhängigkeiten, kein Build, funktioniert offline.

## Bereiche
- **Übersicht** – Wochenbilanz mit Trainingstagen, bewegtem Gewicht und Laufkilometern, Wochenleiste (Mo–So), Serie aktiver Wochen, Trainingskalender der letzten Monate, Entwicklung der letzten 8 Wochen und neue Bestleistungen.
- **Kraft** – Übung per Chip wählen, Gewicht & Wiederholungen mit +/- eingeben, Satz speichern. Letzte Werte werden vorausgefüllt, das letzte Training wird angezeigt, Rekorde werden gefeiert. Liste aller Übungen mit Mini-Verlauf.
- **Übungsdetail** – Diagramm für Max. Gewicht, geschätztes 1RM, Volumen oder Wiederholungen, Zeitraum 1 Monat bis alles, Bestwert, Entwicklung in %, alle Einheiten.
- **Laufen** – Distanz und Zeit eingeben, Pace (min/km) und km/h werden live berechnet. Diagramm für Pace, Distanz oder Tempo, Kilometer pro Woche, Liste aller Läufe.
- **Verlauf** – alle Trainingstage nach Monaten, filterbar nach Kraft/Laufen.
- **Einstellungen** – Hell/Dunkel/Automatisch, Übungen verwalten, Export/Import als JSON.

Farben: **Kraft = Blau**, **Laufen = Orange** – überall gleich.

Die Daten werden lokal im Browser gespeichert (localStorage) – regelmäßig exportieren!

## Starten
```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Veröffentlicht über GitHub Pages: im Handy-Browser öffnen und „Zum Home-Bildschirm“ wählen.
