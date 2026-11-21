# Kings Logistics — Masterplan für zentrale Datenquellen auf Discord

**Stand:** 21. November 2026
**Geltungsbereich:** Kings Logistics (ETS2/ATS, auf allen offiziell unterstützten Multiplayer-Plattformen). Kings Hub und RealmMP haben später eigene, voneinander unabhängige Mitglieder-, Management- und Berechtigungssysteme.

## 1. Ziel

Kings darf nicht für jede Automation separat erraten, wer eine Person ist, wann sie ursprünglich Kings beigetreten ist oder welche externen Plattform-IDs zu ihr gehören. Das bereits **private, von Kings Management gepflegte Driver-Register auf Discord** ist der richtige Ausgangspunkt für stabile, geprüfte *Fahrer-Stammdaten*. Die vorhandenen Systeme können dasselbe Register **lesen**, ohne das Register selbst automatisch zu überschreiben.

Die technische, rein lesende Feldzuständigkeit ist in `kings-data-sources.js` festgehalten. Dieses Modul speichert **keine** Personen, nimmt **keine** Discord-Schreiboperationen vor und führt **keine** Rollenänderungen aus. Neue produktive Verbraucher werden einzeln mit Berechtigungs-, Vollständigkeits- und Datenschutztests integriert; allein das Vorhandensein dieser Datei aktiviert keinen neuen Live-Datenabgleich.

### Stand der vorhandenen Quellen

- Das bestehende `driver-loyalty-records`-Register enthält die **Discord-ID**, das **ursprüngliche Kings-Beitrittsdatum** und optional verifizierte **TruckersMP-, HaulMP- und TruckLineMP-IDs**.
- Das vorhandene `driver-identity-register.js` liest diese Formate. `driver-loyalty-register.js` prüft unter anderem Channel-Berechtigungen, autorisierte Management-Absender, Doppelregistrierungen und mehrfach vergebene Plattform-IDs; der Abruf bleibt auf den Arbeitsspeicher begrenzt.
- Bereits aktiv: Driver Loyalty, private Driver-Register-Onboarding-Prüfung, private VTC/Discord-Identitätsprüfung. Beim zuletzt geprüften Tageslauf waren **74 von 74** aktiven Discord Kings Drivers erfasst. Diese Beobachtung ist zeitgebunden und keine dauerhafte Mitgliederzahl.
- Die **vollständige offizielle TruckersMP-VTC-Mitgliederzahl** (beim letzten Audit 111) und die **Discord Kings Driver-Rolleninhaber** (74) sind absichtlich unterschiedliche Mengen. Niemals die zusätzlichen VTC-only-Accounts ohne Kings-Driver-Rolle automatisch als fehlende Discord-Registrierungen werten.
- Die aktuellen Live-Spielerpositionen kommen **nicht** aus dem Beitrittsregister. Solange die externe Map-API keine vollständige bestätigte Abdeckung bietet, bleibt Online `Unavailable`.

## 2. Welche Quelle hat für welches Feld Vorrang?

| Datenelement | Verbindliche Quelle | Was ausdrücklich **keine** Ersatzquelle ist |
|---|---|---|
| Discord-Konto-ID | Discord-Guild/Login (im privaten Register als geprüfter Schlüssel referenziert) | Discord-Nickname / Anzeigename |
| Ursprüngliches Kings-Beitrittsdatum | von Management bestätigtes **privates Kings Driver Register** | Discord-`joined_at`, VTC-Join, erster Botkontakt, erste Aktivität |
| TruckersMP-, HaulMP-, TruckLineMP-Identität | geprüfte ID-Zuordnung im privaten Register; bei Bedarf gegen jeweilige offizielle Plattform prüfen | Namen, ungeprüfte/vermutete Account-Verbindungen |
| Aktueller Kings Driver / Trial | **aktuelle Discord-Rollen**, getrennt nach Driver / Trial | früherer Registereintrag oder Mitgliedschaft auf TruckersMP |
| Aktueller TruckersMP-VTC-Bestand | **offizielle TruckersMP-VTC-Mitglieder-API** | Zahl der Discord Kings Driver-Rollen |
| Gerade online / auf dem Server | vollständige, aktuelle, verifizierte Live-Datenquelle | letzte bekannte Karte, Trucky-Teilbestand, globaler Server-Count |
| Staff-Rolle und Abteilung | verifizierte Discord Staff-/Leadership-Rollen und interne Staff-/HR-Freigabe | VTC-Nickname oder alte Kopie einer Mitgliederliste |
| Monats-Awards | ausdrücklich genehmigte **menschliche Leadership-Entscheidung** | automatische Leistungs-Rangliste |
| Partnerschaft / Genehmigung | Kings Partner Management mit dokumentierter Freigabe (vereinheitlicht später) | die bloße Partner-Discord-Rolle |
| Event / Slot / Einladung | bestätigte Event-Leadership-Freigabe und Veranstalterinformationen (vereinheitlicht später) | unverbindliche Chat-Nachricht |
| Shop-Kauf / Circle-Abo | verifizierte **Commerce-/Zahlungsplattform** (für Zukunftssystem) | Discord-Supporter-Rolle als Zahlungsbeweis |

