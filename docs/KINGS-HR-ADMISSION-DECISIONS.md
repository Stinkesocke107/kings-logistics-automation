# Kings Logistics — geschützte HR-Freigaben für Driver-Aufnahmen und Rückkehrer

**Entwurf mit vorbereiteter, rein lesender Technik · 21. November 2026**

## Was damit gelöst wird

Das bestehende **private Kings Driver Identity Register** ist verbindlich für Discord-ID, Original-Kings-Beitrittsdatum und optional geprüfte TruckersMP-/HaulMP-/TruckLineMP-IDs. Eine gültige Originalzugehörigkeit oder eine aktuell vorhandene Discord Kings Driver-Rolle beweist allerdings **nicht**, ob eine neue Aufnahme oder Rückkehr tatsächlich von HR/Management freigegeben wurde.

Der neue, getrennte **HR Driver Decision Source** ist ausschließlich für **ausdrücklich von einer berechtigten Person bestätigte** HR-Entscheidungen gedacht. Er macht keine Personalentscheidung. Er kann auch nicht automatisch das Originaldatum ändern oder Rollen vergeben.

**Wichtig:** Der HR-Entscheidungskanal ist noch **nicht eingerichtet oder als Quelle konfiguriert**. Kein bestehender Kings Driver erhält rückwirkend einen erfundenen Freigabenachweis. `not-configured` und `noFormalDecisionEvidence` sind nicht gleichbedeutend mit „abgelehnt“ oder „unzulässig“.

## 1. Ein eigener privater Discord-Quellkanal

Für die dauerhafte, getrennte Nachweisführung sollte ein **eigener** Discord-Textkanal wie `hr-driver-decisions` benutzt werden; die Automation erstellt ihn **nicht**. Er ist weder mit dem vorhandenen `driver-loyalty-records`-Kanal noch mit den öffentlichen Bewerbungs-/Driver-Updates gleichzusetzen.

**Nur der CEO und ausdrücklich berechtigte HR-/Management-Führung** dürfen HR-Entscheidungen dort veröffentlichen. Der Kings Systems Bot erhält Leserechte, jedoch keine Schreibfreigabe für Entscheidungen. `@everyone`, normale Drivers, Partner, andere Abteilungen und öffentliche Rollen dürfen nicht lesen. Der Scanner verweigert die private Quelle bereits bei unerlaubter Kanal-Freigabe; ebenso bei anderen Administrator-Rollen, deren Discord-Administrator-Recht einen Kanal-Deny umgehen würde. Gegebenenfalls muss die Rollen-/Admin-Berechtigungssituation gemeinsam mit dem CEO geprüft werden, statt diese Kontrolle abzuschalten.

Die konkrete Kanal-ID wird nach manueller Freigabe als **GitHub Actions Secret** `KINGS_HR_DECISIONS_CHANNEL_ID` eingetragen; niemals einen öffentlichen Channel oder einen fremden Server verwenden. Solange die Konfiguration fehlt, gibt der read-only Prüfschritt lediglich `NOT CONFIGURED` aus. Diese grüne, schadlose Ausführung ist ausdrücklich **keine Bestätigung vorhandener HR-Freigaben**.

## 2. Verbindliches, minimales Entscheidungsformat

Jede Entscheidung ist eine eigenständige, von einem berechtigten menschlichen HR-/Management-Mitglied gesendete Nachricht im geschützten Kanal:

```text
KINGS_HR_DRIVER_DECISION_V1
discord_id: <17- bis 20-stellige Discord-ID>
decision: approved
admission: first
ticket_id: <17- bis 20-stellige Discord-Ticket-ID>
```

Für einen genehmigten **Rückkehrer** `admission: return` verwenden.

Für eine **Ablehnung** `decision: declined` und für den späteren **Widerruf einer ausdrücklich dokumentierten Freigabe** `decision: revoked` einsetzen. Auch diese Eingaben sind **Dokumentation einer bereits getroffenen HR-Entscheidung**, keine Befehle an den Bot. Ein Widerruf entfernt keine Rollen und sperrt keine Mitglieder.

