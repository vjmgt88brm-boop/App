# Trainingslog

Eine einfache Web-App (PWA) zum Tracken von Kraftübungen mit Gewicht und Wiederholungen – inkl. Fortschrittsdiagramm.

## Funktionen
- **Training**: Übung wählen, Gewicht & Wiederholungen eingeben (mit +/- Tasten), Satz speichern. Werte vom letzten Satz werden vorausgefüllt, das letzte Training der Übung wird angezeigt. Neue Bestleistungen werden gemeldet.
- **Verlauf**: Alle Trainingstage mit Übungen und Sätzen; vergangene Tage lassen sich bearbeiten.
- **Fortschritt**: Liniendiagramm pro Übung über die Zeit – Max. Gewicht, geschätztes 1RM (Epley), Volumen oder Max. Wiederholungen; Zeitraum 4 Wochen bis alles. Kennzahlen: Bestwert, Entwicklung in %, Anzahl Einheiten. Tabellenansicht.
- **Übungen**: Übungen anlegen, umbenennen, löschen. Export/Import der Daten als JSON.
- Dark Mode, offline-fähig, auf dem Handy zum Startbildschirm hinzufügbar.

Die Daten werden lokal im Browser (localStorage) gespeichert – regelmäßig exportieren!

## Starten
Keine Abhängigkeiten, kein Build. Lokal z. B.:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Zum Nutzen auf dem Handy: Repository über **GitHub Pages** veröffentlichen (Settings → Pages → Branch wählen), Seite im Handy-Browser öffnen und „Zum Home-Bildschirm“ wählen.
