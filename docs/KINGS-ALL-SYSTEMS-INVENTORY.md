# Kings Logistics — Vollständiges Systemverzeichnis (43 Workflows)

Stand: 20. Oktober 2026. Dieses Dokument deckt **jede derzeit im Kings-GitHub-Repository vorhandene GitHub-Actions-YAML-Datei** ab. Die eigentlichen Skripte und Discord-Ausgaben hängen jeweils an diesen Workflows; ein Workflow kann mehrere zusammengehörige Schritte ausführen.

## Grundregeln

- **43 erfasst**, davon **32 automatisch eingeplant** und **11 ohne eigenen Dauer-Zeitplan** (manuell/bei Änderungen). Kein derzeitiger Workflow bleibt außerhalb des Verzeichnisses.
- Einziger gemeinsamer **technischer Wiederanlauf-Takt: etwa alle 5 Minuten**, zusätzlich durch vorhandene `workflow_run`-Signale. Der Scheduler startet nur überfällige, ausdrücklich freigegebene Produzenten. Er führt keine 43 Systeme blind alle fünf Minuten aus.
- **Live Tracker → Statistics → Central Overview** arbeiten innerhalb **einer** Pipeline mit demselben nachgewiesenen Snapshot-Zeitstempel. Convoy Center arbeitet innerhalb seiner eigenen Pipeline. News, Convoys, Fahrerrollen und Berichte haben unabhängige Ausgangsdaten und können nicht sinnvoll als ein einziger Live-Datenbankstand gelten.
- Für **jede automatisch geplante** Pipeline prüft `system-monitoring.js` auf reale Produktionsläufe und auf das letzte erfolgreiche Ergebnis. Die dort hinterlegte **Frischefrist ist ein Alarmgrenzwert**, nicht die beabsichtigte Ausführungsfrequenz. Häufigkeiten stehen direkt im jeweiligen Workflow-`schedule`.
- Bei `on-change` und `manual` wird überprüft, dass die Werkzeuge vorhanden und klassifiziert sind. Ein nicht gestarteter manueller Restore darf nicht allein wegen Inaktivität rot werden.
- Ein fehlgeschlagener reiner `push`-Test ist ein CI-Problem, nicht automatisch ein Ausfall des Live-Feeds. Der jeweils separate CI-Lauf bleibt einsehbar. Ein fehlgeschlagener produktiver Lauf zählt weiterhin.
- Warnungen erscheinen im Discord-Monitor und im technischen Bericht. **DEGRADED** ist kein grüner, vollständig störungsfreier Zustand; eine Warnung soll aber nicht durch einen künstlich fehlgeschlagenen Monitoring-Workflow einen weiteren Ausfall auslösen.
- Für kritische Ausfälle gilt weiterhin fail-closed: **UNHEALTHY** und kritische Issues blockieren die technische Abnahme.

## Alle Bereiche und alle Workflows

### Automation

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `central-scheduler.yml` | Automatisch | 20 Min. (kritisch) |
| `self-healing.yml` | Automatisch | 90 Min. (Warnung) |
| `system-monitoring.yml` | Automatisch | 120 Min. (Warnung) |

### Backup

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `backup-recovery-verification.yml` | Bei Codeänderungen | Keine zeitgesteuerte Frist |
| `core-backup.yml` | Automatisch | 2160 Min. (kritisch) |
| `core-recovery.yml` | Nur manuell | Keine zeitgesteuerte Frist |

### Changelog

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `add-changelog-entry.yml` | Nur manuell | Keine zeitgesteuerte Frist |

### Convoys

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `convoy-announcement-verifier.yml` | Automatisch | 180 Min. (Warnung) |
| `convoy-checker.yml` | Automatisch | 45 Min. (kritisch) |
| `legacy-convoy-import.yml` | Nur manuell | Keine zeitgesteuerte Frist |

### Drivers

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `driver-achievements.yml` | Automatisch | 2160 Min. (Warnung) |
| `driver-management.yml` | Automatisch | 150 Min. (kritisch) |
| `driver-updates.yml` | Automatisch | 30 Min. (kritisch) |
| `milestones.yml` | Automatisch | 30 Min. (Warnung) |
| `probation.yml` | Automatisch | 180 Min. (Warnung) |

### HR & Staff

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `hr-leadership.yml` | Automatisch | 45 Min. (kritisch) |
| `staff-leadership-live-overview.yml` | Automatisch | 90 Min. (Warnung) |
| `staff-management.yml` | Automatisch | 150 Min. (kritisch) |

### Leadership

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `leadership-dashboard.yml` | Automatisch | 780 Min. (Warnung) |

### Live Data

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `live-tracker.yml` | Automatisch | 30 Min. (kritisch) |

### News

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `changelog.yml` | Automatisch | 75 Min. (Warnung) |
| `news-production-verification.yml` | Automatisch | 180 Min. (Warnung) |
| `news.yml` | Automatisch | 35 Min. (Warnung) |
| `social-news.yml` | Automatisch | 90 Min. (Warnung) |