Eine Quelle darf **nur** für die Felder als maßgeblich gelten, für die sie verlässlich ist. Felder bekommen einen eigenen Status `verified`, `missing`, `conflict`, `unavailable` oder `outdated`. Fehlende Informationen bleiben fehlend; es gibt **keine** automatische Schätzung.

## 3. Das private Kings Driver Identity Register

### Beibehaltener Datensatz

Kompatibel mit der bestehenden Zwei-Zeilen-Version:

```text
discord_id: <DISCORD_ID>
kings_join_date: 14.11.2026
truckersmp_id: <VERIFIED_TMP_ID>
haulmp_id: <OPTIONAL_VERIFIED_ID>
trucklinemp_id: <OPTIONAL_VERIFIED_ID>
```

Das Beispiel ist eine **Strukturvorlage**, kein realer Datensatz. `discord_id` und `kings_join_date` sind erforderlich; einzelne Plattform-IDs dürfen fehlen, statt erfunden zu werden. Die reale Parser-Implementierung erwartet für IDs das jeweils gültige Format und für das Datum `D.M.YYYY`. Bestehende Kurzform `id:` / `datum:` sowie vorhandene Register-Batches bleiben unverändert unterstützt.

### Neue, bestehende und ehemalige Fahrer

**Aktuelle Fahrer:** Aufnahme in die aktuelle Driver-Auswertung ausschließlich mit nachweisbarer aktiver Kings-Driver-Discord-Rolle. Privates Register liefert nur geprüfte Personenstammdaten.

**Zukünftige Fahrer:** Nach freigegebener Bewerbung und verifizierter Discord-ID prüft HR bzw. Management den Registereintrag. Fehlt er, wird ein privater Hinweis erstellt und das ursprüngliche Kings-Beitrittsdatum durch eine berechtigte Person bestätigt und eingetragen. **Keine automatische Datumsübernahme aus Discord oder TruckersMP.**

**Trial:** Die Trial-Rolle ist **kein** aktiver Kings Driver. Ob und wann aus einem Trial ein Driver wird, muss aus der offiziellen HR-/Driver-Freigabe stammen; ein vorläufiger Registereintrag darf nicht eigenständig die Driver-Rolle vergeben.

**Ehemalige / zurückkehrende Fahrer:** Die frühere Zuordnung wird nicht für aktuelle Driver-Zähler verwendet. Falls die ursprüngliche Kings-Zugehörigkeit laut Kings-Regeln für eine Rückkehr erhalten bleibt, verifiziert Management das ursprüngliche Datum und dokumentiert die Entscheidung. Ein Wiedereintritt wird nicht stillschweigend mit der ersten Discord-Join-Zeit überschrieben. Aufbewahrung/Löschung ehemaliger Personendaten muss einer festgelegten internen Datenschutz- und Aufbewahrungsregel folgen.

**Änderungen:** Eine aktuelle Original-Nachricht unter Management-Kontrolle korrigieren, nicht kommentarlos einen zweiten, widersprüchlichen Datensatz hinzufügen. Der bestehende Parser verweigert doppelte Einträge für dieselbe Discord-ID oder eine doppelt vergebene Plattform-ID.

