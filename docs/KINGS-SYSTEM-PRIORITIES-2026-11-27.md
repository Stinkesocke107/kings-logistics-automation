# Kings Logistics — System-Prioritäten, fehlende Funktionen und Abnahmefolge

Stand: 27.11.2026. Grundlage: 46 registrierte GitHub-Workflows, die vorhandenen
Closeout-Anforderungen, bestehende Event-Dokumentation und die CEO-Wünsche.
Diese Liste ist ein **Arbeitsplan**, keine Bestätigung einer Produktivfreigabe.

## Wichtige Korrektur: 46 statt 45 aufgeführte Workflows

Die bisherige Textliste nennt 46 Workflows, führt aber nur 45 einzeln auf.
**Workflow #35 Monthly Report (monthly-report.yml)** fehlt in dieser Aufzählung.
Er gehört zur eigenständigen Produktiv- und Abnahmeprüfung: echter Monatsabschluss,
Originalquellen, Einmaligkeit, sichere Zustellung und Wiederanlauf.

Die nachfolgenden Gruppen umfassen **alle IDs 01–46 genau einmal**.
Die Event-Fachsystemnummer #17 (Booking / Slot Management) ist **gestrichen**;
Workflow #17 (TruckersMP Driver VTC Date Review) bleibt bestehen.

## Priorität 0 — Sicherheits- und Betriebsgrundlage

| ID | Workflow | Was zunächst nachgewiesen werden muss |
| --- | --- | --- |
| 02 | API Resilience Verification | Fehlerbehandlung, API-Wiederkehr und Circuit Breaker |
| 03 | Backup / Restore Verification | Isolierter Restore vs. echter Notfall sauber trennen |
| 04 | Central Scheduler | Zeitplan, Sperren, Wiederanläufe und verbotene Aktionen |
| 08 | Core Backup | Vollständige produktive Sicherung, Aufbewahrung, Alarme |
| 09 | Core Baseline Verification | Externe Map-/Freshness-Blocker separat offen halten |
| 10 | Core End-to-End Verification | Originalquelle → Speicherung → Discord beweisen |
| 11 | Core Restore / Recovery | Nur autorisierte manuelle Recovery und Wiederinbetriebnahme |
| 22 | Final Freeze Verification | Ganz zum Schluss: alle kritischen Gates, Freigabe |
| 23 | Git State Hardening Verification | Geschützte Konflikt-/Parallelzugriffstests |
| 30 | Live Tracker / Advanced Statistics | ETS2/ATS-Fallback, Original-Map-Daten, drei Anzeigen |
| 39 | Self-Healing Stress Verification | Fehlerkombinationen, Sicherheitsgrenzen |
| 40 | Safe Self-Healing | Erlaubte Recovery, Eskalation statt falscher Reparatur |
| 44 | System Monitoring | Vollständige Workflow- und API-Beobachtung, Alerts |
| 45 | Offline System Verification | Tests aktuell halten; niemals Offline-Test=Live-Abnahme |

**Abhängigkeit:** #09, #10, #22 und Teile von #30 bleiben offen, solange
relevante externe Kartenquellen keine verifizierten aktuellen Daten liefern.
Andere Systeme deshalb **parallel** weiter fertigstellen, aber den Blocker nie
als behoben markieren. Keine automatische Restore-, HR-/Staff- oder Rollenaktion.

## Priorität 1 — Bestehende Event-Systeme betriebsfähig abschließen

| ID | Workflow | Nächster Nachweis |
| --- | --- | --- |
| 06 | Convoy Announcement Verification | Echte fehlende/doppelte/stale Ankündigungen |
| 07 | Convoy / Event System | Pflichtdaten, Konflikte, Calendar/Capacity-Konsistenz |
| 20 | Event Operations Discord Staff Review | Neuer echt berechtigter Befehl → Journal → Dashboard |
| 21 | Event Operations Manual Staff Review | Geschützte manuelle Prüfung und Statuskonflikte |
| 29 | Legacy Convoy Import | Originalevents, UTC, Dubletten, Legacy-Holds |

