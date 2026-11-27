# Kings Logistics — Backup & Recovery: Operator-Handover und offene Abnahmen

**Stand:** 28. November 2026 (MEZ; 27. November 2026 UTC) · **Repository:** `Stinkesocke107/kings-logistics-automation` · **Produktionsbranch:** `main`

> **Status: CODE-HARDENING + ISOLIERTER E2E NACHGEWIESEN, NICHT FINAL ABGENOMMEN.**
> Dieses Dokument begründet **keine** Freigabe eines produktiven Restore, keine
> Freigabe von Secrets, kein Core-Freeze und keine CEO-Abnahme. Die 46 separaten
> Workflow-Abnahmekriterien bleiben im [Master-Issue #213](https://github.com/Stinkesocke107/kings-logistics-automation/issues/213) offen, solange authentische Prüfungen fehlen.

## Betroffene Systeme (keine neuen Workflows)

| Workflow | Technische Umsetzung / Nachweis | Noch offene Betriebsabnahme |
| --- | --- | --- |
| **#08 Core Backup** — `core-backup.yml` | [PR #267](https://github.com/Stinkesocke107/kings-logistics-automation/pull/267): sicherer Pfad der Quelle unmittelbar vor Kopie, Manifest auf doppelte/unsichere Pfade geprüft, Dateigröße + SHA-256 des Stagings, isolierte Tests | Echtes regelmäßiges Artefakt und Retention im produktiven GitHub-Betrieb, Zugriff, Fehlalarme und Operator-Übergabe nachweisen |
| **#03 Backup/Restore Verification** — `backup-recovery-verification.yml` | [PR #268](https://github.com/Stinkesocke107/kings-logistics-automation/pull/268): Symlink-Root-Schutz, vollständiger Quell-Preflight vor Sandbox-Änderung. [Produktionsbranch-Verifikationslauf #46082533605](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/46082533605) am 27.11.2026 **SUCCESS**: aktueller Backup-Build, vollständiger isolierter Restore, Manifest/SHA-256 und Sandbox-Entfernung nachgewiesen | Wiederholbarkeit an weiteren echten Sicherungstagen, Abgleich echter Original-Artefakte, Operator- und CEO-Abnahme |
| **#11 Core Recovery** — `core-recovery.yml` | [PR #269](https://github.com/Stinkesocke107/kings-logistics-automation/pull/269): ein eindeutiges nicht abgelaufenes Restore-Point-Artefakt aus einem erfolgreichen manuellen GitHub-`main`-Backup, Run-ID/Nummer/Repository/Branch-Übereinstimmung, finales gesundes Backup für `APPLY`; isolierte CLI-Tests | Reale autorisierte `preview` eines Original-Restore-Points, unabhängige Restore-/Secret-/Betriebsfreigabe und CEO-Schlussabnahme |

**Offline Regression:** PR #267 (GitHub Actions #46082392512), PR #268 (#46082206141), PR #269 (#46082354209) — **SUCCESS**. Ein erfolgreicher synthetischer Test ist nicht dasselbe wie ein produktiver Restore.

## Wiederanlauf und Wiederherstellungsregeln für Operatoren

### 1. Laufende Sicherungen prüfen — #08

- Der bestehende `core-backup.yml` ist auf eine normale tägliche Sicherung um **03:06 UTC** konfiguriert. Die normale GitHub-Artifact-Aufbewahrung ist im Workflow mit **30 Tagen** hinterlegt.
- Pro echtem Lauf prüfen: `success`, ein herunterladbares `kings-automation-backup-<run-number>`-Artefakt, vollständiges `backup-manifest.json`, `backup-health.json` und `backup-final-health.json`, gültige AES-verschlüsselte sensitive Zustände sowie SHA-256-/Abdeckungskennzahlen.
- GitHub-Artifact-Retention ist eine konfigurierbare Aufbewahrungsfrist, **kein automatisch nachgewiesener 30-Tage-Verlauf**. An mehreren Tagen Originalartefakte kontrollieren; fehlende oder abgelaufene Dateien ausdrücklich dokumentieren.
- Bei fehlendem, fehlerhaftem oder unvollständigem Backup den Fall in **System Monitoring / #system-alerts** eskalieren. Eine erfolgreiche GitHub-Action ohne Artefaktprüfung ersetzt die Sicherung nicht.

### 2. Isolierte Wiederherstellung — #03

- Der bestehende `backup-recovery-verification.yml` baut aus dem aktuellen GitHub-Stand eine Sicherung und prüft deren Restore **nur** in `restore-verification/`. Er verändert keine produktiven Datensätze.
- Zu dokumentieren sind: Run-ID, Commit SHA, Anzahl Manifestdateien, tatsächlich restaurierte Dateien, geprüfte SHA-256-Hashes, JSON-Parsing, **0 Abdeckungs-/Integritätsfehler**, bestätigtes Entfernen der Sandbox.
- Ungültige Manifestpfade, doppelte Pfade, Symlinks (einschließlich Hauptverzeichnis), falsche Hashes oder inkonsistente Größen müssen die Prüfung sichtbar **UNHEALTHY** machen.

### 3. Original-Restore-Point zuerst nur als PREVIEW — #11

- Ein geeigneter Restore Point wird **manuell** durch `core-backup.yml` (`backup_type: restore-point`) erstellt. Der Workflow konfiguriert **90 Tage** Artifact-Retention für Restore Points.
- `core-recovery.yml` erhält die **Original-Backup-Run-Nummer** und wird zunächst ausschließlich mit `recovery_mode: preview` aufgerufen.
- Der Sicherheitscheck muss sicherstellen: erfolgreich beendeter manueller `main`-Backup-Run, genau ein passendes nicht abgelaufenes Restore-Point-Artefakt, korrekte Run-ID/Nummer, Repository und Branch, vollständiges Manifest, verschlüsselte Zustände und SHA-256.
- Preview muss einen Plan/Audit erzeugen, **ohne** Repository- oder Discord-Schreibaktionen. Den Plan unabhängig durch eine autorisierte Person prüfen.

### 4. Produktiven APPLY nur im bestätigten Notfall

- **Kein automatischer APPLY** über Scheduler, Self-Healing oder Fehlerverifikation.
- Erforderlich sind eine dokumentierte Berechtigung/CEO-Freigabe, ein autorisierter Operator, unveränderte `main`-Basis, gültiges finalisiertes Restore Point Artifact und die geschützte Environment `kings-production-recovery` mit ihrer expliziten Freigabe.
- Der Workflow prüft zusätzlich die Environment-Variable `KINGS_RECOVERY_ENVIRONMENT_ARMED=ENABLED` sowie die exakte manuelle Bestätigung `RESTORE_KINGS`. Diese Guards dürfen nicht für Tests deaktiviert oder umgangen werden.
- Vor produktiven Änderungen ist ein geprüftes **Emergency Pre-Recovery Backup** samt hochgeladenem Artifact erforderlich. Der Workflow stoppt, falls `main` während der Vorbereitung oder vor dem Commit wechselt; **kein Force-Push**.
- Backups enthalten absichtlich **keine GitHub- oder Discord-Secrets/Private Keys**. Eine produktive Notfallfähigkeit erfordert separat gesicherte, autorisiert abrufbare Zugangsdaten, ihre sichere Neueinrichtung und Berechtigungsprüfung, ohne Inhalte in öffentliche Logs oder Artefakte zu schreiben.

### 5. Betrieb nach möglicher autorisierter Wiederherstellung

- Repository-/Manifest- und Datenintegrität, verschlüsselte Zustandsformate, Workflow-Ausführung, Monitoring, Discord-Zustellung und sichere Retry-Funktion kontrollieren.
- Die externen Map-API- und Statistics-Freshness-Blocker dürfen dadurch **nicht** als geheilt oder vollständig live erklärt werden.
- Rückfall-/Abbruchweg, Notfallkontakte, Verantwortliche, Auditlinks, Start-/Endzustand und ausdrückliche CEO-Schlussabnahme unabhängig protokollieren.
- Keine echten Staff/HR-/Driver-Entscheidungen, Rollenmutationen oder Eventfreigaben zu Testzwecken auslösen.

## Ausstehende Freigaben

- [ ] #08 Original-Backup-Läufe, Aufbewahrung und Alarmierungsreaktion über mehrere Zeitpunkte geprüft
- [ ] #03 Wiederholte isolierte Restore-Prüfung mit vollständig dokumentierter Original-Artifact-Beweiskette
- [ ] #11 Autorisierter echter Restore-Point-PREVIEW samt unabhängigem Review, Rechte-/Environment-Test und Betriebsübergabe
- [ ] Notfall-Secret-Verwahrung und kontrollierte Wiederinbetriebnahme nachweisbar
- [ ] Verantwortliche Operatoren bestätigen die Bedienbarkeit und Recovery-Prozedur
- [ ] Ausdrückliche finale CEO-Freigabe mit verlinkten Nachweisen

**Bis dahin:** technische Teilnachweise = vorhanden; vollständige Produktivabnahme = **OFFEN**.
