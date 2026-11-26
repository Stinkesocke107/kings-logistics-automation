# Kings Logistics — System- und Funktionsabnahme

**Stand: 26. November 2026.** Zentrale Abnahmeliste für die aktuelle Kings-Logistics-Automation. Diese Liste ist bewusst **nicht** die technische GitHub-Workflow-Übersicht oder der Live-Gesundheitsmonitor. Ein erfolgreich gestarteter Job belegt weder eine fertige Funktion noch eine dauerhaft fehlerfreie Integration.

## Wann sagen wir „System XY ist komplett fertig“?

Nur wenn **alle** zugehörigen Funktionen und Pflichtabnahmepunkte nachweislich erfüllt sind:

1. **Umfang geklärt:** Ziel, Anforderungen, Abgrenzung und Akzeptanzkriterien sind dokumentiert.
2. **Umsetzung komplett:** Keine vereinbarten Pflichtfunktionen fehlen.
3. **Code geprüft:** Automatische Offline-/Regressionstests bestehen.
4. **Verbindungen geprüft:** Abhängige Kings-Systeme und ihre tatsächlichen Datenübergaben funktionieren.
5. **Echtbetrieb geprüft:** Mindestens eine konkrete, real durchgelaufene Eingabe → Verarbeitung → gespeichertes Ergebnis → sichtbare Ausgabe ist bestätigt. Ein einzelner Lauf allein reicht nicht für eine Aussage über dauerhafte Stabilität.
6. **Schutz geprüft:** Rollen, Datenschutz, Verschlüsselung, Fehlverhalten, Wiederholungen und ggf. Rücksetzung funktionieren.
7. **Betrieb geklärt:** Monitoring, verständliche Bedienung, Zuständigkeit, Störungen und Wiederanlauf sind überprüft.
8. **CEO-Abnahme:** Schlussfreigabe und überprüfbare Belege liegen vor.

**Regel:** `COMPLETE` (100 % fertig) gibt es ausschließlich bei vollständigen Nachweisen für **alle** Punkte, ohne offene Blocker und mit ausdrücklicher abschließender Freigabe. Ein nicht geprüfter Punkt bleibt offen; fehlende Nachweise dürfen nicht als bestanden angenommen werden.

## Verständliche Status

| Status | Aussage |
|---|---|
| **NOT_ASSESSED** | Noch nicht einzeln nach dieser Abnahmeliste bewertet. Kann bereits produktiv laufen. |
| **PARTIALLY_VERIFIED** | Mindestens ein Teil funktioniert nachweislich; finale Abnahme steht aus. |
| **COMPLETE** | Alle Funktionen, reale Integration, Sicherheit, Betrieb und CEO-Abnahme nachgewiesen. |

**Wichtig:** Eine grüne GitHub Action, eine grüne Offline-CI und ein grünes Systemmonitoring sind **verschiedene Nachweise**. Keiner ersetzt automatisch die vollständige Systemabnahme. Neue Funktionen oder geänderte Abhängigkeiten erfordern gegebenenfalls eine erneute Prüfung.

## Alle aktuellen Kings-Workflows

Die ausführbare Übersicht ist `kings-system-acceptance.js` und liest die **46** registrierten Workflows direkt aus `kings-workflow-registry.js` ein. Dadurch wird kein Workflow vergessen, wenn wir die Systeme schrittweise durchgehen.

- **46 Workflows inventarisiert**, davon aktuell **0 vollständig abgenommen nach dem neuen Schema**. Das ist keine Aussage, dass die bestehenden Workflows defekt wären: Für die meisten fehlt bisher nur die *separate systematische Einzelabnahme*.
- Die Funktionen werden schrittweise je Bereich (Automation, Backup, Changelog, Convoys, Drivers, HR & Staff, Leadership, Live Data, News, Reports, Security) überprüft.
- Jeder Workflow bekommt seine eigene Einzelfunktionsprüfung; zusätzlich zählen **systemübergreifende** Übergaben und echte Bedienbarkeit. Ein Bereich wird nicht durch einen einzigen erfolgreichen Unterworkflow fertig.
- Startnachweis: `node kings-system-acceptance.js`; die maschinenlesbare Ausgabe enthält nur freigegebene Repository-Verweise, keine Secrets oder privaten Event-Inhalte.