Die fünf **zusätzlichen Fachsysteme** sind in vorhandene Workflows integriert,
keine fünf neuen GitHub Actions:
- **#12 Event Capacity:** 3 Gesamt-Convoys/UTC-Tag, 20 Partner/Monat,
  20 External/Monat, Kings monatlich unbegrenzt; <120 Minuten Abfahrtabstand
  als *Warnung zur Prüfung*, nicht als automatischer Ablehnungsgrund.
  Originalquellen/Staff-Abnahme und Kapazitätsgrenzen gegenprüfen.
- **#14 Event History:** 24 Monate vollständig mit Originalbelegen abgleichen,
  fehlende, abgesagte, doppelte und unklare Einträge manuell prüfen.
- **#15 Invitation Tracker:** echte Einladungen, Antworten, archivierte
  Forum-Threads und Dubletten verifizieren; keine Teilnahme erfinden.
- **#16 Event Calendar:** kommende 12 Monate, Holds, Absagen, Quellenfrische
  und Monatsgrenzen mit Originaleinträgen prüfen.
- **#18 Event Operations:** eine neue echte autorisierte Staff-Aktion durch
  Discord GET → aktuelle Rollenprüfung → AES-Journal → Git-Persistenz →
  feste Leadership-Nachricht → Discord-Rücklesung nachweisen.

**Bereits vorhanden:** private Nachrichtenbefehle
`!kings-review KR... start` sowie
`block`, `reopen` und
`record_check STAFF_RECORD ORIGINAL_RECORDS_CHECKED` (mit gültigem KR-Code).
Das sind keine Slash Commands und sie bewilligen keine Events.
**UX-Lücke:** konkrete Kurzhilfe, verständliche Statusrückmeldung, klare
"nächster Schritt"-Übersicht. Erste Verbesserung ist im begleitenden PR
enthalten. Spätere read-only Abfragen (Status, Calendar, History, Capacity,
Invitations) erst nach Datenschutz-/Quellprüfung und Event-Team-Test.
Keine Live-Slash-Bot-Zusage unter GitHub-Free ohne Hosting.

## Priorität 2 — Driver, HR und Staff an autorisierte Originaldaten anbinden

| ID | Workflow | Restaufgabe |
| --- | --- | --- |
| 12 | Driver Achievements / Loyalty | Echte Kriterien, Dubletten, manuelle Rollengenehmigung |
| 14 | Driver Management | LOA, Rückkehr, sichere geschützte Speicherung |
| 15 | Driver Updates | Echt-Beitritt/Austritt ↔ Driver Management |
| 16 | Driver Registration Onboarding | Original-IDs/Join-Dates, fehlende Angaben, HR-Handover |
| 17 | TruckersMP Driver VTC Date Review | Eintrittsdaten nur nach humanem Abgleich korrigieren |
| 33 | VTC Milestones | Mitgliedschaftsmeilensteine, Dubletten, Veröffentlichung |
| 38 | Driver Probation | Echte Fristen/Status, HR bleibt Entscheider |
| 25 | HR Leadership | Berechtigter HR-Befehl und Entscheidungskette |
| 41 | Staff Leadership Live Overview | Tatsächliche Discord-Rollen/hierarchische Zählung |
| 43 | Staff Management | Ernennung, Beförderung, Austritt, Originalnachweis |

Noch begonnene, vorhandene Fachfunktionen: HR Decision Source, HR Private Case
View, Driver Identity Register, Staff Appointment Register, Driver Loyalty
Role Synchronization und Monthly Awards (genau vier: Driver, Staff, Recruiter,
Photo of the Month). Keine unkontrollierten Live-Personalentscheidungen.

## Priorität 3 — Leadership, Wochen-/Monatsberichte und Dashboards

