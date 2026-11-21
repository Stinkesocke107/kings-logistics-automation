# Kings Logistics – Event-/Convoy-Systemprüfung vom 22. November 2026

## Prüfziel und Umfang
Read-only Audit der bestehenden Event-Kette: Convoy Checker (Guild-Forum), TruckersMP-Event-Abgleich, Finalisierung, Staff-Freigaben, Driver 24h/1h-Reminder, eigene Kings 2h-/Start-Ankündigungen, historische Kalenderübernahme, Convoy Overview, technische Scheduler/Verifier. Keine Test-Discord-Posts, Rollen-/Event-Freigaben oder manuellen Teilnahmen ausgelöst.

## Echte Belege
- [Convoy Checker live – Run 44958692597](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44958692597) vollständig erfolgreich: 33 echte Convoy-Center-Einträge, davon 29 archivierte Threads und nur 4 aktive echte Threads; 3 final als Scheduled, 28 Needs Information, 2 Completed. TruckersMP-Sync und alle zugehörigen technischen Stufen liefen; **ein erfolgreiches Gesamtergebnis beweist nicht, dass jeder fällige Reminder gesendet wurde**.
- Dieselbe Run-Ausgabe: Driver Reminder **24h neu 0 / 1h neu 0**, 137 übersprungene Datensätze und eine bereits aktuelle 24h-Nachricht für einen anderen späteren Konvoi. Eigener `kings-convoys`-Quellbereich: **0 aktive berücksichtigte Quell-Events**, deshalb public 0 / intern 0. Diese 2h-/Start-Ankündigungen gelten **für eigene Kings Convoys**, nicht generell für jeden externen Partnerkonvoi.
- [Stündlicher unabhängiger Public-Verifier – Run 44960372022](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44960372022) hat bei seinem aktuellen Scan **0 neue source entries** gefunden. Das alte positive Proof-File für Oktober (Event #35810) ist ein historischer Nachweis, **keine** Bestätigung einer künftigen November-Ankündigung.
- [Central Scheduler – Run 44959337978](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44959337978) erfolgreich, Convoy Workflow als aktiv und mit zuletzt erfolgreichem produktiven Durchlauf bewertet; der Scheduler prüft Pipeline-Freshness, nicht den Event-spezifischen Versandzeitpunkt.

## Unmittelbar relevanter Fall: SHL am 22.11.2026

Im **echten, aus dem GitHub-Run 44958692597 heruntergeladenen Convoy-Report**:
- Öffentliche TruckersMP-Event-ID **36859**; offizielles `meetup_at` **22.11.2026 00:00 UTC = 01:00 MEZ**, `start_at` **01:00 UTC = 02:00 MEZ**.
- Human-authentifizierte Kings Staff-Statusmeldung **Scheduled**, Slot nach vorhandenem Text/Bild **bestätigt**, vom TMP-Sync alle wesentlichen Felder übernommen. Host-Event laut öffentlichem API-Feed zum Prüfzeitpunkt nicht abgebrochen.
- Der Convoy-Center-Thread war **archived=true**. Der Finalizer verarbeitet bisher nur **nicht archivierte, nicht gesperrte** Threads. Deshalb blieb dieser Eintrag trotz erfolgreichem TMP-Sync im finalen Report auf `Needs Information` und ohne gültiges `eventUnix`.
- `convoy-driver-reminders.js` überspringt archivierte, nicht Scheduled oder zeitlich ungeklärte Einträge. Die **1h-Meldung war im letzten geprüften Lauf nicht neu verschickt**. Ob unabhängig davon schon eine ältere oder manuell gesendete Nachricht existiert, ist noch nicht vollständig in der Discord-Nachrichtenhistorie verifiziert.
- **Keine automatische Änderung einer Staff-Freigabe, kein heimliches Unarchive, keine Test-Posts.** Schnelle menschliche Abnahme: Im Convoy-Management-Forum den SHL-Thread gezielt entarchivieren, erhaltenen Scheduled-Status/Slotbild und die offizielle Uhrzeit bestätigen, bestehenden `convoy-reminders`-Post für Event #36859 prüfen und gegebenenfalls kontrolliert manuell informieren. Künftige automatische Trigger erst anhand echter Zustellnachweise abnehmen.

## Neue nachhaltige Diagnose

`convoy-imminent-readiness.js` ist **advisory-only**, importiert den nach autoritativer Synchronisation und Finalisierung ohnehin vorhandenen lokalen Bericht und prüft ausschließlich in den nächsten 24 Stunden fällige, ausdrücklich durch Kings Staff als `Scheduled` bestätigte und aktuell mit TruckersMP abgeglichene Events. Blockierende Gründe werden ohne Personendaten, Rollen-/Thread-IDs, Nachrichtenkörper oder Slot-Bilder in die Actions-Warnungen geschrieben:
- archivierter oder gesperrter Thread, nicht finalisierter Scheduled-Status oder fehlende Event-Zeit,
- noch fehlende Pflichtfelder oder bestätigter Slot mit Bild,
- Zeitabweichung zur aktuell verifizierten TruckersMP-Meeting-Zeit.

Dieses Audit **veröffentlicht keinerlei Discord-Nachricht und repariert keine Eventdaten**. Es markiert `ELIGIBLE_NOT_DELIVERY_PROOF` ausdrücklich nicht als nachgewiesene Zustellung und darf nur **vorhandene** berechtigte Events analysieren. Das read-only Diagnose-Script wird im bestehenden Live-Convoy-Checker **nach** dem offiziellen TMP Sync + Finalizer und **vor** den Notify-/Reminder-Stufen ausgeführt, ohne diese Stufen zu blockieren.

## Weiter offen

1. Ein tatsächlich fälliges Event braucht **direkten Nachrichtennachweis im Zielkanal** und korrekte Event-ID zur Deduplizierung, nicht nur einen erfolgreichen allgemeinen Workflow.
2. Archivierte **zukünftige**, durch Staff bestätigte Events benötigen eine ausdrückliche Kings-Policy: Soll ein Archiv-Flag nur Discord-Inaktivität sein oder die Reminder-Berechtigung entziehen? Bis zur Freigabe bleibt die bisherige Sperre bestehen; das Audit warnt.
3. Legacy-Reminder aus dem alten Kalender und die echten Convoy-Center-Einträge müssen ohne Doppelmeldungen zusammenarbeiten. Der bestehende Duplikatfilter wurde im geprüften Live-Lauf genutzt; Einzelzustellungen für jede Zeitstufe sind noch nicht vollständig nachgewiesen.
4. Ablaufübergreifende Event-Berechtigungen, externe Event-Einladungs-Bots und private Staff-Daten benötigen getrennte autorisierte Prüfung. Keine Freigabe oder Slot-Berechtigung wird aus einem TruckersMP-Event allein erfunden.
