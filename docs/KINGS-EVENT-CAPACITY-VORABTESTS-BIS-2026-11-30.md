# Kings Logistics — Event Systems Vorabtests bis 30.11.2026

**Stand: 25.11.2026. PR #143 ist DRAFT. Keine Freigabe für produktive Änderungen.**

## CEO-Hinweis und Teststrategie

Der CEO hat angegeben, dass die Kings-Systeme bis einschließlich **30.11.2026 nicht regulär funktionieren**. Dies ist die **vom CEO gemeldete Wartungs-/Störungssituation**, keine vom Code oder Discord unabhängig bestätigte Ausfallmessung.

**Neue Arbeitsweise:** Fehler werden sofort während jeder Entwicklungsphase getestet und behoben. Der Testlauf darf nicht mit einer produktiven Freigabe verwechselt werden. Wir testen jetzt ausgiebig **offline**, mit synthetischen Konvoi-/Tracker-Daten und bestehenden privaten Prüfregeln. Echte Discord-Leserechte, Live-Schreibtests, Bots, Berechtigungsänderungen, Produktiv-Merges oder neue Secrets benötigen separat vereinbarte sichere Schritte.

## Teststufen

| Stufe | Jetzt ausführbar? | Umfang | Erfolg bedeutet | Erfolg bedeutet NICHT |
| --- | --- | --- | --- | --- |
| A — Syntax und bestehende Software | Ja | Node-Syntax, bestehende Unit- und Integrationstests in Draft PR CI | Software bleibt regressionsfrei | Discord-Bot online oder Events zugänglich |
| B — Systemübergreifende Offline-Szenarien | Ja | Convoy Center, Event Invitation Tracker, Legacy-Quellen, Staff-Jahreskalender und bestehende signierte Holds | Simulierte Daten werden korrekt getrennt und überprüft | Alte Discord-Nachrichten authentifiziert |
| C — Tatsächlicher vorhandener Legacy-Import | Ja, nur lesend | `data/legacy-convoys.json`: 115 eingefrorene Einträge, sechs Monatssourcen, 111 Kings-Slot-Nachweise, 1 Quellverlust | Lokale historische Importstruktur ist konsistent | 111 formelle angenommene Einladungen |
| D — Originale private Discord-Quellen | In dieser Chat-Sitzung nicht verfügbar | Aktiver Convoy Center Forumkanal, alte Kanäle, archivierte und gelöschte Threads, Statusänderungen und Staff-Entscheidungen | Nach autorisiertem Quellenzugriff möglich | Vollständigkeit ohne Erreichbarkeit/Archivbelege |
| E — Abgesicherter privater End-to-End-Test | Nicht ohne separate Freigabe | Restriktive Authentisierung, echte Berechtigungsprüfung, unabhängige Backups/Restore und zwei Reviewer | Private Testumgebung nach externen Nachweisen validiert | Produktionsfreigabe |
| F — Live-Freigabe | Nein | Produktive Kommunikation/Schreiboperationen | Nur nach expliziter CEO-Freigabe | Niemals aus bestandenen Offline-Tests automatisch abzuleiten |

## Neu: private Prelaunch-Checkliste im Code

`event-capacity-prelaunch-diagnostics.js` liefert eine **read-only** Matrix aus sieben Systemen. Sie konsumiert die bereits vorhandene private Cross-System-Brücke und prüft zusätzlich:

- Pro Quellkanal gemeldete vs. gelistete Gesamt-Threadzahl.
- Pro Quellkanal gemeldete vs. gelistete **archivierte** Threads.
- Pro Quellkanal gemeldete vs. gelistete **gelöschte** Threads.
- Fehlt das behauptete Archiv-/Lösch-/Edit-Review, wird dies separat sichtbar.
- Ein nicht angebundener Event Invitation Tracker wird nicht als funktionsfähig ausgegeben.
- Der 30.11.2026 gilt im Testbericht nur als **nutzerseitig angegebene Wartungsgrenze**. Der 01.12.2026 löst **keine automatische Freigabe** aus.
- Kein grüner Softwarecheck darf `freeSlotsCertified` oder `safeToActivate` auf wahr setzen.

Die bereits vorhandenen Quellen- und Kalenderregeln werden wiederverwendet, statt eine neue unabhängige Eventbuchung zu erfinden. Der Berichtsinhalt ist privat, anonymisiert und enthält keine einzelnen Discord-IDs, Nachrichteninhalte, Tokens, Routen, Staff-Namen oder personenbezogene Daten.

## Konkrete Fehlertypen, die wir früh finden wollen

1. Eingeladener Konvoi erscheint mehrfach im Center, in alten Monats-Channels oder im Tracker.
2. Datum oder Kategorie wurde in einem System verändert, in anderen nicht.
3. Die archivierte/gelöschte Threadzahl passt nicht zu den vorhandenen Datensätzen.
4. Ein Thread ist nicht lesbar; ältere Importstände werden dadurch nicht stillschweigend gelöscht.
5. Ein Kings-Slotbild wird irrtümlich als formell angenommene Einladung behandelt.
6. Staff-Klassifikation und tatsächlich genehmigter Eventstatus widersprechen sich.
7. Ein Konvoi wird verschoben; ältere bestätigte Termine verschwinden aus dem Prüfkalender.
8. Ein Backup-/Highwater- oder Berechtigungsnachweis fehlt.
9. Im Kalender steht vermeintlich `Available`, obwohl die Originalhistorie lückenhaft ist.
10. Ein fehlender Tracker wird als erfolgreich angebunden gemeldet.

## Was ab 01.12.2026 sinnvoll ist

**Nur nach neuer Zustandsprüfung:** erst einen nichtschreibenden Echt-Zugriffstest des Bots und der berechtigten Convoy-Quellen durchführen; anschließend die alten Event-Monats-Channels und den Outbound Tracker mit einem autorisierten privaten Leser untersuchen. Fehlende gelöschte Inhalte sind als `nicht rekonstruierbar/prüfbedürftig` zu kennzeichnen.

Unabhängig davon muss der CEO separate Freigaben für eingeschränkte private Pilot-Zugriffe, echte E2E-Schreibtests und eine spätere Produktivschaltung erteilen. **GitHub PR #143 bleibt bis dahin ungemergt.**