| ID | Workflow | Restaufgabe |
| --- | --- | --- |
| 13 | Driver Leadership Reports | Mitglieder/LOA-Daten und private Ausgabe |
| 18 | Driver Weekly Summary | Vollständige echte Woche, sichere Einmalzustellung |
| 19 | Event Leadership Reports | Capacity/History/Calendar/Invitations abgleichen |
| 24 | HR Leadership Reports | HR-Fälle, Fristen, private Freigaben |
| 26 | HR Weekly Summary | Originalfälle, korrekte Kalenderwoche |
| 27 | Leadership Dashboard Verification | Änderungen und Discord-Readback |
| 28 | Leadership Dashboard | Einheitliche vertrauenswürdige Driver/HR/Staff/Event/Management-Daten |
| 31 | Management Monthly Report | Echter Monatsabschluss aller Abteilungen |
| 32 | Management Weekly Overview | Echte aktuelle Wochenquellen |
| 34 | Monthly Report Verification | Unabhängige Monats-Originaldatenprüfung |
| **35** | **Monthly Report** | **Fehlte in der alten Liste:** Originaldaten, Monatslauf, Publishing, Retry |
| 42 | Staff Leadership Reports | Rollen-/Abteilungs-Originalquellen |
| 46 | Weekly Reports Verification | Echte Driver/HR/Management-Wochenberichte |

**Dashboard-Designregel:** je Abteilung eine stabile Nachricht. Zuerst
aktueller Status und verantwortliche nächste Schritte; anschließend
Wochen-/Monatsentwicklung, dann Quellen-/Historienprobleme. Nicht verifizierte
Quellen als **Unavailable** darstellen, niemals als Null. Private HR-/Staff-
und Eventnachweise niemals in öffentliche Kanäle kopieren.

## Priorität 4 — News und Changelog

| ID | Workflow | Restaufgabe |
| --- | --- | --- |
| 01 | Changelog Editor | Berechtigte Eingabe, Übergabe, Dubletten |
| 05 | Changelog Publisher | Echte einmalige Veröffentlichung + Rücklesung |
| 36 | TruckersMP News Verification | Quelle ↔ Discord und Dubletten |
| 37 | TruckersMP News | Neuer Originalartikel mit sicherer Wiederholung |

## Priorität 5 — Neue Verwaltungsregister nur wo sie wirklich fehlen

Partner Data Registry, Event Approval / Evidence Registry (kein Booking),
Award Results Registry, Ticket & Support Integration, Event Support-Formulare,
External event (offizieller Rollenname) und Governance für Staff-/HR-Freigaben.
Zuerst bestehende Ticket- und Quellsysteme wiederverwenden; keinen
redundanten Workflow einführen. Website/Driver Hub, Shop, Kings Hub und RealmMP
sind **andere Projekte** und hier keine Pflichtaufgaben.

## Neues, separates System: Kings Operations Notices

Ziel: nichttechnische **Betriebsmitteilungen** in
`#operations-notifications` oder
`#kings-operations-notifications`.
`#system-alerts` bleibt exklusiv für technische Fehler,
Eskalationen und Entwarnungen. Vertrauliche Personal-/HR-Fälle verbleiben in
ihren geschützten Fachkanälen.

**Im Draft PR technisch vorbereitet:** erster, ausdrücklich opt-in
**Event-Aggregat-Pilot** im bereits vorhandenen Convoy Checker. Nur nach
erfolgreichem Checker, TruckersMP-Abgleich, Finalizer, Completeness-Prüfung
und Convoy-Overview dürfen frische, konsistente Statuszahlen erscheinen.
Es werden keine Event-Namen, persönlichen Daten, internen Fall-IDs,
Staff-Kommandos, Buchungsentscheidungen oder freien Plätze veröffentlicht.

**Ein festes Message-Embed statt Meldungsflut:** einmaliges Bot-POST,
anschließend bei Event-Änderung nur PATCH auf exakt **dieselbe bot-eigene**
Nachricht; unveränderte Quellstände ergeben keine Discord-Schreibaktion.
Der Digest bezieht die individuellen Statusänderungen ein, auch wenn die
aggregierten Summen gleich geblieben sind. Jeder Discord-Write benötigt
anschließend eine echte GET-Rücklesung desselben Bot-Messages. Mehrere
historische Bot-Statusmeldungen oder eine volle 100er-History-Seite stoppen
die Veröffentlichung sicher statt riskanter Dubletten-/Löschaktionen.