- Die Discord-ID ist der eindeutige Identitätsschlüssel. Nicknames oder TruckersMP-Profile werden nicht zum Erraten einer ID benutzt.
- `ticket_id` verweist auf die **bereits vorhandene**, von HR bearbeitete Ticket-/Bewerbungsentscheidung. Der Parser kontrolliert zunächst nur das ID-Format, nicht automatisch Inhalt, Echtheit oder Rechte des verlinkten Tickets. Die zugehörige menschliche HR-Prüfung ist weiterhin erforderlich.
- Die Entscheidung erhält den tatsächlichen Autor und Zeitstempel aus **Discord-Nachrichtenmetadaten**, nicht aus frei eingetragenen, zurückdatierten Textfeldern.
- Es dürfen keine Gründe, vertraulichen Beschwerden, medizinischen Daten oder unnötigen Personendaten in den maschinenlesbaren Entscheideintrag aufgenommen werden.
- **Nachträgliche Bearbeitung einer Entscheidungsnachricht** wird bei der Prüfung verweigert. Eine neue bestätigte Entscheidung wird als eigene Nachricht angehängt und ersetzt nur für die aktuelle Auswertung die vorherige; die frühere Nachricht bleibt als Beleg im privaten Verlauf erhalten.
- Eine bestehende Discord Kings Driver-Rolle ohne zugehörige HR-Nachricht wird als **„kein formaler Entscheidungsnachweis vorhanden“**, nicht automatisch als falsch aufgenommen oder abgelehnt, klassifiziert.

## 3. Welche Freigaben zählen und welche nicht?

Die read-only Quelle akzeptiert nur unveränderte Datensätze von menschlichen Accounts mit zulässiger HR-/Management-/CEO-Führungsrolle beziehungsweise dem Discord-Servereigentümer. Eine gewöhnliche Staff-Rolle, ein Driver, Partner, eine Nachricht von einem Bot/Webhook oder eine nur in einem anderen Channel behauptete Freigabe zählen nicht.

**Grenze der Prüfbarkeit:** Der Scan bewertet die **aktuell** verifizierbaren Rollen des Verfassers. Wird ein früher genehmigender HR-Mitarbeiter später herabgestuft oder verlässt Kings, kann dieser reine Discord-Rollenabgleich seine damalige Berechtigung nicht mehr nachweisen. Solche historischen Fälle bleiben zu verifizieren; eine belastbare spätere Lösung benötigt eine unveränderbare, privat revisionsfähige HR-Entscheidungshistorie mit zum Entscheidungszeitpunkt festgehaltener Autorisierung.

Vor einer formalen Freigabe sollte HR mindestens die echte Bewerbung und Ticket-Entscheidung, Alters-/Regelkonformität nach geltender Kings-Policy, Aufnahme beziehungsweise Rückkehr und die Zuordnung zur richtigen Discord-ID prüfen. Für Rückkehrer bestätigt Management ausdrücklich, ob das frühere **originale Kings-Beitrittsdatum** beibehalten werden darf. Der HR-Entscheidungsdatensatz enthält **kein** zweites Beitrittsdatum und verändert niemals die Originalquelle.

## 4. Was der Bot kontrolliert

Der erste, standardmäßig **nicht konfigurierte** Schritt in der vorhandenen täglichen `driver-register-onboarding.yml`-Automation nutzt nur Discord-GET:

1. Server, Bot, aktuelle Mitgliedschaftsrollen, privaten HR-Kanal und den bereits geschützten Kings Driver Identity Register prüfen.
2. Sicherstellen, dass normale Mitglieder und fremde Administratoren keinen Zugriff auf die HR-Entscheidungen erhalten.
3. Höchstens 2.000 Kanalnachrichten lesen. Bei unvollständiger Historie, ungültigen Datensätzen, unberechtigten Autoren oder nachträglich bearbeiteten Entscheidungsnachrichten **abbrechen**, statt eine falsche Freigabe zu akzeptieren.
4. Nur tatsächlich aktuelle Discord Kings Driver-Rollen zählen; Trial, ehemalige Fahrer und zusätzliche TMP-VTC-Mitglieder werden nicht automatisch dazugezählt.
5. Beim letzten gültigen Entscheid pro Discord-ID unterscheiden: `approved + first`, `approved + return`, Ablehnung/Widerruf trotz aktueller Driver-Rolle (= **Konflikt für menschliche Prüfung**) und **kein formaler Nachweis**.
6. Bei einem genehmigten Datensatz ohne gültiges Original-Kings-Identitätsregister einen gesonderten **Widerspruch** zählen. Keinesfalls ein Ersatzdatum erzeugen.
7. Öffentliches GitHub-Actions-Log ausschließlich mit Summen und allgemeinem Status ausgeben – **keine** Discord-IDs, Ticket-IDs, Autoren, ursprüngliche Beitrittsdaten, Nachrichtentexte oder Gründe.