## 4. Neue technische Schnittstelle: mehrere Systeme, dieselbe Quelle

Die reine `kings-data-sources.js`-Schicht kann ein bereits **berechtigungsgeprüftes** Ergebnis von `loadRegister()` annehmen:

```js
const {loadRegister} = require('./driver-loyalty-register');
const {privateDriverIdentity,activeDriverSourceCoverage} =
  require('./kings-data-sources');

// Der bestehende loadRegister-Aufruf prüft Discord-Kanal, Absender,
// Registrierungsformat und mehr. Er benötigt autorisierte Lesezugriffe.
const register = await loadRegister(discord, guildId, roles, members, botId, {
  channelId: PRIVATE_REGISTER_CHANNEL_ID
});

// Nur innerhalb eines berechtigten Systems; niemals öffentlich protokollieren.
const privateIdentity = privateDriverIdentity(register, approvedDiscordId);

// Die aktiven IDs müssen aus der aktuellen Discord Kings Driver-Rolle kommen.
const publicSafeTotals = activeDriverSourceCoverage(register, currentDriverDiscordIds);
```

Die Schnittstelle ist **read-only**, transportiert im privaten Objekt die bestätigte Originalzugehörigkeit und die optionalen Plattform-IDs und liefert in der zweiten Funktion **nur Summen**. `source-unavailable`, `incomplete`, `complete` und `no-active-drivers` sind getrennte Fälle. `source-unavailable` darf nicht als vollständige Abdeckung angezeigt werden.

Der Adapter erstellt **keine neue Discord-Nachricht** und **keinen weiteren Datensatz**. Die Rechte- und Identitätsprüfung bleibt Aufgabe des bestehenden privaten Loaders und der jeweiligen aufrufenden Workflow-Berechtigungen. Es handelt sich um einen Baustein für schrittweise Integrationen, noch keinen automatischen Rollout auf sämtliche Kings-Systeme.

## 5. Konkrete Kings-Anwendungsfälle

| Bereich | Nutzen der zentralen Quelle | Einführung |
|---|---|---|
| Driver Loyalty | originale Kings-Zugehörigkeit, nur bestätigte kosmetische Stufen | **bereits aktiv**, mit manueller Live-Freigabe |
| Driver Onboarding / HR | fehlende Einträge für neu bestätigte Drivers anzeigen | **bereits aktiv** als private Prüfung |
| Driver Register / Plattformlinks | Discord-ID ↔ TMP/HaulMP/TLMP als verifizierbare Zuordnung | **bereits teilweise aktiv** |
| Kings Driver Hub / Profile | das persönliche Profil mit denselben geprüften IDs und Datum laden | später über geschützte Website/API |
| Jubiläen / Milestones | 1/3/6 Monate, 1/2/3/4/5 Jahre **seit originalem Kings-Datum**, nicht VTC/Discord-Join | erst verifizierte Quelle und private Prüfung integrieren |
| Driver Recognition / Awards | die richtige Person über Discord-ID zuordnen, Award-Entscheidung bleibt menschlich | später |
| Driver Services | interne Anfragen sicher zum richtigen Fahrerprofil verbinden | später, rollen-/zweckgebunden |
| Event-Teilnehmer / Konvoi-Organisation | genehmigte Kings Driver eindeutig plattformübergreifend zuordnen | später |
| Staff-Berichte | Driver↔Staff-Verbindungen prüfen, **ohne** daraus Staff-Beförderungen zu entscheiden | später |
| Website / Kings Points / Circle | eindeutige Profil-Verknüpfung, aber Points/Abos haben eigene maßgebliche Geschäftsquellen | später |

Nicht jedem Verbraucher müssen alle Stammdaten zugänglich sein. Ein öffentlicher Bericht erhält z. B. eine **Anzahl**; die berechtigte Driver-Services-Abteilung nur die für den konkreten Vorgang nötigen Daten. Datensparsamkeit wird **pro Verbraucher** durchgesetzt.

## 6. Weitere Discord-basierte Stammdatenquellen

Nicht für alles neue Kanäle anlegen. Nur Informationen, die von Menschen **verbindlich freigegeben und langfristig gepflegt** werden müssen, eignen sich als zusätzliche private, rollenbeschränkte Register:

1. **Kings Staff Registry (geplant):** bestätigte Staff-/Leadership-Zuordnungen, Abteilung, Beginn/Ende der Amtszeit und Verantwortlichkeit. Personalentscheidungen ausschließlich durch befugte Leadership, kein automatischer Aufstieg oder Sanktionierung.
2. **Kings Partner Registry (geplant):** Partner-ID, bestätigter Name/Discord-Bezug, Partnership-Start, Ansprechpartner, Status und Freigabe. Keine sensiblen Kontaktdaten im öffentlichen Repo.
3. **Kings Event Registry (geplant):** bestätigte Events, Slots, Veranstalter, Freigabe, Zeitpunkt in UTC sowie lokale Zeitzonen-Darstellung und verlässliche Veranstaltungs-IDs. Der Event-Kanal ist kein Ersatz für eine offizielle Terminbestätigung.
4. **Kings Awards Registry (geplant):** monatliche **vier** Kategorien, bestätigte Gewinner und Entscheidung durch Leadership, einschließlich Photo-of-the-Month-Siegerlackierung; keine automatische Siegerwahl.

**Nicht als Discord-„Datenbank“ verwenden:** Zahlungs- und Bestellinformationen, vollständige personenbezogene HR-Akten, große Tracking-Logs, Echtzeit-Spielerpositionen oder geheime API-Schlüssel. Für Shop und Circle bleibt der künftige Commerce-/Zahlungsanbieter maßgeblich; Discord-Supporter-Rollen sind abgeleitete Berechtigungen, keine Kaufbelege.

## 7. Sicherheit, Betrieb und spätere Migration

- **Zugriff:** private Channels mit verweigerter `@everyone`-Sichtbarkeit, überprüften Management-Leserechten und Bot-Lesezugriff nur für die benötigte Funktion. Die bestehende Permission-Audit-Logik wird weiterverwendet und muss Admin-/Override-Sonderfälle berücksichtigen.
- **Schreiben:** grundsätzlich manuelle Management-Genehmigung. Keine automatischen Datums-Korrekturen, Mitgliedschaftsentscheidungen, Staff- oder Loyalty-Rollenänderungen durch den reinen Datenquellen-Adapter.
- **Privatsphäre:** Discord-ID, externe Plattform-ID und originales Beitrittsdatum bleiben in privaten Discord-Daten bzw. autorisiertem Arbeitsspeicher/verschlüsseltem State. Keine Personenausgabe in öffentlichen GitHub-Daten, öffentlichen CI-Logs oder öffentlichen Discord-Embeds.
- **Nachvollziehbarkeit:** künftige Änderungen mit `geprüft von`, `geprüft am`, sachlichem Korrekturgrund und zweckgebundener Historie; keine zweite widersprüchliche Live-Quelle. Nie private Audit-Trails in GitHub veröffentlichen.
- **Schutz gegen Ausfälle:** wenn das Register/Discord nicht erreichbar ist, `source-unavailable` ausgeben, keine stillschweigende Wiederverwendung unbestätigter Personen-/Datumswerte und kein Rollensync.
- **Betrieb:** das jetzige Discord-Nachrichtenregister hat bewusst Begrenzungen (u. a. maximal 2.000 eingelesene Nachrichten), ist für aktuelle Kings-Größen praktikabel, aber kein vollwertiger transaktionaler Datenbankersatz.
- **Website/Driver Hub:** für den künftigen professionellen Betrieb zunächst ein privater, revisionsfähiger, verschlüsselter Datenspeicher mit Discord OAuth als Kontoverknüpfung und getrenntem Rechtekonzept planen; den Discord-Registerbestand nur nach überprüfter Migration und Owner-/HR-Freigabe synchronisieren. Eine unkontrollierte zweite editierbare Datenquelle vermeiden.
- **Datenschutz:** Lösch-, Auskunfts- und Aufbewahrungsprozesse für ehemalige Fahrer und Staff festlegen, bevor zusätzliche langfristige personenbezogene Felder gesammelt werden.

## 8. Umsetzungsreihenfolge

