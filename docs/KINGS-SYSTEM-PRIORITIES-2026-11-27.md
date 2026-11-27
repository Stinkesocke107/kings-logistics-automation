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

Ziel: non-technische **Betriebsmitteilungen** in
`#operations-notifications` oder
`#kings-operations-notifications`.
`#system-alerts` bleibt exklusiv
für technische Fehler, Eskalationen und Entwarnungen.
Andere private Einzelmeldungen bleiben in ihren Fachkanälen.

**In diesem PR technisch vorbereitet:** opt-in, ausschließlich aggregierte
Event-Statusübersicht aus dem vorhandenen Convoy Checker. Sie unterdrückt
unverifizierte/stale/fehlerhafte Quellen, Testthreads, Fremdkanäle, Erwähnungen
und Doppeleinträge. Sie verändert weder Rollen/Personal noch Events.
Es wird **kein 47. GitHub-Workflow** und kein externer Server benötigt.

**Noch NICHT live:** Discord-Channel und dessen genaue Rollenrechte sind
im Repository nicht belegt; keine GitHub-Secrets wurden gesetzt. Ohne
explizite Aktivierung sendet die Funktion **nichts**.

Nötige Einrichtung vor Live-Test durch den Serverinhaber:
1. Privaten Discord-Textchannel mit genau einem der zwei Namen anlegen.
   `@everyone` benötigt ein explizites **Deny View Channel**; nur freigegebene
   Staff/Leadership-Rollen und Bot dürfen View/Read History/Send erhalten.
2. In **GitHub Actions → Repository secrets** setzen:
   `KINGS_OPERATIONS_CHANNEL_ID` auf die echte Kanal-ID, bei Bedarf
   `SYSTEM_ALERTS_CHANNEL_ID` für explizite Zieltrennung. Nicht in Chat/README
   Zugangstoken posten. Der vorhandene `DISCORD_BOT_TOKEN` wird wiederverwendet.
3. Separat genehmigt `KINGS_OPERATIONS_NOTIFICATIONS_ENABLED=ENABLED`
   setzen. Bis dahin bleibt alles inaktiv.
4. Echten Convoy Checker ausführen, Ergebnis im privaten Channel überprüfen,
   bei unveränderten Quellen keine Doppelposts akzeptieren. Fehlende/mehrfache
   Nachrichten und Berechtigungsfehler anschließend unabhängig abnehmen.

**Weitere non-technische Bereiche erst einzeln anbinden:** Driver-Handover
(ohne Namen/Privatdaten), Staff-Termine, Awards (nach Genehmigung), Partner-
Status, Berichte, Support-Aufkommen und Event-Einladungsstatus. Für jeden
Bereich braucht es einen freigegebenen, datensparsamen Quellvertrag mit
Benachrichtigungstyp, Zielrollen, Dublettenschutz, Rücklesung und Löschkonzept.
Es wäre irreführend, heute "alle Betriebsereignisse" als integriert zu
kennzeichnen.

## Gemeinsame Abschlussregel

Technischer Code / CI grün ≠ Live-Nachweis ≠ Fachabnahme ≠ CEO-Freigabe.
Für jede der 46 Positionen: Pflichtfunktionen, reale Originalquellen, Rechte,
Quellfrische, Veröffentlichung/Rücklesung, Duplikate, Störung/Wiederanlauf,
Teamübergabe und dokumentierte CEO-Endfreigabe getrennt festhalten.
**Keine automatische Produktionsfreigabe in diesem Plan.**