Der Scanner gibt **niemals** `POST`, `PATCH` oder `DELETE` an Discord aus. Auch `declined` oder `revoked` sind dort nur **nachzuprüfende Belege** und lösen keinen Rollenkick, Bann oder Zugriffsentzug aus.

## 5. Was zunächst *nicht* umgesetzt ist

- Kein neuer Discord-Kanal, keine neu angelegten oder automatisch genehmigten Entscheidungen, kein Versand von Bewerbungs-/HR-Nachrichten.
- Kein rückwirkender Nachweis für die 74 bereits registrierten aktuellen Discord Kings Drivers (Stand des letzten Audits); fehlende neue HR-Evidenz bedeutet **historisch ungeklärt**, nicht unrechtmäßige Aufnahme.
- Keine automatische Zuordnung zu Tickets; der Ticket-Verweis ist ein dokumentarischer Schlüssel.
- Kein automatisches „Genehmigt“-Label für offene Bewerbungen oder Rückkehrer und keine Rollenänderung.
- Keine zusätzliche personenbezogene HR-Datei im öffentlichen GitHub-Repository.
- Kein Ersatz für den professionellen, späteren Kings Website/Driver-Hub-Approval-Workflow.

## 6. Nächste produktive Schritte

1. **CEO/HR** bestätigen, wer HR-Entscheidungen veröffentlichen darf, und legen den geschützten Entscheidungs-Channel samt überprüften Rechten an.
2. Kanal-ID **nur als GitHub Secret** `KINGS_HR_DECISIONS_CHANNEL_ID` hinterlegen.
3. Eine **neue, echte HR-Freigabe** im vereinbarten Format nach Prüfung des zugrunde liegenden Tickets und der Original-Kings-Daten erfassen. **Keine rückwirkenden Fake-Nachrichten für bestehende Fahrer.**
4. Manuellen oder täglichen read-only Onboarding-Workflow ausführen; öffentlichen Aggregat-Status und Berechtigungsprüfung kontrollieren.
5. Anschließend eine **separate private HR-Einzelfall-Ansicht** entwickeln, die Entscheidung/Ticket/Rückkehr unter derselben vertraulichen Quelle ohne öffentliche personenbezogene Daten sichtbar macht.
6. Bei wachsender Datenmenge über den professionellen verschlüsselten, revisionsfähigen Kings Driver Hub umziehen, ohne zwei konkurrierende editierbare Freigabequellen zu schaffen.

**Leitprinzip:** *HR genehmigt die Aufnahme. Management bestätigt Original-Kings-Daten. Discord zeigt aktuelle Rollen. Keiner dieser drei Nachweise ersetzt die anderen.*


## 7. Private HR-Einzelfallübersicht – vorbereitet und manuell freigabepflichtig

Zusätzlich zur menschlich bestätigten Entscheidungsquelle gibt es jetzt die technisch vorbereitete **Kings HR Driver Case View**. Sie dient berechtigten HR-/Management-Personen zur Einzelfall-Nachprüfung und ist **kein** öffentliches Discord-Dashboard.

### Welche Fälle die Ansicht unterscheidet

- **Verified approved first:** Eine menschliche Erstaufnahmeentscheidung mit bestätigter aktueller Discord-Driver-Rolle und gültigem Original-Kings-Identitätsregister.
- **Verified approved return:** Eine ausdrückliche menschliche Rückkehrentscheidung mit bestätigter Original-Identität. Das ist kein automatisches Zurücksetzen/Ändern des Kings-Beitrittsdatums.
- **Active role with declined/revoked decision:** Echte widersprüchliche HR-Evidenz bei noch bestehender Driver-Rolle – **manuell prüfen**, niemals automatisch Rolle entziehen.
- **Approved without original identity:** Dokumentierte HR-Freigabe, aber fehlender Original-Kings-Datensatz – Management prüft die Stammdaten. Kein automatisch geschätztes Datum.
- **Missing original identity and HR decision:** Aktueller Driver ohne gültige Stammdaten und formalen HR-Beleg – Einzelfallprüfung für tatsächliche Neuaufnahme oder Rückkehr.
- **Registered historical Driver without formal HR evidence:** **Nur aggregiert zählen**, nicht automatisch als „ungenehmigt“ oder „abgelehnt“ kennzeichnen. Die bestehende Identität allein beweist zwar keine HR-Freigabe, aber auch keinen Aufnahmefehler.