**Phase A — gemeinsame Quellenregeln (diese Änderung):** Autoritäten, Grenzen und read-only Adapter definieren; Tests mit künstlichen IDs; kein Produktions-Live-Abgleich, kein neuer Discord-Kanal.

**Phase B — bestehende Driver-Workflows harmonisieren:** bei jedem bestehenden Nutzer von `loadRegister()` die gleichen Schutzregeln und die neue öffentliche Summen-Schnittstelle anwenden. Keine gleichzeitige breite Workflow-Umschreibung; jeweils isoliert testen und einen realen read-only Lauf prüfen.

**Erster Integrationsschritt (21. November 2026):** Die tägliche private Driver-Register-Prüfung und der vorhandene private VTC-Abgleich verwenden die gemeinsame, read-only `activeDriverSourceCoverage()`-Validierung. Eine scheinbar vorhandene ID ohne übereinstimmendes originales Kings-Beitrittsdatum wird nicht mehr als unproblematisch behandelt; die privaten Berichte bleiben bei der bestehenden Management-/Driver-Leadership-Verteilung. Das ist noch keine Integration von Driver Hub, Website oder anderen Abteilungen.

**Zweiter Integrationsschritt (21. November 2026):** Auch die bestehende Loyalty-Automatisierung gleicht ihre **rein aggregierten** aktiven Driver-Zähler, den Anteil registrierter Original-Kings-Beitrittsdaten und die Zahl der vorhandenen Plattformverknüpfungen gegen die gemeinsame private Quellenprüfung ab. Ein Widerspruch blockiert den Lauf vor etwaigen Rollenänderungen. Öffentliche Statusdateien dürfen nur Summen und Quellenstatus erhalten. Zeitgesteuerte Läufe bleiben unverändert `dry-run`; für manuelle Live-Rollenänderungen gelten die zusätzliche Originalregister- und Entfernungsfreigabe aus PR #85.

**Phase C — zukünftige Driver-Abläufe:** HR-Freigabe → Rollenstatus überprüfen → Original-Datum/IDs im privaten Register durch berechtigte Person bestätigen → private Completeness-Audit → autorisierte Folgesysteme aktualisieren. Fehlende Felder bleiben sichtbar, aber nicht öffentlich.

**HR-Integrationsschritt (21. November 2026):** Das vorhandene HR-Leadership-Overview zeigt zusätzlich die **rein aggregierte**, gegen das private Kings-Register verifizierte Driver-Registrierungsabdeckung aus dem Loyalty-Quellstatus an. Die vollständige TMP-VTC-Mitgliederzahl wird getrennt beschriftet. Ein über 36 Stunden alter oder widersprüchlicher Quellstatus wird `Unavailable`, nie fälschlich `0 ausstehend`. Individualisierte Korrekturanfragen bleiben in der geschützten Driver-Leadership-Registerliste; HR/Management bestätigt Originaldaten und etwaige Rückkehrentscheidungen menschlich. Das fügt keine automatische Approval-, Rollen- oder Registeränderung hinzu.

**Produktive Anzeigeschicht:** `hr-leadership.js` wird vom bestehenden `hr-leadership.yml` aktuell **nicht direkt ausgeführt** (der Workflow führt `hr-probation.js` aus). Für die tatsächlich sichtbare zentrale HR-Leadership-Nachricht muss die Quelle deshalb zusätzlich im aktiven `leadership-dashboard.js:buildHr()` eingebunden sein. Der Consolidated Leadership Workflow aktualisiert damit weiterhin dieselbe gespeicherte HR-Nachricht; kein zweites Dashboard wird angelegt. Die tatsächliche Veröffentlichung ist anhand eines nachfolgenden erfolgreichen Produktionslaufs zu kontrollieren.

