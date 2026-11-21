# Kings Logistics – Discord-Systeme, Public- und Leadership-Publikationen: Prüfstand

**Datum:** 21. November 2026. Quellen: bestehende Kings-Workflows und **tatsächliche, nur lesende Discord-GET-Läufe**. Dieses Dokument ist ein Prüfnachweis, **keine** Erklärung, dass jeder alte Beitrag und jedes externe Discord-Tool vollständig aktuell ist.

## 1. Nachgewiesene Live-Ergebnisse

| Umfang | Ergebnis | Was wirklich geprüft wurde | Nachweis |
| --- | ---: | --- | --- |
| 5 konsolidierte Leadership-Dashboards + 3 feste Live-Systemnachrichten | **8/8** | Eindeutige gespeicherte Discord-Nachrichten und Embeds, teilweise Quellkontrakte | [Read-only-Lauf 44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556) |
| Bekannte direkte Leadership-/Public-/interne/technische Discord-Kanal- und Forum-IDs | **13/13** | Existenz, Kanaltyp und Kings-Guild-Zuordnung; keine Texte | [Run 44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556) |
| Vertiefte Inhaltsverträge real veröffentlichter Nachrichten | **7/7** | 3 ehrliche Live-Outage-Banner; Staff Rollenquelle/Anstellungshinweis; neueste News; System Monitor; Convoy Overview | [Run 44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556) |
| Webhook-Ziele bestehender Pub-Automationen | **8/8** | Discord-Webhooks zeigen auf konfigurierte Kings-Guild-Kanäle: Live Tracker, Statistics, Central, News, Changelog, Milestones, Driver Updates, Monthly Report | [Run 44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556) |