Die Ansicht stellt auf einer Übersichtsseite ausschließlich Summen dar. Einzelne Fälle werden in eigenen **vertraulichen Seiten** angezeigt, höchstens zehn Fälle pro Seite (automatische sichere Seitenteilung). Discord-IDs, interne Ticketreferenzen und der Status der originalen Kings-Identität sind ausschließlich für diesen geschützten Kanal bestimmt und erscheinen **niemals** in öffentlichen GitHub-Dateien oder Actions-Protokollen.

### Private Discord-Veröffentlichung – nur nach ausdrücklicher Freigabe

1. Der CEO / das berechtigte HR-Management richtet **zwei voneinander getrennte private Textkanäle** ein beziehungsweise bestätigt sie: `hr-driver-decisions` als **menschliche Entscheidungsquelle** und beispielsweise `hr-driver-case-view` als **ausschließlich interne Bot-Anzeige**. Diese Kanäle dürfen auch nicht das bestehende private Driver Identity Register ersetzen.
2. Beide Kanäle müssen nachweisbar privat sein: `@everyone` hat **kein** View Channel, nur zugelassene HR-/Management-Leitung und der Kings Systems Bot dürfen lesen. Die Automatisierung lehnt andere View-Overwrites und fremde Administrator-Rollen ab.
3. Die exakten Kanal-IDs nur als GitHub Actions Secrets hinterlegen: `KINGS_HR_DECISIONS_CHANNEL_ID` und `KINGS_HR_CASE_VIEW_CHANNEL_ID`. Die Namen allein werden **nicht** als Quelle angenommen.
4. Die eigentlichen HR-Entscheidungen werden **manuell und tatsächlich nach Ticketprüfung** im geschützten `hr-driver-decisions`-Kanal dokumentiert. Keine erfundenen oder rückdatierten Freigaben.
5. Erst nach bewusster HR-/CEO-Freigabe den bestehenden GitHub Actions Workflow **Kings Driver Register Onboarding Check** über `workflow_dispatch` starten und die standardmäßig **deaktivierte** Checkbox `publish_private_hr_case_view` ausdrücklich einschalten. Ohne Checkbox bzw. bei täglichen/Push-Läufen bleibt die Prüfung **read-only**.
6. Bei diesem gezielt autorisierten Lauf wird die Entscheidungshistorie vorab gelesen und auf HR-Autor, Originaldatum und beide privaten Kanalrechte geprüft. Erst danach darf der Bot **nur im separaten geschützten Case-View-Kanal** eigene Case-View-Nachrichten erstellen/aktualisieren.
7. Bestehende, eindeutig erkannte Bot-Case-View-Seiten werden **bearbeitet** statt doppelt gepostet. Wenn sich die Fallzahl verkleinert, werden alte überschüssige Bot-Seiten inhaltsarm **archiviert und von bisherigen Personendaten bereinigt** – ohne Nachrichten zu löschen. Fremde Nachrichten werden nicht verändert. Bei doppelten/früher nicht sicher überprüfbaren Nachrichten oder zu vielen Kanalnachrichten wird die Veröffentlichung verweigert.
8. Öffentliche Workflow-Logs enthalten **nur** die Anzahl vorbereiteter/aktualisierter/archivierter privater Seiten und zusammengefasste HR-Evidenzdaten. Keine Discord-ID, HR-Ticket-ID, HR-Autor-ID, private Entscheidung oder ursprüngliches Kings-Beitrittsdatum.

**Aktueller Status (21. November 2026):** Technik und manueller Freigabeschalter sind vorbereitet. Ein tatsächlich eingerichteter, freigegebener HR-Entscheidungskanal und der separate geschützte View-Kanal sind **noch nicht bestätigt**. Ohne beide korrekt konfigurierten Quellen gibt es weiterhin keine veröffentlichte HR-Fallübersicht. Dies ist der gewünschte sichere Zustand, kein Fehler, der durch eine Veröffentlichung in einem allgemeinen HR-/Driver-Kanal umgangen werden sollte.

**Datenschutzgrenze:** Aufbewahrung privater Fälle, HR-Entscheidungen und Ticket-Daten muss durch Kings Policy und geltende Datenschutzanforderungen geregelt werden. Ein Discord-Textkanal ersetzt langfristig keinen privaten, revisionsfähigen HR-Datenspeicher mit rollen- und zweckgebundener Berechtigung.