## Event-Systeme als erste detaillierte Abnahme

| System | Momentane Abnahme | Offene Pflichtarbeit |
|---|---|---|
| **#12 Event Capacity** | **PARTIALLY_VERIFIED** | UTC-Regeln und Kapazitätswarnungen offline geprüft; [realer Read-only-Source-to-Staff-Worklist-Nachweis #45901364553](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901364553) bestanden. Keine Originalfreigaben, verifizierten freien Plätze, echten Staff-Entscheidungen oder CEO-Schlussabnahme daraus ableiten |
| **#14 Event History** | **PARTIALLY_VERIFIED** | Synthetische Quellen-/Monatsvalidierung ([PR #195](https://github.com/Stinkesocke107/kings-logistics-automation/pull/195), [CI](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45900507573)) und [realer Read-only-Quellenabgleich](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45900603134) bestanden; originaler vollständiger 24-Monats-Bestand, echte Staff-Entscheidungen, Live-Übergabe und CEO-Abnahme offen |
| **#15 Invitation Tracker** | **PARTIALLY_VERIFIED** | Originales privates Forum und Status-Tags in [Live-Quellenprüfung #45900603134](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45900603134) GET-only bestätigt. Historische Vollständigkeit, tatsächliche Einladungs-/Antwortnachweise, Dashboard-Übergabe und Schlussfreigabe offen |
| **#16 Event Calendar** | **PARTIALLY_VERIFIED** | 12-Monats-Kalenderwarnungen offline geprüft und echte Center-/Legacy-Quellen [read-only abgeglichen](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45900603134); ursprüngliche Staff-Genehmigungen, Holds, echtes Staff-Dashboard-Feedback und CEO-Abnahme offen |
| **#18 Discord Staff Review** | **PARTIALLY_VERIFIED** | Echte Staff-Befehle und verschlüsselte Speicherung bereits nachgewiesen; Webhook-/Timeout-Schutz [offline geprüft](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901257045), abgesicherte überfällige Scheduler-Ausführung [offline geprüft](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901478091) und [im Echtbetrieb nachgewiesen](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901614835). Live-Refresh nach neuer echter Staff-Änderung, Betriebsstabilität, Team- und CEO-Abnahme weiterhin offen |

**#17 Event Booking & Slot Management ist gestrichen.** Es ist weder offene Pflichtaufgabe noch Teil der Akzeptanzprüfung.

### #18 — Was ist tatsächlich bestätigt?