### Reports

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `driver-leadership-reports.yml` | Automatisch | 2400 Min. (Warnung) |
| `driver-weekly-summary.yml` | Automatisch | 12000 Min. (Warnung) |
| `event-leadership-reports.yml` | Automatisch | 2400 Min. (Warnung) |
| `hr-leadership-reports.yml` | Automatisch | 2400 Min. (Warnung) |
| `hr-weekly-summary.yml` | Automatisch | 12000 Min. (Warnung) |
| `management-monthly-report.yml` | Automatisch | 55000 Min. (Warnung) |
| `management-weekly-overview.yml` | Automatisch | 12000 Min. (Warnung) |
| `monthly-report.yml` | Automatisch | 50400 Min. (Warnung) |
| `staff-leadership-reports.yml` | Automatisch | 2400 Min. (Warnung) |

### Security

| Workflow | Betrieb | Frischeprüfung |
|---|---|---|
| `api-resilience-verification.yml` | Bei Codeänderungen | Keine zeitgesteuerte Frist |
| `core-baseline-verification.yml` | Bei Codeänderungen | Keine zeitgesteuerte Frist |
| `core-e2e-verification.yml` | Bei Codeänderungen | Keine zeitgesteuerte Frist |
| `final-freeze-verification.yml` | Automatisch | 540 Min. (Warnung) |
| `git-state-hardening-verification.yml` | Bei Codeänderungen | Keine zeitgesteuerte Frist |
| `leadership-dashboard-verification.yml` | Bei Codeänderungen | Keine zeitgesteuerte Frist |
| `monthly-report-verification.yml` | Automatisch | 55000 Min. (Warnung) |
| `self-healing-stress-verification.yml` | Bei Codeänderungen | Keine zeitgesteuerte Frist |
| `system-tests.yml` | Bei Codeänderungen | Keine zeitgesteuerte Frist |
| `weekly-reports-verification.yml` | Automatisch | 12000 Min. (Warnung) |


## Zuständigkeitsgrenzen außerhalb von GitHub

| Plattform/Dienst | Aktueller Automationsstatus | Kontrolle |
|---|---|---|
| TikTok `@kings__logistics` | PostPing (externer Discord-Bot) | Erfolgreiche Discord-Nachricht nach **neuem** Video überprüfen; GitHub kann den PostPing-Dienst nicht einsehen |
| Instagram `@kings___logistics` | PostPing (externer Discord-Bot) | Erfolgreiche Discord-Nachricht nach **neuem** Reel überprüfen; GitHub kann den Dienst nicht einsehen |
| Kings Discord Ticket/Support Center (Galaxy) | Extern konfigurierter Bot | Pre-Ticket-Formulare, Öffnungsnachricht, Ticket-Rechte und reale Erstellung direkt in Discord testen |
| TruckersMP | Datenquelle und Event-Plattform | GitHub zeigt nur API- und Synchronisationsnachweise; Verfügbarkeit liegt bei TruckersMP |
| Kings Logistics Website / Driver Hub | Eigenständiges Web-Projekt | Nur mit Repository/Hosting/Produktionszugang direkt verifizierbar |
| Öffentlicher Kings Hub und RealmMP | Weitere Projekte/Roadmap | Keine laufenden GitHub-Automationen dieses Repositories unterstellen |

## Prüfergebnis und reale Grenzen

- Das Dateiverzeichnis wird durch `tests/all-kings-workflows.test.cjs` mit den tatsächlichen YAML-Dateien abgeglichen; eine neue/gelöschte YAML ohne Registereintrag lässt die Tests fehlschlagen.
- Der Discord-Kanal `system-monitor` zeigt jetzt nicht nur eine einzelne veraltete „Leadership Overviews“-Datei, sondern aggregiert die **wirklich überwachten Workflow-Bereiche** mit gesunden/gesamten Werten.
- Insbesondere nach verspäteten GitHub-Cron-Läufen können echte Warnungen für Probation, Staff Leadership, Self-Healing oder andere Systeme erscheinen; das ist ein Signal für ein Produktionsproblem, nicht etwas, das wir aus den Prüfungen entfernen sollten.
- Nicht alle 43 Workflows wurden im Rahmen dieser Änderung manuell ausgelöst: Manuelle Restore- oder Import-Werkzeuge sollen **niemals** nur zu Testzwecken echte Daten/Discord-Rechte verändern.
- Ein erfolgreicher Offline-Test beweist Quellcode-/Konfigurationskonsistenz, nicht 24/7 Betriebszuverlässigkeit. Für eine Produktionsfreigabe echte Ausführung, Datenfrische und Discord-Zustellung über mindestens einen sinnvollen Zeitraum beobachten (für wöchentliche/monatliche Berichte über den entsprechenden Zeitraum).
