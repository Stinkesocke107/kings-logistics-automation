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

## 8. Einmalige State-Migration ohne Discord-Veröffentlichung
Das bestehende Event Leadership `verify`-Job wird auf einem **Code-Push nach main** nun einmalig und idempotent um einen reinen State-Migrationsschritt erweitert (`scripts/migrate-event-leadership-state.js`). Der Schritt verwendet das bestehende private Secret, authentifiziert bestehende verschlüsselte Container und konvertiert nur bei erkennbarem, vollständig geprüftem alten Klartextzustand.

Die Ausführung benutzt weder Discord-Bot-Token noch Discord-Netzwerkaufrufe. Nach erfolgreicher Konvertierung commitet sie ausschließlich `data/event-leadership-report-state.json` mittels des vorhandenen Safe-Push-Skripts; bei konkurrierender Änderung/fehlendem Key wird **abgebrochen**, statt fremde Inhalte zu überschreiben. Ein erneuter Code-Push ist dann no-op.

**Nach der ersten produktiven Ausführung kontrollieren:** `encrypted === true` in `main`, nur `version`, `encrypted`, `algorithm`, `iv`, `authTag`, `ciphertext` als Containerfelder; keine Klartext-Personenlisten. Alte Commit-Historie bleibt davon unberührt.
