# Kings Logistics – Discord-Systeme, Public- und Leadership-Publikationen: Prüfstand

**Datum:** 21. November 2026. Quellen: bestehende Kings-Workflows und **tatsächliche, nur lesende Discord-GET-Läufe**. Dieses Dokument ist ein Prüfnachweis, **keine** Erklärung, dass jeder alte Beitrag und jedes externe Discord-Tool vollständig aktuell ist.

## 1. Nachgewiesene Live-Ergebnisse

| Umfang | Ergebnis | Was wirklich geprüft wurde | Nachweis |
| --- | ---: | --- | --- |
| 5 konsolidierte Leadership-Dashboards + 3 feste Live-Systemnachrichten | **8/8** | Eindeutige gespeicherte Discord-Nachrichten und Embeds, teilweise Quellkontrakte | [Read-only-Lauf 44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556) |
| Bekannte direkte Leadership-/Public-/interne/technische Discord-Kanal- und Forum-IDs | **13/13** | Existenz, Kanaltyp und Kings-Guild-Zuordnung; keine Texte | [Run 44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556) |
| Vertiefte Inhaltsverträge real veröffentlichter Nachrichten | **7/7** | 3 ehrliche Live-Outage-Banner; Staff Rollenquelle/Anstellungshinweis; neueste News; System Monitor; Convoy Overview | [Run 44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556) |
| Webhook-Ziele bestehender Pub-Automationen | **8/8** | Discord-Webhooks zeigen auf konfigurierte Kings-Guild-Kanäle: Live Tracker, Statistics, Central, News, Changelog, Milestones, Driver Updates, Monthly Report | [Run 44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556) |

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

## 3. Offene Public-Inhaltsprüfungen

| System | Tatsächliche Ausgangslage | Nächster Prüfauftrag |
| --- | --- | --- |
| Changelog | Webhook korrekt zugeordnet; letzter gespeicherter Release `S01-KL07` (08.11.2026); ereignisgetrieben | Tatsächliche Changelog-Discord-Nachrichten, Duplikate, Freigaben und Inhalte gezielt prüfen |
| Driver Updates | Webhook korrekt zugeordnet; Änderungen sind ereignisgetrieben | Neue echte Join/Leave-Publikation gegen gespeicherte **private** Berechtigung/Quellen prüfen; keine Daten in GitHub Logs |
| Milestones | Webhook korrekt zugeordnet; `data/milestones.json` enthält derzeit keine erreichten Schwellenwerte | Keine Test-Publikation erzeugen; nächstes echtes Ereignis auf nur einen korrekten Post prüfen |
| Staff Public Updates | Direkter Discord-Zielkanal bestätigt; letzter geprüfter Status meldete 0 neue Posts | Echte Staff-Event-Publikation nur bei autorisiertem Ereignis prüfen, nicht für einen Test erfinden |
| Public Kings Convoy Announcements | Kanal bestätigt; separat bereits frühere reale Publikationsbelege | Nächste echte 2h-/Start-Ankündigung, Timing, Slot und Duplikate gegen Events prüfen |
| System Alerts | Technischer Kanal bestätigt; Monitoring meldet externe Abhängigkeiten | Konkrete Alarm-/Resolve-Folgen und frische Quellen gegen Status prüfen, ohne Texte oder User IDs zu loggen |
| Monthly Reports / weitere Leadership Reports | Konfigurations-/Workflow-Prüfungen, aber nicht alle individuellen letzten Texte geprüft | Zu korrektem Monat und autorisiertem Veröffentlichungszeitpunkt den tatsächlichen Bericht kontrollieren |
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