| Teilfunktion | Status | Quelle |
|---|---|---|
| Privater Discord-Kanal + freigegebene Rollen | Bestätigt | [Live-Metadatenprüfung](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45737061788) |
| Menschliche Staff-Nachrichten lesbar + Autorberechtigung | Bestätigt | [Live-Nachrichtenprüfung](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45738190261) |
| Erststart ohne Verarbeitung alter Befehle | Bestätigt | [BOOTSTRAPPED](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45738711922) |
| Echter Staff-Befehl + verschlüsselte Statusspeicherung | Bestätigt | [SOURCE_REVIEWS_RECORDED](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45739168709) |
| Automatischer leerer Lauf ohne versehentliche Änderung | Bestätigt | [NO_NEW_MESSAGES](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45878834923) |
| Neues, übersichtlicheres Event Leadership Dashboard veröffentlicht | Bestätigt | [Dashboard-Erneuerung](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45740141908) |
| Tatsächliche Event-Dashboard-Aktualisierung mit zusätzlichem Discord-GET-Rücklesen der vollständigen sichtbaren Embed-Felder | **Technisch live bestätigt** | [Sichere Rückleseprüfung PR #212](https://github.com/Stinkesocke107/kings-logistics-automation/pull/212), [echter Dashboard-Lauf #45907968169](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45907968169) – kein Nachweis einer **neuen** Staff-Entscheidung |
| Gespeicherter AES-verschlüsselter #18-Staff-Review-Status → aktuelle echte Discord-Event-Dashboard-Anzeige | **Technisch live bestätigt** | [Sichere GET-only-Prüfung PR #218](https://github.com/Stinkesocke107/kings-logistics-automation/pull/218), [erfolgreicher produktiver Dashboard-Lauf #45909541123](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45909541123); kein neuer menschlicher Staff-Befehl und keine Originalgenehmigung behauptet |
| #12 Capacity / #16 Calendar / #14 History / #15 Invitation Tracker → #18 Discord Review → Dashboard | **Offline integriert und getestet** | [Automatisierter Integrationstest](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45899041605) – nur synthetische Daten, keine echten Eventänderungen |
| Automatischer Dashboard-Refresh *nach einer späteren echten neuen Staff-Änderung* | **Offen** | Technische Verdrahtung ist implementiert, aber noch kein eigener Live-Durchlauf nachgewiesen |
| Zusammenhängender echter Workflow mit #12, #14, #15, #16 | **Offen** | Fachliche und technische Integrationsabnahme ausstehend |
| Bedienbarkeit, verständliche Fehlermeldungen, Betriebsübergabe | **Offen** | Rückmeldung/Abnahme des Event-Teams und CEO nötig |

**Keine künstlichen Prozentwerte:** Die bereits getesteten Teilfunktionen sind nicht gleich einer prozentualen Gesamtfertigstellung. Sicherheits-, Funktions- und Live-Abnahmekriterien sind Pflicht; nicht nur eine gewichtete Fortschrittsanzeige.

## Fahrer und HR / Staff — zweite Einzelfunktionsabnahme

**Vier Fahrer-/HR-/Staff-Workflows und zusätzlich der kartenunabhängige Live Tracker sind nun einzeln erfasst.** Gemeinsam mit Event-System #18 sind **sechs von 46 registrierten Workflows** formal bewertet, weiterhin **kein einziger vollständig abgenommen**. „Nicht bewertet“ bei den anderen 40 ist keine Ausfallmeldung. Die maschinenlesbare Funktionsliste und acht Pflicht-Gates stehen in `kings-system-acceptance.js` unter `operationalSystems`.

| System / zugehöriger Workflow | Nachweis im echten Betrieb | Offen bis zur Abnahme |
|---|---|---|
| **Driver Updates** — `driver-updates.yml` | [Produktionslauf #45901569737](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901569737): echte VTC-Mitglieder abgerufen, bei unverändertem Bestand keine erfundenen Join-/Leave-Meldungen | Echte Mitgliedsänderung → verschlüsselter Zustand → korrekte Discord-Mitteilung, Abgleich mit Driver Management, Driver-Team- und CEO-Abnahme |
| **Driver Management** — `driver-management.yml` | [Produktionslauf #45902760777](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45902760777) nach Sicherheitskorrektur erfolgreich; [Git-Konfliktschutz offline getestet](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45902677492) | Echte LOA-Anfrage/Beendigung, gesicherter Status, Management-Ansicht, dokumentierter Recovery-Prozess und CEO-Freigabe |
| **HR Leadership / Probation** — `hr-leadership.yml` | [Produktionslauf #45902760787](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45902760787) erfolgreich; [verschlüsselte HR-Statusänderung bei Git-Konflikt fail-closed](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45902677492) geprüft | Neuer echter autorisierter Probation-Befehl mit dauerhaftem Status und privater Leadership-Ausgabe; HR-Team-, Recovery- und CEO-Abnahme |
| **Staff Management** — `staff-management.yml` | [Produktionslauf #45902761042](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45902761042) erfolgreich; [kaputte verschlüsselte Staff-Historie und verlorener Git-Commit blockiert](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45902677492) | Echter Staff-Beitritt/Rollenwechsel/Austritt, bestätigte öffentliche Discord-Ausgabe, Zuständigkeiten, Wiederanlauf und CEO-Freigabe |

**Sicherheitskorrektur PR #201:** Früher konnten Driver Management, HR Leadership und Staff Management einen fehlgeschlagenen Git-Safe-Push als Warnung behandeln und trotzdem mit „Erfolg“ enden. Jetzt darf der gesicherte Commit nicht stillschweigend gelöscht oder als erfolgreich ausgegeben werden. Ebenso muss eine bereits vorhandene, aber kaputte Staff-Historie hart fehlschlagen und darf **nicht** als neuer erster Staff-Stand interpretiert werden. Die Regression verwendet ausschließlich isolierte lokale Test-Git-Repositories, keine echten Mitglieder, Rollen oder Personalentscheidungen.

**Keine vollständige Abnahme:** Die reinen erfolgreichen regelmäßigen Abfragen belegen keine echten neuen Personalereignisse. Keine Staff-Entscheidungen, Probation-Bestätigungen, Discord-Nachrichten, Loyalty-Rollen oder LOA-Status wurden zu Testzwecken erzeugt. Verbleibende echte End-to-End- und Betriebsnachweise sowie eine ausdrückliche CEO-Schlussfreigabe bleiben als Pflicht offen.

### Weitere Nachweise für Driver LOA, HR Probation und Staff Updates (26.11.2026)

**Command-Sicherheit – echte Produktionscodepfade und Offline-Regressionsnachweise:**

- **Driver LOA und HR Probation – kein stilles Überspringen:** [PR #203](https://github.com/Stinkesocke107/kings-logistics-automation/pull/203) und [Test #45903917911](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45903917911) sichern das Abrufen von bis zu 20 aufeinanderfolgenden Discord-Nachrichtenseiten ab. Der vorhandene letzte Cursor muss erreicht sein; beschädigte/nicht sortierte IDs und unbegrenzt lange Rückstände werden ohne Cursorfortschreibung abgewiesen. Bei einem anfangs leeren Kanal bleibt ein echter `0`-Startcursor erhalten. Die regulären [Driver-Management-Ausführung #45904002762](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45904002762) und [HR-Ausführung #45904002869](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45904002869) waren nach dem Merge erfolgreich. Dies ersetzt keinen echten neuen LOA-Antrag.
- **HR Probation – echte Rollenberechtigung vor einer Änderung:** [PR #204](https://github.com/Stinkesocke107/kings-logistics-automation/pull/204) und [Sicherheitstest #45904130702](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45904130702) prüfen die tatsächliche Discord-Mitgliedschaft und zugelassene HR-/Management-/CEO-Rollen des menschlichen Autors. Unberechtigte, bearbeitete und Webhook-Nachrichten dürfen keine HR-Statusänderung auslösen. Bei ausgefallener Rollenprüfung wird kein Bearbeitungscursor gespeichert. Der [reale HR-Workflow #45904230707](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45904230707) war anschließend erfolgreich; ein neuer autorisierter menschlicher Fall wurde dadurch **nicht** als geprüft behauptet.
- **Öffentliche Staff-Updates – verschlüsselte Veröffentlichungshistorie:** [PR #205](https://github.com/Stinkesocke107/kings-logistics-automation/pull/205) und [CI #45904297317](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45904297317) blockieren das stille Zurücksetzen bei kaputtem JSON, falscher Verschlüsselungsstruktur und ungültiger Deduplizierungs-Historie. Nur eine tatsächlich fehlende Datei erlaubt den ersten Start. Nach der Änderung war der [Staff-Management-Live-Lauf #45904393705](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45904393705) erfolgreich. Ein echter neuer Staff-Beitritt, eine Beförderung oder ein Austritt mit bestätigter Discord-Nachricht bleibt gesondert nachzuweisen.

**Abnahmegrenze:** Dies sind **nachgewiesene technische Schutzfunktionen**, keine autorisierten echten Personalereignisse, keine Garantie dauerhaft funktionierender externer APIs und keine CEO-Abnahme. Die betroffenen Systeme bleiben `PARTIALLY_VERIFIED`. Der separat offene Live-Tracker-/Kartenprovider-Blocker wird nicht durch grüne HR-Tests behoben.

## Live Tracker — automatischer Kartenbetrieb mit offiziellem Fallback (Entscheidung aktualisiert 26.11.2026)

**Aktuelle, vom CEO bestätigte Zielentscheidung:** Kings Live Tracker soll **automatisch zwischen vollständigem Kartenbetrieb und offiziellen kartenfreien Daten wechseln**. Sobald die Karten-API wieder verfügbar ist, sollen die einzelnen Kings-Online-Fahrer, Server, optionalen Orte, Profil-/Kartenlinks sowie die synchronisierten Live-Statistics und Central Overview zurückkommen. Bei einer Störung müssen die real verfügbaren VTC-/Server-Zahlen ohne erfundene Kings-Online-Werte weiterlaufen. `.github/workflows/live-tracker.yml` nutzt deshalb `KINGS_TRACKER_SOURCE_MODE: 'auto'`.

**Sicheres Umschalten:** Jeder planmäßige Lauf startet zunächst eine kleine, schreibgeschützte Karten-API-Testabfrage mit Timeout, Umleitungssperre und Antwortgrößenlimit. **Erst danach** wird das ursprüngliche vollständige Kings Live-Tracker-Programm auf allen aktiven Servern ausgeführt. Nur eine erfolgreiche Komplettprüfung erlaubt echte Kings-Online-Messungen und die getrennten vollständigen Updates für Statistics, Central Overview und `verified-live`-Nachweis. Scheitert schon der Vorabtest oder eine einzelne Serverprüfung, übernimmt die offizielle TruckersMP-API die bestehenden drei Discord-Anzeigen, ohne historische Player-Snapshots zu löschen. Der nächste planmäßige Lauf versucht automatisch wieder die Karte. Die Probe allein ist niemals ein Beleg für einen erfolgreichen vollständigen Live-Tracker.

- **Erfolgreiche echte Quell- und Anzeigeprüfung:** [Kings Live Systems #45905430735](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45905430735), **26.11.2026 um 22:32 UTC**. Der Karten-Trakker-Schritt wurde planmäßig **übersprungen**, der offizielle kartenfreie Schritt und alle drei bestehenden Discord-Nachrichten waren erfolgreich. Die gesicherte Git-Persistenz war erfolgreich.
- **Tatsächlich gespeicherte offizielle Zahlen dieses Stichprobenzeitpunkts:** 110 Kings-VTC-Mitglieder, 1.509 TruckersMP-Spieler insgesamt (1.458 ETS2 / 51 ATS) auf 10 aktiven TMP-Servern. **Die 1.509 sind keine Kings-Online-Fahrer.**
- **Eigene aktuelle Datenquelle:** `data/live-tracker-official.json` enthält ausschließlich neu geprüfte, nicht personenbezogene VTC-/Server-Aggregate und ausdrücklich `kingsOnline: null`. `data/live-tracker-snapshot.json` und die Kings-eigenen historischen Spieler-/Spitzenstatistiken werden nicht mit unbewiesenen Nullwerten oder globalen Spielern überschrieben.
- **Monitor getrennt – jetzt auch live nachgewiesen:** [Monitoring-CI #45905628464](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45905628464) prüfte Quelle und Sicherheitsgrenzen. Die echte [Kings-System-Monitor-Ausführung #45905733795](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45905733795) speicherte einen Health-Report als GitHub-Artefakt. Dessen überprüftes Feld `data.officialTracker` meldet `mode: map-independent`, `status: verified`, `source: official-vtc-and-servers`, VTC 110 und `kingsOnline: null`; gleichzeitig blieb der Gesamtstatus korrekt `UNHEALTHY` (vier kritische Punkte wegen historischer Kartenstatistik und zwei externen Kartenprovidern). Damit ist die **erfolgreiche Erkennung im echten Monitor** belegt, ohne die anderen Core-Blocker zu verstecken.
- **Noch offen für COMPLETE:** nachgewiesener echter automatischer Wiederanlauf eines vollständig funktionierenden Kartenproviders inklusive aller synchronisierten Discord-Ausgaben, stabile wiederkehrende Wechsel zwischen beiden Modi, Staff/Driver-Operations-Übergabe und ausdrückliche CEO-Freigabe. Bis die externe Karten-API zurückkehrt, ist die offizielle Fallback-Funktion bereits separat nachgewiesen. Die weiterhin gestörten alten Karten-/Statistik-Prüfungen werden nicht künstlich als erfolgreich erklärt.

**Abnahme:** `LIVE_TRACKER_OFFICIAL` / Workflow `live-tracker.yml` = `PARTIALLY_VERIFIED`. Der neue offizielle Tracker arbeitet technisch bereits im Echtbetrieb; es gibt **keinen** fingierten Kings-Online-Wert und **keine** vorgezogene finale Systemfreigabe.

## Nächste Reihenfolge

**Zuerst #18 sauber abschließen:** realen Dashboard-Refresh nach einer späteren Änderung nachweisen, dann den Prozess und die sichtbaren Status mit Event-Team/CEO abnehmen. Anschließend #12, #14, #15, #16 auf ihre echten Quellen, Funktionen und Übergaben prüfen. Dann die anderen Kings-Logistics-Bereiche anhand derselben Kriterien durchgehen.

**Wartung:** Bei jeder größeren Änderung die zugehörigen Test-, Live- und Bediennachweise aktualisieren. Ein ehemaliger Abschluss gilt nicht automatisch auch für neue Funktionen, Rollen, Schnittstellen oder Event-Regeln. Drittanbieter-Plattformen und Zukunftsprojekte (Kings Website / Driver Hub, RealmMP) haben separate Abnahmegrenzen.

## #18 – Ergänzender Integrationstest (26.11.2026)

Die separate Regression `tests/event-operations-cross-system-acceptance.test.cjs` verbindet die tatsächlich vorhandenen Codepfade mit **synthetischen** und streng validierten Quellen:

- #12 + #16: künftige UTC-Kalenderwarnungen und Kapazitäts-Quellenkonflikte bleiben prüfpflichtige Hinweise;
- #14: historische Originalnachweise und Prioritätsmonate fließen in die Review-Aufgaben, ohne Vergangenheitsfreigaben zu erfinden;
- #15: private Invitation-Traces und fehlende Event-Links erscheinen in der Staff-Liste, ohne RSVP- oder Einladungsergebnisse zu zertifizieren;
- #18: ein freigegebener Discord-Autor kann mehrere unverwechselbare Review-Codes in den AES-GCM-gesicherten Staff-Status schreiben, die im Leadership Dashboard als **In Review** erscheinen;
- **Sicherheitsgrenzen:** Unberechtigte Autoren bewirken keine Reviewänderung; geänderte Quelldaten verlangen `RECHECK_REQUIRED`. Alle simulierten Discord-Abfragen bleiben GET-only, und keine Originalquelle wird geändert.

Dies ist ein **echter Code-Integrationstest**, jedoch ausdrücklich **kein realer Discord-Live- oder CEO-Schlussabnahmenachweis**. Der automatische Dashboard-Refresh durch eine **spätere echte** Statusänderung und die Teamabnahme bleiben offen.

## #12 — Neue Funktions- und Quellenprüfung (26.11.2026)

Die zusätzliche Regression `tests/event-capacity-functional-acceptance.test.cjs` vergleicht **dieselben synthetischen Convoy-Ansprüche** in den tatsächlichen Implementierungen für operationales Planning, zwölfmonatigen UTC-Calendar, 24-monatige History/Leadership-Übernahme und Event Operations:

- **3 source-claimed Convoys pro UTC-Tag insgesamt**, unabhängig vom Typ; **20 Partner + 20 External pro UTC-Monat jeweils separat**, Kings ohne Monatsdeckel;
- Warnung bei **weniger als 120 Minuten** zwischen Abfahrten auch über UTC-Mitternacht/Monatswechsel, ohne automatische Event-Ablehnung oder Umbuchung;
- vollständiger Abgleich von Convoy Checker vs. Overview und fail-closed bei alten, falschen oder widersprüchlichen Quelldaten;
- eingefrorene Legacy-Ansprüche bleiben separat, dürfen weder die Zahl freier Plätze erhöhen noch einen bestätigten Hold freigeben;
- Statusschritte melden **Prüfbedarf** an das Event-Team, niemals automatisch bestätigte Kapazität, Originalgenehmigungen, Ticket-Buchungen oder Einladungsentscheidungen.

**Beleg für die Funktionsprüfungen:** [CI #45899560178](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45899560178) — 734/734 Tests bestanden.

**Zusätzlicher echter Live-Nachweis:** Der echte [Convoy Checker-Lauf #45897888431](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45897888431) meldete `SOURCE_CALENDAR_READONLY_READY` im Schritt „Check read-only Event Calendar source from finalized Convoy Center“. Das bestätigt die erfolgreiche *Read-only-Datenübergabe innerhalb dieses einen Laufs*, **keine** dauerhaft gültige Event-Verfügbarkeit, keinen ursprünglichen Staff-Abgleich und keine automatisch freigebbaren Event-Slots.

**Noch erforderlich für #12 COMPLETE:** Reale, vollständig nachvollzogene Quelle → Staff-Prüfung → eindeutige Rückmeldung einschließlich Fehlerszenario, Verantwortlichkeit und Recovery; separate Funktions-/Sicherheits-/Betriebsabnahme samt CEO-Freigabe. **System #17 bleibt gestrichen**, kein neues Booking/Slot-System als Voraussetzung einplanen.


## #12 / #18 — zusätzliche Nachweise und Betriebsschranken (26.11.2026)

- **#12 genuine source-to-triage proof:** [GitHub Actions #45901364553](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901364553) printed `CAPACITY_READ_ONLY_SOURCE_RECONCILED`. The actual reconciled Convoy Center + Calendar data was transformed into the existing Event observation and human Staff worklist. The new assertion verifies that **all nonzero warning classes** (daily and monthly limits, under-two-hour gaps, event type classification, unresolved calendar days and frozen Legacy holds) have corresponding worklist items with matching counts. This is a real read-only technical integration proof, **not** evidence of Staff approvals or booked/free capacity.
- **#18 source safety:** [CI #45901257045](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901257045) tests rejection of webhook-impersonated commands and bounded, redirect-rejecting Discord GET requests.
- **#18 delayed Cron recovery:** [CI #45901478091](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901478091) tests a Central Scheduler fallback with a private mode gate: **only** previously owner-enabled `ENABLED` / `VERIFY_ONLY`, 30-minute overdue threshold, active-run suppression, 15-minute cooldown, and no bypass of source access checks. The live [Central Scheduler recovery #45901564388](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901564388) did actually dispatch [Discord Staff Review #45901614835](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45901614835), which succeeded with `NO_NEW_MESSAGES` and left encrypted state unchanged. This proves one overdue recovery and safe idle, **not** an accepted later Staff change or private Dashboard refresh.
- **Still pending:** an authorized new real Staff review after the latest integration, saved encrypted Event state, confirmed downstream existing Leadership dashboard update and team/CEO approval. Historical source claims and operator checkmarks must not be treated as original decisions, free capacity, RSVPs or Events booked. **#17 remains cancelled.**

## Backup & Recovery — neue Einzelfunktionsabnahme (27.11.2026)

Die Sicherungs- und Wiederherstellungsfunktion `backup-recovery-verification.yml` ist zusätzlich zum bisherigen Inventar als **PARTIALLY_VERIFIED** erfasst. `Core Backup` und der nur manuell erlaubte `Core Recovery` bleiben unabhängige Workflows und erben keine Gesamtfreigabe.

- **Umgesetzt:** [PR #220](https://github.com/Stinkesocke107/kings-logistics-automation/pull/220) ergänzt Sicherungsquellen für `scripts/`, `tests/`, `docs/`, bewahrt die bestehenden Schutz-Ausschlüsse und verhindert das Folgen symbolischer Links aus dem Repository heraus.
- **Echter isolierter Restore:** [GitHub-Actions-Lauf #45910026083](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45910026083) bestätigt **441/441 wiederhergestellte Dateien**, **441/441 SHA-256-Prüfungen**, **48/48 erforderliche kritische Dateien**, vollständige Prüfung wichtiger Skripte, Tests und Betriebsdokumente sowie Entfernung der temporären Restore-Umgebung. Status **HEALTHY**.
- **Nicht dadurch nachgewiesen:** kontrollierte Wiederinbetriebnahme im Ernstfall, Wiederherstellung externer Dienste und gesicherte Schlüssel-/Secret-Übergabe. Ein isolierter Wiederherstellungstest darf keine fiktive reale Katastrophen-Recovery oder CEO-Abnahme auslösen.
- **Offen für COMPLETE:** tatsächlicher autorisierter Recovery-/Wiederanlauf-Nachweis, Operator-Runbook und Schlüsselverwahrung, Sicherheits-/Betriebsübergabe sowie ausdrückliche CEO-Endfreigabe.



## Zusatz-Einzelprüfung — 27. November 2026 (Sicherheit und Betriebsmonitoring)

Die folgenden drei zuvor ausschließlich inventarisierten Workflows besitzen jetzt **eigenständige, konkret belegte positive Teilfunktionen** in der maschinenlesbaren Systemabnahme. Die ursprünglichen älteren Zahlen auf dieser Seite bleiben als historische Zwischenstände stehen.

| Einzelworkflow | Konkreter positiver Nachweis | Weiter offen |
|---|---|---|
| `system-tests.yml` — Offline System Verification | [GitHub-PR-Test #45910987965](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45910987965): echte Syntaxprüfung, isolierte Regressionen und Integrationstests erfolgreich, individuelle 46er-Abschlussübersicht erzeugt. | Vollständige Einzelfunktionsabdeckung, tatsächlicher Betrieb, Betreiberübergabe, CEO-Abnahme. |
| `git-state-hardening-verification.yml` — Git State Hardening | [Git-/State-Lauf #45910026256](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45910026256): isolierter Conflict-/Rebase-/Safe-Push-Testbericht mit neun von neun technischen Teilprüfungen erfolgreich. | Echte vollständige Recovery-Praxis bei konkurrierenden produktiven Schreibvorgängen und Betreiberfreigabe. |
| `system-monitoring.yml` — System Monitoring | [Produktionslauf #45910473380](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45910473380): 46-Workflow-Überwachung, vier echte kritische Core-Befunde weiterhin **UNHEALTHY**, 13/13 technische Discord-Permissions und Update der vorhandenen Monitor-Nachricht. | Unabhängiger Discord-GET-Readback des Monitorinhalts, echter Alarm-/Entwarnungszyklus, Recovery, Operator-/CEO-Abnahme. |

Damit sind **10 von 46 Workflows einzeln teilweise verifiziert, 36 noch nicht individuell nach dem Abnahmeschema bewertet und 0 abschließend freigegeben.** Die fünf separat erfassten Event-Fachsysteme #12/#14/#15/#16/#18 bleiben teilweise geprüft. Insbesondere die externen Map-API- und Freshness-Blocker werden nicht herabgestuft oder als gelöst markiert; die Zahlen sind keine funktionalen Prozentwerte.



## Zusätzliche Einzelabnahmen — 27. November 2026 (Events, Staff und Leadership)

Fünf weitere bisher nicht individuell bewertete Workflows wurden anhand **konkreter produktiver Läufe** als `PARTIALLY_VERIFIED` aufgenommen, ohne eine Echtentscheidung oder vollständige Betriebsfreigabe zu behaupten.

| Workflow | Nachweis | Verbleibende wichtige Lücke |
|---|---|---|
| `convoy-checker.yml` | [Realer Convoy-Center-Lauf #45909598171](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45909598171): originale Quellen verarbeitet, source-only UTC-Calendar-Check bestanden und bestehende Discord-Übersicht aktualisiert. | Keine authentische neue Genehmigung nachgewiesen; ein gleichzeitig aufgetretener Git-Baseline-Konflikt wurde als Warnung behandelt und erfordert gesonderte Recovery-Abnahme. |
| `convoy-announcement-verifier.yml` | [Realer Prüflauf #45911305606](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45911305606) hat einen älteren veröffentlichten Kings Convoy anhand der tatsächlichen Discord-Nachricht bestätigt. | In der jüngsten Prüfung gab es **0** neu fällige Quellen; ein neuer Versand, Dubletten- und Retry-Fall bleibt offen. |
| `staff-leadership-live-overview.yml` | [Realer Staff-Lauf #45908590431](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45908590431): bestehende Staff-Hierarchie-Nachricht aktualisiert, Message-ID erhalten, Zustand sicher in Git persistiert. | Reale neue Beförderung oder Austritt mit unabhängiger Rückleseprüfung fehlen. |
| `leadership-dashboard.yml` | [Realer Dashboard-Lauf #45909541123](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45909541123): vorhandene fünf konsolidierte Discord-Ausgaben aktualisiert; aktuellen AES-geschützten Event-Review-Zustand in der sichtbaren Event-Ausgabe mittels Discord-GET bestätigt. | Neues Staff-Kommando nach Integration, vollständige fachliche Quellen-Matrix und Freigabe fehlen. |
| `leadership-dashboard-verification.yml` | [Reale Read-only-Überprüfung #45909350372](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45909350372): fünf Leadership-Inhaltsverträge und aktuelle Public-/Event-Publikationen geprüft. | Vier historische Legacy-Leadership-Nachrichten waren **NOT_VISIBLE** und sind keine bestätigten Auslieferungen. |

**Aktuelle Bilanz: 15/46 einzeln teilverifiziert, 31/46 noch nicht einzeln bewertet, 0/46 vollständig freigegeben.** Alle Event- und Organisationssysteme behalten ihre offenen realen E2E-, Fehlerbehandlungs-, Team- und CEO-Gates. Die externen Core-Blocker bleiben ungeändert.
