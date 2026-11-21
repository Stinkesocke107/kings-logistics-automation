# Kings Convoy Center – archivierte genehmigte Events und Driver-Reminder (22.11.2026)

## Verbindliche Unterscheidung

**Ein Discord-Thread kann durch Inaktivität automatisch archiviert werden. Das ist keine Kings-Event-Absage, kein Entzug einer durch Kings Event Leadership ausgesprochenen Freigabe und kein Entzug des bestätigten Slot-/Parking-Nachweises.** Eine explizite aktuelle autorisierte Staff-Entscheidung bleibt maßgeblich. Ein von Staff gesperrter/locked Thread bleibt dagegen von dieser Recovery ausgeschlossen. Der Bot öffnet **niemals** archivierte Threads automatisch.

## Produktionsreparatur

Die bestehende Kette bleibt: `convoy-checker.js` → offizieller TMP Event API Sync → `convoy-finalize.js` → Read-only Readiness Audit → `convoy-driver-reminders.js` → Convoy Overview.

Für ein **archiviertes, zukünftiges** Convoy-Center-Event wertet der Finalizer jetzt die aktuellen Quellen **lesend** aus, genau dann, wenn:
- das Event eindeutig (aktuell numerische TruckersMP Event-ID) ist und nicht als Duplikat, Test oder fehlerhafter Datensatz vorliegt,
- eine **von Kings berechtigter Event-Leitung verfasste** jüngste autorisierte Statusmeldung `Scheduled`/Approved vorliegt (Rollenbeleg und Autor-Identität),
- das Original-Event `id`/`meetup_at` nach einem frischen erfolgreichen offiziellen API-Abgleich eindeutig und in der Zukunft liegt, ohne bekannte öffentliche Absage,
- der Discord-Thread nur `archived`, **nicht** `locked` ist.

Die vollständige eigentliche Reminder-Freigabe wird **zusätzlich** validiert: finale `Scheduled`-Entscheidung, alle Kings-Pflichtfelder, bestätigter Slot und originales Bild, gültige Eventzeit mit maximal einer Minute Abweichung zur offiziellen Meetup-Zeit. Ohne ausreichenden Beleg folgt **kein** Reminder. Ein archiviertes Original-Slotbild muss live als Discord-Anhang abrufbar bleiben; ein bloß zwischengespeicherter veralteter CDN-Link ist kein ausreichender Beleg.

**Der Finalizer schreibt in archivierte Threads keine Discord-Nachricht und ändert dort keine Status-Tags.** Der intern berechnete finale Event-Status kann dennoch zu `Scheduled` und zu einer gültigen Zeitzone werden, so dass die Overview nun statt `time=pending` den echten Meeting-Zeitpunkt ausweisen kann.

## Reminder-Takt und Duplikate

- `convoy-driver-reminders.js` schickt wie bisher **24h** beim Eintritt ins 24-Stunden-Fenster, **1h** beim Eintritt ins 1-Stunden-Fenster (jeweils zur Meetup-Zeit). GitHub kann Runs verzögern, daher kein Anspruch auf punktgenauen Zeitpunkt.
- Der Versand erfolgt ausschließlich in `convoy-reminders` mit dem genehmigten **Convoy Driver** Role-Mention und validiertem Kings Slot-Bild.
- Der vorhandene Verlauf wird auf die gleiche Event-ID und Reminder-Stufe geprüft. Hat ein archivierter Event bereits eine passende Erinnerung mit **demselben Meeting-Zeitpunkt**, wird diese bestehende Nachricht **nicht erneut gepostet oder geändert**. Bei Zeitabweichung zum bestehenden Reminder wird **fail-closed** gewarnt; eine manuelle Event-Leitungsentscheidung ist erforderlich.
- **Cancelled**, **Completed**, nicht genehmigte, gesperrte, doppelte, vergangene, unvollständige oder nicht frisch verifizierbare Events lösen keine archivierten Reminder aus.
- Die alten Kalender-Events werden nicht automatisch als neue Kings-Freigaben behandelt; die bestehende Legacy/Duplicate-Logik bleibt separat.
- Das eigene `kings-convoys`-Forum mit 2h-/Starting-Now-Public-Ankündigungen bleibt eine **separate Routine für eigene Kings Convoys**; die Reparatur ändert sie nicht.

## Nachweise, Aufräumen und Grenzen

- Der SHL-Einmalversand für Event #36859 wurde am 22.11.2026 bereits über den originalen Kings-Bot nach Discord-POST + anschließendem Discord-GET bestätigt: https://discord.com/channels/1114967437788577792/1550997669596631200/1573843569318568108.
- Die einmalige `[shl-reminder-36859]`-Push-Sonderfreigabe und ihr Skript wurden **aus der aktiven Hauptversion entfernt**. Historische GitHub PRs #135/#136, Läufe und Issue #134 bleiben als Auditevidence erhalten.
- Die neu hinzugefügten **isolierten End-to-End-Sandbox-Tests** simulieren Discord-/TruckersMP-APIs und dürfen keinerlei echte Nachrichten, Pings, Rollenzuweisungen oder Thread-Änderungen auslösen. Sie decken freigegebene archivierte Events, idempotente Reminder, fehlendes Slotbild, Locked, Public Cancellation und fehlende berechtigte Staff-Freigabe ab.
- Ein grüner Offline-Test ist **kein tatsächlicher neuer produktiver Discord-Zustellnachweis**. Der erste reguläre Live-Lauf nach Merge muss für den Event-spezifischen Zeit-/Freigabe-Status und tatsächliche Message-ID/History separat geprüft werden. Bestehende historische 1h-Belege werden nicht neu veröffentlicht.
