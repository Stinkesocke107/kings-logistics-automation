# Kings Event Leadership – privater GitHub-State (Datenschutz)

**Sicherheitsänderung (21.11.2026) · zu Audit #73**

## Befund
Das bisherige `data/event-leadership-report-state.json` ist in einem **öffentlichen Repository** gespeichert und enthält Staff-Erwähnungen im Klartext. Beim read-only Audit waren es **114 Vorkommen** im Feld `responsibleStaff` (Mehrfachzählung derselben Personen möglich), verteilt über letzte Snapshots und ChangeLogs. Auch interne Thread-IDs/Event-Zuordnungen sind darin gespeichert.

## Fix im Code
`event-leadership-state.js` verschlüsselt nach AES-256-GCM mit zufälligem Nonce und abgetrenntem Schlüsselkontext `kings-event-leadership-private-state-v1`. Der bestehende Workflow verwendet das bereits für Kings vorhandene `DRIVER_STATE_KEY`-Secret **nur** im Event-Report-Schritt als `EVENT_LEADERSHIP_STATE_KEY`. Der Secret-Wert darf nie in Logs, Git oder Discord auftauchen. Fehlender oder unpassender Schlüssel führt zu einem klaren Abbruch **vor** Discord-Publishing.

Der erste berechtigte **nicht-Preview**-Lauf liest den alten State im Speicher und schreibt nach erfolgreichem Publish eine verschlüsselte Form. Keine neuen Kanäle, keine Rollenänderung, kein automatischer historischer Datenersatz. Die bestehende ChangeLog-/Snapshot-Funktion soll erhalten bleiben.

## Kontrollierte Inbetriebnahme
1. CI und isolierte Tests prüfen; danach Review durch Kings-Owner.
2. Sicherstellen, dass das Secret in `main` weiterhin korrekt vorhanden ist, bevor die Änderung produktiv wird.
3. Bei geeigneter Betriebsfreigabe **genau einen** Event Leadership Publish ausführen und in Git/Actions nur aggregiert prüfen, dass `data/event-leadership-report-state.json` nun `encrypted: true` besitzt und keine `responsibleStaff`-/`changeLog`-Klartextfelder mehr enthält. Nur bekannte eigene Discord-Nachrichten bearbeiten.
4. Vorherige Workflow-Läufe, alte Git-Commit-Versionen, Artefakte und Forks weiterhin als potentiell exponiert behandeln. **Ein regulärer Commit oder verschlüsselter aktueller State bereinigt keine Historie.** Für eine History-Bereinigung getrennten Backup-/Recovery-/Owner-Freigabeplan festlegen.
5. Ebenso das separat gefundene unverschlüsselte Legacy-Convoy-Archiv prüfen: Issue #100.

**Grenzen:** Die Änderung ist bewusst auf Event Leadership State beschränkt; keine Änderungen an Driver-/Staff-/HR-Rollen, originalen Kings-Beitrittsdaten, Tracker-Onlinezahlen oder Event-Freigaben. Der konkrete Produktivlauf wird nicht durch diesen Pull Request ausgelöst.
