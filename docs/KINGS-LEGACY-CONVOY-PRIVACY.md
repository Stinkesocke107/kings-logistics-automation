# Kings Legacy Convoy Archive – private Quelle und datensparsame öffentliche Ansicht

**Stand 21.11.2026, Datenschutz-Audit #73 / Issue #100**

## Ausgangslage
Das öffentliche `data/legacy-convoys.json` enthält den alten Kings Convoy Kalender. Der alte Import speicherte vollständige Discord-Notizen, Slot-Belegtexte und Bildbegleittexte aus internen Diskussionen in GitHub. Read-only Befund: 115 Legacy-Events, 207 Notiztexte, 122 Slot-Belegtexte und 109 Bildbegleittexte; 91 Vorkommensfelder mit User-Mentions. Ein Vorkommen bedeutet **nicht** eine individuelle Person.

## Umstellung
- `legacy-convoy-privacy.js` erhält Originaldaten **vollständig und nachvollziehbar** in der AES-256-GCM-verschlüsselten Datei `data/legacy-convoys-private.json`; eigener Key-Kontext, Schlüssel kommt ausschließlich aus dem bestehenden GitHub Secret `DRIVER_STATE_KEY` unter dem Alias `LEGACY_PRIVATE_STATE_KEY`.
- Das öffentlich gelesene `data/legacy-convoys.json` bleibt eine *abgeleitete Ansicht*: `sourceNotes`, `sourceMessageIds` und `slotEvidence` sind leer, Bildbegleittexte werden entfernt, für Slot-Status wird nur eine feste Statusbeschreibung gespeichert.
- Die Event-Struktur, validierten Zeiten, Termine, Event-IDs, bestätigten Slot-Statuswerte und Bildverknüpfungen für vorhandene Reminders bleiben derzeit vorhanden.
- Der Code-Push führt im bestehenden Legacy-Importer-Workflow einen **einmaligen, rein lokalen** Migrationsjob aus, ohne Discord-Abfragen, Discord-Nachrichten oder Rollenänderungen. Er commitet den entschlüsselten öffentlichen Snapshot und das verschlüsselte Archiv **nur gemeinsam**. Fehlender Key oder ungültige Daten => Abbruch vor Commit.
- Künftige manuelle Legacy-Imports lesen den verschlüsselten Originalbestand, erhalten die verifizierten Informationen und schreiben ausschließlich den abgeleiteten öffentlichen Snapshot. Raw Texte werden nicht erneut in die öffentliche Datei geschrieben.
- Safe Push verweigert nach angelegtem Private-Archiv jede erneute Veröffentlichung von frei lesbaren Originalnotizen.

## Funktionale Grenzen
Der bestehende `convoy-driver-reminders.js` benötigt aktuell `kingsSlot`, `kingsSlotImage` und dessen URL. Deshalb enthalten die öffentlichen Daten **vorerst weiterhin Bild- und Discord-Nachrichtenlinks**; diese können je nach Zugriff/Richtlinien selbst vertraulich sein. Eine zweite Phase muss diese Links geschützt halten, die Reminder-/Overview-Consumer auf berechtigte private Quelle umstellen und erst danach die Links aus der öffentlichen Ansicht entfernen. Solange das nicht geschehen ist, Issue #100 **nicht als vollständig abgeschlossen** markieren.

## Migration prüfen
1. Auf PR-CI vollständig testen: verschlüsselte Wiederherstellung, kein Raw-Text im Public-Projektionsobjekt, keine Änderung an Convoy-/Zeit-/Slot-/Bild-Verfügbarkeit und korrekte Safe-Push-Fail-Closed-Regel.
2. Erst nach Tests und Freigabe mergen; dann auf `main` den dedizierten **privacy-migration**-Job überprüfen.
3. In GitHub main prüfen: `data/legacy-convoys-private.json` hat `encrypted:true` und nur kryptografische Containerfelder, aktuelles `data/legacy-convoys.json` enthält keine Notiz-/Beleg-/Bildbegleittexte und behält alle Event-Zähler.
4. Alte Git-Commits/PR-Diffs, Actions-Logs, Forks und Kopien bleiben historisch exponiert. **Keine History-Rewrite, Key-Rotation oder weitreichende Löschung** ohne gesonderte Owner-Freigabe, Backup und Recovery-Plan.
