# Kings Logistics — GitHub-Core-Inventur (Punkt 01)

**Prüfstand:** 27. Oktober 2026 · **Referenz-Commit:** `99ce00d7b9c64ac1f62fdf7b4ceea52c00dffc07` · **Repository:** `Stinkesocke107/kings-logistics-automation` · **Produktion:** `main`

> **Status:** Inventur und Dokumentation. Kein Produktionsworkflow, kein Secret, keine Discord-Nachricht, keine verschlüsselte Mitgliedsdatei und keine Rollenberechtigung wird durch dieses Dokument verändert. Dieser Bericht ist eine technische Bestandsaufnahme, keine Freigabe von Punkt 02/03 und kein 24/7-Betriebsnachweis.

## 1. Inventur und Geltungsbereich

- **243 versionierte Dateien:** 43 YAML-Workflows, 88 Root-JavaScript-Dateien, 72 `data/`-Dateien einschließlich API-Health, 25 Dateien unter `tests/` (24 `*.test.cjs` plus `sandbox.cjs`), 12 Markdown-Dokumente sowie unterstützende Skripte und Git-Konfiguration.
- **43 registrierte Workflows:** 32 mit Cron-Zeitplan und 11 ohne eigenen Cron-Zeitplan; ein manueller Trigger ist kein Produktionsintervall.
- Bestehende Produktion läuft primär über GitHub Actions/Node.js; APIs (TruckersMP, TruckersMP Map/ETS2Map, Discord, GitHub, YouTube) haben unterschiedliche Datenhoheit und Verfügbarkeit.
- **Zielplattformen der kommenden Phase:** TruckersMP, HaulMP und TrucklineMP. Es wurde in den überprüften 88 Root-JavaScript-Dateien keine fertige gemeinsame Platform Registry, kein allgemeines Adapter Framework und keine nachgewiesene HaulMP-/TrucklineMP-Datenintegration festgestellt. API-Capabilities der beiden neuen Plattformen sind **erst Punkt 03**, nicht Teil dieser Bestandsaufnahme.
- Quelle: Dateien und Workflow-Definitionen des obigen Referenz-Commits, vorhandene Systemdokumentation sowie eine beschränkte Stichprobe jüngster GitHub Actions Runs.

## 2. Architektur / Datenfluss (aktuell)

```text
TruckersMP VTC Members / Events / News     TMP Map/ETS2Map      Discord-Rollen/Mitglieder
        |                                        |                    |
        +-- Driver Management, Staff, HR        +-- Tracker          +-- Driver Updates, Staff Updates
        |                                           |                     |
        +-- Convoy Center / Announcement        Tracker Snapshot          verschlüsselte States
        |                                           |                     |
        +-- Milestones                        Statistics / Overview  HR / LOA / Achievements
                                                    |                     |
                                              Discord Publishers    Leadership / Reports
                                                      \                /
                                                    System Monitoring
                                                        |
                                        Security / Backup / Scheduler / Safe Self-Healing
```

**Kernregeln:** Keine Plattformdaten künstlich vermischen; Quellenzeitstempel erhalten; getrennte Failure-Domains; nur bestätigte Daten publizieren; nicht erfolgreiche Veröffentlichungen nicht als geliefert markieren; verschlüsselte Personaldaten nicht unkontrolliert überschreiben.

## 3. Vollständiger Workflow-Katalog (43/43)

Die Ausführungsintervalle sind **UTC-Cron-Zielwerte**, keine garantierten Uhrzeiten. Bei mehreren Jobs pro Workflow können Teilprozesse seltener laufen. Angegebene Skripte sind die Hauptkomponenten, nicht zwingend jede transitive `require(...)`-Abhängigkeit.