**Privacy-Härtung:** Die echte Kanal-ID, der Kanalname und die Guild-ID
müssen zusammenpassen. Auf jedem Lauf prüft das System per Discord GET
die Serverrollen, Bot-Identität/-Rollen und **alle** Kanal-Overwrites.
`@everyone` braucht explizites **Deny View Channel**.
Jede Rolle, die den Kanal über einen positiven View-Overwrite lesen kann,
muss über ihre unveränderliche Rollen-ID ausdrücklich im vom CEO
genehmigten Secret stehen — **auch eine Bot-Rolle**, falls ihr View explizit
erlaubt wird. Unbekannte Rollen, individuelle View-Freigaben an andere
Nutzer, fehlende genehmigte Rollen oder Mehrfach-Overwrites stoppen den
Publisher. Discord-Serverrollen mit **Administrator** können Kanal-Denies
trotzdem umgehen; deren separate Kontrolle ist erforderlich.

**Noch NICHT live:** Eine echte Discord-Channel-ID, die aktuellen genehmigten
Role-IDs und die ausdrücklich bestätigte Aktivierung wurden nicht gesetzt.
Der PR wird nicht automatisch gemerged oder produktiv geschaltet. Es
existiert kein eigener 47. GitHub-Workflow und kein externer Server.

### Autorisierte Inbetriebnahme (noch ausstehend)

1. Privaten **Text**-Channel genau `operations-notifications` oder
   `kings-operations-notifications` einrichten. Positiv View nur
   für genehmigte Leadership/Staff-Rollen und gegebenenfalls ausdrücklich
   genehmigte Bot-Rolle oder Bot-Einzelaccount, negativ View für
   `@everyone`; Bot muss lesen, History abrufen, schreiben und seine
   eigene Nachricht editieren können.
2. In **GitHub Actions Repository Secrets** privat hinterlegen:
   `KINGS_OPERATIONS_CHANNEL_ID` (echte Channel-ID),
   `SYSTEM_ALERTS_CHANNEL_ID` (echte *andere* Channel-ID),
   `KINGS_OPERATIONS_ALLOWED_ROLE_IDS` (kommagetrennte, genehmigte
   aktuelle Role-IDs einschließlich jeder Bot-Rolle mit positiver View
   Permission). Den vorhandenen `DISCORD_BOT_TOKEN` nur als Secret
   verwenden; keine IDs/Tokens in öffentliche CI-Logs oder Chat kopieren.
3. **Separat genehmigt** exakt
   `KINGS_OPERATIONS_NOTIFICATIONS_ENABLED=ENABLED` als Secret
   setzen. Vorher ist der Publisher vollständig inaktiv.
4. Nach CI-Grün einen echten Convoy-Checker-Live-Lauf und Discord-Readback
   prüfen. Ein ursprünglicher POST, spätere PATCH-Updates und keine doppelten
   Statusmeldungen müssen dokumentiert werden. Rechteänderungen, API-Fehler,
   Replay und ältere/volle History sind als echte Negativfälle abzugleichen.
5. Solange kein humaner Live-Nachweis und keine fachliche CEO-Freigabe
   vorliegen, bleibt die Abnahme ausdrücklich offen. Ein optionaler
   fehlgeschlagener Publisher-Schritt erzeugt eine GitHub-Warnung; er
   bescheinigt **keinen** erfolgreichen Versand.

**Spätere Quelladapter separat prüfen:** Driver-Handover (ohne
personenbezogene Daten), Staff-Termine, freigegebene Awards, Partner-Status,
Reports, Support-Volumen und Event-Einladungsstatus. Jede Kategorie braucht
Quellfrische, deduplizierbare Statusdaten, ein freigegebenes Publikum,
Datenschutzprüfung und unabhängigen Discord-Readback.
**Die aktuelle Implementierung umfasst nur den Event-Aggregat-Pilot.**

## Gemeinsame Abschlussregel

Technischer Code / CI grün ≠ Live-Nachweis ≠ Fachabnahme ≠ CEO-Freigabe.
Für jede der 46 Positionen: Pflichtfunktionen, reale Originalquellen, Rechte,
Quellfrische, Veröffentlichung/Rücklesung, Duplikate, Störung/Wiederanlauf,
Teamübergabe und dokumentierte CEO-Endfreigabe getrennt festhalten.
**Keine automatische Produktionsfreigabe in diesem Plan.**