**Zusätzliche Fixed-Message-Identitätsprüfung (#105, 21.11.2026):** Der bestehende direkte `discord-fixed-message-audit.js` prüft künftig für **alle acht** gespeicherten Nachrichten zusätzlich die tatsächliche Message-ID. Bei den **fünf Leadership-Embeds** wird die Bot-Identität einmal unabhängig über `GET /users/@me` aus dem konfigurierten Bot-Token ermittelt; Message-Author und exakt konfigurierte Channel-ID müssen übereinstimmen. Bei den **drei Webhook-Embeds** muss die vom Discord-Endpunkt gelesene `webhook_id` mit der sicher aus der konfigurierten Webhook-Adresse ermittelten ID übereinstimmen. Fehlt ein Identitätsbeleg, bleibt dieser Eintrag `UNVERIFIED` statt allein wegen eines lesbaren Embeds `VERIFIED` zu werden. Webhook-*Guild*/Zielkanalzuordnung bleibt zusätzlich Aufgabe des bestehenden achtfachen Destination-Audits; die reine Identitätsprüfung beansprucht keine vollständige Guild- oder Inhaltsabnahme. **Keine** Discord-POST/PATCH/DELETE, keine Rollenänderungen, keine privaten IDs/Namen in öffentlichen Logs.

**Inhaltsprüfung der fünf aktiven Leadership-Dashboards (#105, 21.11.2026):** Zusätzlich zur bestehenden 8/8-Zustell- und Absenderprüfung kontrolliert `discord-leadership-content-audit.js` per unabhängigen Bot-GET der **fünf** gespeicherten konsolidierten Dashboards den korrekten Bereichstitel, verpflichtende Sektionen, fachliche Quellenhinweise (Discord-Rollenbestand ≠ TruckersMP-VTC-Bestand), die Trennung von Staff-Rolle und Personalentscheidung, den passenden Footer und einen parsebaren nicht-zukünftigen Embed-Zeitstempel. Inhaltsabweichungen werden als `UNVERIFIED` gemeldet; keine personenbezogenen Inhalte, Kanal-IDs oder Originalnachrichten erscheinen in öffentlichen Logs. Die separate Staff Live Role Overview und HR-Register-Aggregate haben weiterhin ihre eigenen Inhaltsprüfungen. Der neue Vertragsaudit überprüft **weder** alle historischen Leadership-Berichte **noch** Awards-Gewinner, Datengenauigkeit aller Einzelwerte oder fremde Bots. Eine `VERIFIED`-Rückmeldung gilt nur für diese ausdrücklich definierten fünf aktuellen Inhaltsverträge. Er führt ausschließlich GETs aus und veröffentlicht nichts.

**Diese Prüfmengen überlappen.** 8+13+7+8 sind daher **keine 36 verschiedenen geprüften Nachrichten**. Die 8 Webhook-Genehmigungen belegen Zielzuordnung, **nicht** aktuelle Veröffentlichung oder deren vollständige Textkonformität.

Verwendete Audit-Skripte:
- `discord-fixed-message-audit.js`
- `discord-channel-inventory-audit.js`
- `discord-publication-content-audit.js`
- `discord-webhook-destination-audit.js`

Alle verwenden in dieser Prüfung nur Discord GET. Die produktive Code-Änderung erfolgt ausschließlich an **Verifikationsskripten und Tests**; keine Discord-Posts, Löschungen, Rollen-/Member-/HR-Aktionen.

## 2. Wichtige echte Inhaltsfeststellungen

**Externer Live-Provider gestört:** Das aktuelle gespeicherte `data/live-tracker-snapshot.json` wurde zuletzt am **18.11.2026** verifiziert. Die drei bestehenden Live-Anzeigen zeigen während dieses Ausfalls korrekt `Unavailable — not zero` und erklären, dass aus fehlenden Daten niemand als on-/offline gewertet wird. Der erfolgreiche Discord-Audit bedeutet **nicht**, dass der Map-Provider oder die Onlinezahlen wieder verfügbar wären.

**Trennung unterschiedlicher Staff-Quellen:** `data/staff-leadership-live-overview.json` speichert eine aktuelle Discord-Staff-Rollenübersicht über **11** eindeutige Rollenträger. `data/staff-discord-updates-summary.json` enthält daneben **14** getrennt erfasste TruckersMP-VTC-Staff-Klassifikationen. Die Live Staff Message benennt ausdrücklich, dass eine aktuelle Rolle **keine** dokumentierte HR-/CEO-Ernennung beweist.

**News:** Der neueste in `data/news-publication-state.json` gespeicherte Artikel ist `72143`, veröffentlicht am **13.11.2026**. Die tatsächlich existierende Discord-Nachricht stimmt mit dem gespeicherten Artikel-Titel/URL und dem eingerichteten News-Webhook überein. Es wird **nicht** aus dem Alter der letzten News geschlossen, dass ein neuer Post fällig wäre.

**Monitor und Convoy Overview:** Beide Nachrichten wurden gezielt über ihre aus dem letzten erfolgreichen Publisher-Lauf belegten bestehenden Message-IDs gelesen. Die ursprünglich verwendeten 100-Nachrichten-Seiten allein reichen nicht aus, um ältere, wiederholt bearbeitete feste Nachrichten zu finden. Das Kings-Branding ersetzt das 👑-Zeichen in Discord-Nachrichtentexten durch ein eigenes Logo; Verträge prüfen daher den stabilen Titeltext. Der Lauf vom 21.11. meldet beide Inhalts-/Aktualitätsprüfungen als bestanden.

## 2a. Verifizierte ereignisabhängige Veröffentlichungen (21.11.2026)

**Produktiver Nachweis:** [GitHub Read-only-Run 44953466706](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44953466706). Nach temporär unverifiziertem System-Alerts-GET wurde die Lesereoutine auf **maximal drei** Versuche bei Discord 429/5xx/Netzfehlern begrenzt und danach erneut mit realem Discord verifiziert. Fehler nach erschöpfter Retry-Frist bleiben rot/unverifiziert. Offline-Regressionen: **461 bestanden, 0 fehlgeschlagen**.

| System | Ergebnis am 21.11.2026 | Prüfung / echte Grenze |
| --- | --- | --- |
| Monatliche Kings-Berichte | **VERIFIED** | Beide gespeicherten Monatsnachrichten für **September und Oktober 2026** direkt via Message-ID abgerufen und auf korrektes Webhook, Channel, Monatsmarker, fehlende PREVIEW-Kennzeichnung geprüft; Oktobers Convoy-Backfill-Zahlen **29/28** stimmen mit bestehendem State überein |
| Changelog `S01-KL07` vom 08.11.2026 | **VERIFIED** | Tatsächliche **vier** aufeinanderfolgende Kings-Webhook-Nachrichten im begrenzten historischen Veröffentlichungszeitfenster geprüft: Release-Marker, drei Fortsetzungen und letzter Kings-Footer. **Historischer Policy-Text** weiterhin nicht automatisch aktuell, siehe #114 |
| System Alerts | **VERIFIED** | Eine echte bot-eigene technische Kings System-Alert-Publikation in der letzten 100er-Kanalhistorie bestätigt. Dies beweist **nicht**, dass alle älteren Alerts/Resolves vollständig zugestellt wurden |
| Driver Updates | **VERIFIED** | Neueste erreichbare zugehörige Webhook-Nachricht mit richtigem Kings Driver Embed, Publisher/Channel, Footer und **keiner** unerlaubten @everyone-/Rollen-/Mehrfach-Nutzererwähnung. **Kein** Vollbeleg über alle 49 anonymisierten historischen Driver-Events oder jeden Join/Leave-Post, siehe #119 |
| Milestones | **NO_EVENT** | Letzter geprüfter Kings VTC-Mitgliederstand **111** liegt unter der ersten automatisierten 150er-Schwelle; nicht fälschlich einen Test-Milestone auslösen |
| Staff Public Updates | **NO_EVENT** | Letzter tatsächlicher Live-Lauf meldete null neue Staff Public Posts. **Kein** Beweis über alte Staff-Publikationen und keine Veröffentlichung zu Testzwecken |

**Statusdefinitionen:** `VERIFIED` ist ein exakt bestimmter bestehender, tatsächlich gelesener Content-/Publisher-Vertrag. `NO_EVENT` heißt, dass laut sicherer letzter Quelle kein aktueller Veröffentlichungsvorgang ausgelöst wurde – **nicht**, dass alle alten Texte geprüft sind. `UNVERIFIED` wird bei Fehler, Lücke oder fehlender Autorisierung ausgegeben und nie als Erfolg umetikettiert.

Zusätzliche Prüfroutinen: `discord-event-driven-publication-audit.js`, `discord-driver-public-updates-audit.js`. Keine produktiven Discord-Nachrichten, Rollen oder HR/Staff/Driver-Daten wurden für den Test erstellt oder verändert.

## 2b. Öffentliche Convoy-Ankündigungen und alte Leadership-Nachweise (21.11.2026)

**Öffentliche Convoy-Nachrichten – [Live-Run 44955311413](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44955311413)**:
- Das bereits historisch akzeptierte Kings Monthly Convoy #12 / TruckersMP Event 35810 wurde direkt anhand seiner gespeicherten Discord-Nachrichten-ID, des Bot-Owners und des passenden Event-ID-/URL-Markers verifiziert.
- Das zuletzt erreichbare Fenster aus **100** öffentlichen Discord-Nachrichten wurde nach bot-eigenen Kings-Convoy-Posts durchsucht. Die im Fenster sichtbaren eigenen Ankündigungen bestanden die Vertragsprüfung auf Event-ID und Event-Link, öffentliche 2h-/Starting-Now-Kennzeichnung, keine unerwarteten Rollenmentions und keine doppelten Event-IDs **innerhalb dieses begrenzten Fensters**.
- Der separat bestehende aktuelle Convoy-Verifier [44953085965](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44953085965) fand beim letzten ausgewerteten Lauf **null aktive Quelleinträge**. Der erfolgreiche Workflow-Status ist damit **kein Nachweis**, dass ein unmittelbar zukünftiges Event tatsächlich in seinem 2h-Fenster angekündigt wurde. Nachweis der künftigen Fälligkeit und des konkreten Versands bleibt offen, ohne Test-Konvoi oder Test-Ping.

**Alte Einzel-Leadership-Reports – [Live-Run 44955985452](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44955985452)**:
- `legacy-staff-daily`, `legacy-staff-weekly`, `legacy-staff-monthly` und `legacy-management-weekly`: **4 × NOT_VISIBLE**. Die im Legacy-State gespeicherten Original-IDs wurden direkt abgefragt, aber nicht mehr als Nachrichten abgerufen. Ein nicht sichtbarer Beitrag ist weder ein aktueller Report noch Beweis, wann/warum er entfernt oder unzugänglich wurde.
- Die vier Legacy-Workflow-Gruppen Driver, HR, Staff und Events haben `LEADERSHIP_CONSOLIDATED_ONLY: 'true'`, sodass `leadership-message-sync.js` den Status `suppressed` zurückgibt. Historische Caller schrieben trotzdem `publishedDailyKeys`/Perioden-Snapshots. **PR #122** hat an **zehn** Stellen verhindert, dass `suppressed` zukünftig als Veröffentlichung checkpointet wird (**467/467** Tests).
- Alte `published...`-Keys wurden **nicht** pauschal gelöscht oder rückwirkend umdatiert. Sie sind allein **kein** Zustellnachweis; separate Reconciliation unter [Issue #123](https://github.com/Stinkesocke107/kings-logistics-automation/issues/123).
- Der aktuelle produktive Leadership-Betrieb läuft über die bereits separat geprüften **fünf konsolidierten Dashboards**, nicht die alten täglichen/monatlichen Einzelmeldungen. Ein historisches `NOT_VISIBLE` erzeugt **keine** automatische Neuveröffentlichung.

**Prüfskripte:** `discord-public-convoy-content-audit.js`, `discord-legacy-leadership-evidence-audit.js`. Beide sind reine Discord-GET-Leser; bei unzuverlässigen Source- oder Content-Verträgen melden sie `UNVERIFIED`, nicht einen behaupteten Live-Erfolg.

## 2c. Issue #123 – neutrale Reconciliation historischer Leadership-Statusdaten (21.11.2026)

Der neue rein lokale Prüfer `legacy-leadership-state-reconciliation.js` liest fünf bisherige Quellen (**Driver, HR, Staff, Event, Management**) ausschließlich lesend und gibt nur aggregierte Mengen von gespeicherten Tages-/Wochen-/Monatsmarkern, Snapshot-Anzahlen sowie Strukturfehlern aus. Der bestehende Workflow `leadership-dashboard-verification.yml` führt ihn getrennt von der direkten Discord-GET-Prüfung aus. Tests verwenden künstliche Beispiele, keine künstlichen Discord-Nachrichten.

**Bedeutung der Ergebnisse:**
- `RECORDED_UNVERIFIED`: Das alte State-File enthält entsprechende Periodenmarker oder Berichtssnapshots. Dies ist **kein** Beleg, dass Discord zum gespeicherten Zeitraum einen Report erhielt. Ein `publishedAt` im historischen State ist nur interne Metadateninformation.
- `SEALED_UNVERIFIED`: Der Event-Leadership-State liegt verschlüsselt vor. Dieser öffentliche, secret-freie Prüfer versucht **keine Entschlüsselung** und meldet **keinen Nullbestand**; etwaige periodengenaue Prüfung ist nur in geschütztem Kontext zulässig.
- `UNVERIFIED`: State nicht lesbar oder nicht vorhanden; keine Veröffentlichung oder Abwesenheit behaupten.
- `HISTORICAL_PRESENT` und `NOT_VISIBLE` aus `discord-legacy-leadership-evidence-audit.js` gelten jeweils **nur für die konkret gespeicherte Message-ID**. Ein existierender einmaliger Report kann nicht automatisch sämtliche älteren Daily-/Weekly-/Monthly-Keys beweisen. Die vier geprüften Original-IDs waren beim letzten Live-GET **NOT_VISIBLE**.

**Offene Abnahme unter #123:** Echte Nachricht-zu-Periode-Zuordnung benötigt eindeutige, autorisiert zugängliche historische Discord-Belege. Fehlen diese, bleibt der jeweilige Datensatz dauerhaft `unverified`, nicht `published`, `deleted` oder `reposted`. Mögliche private Archivkennzeichnung und gesonderte Event-Entschlüsselung brauchen eine eigene Freigabe. Alte State-Dateien und bestehende Discord-Nachrichten wurden nicht geändert, keine Altberichte neu ausgesendet.

## 3. Offene Public-Inhaltsprüfungen

| System | Tatsächliche Ausgangslage | Nächster Prüfauftrag |
| --- | --- | --- |
| Changelog | Letzter Release `S01-KL07`: 4/4 bestehende Discord-Nachrichten und Webhook-Daten tatsächlich geprüft | Historischen Policy-Widerspruch zu Excellence Awards nur redaktionell freigegeben klarstellen (#114); alte Releases erhalten |
| Driver Updates | Neueste erreichbare Driver-Update-Webhook-Nachricht und sichere Einzel-Erwähnung verifiziert | Alte Join/Leave-/Promotion-Posts nicht vollständig einzeln belegbar; verschlüsselte künftige Message-Evidence prüfen (#119) |
| Milestones | Webhook korrekt zugeordnet; `data/milestones.json` enthält derzeit keine erreichten Schwellenwerte | Keine Test-Publikation erzeugen; nächstes echtes Ereignis auf nur einen korrekten Post prüfen |
| Staff Public Updates | Direkter Discord-Zielkanal bestätigt; letzter geprüfter Status meldete 0 neue Posts | Echte Staff-Event-Publikation nur bei autorisiertem Ereignis prüfen, nicht für einen Test erfinden |
| Public Kings Convoy Announcements | Akzeptiertes historisches Event 35810 und zuletzt sichtbare öffentliche Posts direkt bei Discord geprüft | Nächste **wirklich fällige** 2h-/Start-Ankündigung, Timing/Slot und vollständige Deduplizierung weiter prüfen |
| System Alerts | Aktuelle bot-eigene technische Nachricht in den letzten 100 Kanalnachrichten bestätigt | Historische Alarm-/Resolve-Ketten und Source-Reconciliation weiter prüfen, ohne User IDs zu loggen |
| Monthly Reports / weitere Leadership Reports | Zwei aktive Monatsreports geprüft; alte Staff Daily/Weekly/Monthly und Management Weekly unter gespeicherten IDs **NOT_VISIBLE**; konsolidierte Dashboards bleiben aktuell | Historische falsche `published`-Keys nicht als Zustellung werten; #123. Weitere autorisierte Content-/Berechtigungsprüfung bleibt offen |
| PostPing, Galaxy, externe Bots | Extern administrierte Systeme, nicht vollständig durch GitHub-Inventur abgedeckt | Mit zuständiger Bot-Konfiguration und separat legitimierter read-only Discord-Sicht prüfen |

## 4. Historische Changelog-Abweichungen (redaktionell, nicht heimlich ändern)

- `S01-KL07` (08.11.2026) erwähnt weiterhin getrennte **Special Excellence Awards**, während die aktuelle Kings-Policy **vier** Monatsawards hat und die bisherigen Excellence Awards entfallen sollen.
- `S01-KL06` (10.10.2026) sagt, dass personalisierte Profil-Assets zur damaligen Zeit Leadership/High Staff vorbehalten seien. Im aktuellen Assetplan sind **Exclusive Leadership Assets gestrichen**.
- Das sind historische Quellen aus ihrem Veröffentlichungszeitpunkt und sollen **nicht rückdatiert, gelöscht oder stillschweigend umgeschrieben** werden. Eine öffentliche Klarstellung muss zunächst durch den CEO redaktionell genehmigt werden. Nachverfolgung: [Issue #114](https://github.com/Stinkesocke107/kings-logistics-automation/issues/114).

## 5. Sicherheit und Abnahme

- Die Compliance der gesamten Guild, aller privaten Channel-Texte, alten Event-Posts und aller externen Bots ist **noch nicht bestätigt**. Issue [#105](https://github.com/Stinkesocke107/kings-logistics-automation/issues/105) bleibt offen.
- Kanäle und Publisher niemals testweise mit Nachrichten fluten. Einen realen Publish nur an einem echten fachlichen Ereignis bestätigen.
- Kein Discord-Restore, keine Rollenänderung, keine Admin-/HR-Entscheidung und keine Publikation aus diesen Audit-Runs.
- Die Live-Provider-Störung und Core-/Freeze-Checks werden durch erfolgreiche Discord-Verifikationen **nicht** in `HEALTHY` umgedeutet.