| Workflow | Bereich | Trigger (Zielwerte) | Skripte | Zweck / Output |
|---|---|---|---|---|
| [`add-changelog-entry.yml`](../.github/workflows/add-changelog-entry.yml) | Editorial / Changelog | manuell | add-changelog-entry.js | Changelog Queue (kontrollierte redaktionelle Eingabe) |
| [`api-resilience-verification.yml`](../.github/workflows/api-resilience-verification.yml) | Quality / API | push + manuell | api-resilience-verifier.js | API-Ausfallmatrix und API-Health |
| [`backup-recovery-verification.yml`](../.github/workflows/backup-recovery-verification.yml) | Backup / Tests | push + manuell | core-backup.js; backup-final-check.js; backup-restore-verify.js | isolierte Sicherungs-/Restore-Prüfung |
| [`central-scheduler.yml`](../.github/workflows/central-scheduler.yml) | Scheduling | 5 min + workflow_run + push + manuell | Workflow-internes GitHub-Actions-Dispatch | Recovery nach Freshness-Gates |
| [`changelog.yml`](../.github/workflows/changelog.yml) | Editorial / Publisher | 15 min + manuell | changelog.js | Changelog-Warteschlange → Discord |
| [`convoy-announcement-verifier.yml`](../.github/workflows/convoy-announcement-verifier.yml) | Convoy / Verification | stündlich + workflow_run + push + manuell | kings-convoy-announcement-verifier.js; production-proof-collector.js | echter Public-Convoy-Proof |
| [`convoy-checker.yml`](../.github/workflows/convoy-checker.yml) | Convoy / Producer | 15 min + push + manuell | convoy-checker.js; convoy-truckersmp-sync.js; convoy-finalize.js; convoy-notifications.js; convoy-reminders.js; convoy-driver-reminders.js; kings-convoy-announcements.js; convoy-archive.js; convoy-overview.js; convoy-overview-discord.js; convoy-completeness.js; convoy-planning-alerts.js | Forum/Event-Sync, Veröffentlichung, Archivierung |
| [`core-backup.yml`](../.github/workflows/core-backup.yml) | Backup | täglich + manuell | core-backup.js; backup-final-check.js | gesicherter Backup-/Restore-Punkt |
| [`core-baseline-verification.yml`](../.github/workflows/core-baseline-verification.yml) | Core / Verification | push + manuell | core-baseline-verifier.js; core-e2e-verifier.js; system-monitoring.js; weitere Prüfer | historische Core-Baseline und Safety-Gates |
| [`core-e2e-verification.yml`](../.github/workflows/core-e2e-verification.yml) | Core / Verification | push + manuell | core-e2e-verifier.js; Backup-/Audit-/Reports-Prüfer | isolierte/read-only E2E-Abnahme |
| [`core-recovery.yml`](../.github/workflows/core-recovery.yml) | Recovery / Controlled | nur manuell | core-recovery.js; recovery-safety-check.js; core-backup.js | geschützter Restore, niemals zeitgesteuert |
| [`driver-achievements.yml`](../.github/workflows/driver-achievements.yml) | Driver / Recognition | täglich + push + manuell | driver-achievements.js; driver-loyalty-roles.js | Achievements, Loyalty und kontrollierter Rollenabgleich |
| [`driver-leadership-reports.yml`](../.github/workflows/driver-leadership-reports.yml) | Driver / Leadership | täglich + monatlich + push + manuell | driver-leadership-reports.js | Driver-Änderungs- und Monatsberichte |
| [`driver-management.yml`](../.github/workflows/driver-management.yml) | Driver / People | stündlich + push + manuell | driver-management.js; driver-loa.js; driver-leadership-rate-limit.js | verschlüsselter Driver-/LOA-Zustand; keine Activity-Alert-Veröffentlichung |
| [`driver-updates.yml`](../.github/workflows/driver-updates.yml) | Driver / Membership | 5 min + push + manuell | driver-updates.js | Discord-Kings-Rollen → Join, Trial-Beförderung, bestätigter Austritt; historische Zustände |
| [`driver-weekly-summary.yml`](../.github/workflows/driver-weekly-summary.yml) | Driver / Reports | montags + manuell | driver-weekly-summary.js | wöchentliche Driver-Daten |
| [`event-leadership-reports.yml`](../.github/workflows/event-leadership-reports.yml) | Event / Leadership | täglich + wöchentlich + monatlich + push + manuell | event-leadership-overview.js; event-leadership-reports.js | Event-Leadership-Berichte |
| [`final-freeze-verification.yml`](../.github/workflows/final-freeze-verification.yml) | Core / Verification | alle 6 h + push + manuell | final-freeze-verifier.js; core-baseline-verifier.js; E2E-/Safety-Prüfer | Final-Proofs und Freeze-Gates |
| [`git-state-hardening-verification.yml`](../.github/workflows/git-state-hardening-verification.yml) | Git / Verification | push + manuell | git-state-hardening-verifier.js | Konkurrenz-/Persistenzregeln |
| [`hr-leadership-reports.yml`](../.github/workflows/hr-leadership-reports.yml) | HR / Leadership | täglich + monatlich + push + manuell | hr-leadership-reports.js | HR-Änderungen und Monatsberichte |
| [`hr-leadership.yml`](../.github/workflows/hr-leadership.yml) | HR / People | 15 min + push + manuell | hr-probation.js; hr-leadership.js | HR-Reviews/Überblick |
| [`hr-weekly-summary.yml`](../.github/workflows/hr-weekly-summary.yml) | HR / Reports | montags + manuell | hr-weekly-summary-runner.js; hr-weekly-summary.js | HR-Wochenbericht |
| [`leadership-dashboard-verification.yml`](../.github/workflows/leadership-dashboard-verification.yml) | Leadership / Verification | nur push | leadership-message-sync.js; mehrere Report-Skripte | Dashboard-Integrität |
| [`leadership-dashboard.yml`](../.github/workflows/leadership-dashboard.yml) | Leadership / Publishing | 2× täglich + Berichtsfenster + push + manuell | leadership-dashboard.js; leadership-message-sync.js | ein konsolidiertes Overview pro Leadership-Kanal |
| [`legacy-convoy-import.yml`](../.github/workflows/legacy-convoy-import.yml) | Legacy / Controlled | nur manuell | legacy-convoy-import.js | historischer Import; kein Auto-Replay |
| [`live-tracker.yml`](../.github/workflows/live-tracker.yml) | Live / Aggregation | 5 min + push + manuell | tracker.js; statistics.js; central-overview.js | ein synchronisierter Live-Snapshot |
| [`management-monthly-report.yml`](../.github/workflows/management-monthly-report.yml) | Management / Reports | Monatsfenster + push + manuell | management-monthly-report.js | Leadership-Monatsübersicht |
| [`management-weekly-overview.yml`](../.github/workflows/management-weekly-overview.yml) | Management / Reports | montags + manuell | management-weekly-overview-v3.js | Weekly-Management-Daten |
| [`milestones.yml`](../.github/workflows/milestones.yml) | Recognition / News | 5 min + push + manuell | milestones.js | TMP-Mitglieder-Meilensteine → Discord/Changelog |
| [`monthly-report-verification.yml`](../.github/workflows/monthly-report-verification.yml) | Reports / Verification | Monatsanfang + push + manuell | monthly-report-verifier.js; production-proof-collector.js | echte Monats-Produktionsnachweise |
| [`monthly-report.yml`](../.github/workflows/monthly-report.yml) | Reports / Publishing | monatlich + manuell | monthly-report-v2.js | monatlicher Kings-Bericht |
| [`news-production-verification.yml`](../.github/workflows/news-production-verification.yml) | News / Verification | stündlich + workflow_run + push + manuell | news-production-verifier.js | TruckersMP-News-Dedupe/Produktionsnachweis |
| [`news.yml`](../.github/workflows/news.yml) | News / Publishing | 5 min + manuell | news.js | Kings-TruckersMP-News → Discord |
| [`probation.yml`](../.github/workflows/probation.yml) | HR / Advisory | stündlich + push + manuell | probation.js | Probezeit-/HR-Hinweise |
| [`self-healing-stress-verification.yml`](../.github/workflows/self-healing-stress-verification.yml) | Reliability / Verification | push + manuell | self-healing-stress.js; self-healing-stress-verifier.js | isolierte Ausfallmatrix |
| [`self-healing.yml`](../.github/workflows/self-healing.yml) | Reliability / Recovery | 15 min + push + manuell | self-healing.js; self-healing-verifier.js; self-healing-state-guard.js | allowlist-technische Wiederanläufe, niemals Personalentscheidung |
| [`social-news.yml`](../.github/workflows/social-news.yml) | News / YouTube | 5 min + push + manuell | social-news.js | YouTube-Neuheiten und Dedupe; TikTok/Instagram extern |
| [`staff-leadership-live-overview.yml`](../.github/workflows/staff-leadership-live-overview.yml) | Staff / Leadership | 15 min + push + manuell | staff-leadership-live-overview.js | Discord-Rollen-Snapshot |
| [`staff-leadership-reports.yml`](../.github/workflows/staff-leadership-reports.yml) | Staff / Reports | täglich + wöchentlich + monatlich + push + manuell | staff-leadership-reports.js | Staff-Berichte |
| [`staff-management.yml`](../.github/workflows/staff-management.yml) | Staff / People | 10 min + push + manuell | staff-management.js; staff-discord-updates.js | Staff-Zustand; Join, Promotion, Exit in bestehendem Discord-Channel |
| [`system-monitoring.yml`](../.github/workflows/system-monitoring.yml) | Reliability / Monitoring | 30 min + workflow_run + push + manuell | system-monitoring.js; system-monitor-discord.js; system-alerts.js; weitere Audits | Freshness/Health, Discord-Monitor und Alerts |
| [`system-tests.yml`](../.github/workflows/system-tests.yml) | Quality / Regression | push + pull_request + manuell | tests/*.test.cjs | isolierte Syntax-/Regressionsprüfung |
| [`weekly-reports-verification.yml`](../.github/workflows/weekly-reports-verification.yml) | Reports / Verification | montags + push + manuell | weekly-reports-verifier-v2.js; production-proof-collector.js | Read-only Wochenberichts-Proof |

## 4. Alle 88 JavaScript-Dateien — gruppiertes Quellverzeichnis

Sämtliche 88 Root-`.js`-Dateien wurden in dieser Inventurrunde auf lokale `require`-Abhängigkeiten, Datenverweise, API-/Discord-Einstiegspunkte und Konfiguration gesichtet. Einige Dateien sind Bibliotheken, historische Hilfsprogramme oder Verifizierer, keine eigenständigen Live-Workflow-Produzenten. **Nicht direkt in einem aktuellen Workflow genannt bedeutet nicht automatisch löschbar.**

### News / Social / Milestones (6)

`add-changelog-entry.js`, `changelog.js`, `milestones.js`, `news-production-verifier.js`, `news.js`, `social-news.js`

### Core / Security / Backup / Operations (29)

`api-resilience-verifier.js`, `api-resilience.js`, `backup-final-check.js`, `backup-restore-verify.js`, `branding-self-test.js`, `core-backup.js`, `core-baseline-verifier.js`, `core-e2e-verifier.js`, `core-recovery.js`, `data-integrity.js`, `discord-permission-audit.js`, `final-freeze-verifier.js`, `git-state-hardening-verifier.js`, `kings-branding.js`, `kings-workflow-registry.js`, `production-proof-collector.js`, `recovery-safety-check.js`, `security-audit.js`, `self-healing-state-guard.js`, `self-healing-stress-verifier.js`, `self-healing-stress.js`, `self-healing-verifier.js`, `self-healing.js`, `system-alerts.js`, `system-hardening.js`, `system-health-readiness.js`, `system-monitor-discord.js`, `system-monitoring.js`, `workflow-recovery.js`

### Live / Statistics (3)

`central-overview.js`, `statistics.js`, `tracker.js`

### Convoy / Event (23)

`convoy-announcements.js`, `convoy-archive.js`, `convoy-checker.js`, `convoy-completeness.js`, `convoy-driver-reminders.js`, `convoy-e2e-dry-run.js`, `convoy-finalize.js`, `convoy-notifications.js`, `convoy-overview-discord.js`, `convoy-overview.js`, `convoy-planning-alerts.js`, `convoy-planning-limits.js`, `convoy-reminders.js`, `convoy-time-display.js`, `convoy-time-utils.js`, `convoy-truckersmp-sync.js`, `event-leadership-overview.js`, `event-leadership-reports.js`, `kings-convoy-announcement-verifier.js`, `kings-convoy-announcements.js`, `legacy-convoy-discovery.js`, `legacy-convoy-import.js`, `legacy-october-audit.js`

### Driver / Staff / HR / Loyalty (19)

`driver-achievements.js`, `driver-leadership-rate-limit.js`, `driver-leadership-reports.js`, `driver-loa.js`, `driver-loyalty-roles.js`, `driver-management.js`, `driver-status-alerts.js`, `driver-updates.js`, `driver-weekly-summary.js`, `hr-leadership-reports.js`, `hr-leadership.js`, `hr-probation.js`, `hr-weekly-summary-runner.js`, `hr-weekly-summary.js`, `probation.js`, `staff-discord-updates.js`, `staff-leadership-live-overview.js`, `staff-leadership-reports.js`, `staff-management.js`

### Leadership / Reporting (8)

`leadership-dashboard.js`, `leadership-message-sync.js`, `management-monthly-report.js`, `management-overview.js`, `management-weekly-overview-v3.js`, `monthly-report-v2.js`, `monthly-report-verifier.js`, `weekly-reports-verifier-v2.js`


## 5. State-Dateien, Datenhoheit und Schutzklassen

Die folgende Zuordnung ist eine Kurzbeschreibung; das vollständige tatsächlich versionierte `data/`-Verzeichnis folgt im Appendix.

| Datenbereich | Beispiele | Schutz-/Migrationshinweis |
|---|---|---|
| Driver / Identity / LOA | `driver-members.json`, `driver-management.json`, `driver-loa.json`, `driver-loyalty-roles.json`, `driver-achievements.json`, `staff-management.json`, `staff-discord-updates.json`, `hr-probation.json` | teilweise AES-256-GCM-verschlüsselt; keine Klartextmigration |
| Driver-Summary / Historie | `driver-history.json`, `driver-updates-summary.json`, `driver-management-summary.json`, `driver-achievements-summary.json`, `driver-loyalty-roles-summary.json`, `driver-change-guard.json` | Zählungen, Dedupe, Zeiträume und Zuordnungen unterscheiden |
| Live / Stats | `live-tracker-snapshot.json`, `statistics.json`, `central-overview.json` | Snapshot-Zeitpunkt `sourceSnapshotAt` muss konsistent bleiben |
| Convoys | `convoy-completeness-state.json`, `legacy-convoys.json`, `legacy-convoys-import-summary.json` | Forum-/Event-Daten, IDs und Archivierung nicht neu veröffentlichen |
| News / Social | `last-news.json`, `news-publication-state.json`, `news-live-proof.json`, `social-news-state.json`, `changelog-queue.json`, `changelog-state.json`, `changelog-history.json` | News/Posts nicht erneut verbreiten |
| Reports / Dashboards | `driver-leadership-report-state.json`, `driver-weekly-summary-state.json`, `hr-weekly-summary-state.json`, `management-weekly-overview-state.json`, `management-monthly-overview-state.json`, `leadership-dashboard-state.json` | Berichtsfenster und Discord-Message-IDs bewahren |
| Security / Reliability | `self-healing-state.json`, `system-alerts-state.json`, `final-freeze-state.json`, `data/api-health/*.json` | Warnungen/Fails unverändert und nachvollziehbar |

**Einige besonders sensible States sind AES-256-GCM-Container**, z. B. Member-/Management-, Staff- und HR-Daten. Diese Files dürfen nicht als Klartext veröffentlicht, zusammengeführt oder automatisch konfliktfrei „rekonstruiert“ werden. Die unveränderte Sicherung und das Testen einer Migration gehören später in ein eigenes Gate.

### Vollständige `data/`-Dateiliste (72)

- `data/api-health/convoy-announcement-verifier--truckersmp-kings-convoy-announcement-verifier.json`
- `data/api-health/convoy-system--truckersmp-convoy-event-sync.json`
- `data/api-health/convoy-system--truckersmp-kings-convoy-announcement.json`
- `data/api-health/driver-management--ets2map-area.json`
- `data/api-health/driver-management--truckersmp-servers.json`
- `data/api-health/driver-management--truckersmp-vtc-members.json`
- `data/api-health/driver-updates--truckersmp-vtc-members.json`
- `data/api-health/final-freeze--github-actions-api.json`
- `data/api-health/live-systems--truckersmp-map-live.json`
- `data/api-health/live-systems--truckersmp-map-locations-ats.json`
- `data/api-health/live-systems--truckersmp-map-locations-ets2.json`
- `data/api-health/live-systems--truckersmp-servers.json`
- `data/api-health/live-systems--truckersmp-vtc-members-live-tracker.json`
- `data/api-health/milestones--truckersmp-vtc-members.json`
- `data/api-health/news--truckersmp-vtc-news.json`
- `data/api-health/news-production-verifier--discord-news-proof.json`
- `data/api-health/news-production-verifier--truckersmp-news-proof.json`
- `data/api-health/self-healing--github-actions-api.json`
- `data/api-health/staff-management--truckersmp-vtc-members.json`
- `data/api-health/staff-management--truckersmp-vtc-roles.json`
- `data/api-health/system-monitoring--github-actions-api.json`
- `data/api-health/truckersmp-convoy-event-sync.json`
- `data/api-health/truckersmp-kings-convoy-announcement.json`
- `data/awards-catalog.json`
- `data/central-overview.json`
- `data/changelog-history.json`
- `data/changelog-queue.json`
- `data/changelog-state.json`
- `data/convoy-completeness-state.json`
- `data/driver-achievements-summary.json`
- `data/driver-achievements.json`
- `data/driver-history.json`
- `data/driver-leadership-rate-limit.json`
- `data/driver-leadership-report-state.json`
- `data/driver-loa.json`
- `data/driver-loyalty-roles-summary.json`
- `data/driver-loyalty-roles.json`
- `data/driver-management-summary.json`
- `data/driver-management.json`
- `data/driver-members.json`
- `data/driver-updates-summary.json`
- `data/driver-weekly-summary-state.json`
- `data/event-leadership-report-state.json`
- `data/final-freeze-state.json`
- `data/hr-leadership-report-state.json`
- `data/hr-probation.json`
- `data/hr-weekly-live-proof.json`
- `data/hr-weekly-summary-state.json`
- `data/last-news.json`
- `data/leadership-dashboard-state.json`
- `data/legacy-convoys-import-summary.json`
- `data/legacy-convoys.json`
- `data/live-tracker-snapshot.json`
- `data/management-monthly-overview-state.json`
- `data/management-weekly-overview-state.json`
- `data/milestones.json`
- `data/monthly-live-proof.json`
- `data/monthly-report-state.json`
- `data/news-live-proof.json`
- `data/news-publication-state.json`
- `data/probation-state.json`
- `data/public-convoy-live-proof.json`
- `data/self-healing-state.json`
- `data/social-news-state.json`
- `data/staff-discord-updates-summary.json`
- `data/staff-discord-updates.json`
- `data/staff-leadership-live-overview.json`
- `data/staff-leadership-report-state.json`
- `data/staff-management-summary.json`
- `data/staff-management.json`
- `data/statistics.json`
- `data/system-alerts-state.json`

## 6. Öffentliche, interne und technische Discord-Ausgaben

| Ziel-/Nachrichtenbereich | Produzent(en) | Schutzregel |
|---|---|---|
| Bestehender Driver Updates Webhook | `driver-updates.js` | Join, Trial → Driver und bestätigter Verlust der letzten Kings-Zugehörigkeitsrolle; keine Meldung über einzelne Rollenentfernungen |
| Bestehender Staff Updates Channel | `staff-discord-updates.js` | Join/Promotion/Staff-Austritt; Textzustellung und Duplikate prüfen |
| `driver-leadership` | Driver Management, LOA, Achievements, Reports | sensible Zusammenfassungen / Berechtigungen |
| `staff-leadership` | Staff, Staff Reports, Live Staff Overview | Personalüberblick, keine öffentliche Personenentscheidung |
| `hr-leadership` | HR Reviews, Probation, HR Reports | besonders zurückhaltende Zugriffs-/Weitergaberegeln |
| `event-leadership` + Convoy Forum/Overview | Convoy Pipeline und Event Reports | bestehende Threads, Slots, Archive und Posts weiterverwenden |
| Management-/Leadership-Dashboards | Dashboard und Reports | bestehende Nachrichten editieren, nicht duplizieren |
| Live Tracker, Statistics, Central Overview | `live-tracker.yml` | ein gemeinsamer Tracker-Snapshot pro Zyklus |
| News / Social / Changelog / Monthly Reports | eigene Publisher | unabhängige Dedupe-States, keine historischen Replays |
| `system-monitor` / `system-alerts` | Monitoring/Alerts | technische Health-Info, kein verstecktes Grün bei Warnungen |

**Aktuelle Kings-Regel:** Keine Mindestkilometer-/Mindestaktivitätspolitik; `driver-status-alerts.js` ist noch im Codebestand, wird jedoch im aktuellen `driver-management.yml` nicht aufgerufen. Die Driver-Abgangserkennung orientiert sich an Discord-Kings-Zugehörigkeitsrollen und nutzt einen verschlüsselten Pending-Zustand; die Rolle-/Namenszuordnung ist vor plattformübergreifender Migration gesondert zu härten.

**Visuelles Branding:** Driver-/Staff-Update-Embeds nutzen denselben extern gehosteten offiziellen Kings-Banner. Diese URL ist eine Drittanbieter-Abhängigkeit; Ausfall/Änderung des Hosts soll später überwacht oder durch kontrolliertes Hosting ersetzt werden. Bestehende Channel-Konfiguration bleibt unverändert.

## 7. Integrationen, Authentifizierung und technische Berechtigungen

- **TruckersMP:** VTC-Mitglieder/News/Events und weitere TMP-nahe Daten stehen heute im Mittelpunkt. Teilweise unterschiedliche Endpoints je Workflow; Adaptergrenze noch zu schaffen.
- **TruckersMP Map / ETS2Map:** Online-Daten und Locations im Tracker, teilweise in Driver Management; Verfügbarkeit/Genauigkeit separat bewerten.
- **Discord:** Guild-Rollen und Member, Webhooks, Bot-/Channel-/Forum-Nachrichten, Dedupe über IDs; Schreibrechte pro Modul begrenzen.
- **GitHub Actions:** Cron, `workflow_dispatch`, `workflow_run`, Versionszustände, Workflow-Recovery, CI und Monitoring.
- **YouTube:** Social News; TikTok/Instagram-PostPing und Galaxy-Tickets sind **externe** Bots und dürfen nicht als GitHub-Workflows ausgegeben werden.
- **Secret-Namen und Permission-Scopes:** `DISCORD_BOT_TOKEN`, `DRIVER_STATE_KEY`, optional `STAFF_STATE_KEY`, mehrere Webhook-Secrets, `GITHUB_TOKEN`/GitHub-App-Berechtigungen. **Keine Werte ausgeben, keinen Secret-Zugriff oder Secret-Export auslösen.**
- **HaulMP / TrucklineMP:** Produktziele, aber **keine als fertig nachgewiesenen Konnektoren im aktuell inventarisierten GitHub-Core**.

## 8. Kritische Abhängigkeiten und Integritäts-Gates

1. `tracker.js` → `data/live-tracker-snapshot.json` → `statistics.js` → `central-overview.js`; gleiche `sourceSnapshotAt`-Generation.
2. `driver-updates.js` → verschlüsselter Member-State und anonymisierte History → Driver-Zahlen und historische Berichte.
3. `driver-management.js` und `driver-loa.js` → `driver-achievements.js`, `hr-probation.js` und mehrere Leadership-Berichte.
4. `staff-management.js` → `staff-discord-updates.js`, Staff Reports und Leadership; Discord und TruckersMP sind nicht immer dieselbe Quelle.
5. Convoy Checker → TruckersMP Event Sync → Finalization → Notification/Reminder → Kings Announcement → Archive → Overview; Thread-/Message-IDs überleben Migration.
6. News / YouTube / Changelog / Milestones → jeweils eigener Dedupe-/Publish-Zustand. Keine gemeinsame „alles neu senden“-Migration.
7. System Monitoring → GitHub Actions Frische, API-Health, Backup, Audits, `system-alerts`; technische Fehler dürfen nicht durch weichere Health-Grenzen versteckt werden.
8. Self-Healing hat eine begrenzte Allowlist für technische Prozesse; keine automatische Personalentscheidung und kein automatisches Legacy-Replay oder Restore.

## 9. Auffälligkeiten und offene Risiken (noch **keine** Änderung)

| Priorität | Befund | Folge für später |
|---|---|---|
| Hoch | Bisher kein dokumentierter gemeinsamer `platformId`, Adaptervertrag und plattformübergreifendes Identity-Schema | Punkt 02–07 planen **vor** Migration |
| Hoch | Driver/Staff/HR und teilweise Milestones referenzieren TruckersMP-IDs, TMP-Roster oder Discord-Rollen | IDs nicht gleichsetzen, Identitäten verifizieren |
| Hoch | Unterschiedliche Zustandsdateien und konkurrierende GitHub-Schreibprozesse | Migration mit Snapshot-/Rollback- und idempotenten Writes |
| Hoch | Convoy Center stützt sich stark auf TMP Event IDs, Discord Forums/Threads und Strings | Transportneutralität nur über Adapter; keine automatische Event-Replays |
| Hoch | Offizielle HaulMP-/TrucklineMP-API-Capabilities noch nicht im Core nachgewiesen | in Punkt 03 prüfen, niemals Funktionen erfinden |
| Mittel | README referenziert historische v1.2 Baseline und alte Pending-Proofs; neuere Final-Freeze-Läufe können bereits erfolgreich sein | README erst nach quellengetreuer Statusabnahme aktualisieren |
| Mittel | Alte Hilfsskripte und `driver-status-alerts.js` bleiben vorhanden, auch ohne aktive Veröffentlichung | nicht löschen, ehe Referenzen/Tests/Replays geklärt sind |
| Mittel | Discord-Rollen anhand von Namen/Kategorien statt stabiler Rollen-IDs können falsch interpretiert werden | Identity/Role Registry und bestehende Member-Regeln schützen |
| Mittel | Banner-Bild extern gehostet; Bot/Webhook-/Channel-Rechte providerabhängig | Ausfall und Embed-Darstellung separat testen |
| Mittel | Kein Beweis aus einer CI-Grünmeldung für 24/7-Verfügbarkeit | mindestens reale Läufe pro Pipeline und Reportingfenster prüfen |

## 10. Verifikation und Grenzen

**GitHub Actions Stichprobe (27.10.2026, um ca. 18:22 UTC):** letzte sichtbare produktive Runs von Driver Updates, Staff Management, Live Systems, News, System Monitoring und Central Scheduler waren erfolgreich. Auch ein letzter Final-Freeze-Lauf war erfolgreich. Die Stichprobe beweist **nicht**, dass alle 43 Workflows jederzeit gesund sind; sie ersetzt keine Live-Discord-Abnahme und keine HaulMP-/TrucklineMP-Prüfung. Der Convoy Checker ließ sich in den jüngsten 100 Repo-Runs nicht mit exakt erwartetem Anzeigenamen identifizieren: separater spezifischer Check nötig.

**Vorhandene Tests:** 24 `*.test.cjs` plus `sandbox.cjs`; automatisierte Offline-Verification auf Pull Requests/Push. Testabdeckung kann sich mit neuen Dateien ändern.

### Test-/Sandbox-Dateien (25)

- `tests/all-kings-workflows.test.cjs`
- `tests/api-resilience.test.cjs`
- `tests/central-schedule-routing.test.cjs`
- `tests/changelog-queue.test.cjs`
- `tests/convoy-completeness.test.cjs`
- `tests/convoy-pipeline.test.cjs`
- `tests/convoy-planning-alerts.test.cjs`
- `tests/convoy-planning-limits.test.cjs`
- `tests/core-systems.test.cjs`
- `tests/discord-permission-audit.test.cjs`
- `tests/driver-systems.test.cjs`
- `tests/git-state-hardening.test.cjs`
- `tests/kings-branding.test.cjs`
- `tests/news-systems.test.cjs`
- `tests/operational-readiness.test.cjs`
- `tests/persistence.test.cjs`
- `tests/public-convoy.test.cjs`
- `tests/sandbox.cjs`
- `tests/self-healing.test.cjs`
- `tests/social-news.test.cjs`
- `tests/staff-hr-systems.test.cjs`
- `tests/system-alerts-discord.test.cjs`
- `tests/system-alerts.test.cjs`
- `tests/system-sync-and-convoy-text.test.cjs`
- `tests/workflow-recovery.test.cjs`

### Vorhandene Dokumentation (12)

- `CONVOY-ENTRY-TEMPLATE-DRAFT.md`
- `README.md`
- `SOCIAL-NEWS-SETUP.md`
- `SYSTEM-INVENTORY.md`
- `docs/KINGS-ALL-SYSTEMS-INVENTORY.md`
- `docs/core-baseline-2026-10-01.md`
- `docs/final-core-documentation.md`
- `docs/kings-central-scheduling-audit-2026-10-20.md`
- `docs/self-healing-2026-10-01.md`
- `docs/self-healing-stress-2026-10-01.md`
- `docs/system-sync-and-convoy-center-audit-2026-10-20.md`
- `docs/system-verification-2026-09-30.md`

## 11. Definition of Done für Punkt 01

- [x] Aktuellen Git-Commit und alle versionierten Dateien aufgenommen.
- [x] Alle 43 Workflow-Dateien mit Trigger, Produzenten und Hauptzweck katalogisiert.
- [x] Alle 88 Root-JavaScript-Dateien gesichtet, gruppiert und auf Abhängigkeiten geprüft.
- [x] Versionierte 72 Daten-/Zustandsdateien erfasst; sensible und veröffentlichbare States unterschieden.
- [x] Bekannte Discord-Ziele, Schreibabläufe und externe Integrationen abgebildet.
- [x] Aktuelle technische/operative Risiken dokumentiert und Statusgrenzen benannt.
- [x] Kein automatischer Datenimport, Rollen-Change, Workflow-Neustart oder Discord-Testpost ausgelöst.
- [ ] Punkt 02: belastbare KEEP / EXTEND / ADAPTER / REBUILD-Entscheidungen je Modul.
- [ ] Punkt 03: offizielle TruckersMP-/HaulMP-/TrucklineMP-Capabilities empirisch prüfen.

**Freigabeempfehlung:** Punkt 01 als **technische Code-/Konfigurationsinventur abgeschlossen** betrachten. Für eine vollständige operationelle Abnahme gehören spätere Live-Channel-Sichtprüfungen und mehrtägige Health-Beobachtung dazu; beides ist nicht das gleiche wie Inventarisierung.