**HR-Eintritts-/Rückkehrprüfung (weiterer Integrationsschritt, 21. November 2026):** Die vorhandene tägliche, privat veröffentlichte `Kings Driver Registration Queue` führt nur Fälle mit aktuell gültiger **Kings Driver Discord-Rolle**, aber **fehlendem** bestätigten Identitäts-/Originalbeitrittsdatum-Datensatz zur menschlichen Prüfung auf. Sie kennzeichnet diese ausdrücklich als `FIRST ADMISSION oder RETURNER – ungeklärt`, weil weder Discord-Join noch VTC-Join noch Welcome-Nachrichten eine HR-Freigabe oder die ursprüngliche Kings-Zugehörigkeit belegen. HR prüft die echte Genehmigung und unterscheidet Neuaufnahme/Wiedereintritt, Management überprüft den Originaltermin gemäß Kings-Regeln und die Plattformzuordnung und pflegt nur das geschützte bestehende Register. Danach erledigt der nächste Bericht den Fall automatisch, sofern der gültige Eintrag vorliegt. Das Dashboard zeigt nur die **Anzahl** offener Fälle; individuelle Discord-IDs stehen ausschließlich in der bereits geschützten Driver-Leadership-Queue. **Bestehender gültiger Registereintrag bedeutet lediglich identifiziert, nicht automatisch HR-genehmigt.** Falls auch für bereits registrierte Rückkehrer ein eigener formeller HR-Freigabenachweis verlangt werden soll, muss dafür eine zusätzliche **autorisierte HR-Entscheidungsquelle** aufgebaut werden; aus der Identitätsquelle allein ist das nicht nachweisbar.

**Private HR-Einzelfallansicht (zweiter HR-Entscheidungsschritt):** `hr-driver-case-view.js` klassifiziert ausschließlich verifizierte aktuelle Discord Kings Drivers anhand der unabhängig bestätigten Original-Kings-Identität und der menschlichen HR-Entscheidungen. Personendetails bleiben im privaten Arbeitsspeicher und können bei **explizit manuellem Opt-in** durch `hr-driver-case-publisher.js` ausschließlich in einen zusätzlich verifizierten, separaten HR-internen Discord-Kanal geschrieben werden. Es gibt **keine automatischen Posts** auf Push/Schedule und keine erstellten oder genehmigten Personendatensätze. Bereits registrierte Legacy-Drivers ohne formalen alten Freigabebeleg werden nur aggregiert als `historical-evidence-unknown` geführt. Die beiden privaten Kanäle und Secrets sind bewusst **noch nicht eingerichtet**; bis zur Freigabe bleibt die Funktion inaktiv. Einrichtung: [HR Decision Source und Case View](KINGS-HR-ADMISSION-DECISIONS.md).

**HR-Entscheidungsquelle (vorbereitet, noch nicht konfiguriert):** Getrennt von der Original-Kings-Identität gibt es jetzt die rein lesende Quelle `hr-driver-decision-source.js` mit einem strikten Format für **von HR/Management persönlich bestätigte** Erstaufnahmen, Rückkehrfreigaben sowie explizite Ablehnungen/Widerrufe. Der bestehende tägliche Driver-Register-Workflow enthält eine standardmäßig deaktivierte, sichere Prüfung. Erst nach manueller Einrichtung eines **eigenen geschützten HR-Entscheidungskanals** und GitHub Secret `KINGS_HR_DECISIONS_CHANNEL_ID` liest er diese Belege. Ohne Konfiguration: **NOT CONFIGURED**, niemals erfundene Freigaben für die aktuell registrierten Drivers. Anleitung mit genauen Anforderungen: [HR Admission & Returner Decision Source](KINGS-HR-ADMISSION-DECISIONS.md). Das aktuelle Kings-Beitrittsdatum bleibt **ausschließlich** im Driver Identity Register; eine aktuelle Driver-Rolle ist kein HR-Freigabenachweis. Personalentscheidungen oder Rollenänderungen werden durch diesen read-only Adapter nicht ausgelöst.

**Phase D — Staff, Partner, Events und Awards:** konkrete Feldschemata, Eigentümer und Genehmigungsabläufe separat fertigstellen; zunächst nicht automatisch neue Channels, Nachrichten oder Rollen anlegen.

**Phase E — Driver Hub und Kings Website:** Zugriff über eine abgesicherte API, Rollen- und Zweckprüfung; perspektivisch eine belastbare interne Datenbank statt Discord-Text als alleiniger Speicher.

**Entscheidender Grundsatz:** **Eine Information = eine autoritative Quelle. Mehrere Kings-Systeme dürfen sie lesen, aber nicht unabhängig voneinander neu erfinden oder ungeprüft überschreiben.**
