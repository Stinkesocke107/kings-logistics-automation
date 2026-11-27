# Kings Logistics – Aktuelles System- und Betriebshandbuch

**Live-Inventur vom 21. November 2026.** Für den tatsächlichen aktuellen Produktionszustand immer das `main`-Repository, `kings-workflow-registry.js`, `.github/workflows/` und jüngste GitHub-Run- sowie Discord-GET-Nachweise prüfen. Dieses Dokument ist ein Master-Einstiegspunkt, **kein** abgeschlossener Vollaudit aller Discord-Inhalte.

## Betriebsstatus – technische Nachweise vom 27. November 2026

- **Registrierung:** 46 vorhandene GitHub-Workflows, 33 geplant und 13 manuell/on-change. Keiner ist dadurch automatisch fachlich oder vom CEO endabgenommen. Die formalen offenen Tore bleiben in `kings-system-acceptance.js` und `kings-system-open-work.js` nachvollziehbar.
- **Regression:** [880/880 isolierte Tests bestanden](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45919917295). Die Green-CI ersetzt weder echten Personalentscheidungen noch vollständige Betriebsnachweise.
- **Backup:** Der jüngste [isolierte Restore](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45915470464) bestätigte 454/454 Dateien, 49 kritische Quellen und 76 JSON-Validierungen. Echtes Desaster-Recovery, Schlüsselverwahrung und Wiederinbetriebnahme bleiben offen.
- **Event-Systeme #12/#14/#15/#16/#18:** [Gemeinsame echte GET-only Prüfung](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45914805638) bestätigte Quellen-/Staff-Arbeitslistenabgleich und unabhängig gespeicherte Dashboard-Felder. Originalhistorien, neuer natürlicher Staff-Befehl und formelle Team-/CEO-Freigabe fehlen.
- **Changelog Editor & Publisher:** Readback vor neuem Post und No-Duplicate-Recovery sind im bestehenden System abgesichert; Teilzustellung oder gescheiterte Rücklesung blockieren weitere Posts. Kein künstlicher Changelog, realer nächster Release und autorisierte Recovery-Abnahme bleiben offen. Siehe [Sicherheits- und Übergaberegeln](KINGS-CHANGELOG-EDITOR-PUBLISHER-ACCEPTANCE-2026-11-27.md).
- **Echte externe Störung:** ETS2-/ATS-Spielerpositionen der vollständigen Map-Quelle sind weiterhin nicht belegt. Offizielle map-unabhängige VTC-/Server-Gesamtzahlen laufen als ehrliche Ersatzdaten; die verifizierte Kings-Spieler-Statistik enthält keine neuen bestätigten Stunden nach dem 18. November 2026. Monatsbericht, Core E2E und Final Freeze dürfen deswegen nicht grün gerechnet werden.
- **Betrieb & Datenschutz:** Neue Driver-/HR-/Staff-Aktionen benötigen genuine autorisierte Quellereignisse. Die reine erfolgreiche Abfrage eines Rosters oder Discord-Dashboards ist **keine** Genehmigung. Alle fünf Event-Systeme bleiben bis zur menschlichen Abnahme und nachgewiesenen E2E-Kette offen; #17 Event Booking & Slot Management bleibt gestrichen.

Der frühere 21.-November-Audit und seine damals korrekten Run-Zahlen bleiben in den folgenden Abschnitten als historische Belege erhalten. Bei Konflikten gilt der **aktuelle `main`-Quellzustand** mit neuen nachprüfbaren Runs, nicht ein älterer gespeicherter Dashboard-Zeitstempel.

## 1. Geltungsbereich
Nur Kings Logistics (ETS2 / ATS auf allen offiziell unterstützten Multiplayer-Plattformen). Kings Hub und RealmMP werden später mit eigenen Teams, Rollen, Rollenrechten und Datenquellen aufgebaut; Kings Logistics Management erhält dort keine automatischen Führungstitel. CEO ist die alleinige höchste Kings Logistics Entscheidungsinstanz.

**Aktueller Stand 27. November 2026: 46 registrierte Workflow-Dateien** — 33 mit Schedule, 13 manuell/on-change. Die frühere Inventur vom 21. November hatte 44 Workflows (32 Schedule, 12 manuell/on-change); sie ist eine historische Momentaufnahme, kein aktueller Bestand. `SYSTEM-INVENTORY.md` ist ein historisches Cleanup-Protokoll; `docs/final-core-documentation.md` dokumentiert den Stand September 2026 und ist **nicht** alleinige Quelle für 2026-November-Betriebsregeln.

## 2. Verbindliche Quellen
- **Driver Identity / Original Kings Join Date:** nur Management-verifiziertes privates Driver Identity Register; `discord_id` verknüpft mögliche geprüfte TMP-/HaulMP-/TLMP-IDs. Nie `Discord joined_at` oder VTC-Join als Ersatz.
- **Aktuelle Kings Drivers/Trials:** aktuelle Discord-Rollen; **offizieller TMP-VTC-Mitgliederbestand** ist eine andere Menge. Keine VTC-only- oder Trial-Konten als bestätigte aktive Drivers ausgeben.
- **Staff-Rollen:** tatsächliche Discord-Staff-Hierarchie; von TMP-VTC klassifizierte Staff zählen separat. Ursprüngliche Staff-Ernennung und HR-/CEO-Autorisierung sind **noch nicht** durch ein produktives Staff Appointment Register belegbar.
- **HR-Erstaufnahmen/Rückkehr:** formelle Human-Freigabe ist unabhängig vom Driver Identity Register; der geschützte HR Decision Source / Case View ist vorbereitet, aber nicht als reale Produktionsquelle bestätigt.
- **Awards:** vier aktuelle Monatskategorien: Driver of the Month, Staff of the Month einschließlich Leadership, Recruiter of the Month, Photo of the Month. Sieger ausschließlich nach Leadership-Freigabe.
- **Partner, Events, Slot-Freigaben, Award-Sieger:** eigene autorisierte Quellen sind für weitere Integration vorgesehen. Keine automatische menschliche Entscheidung aus einem Discord-Rollenstatus.
- **Live Online:** vollständige und verifizierte Map-Provider-Snapshot-Abdeckung. Während externem Ausfall: **Unavailable**. Weder alte Daten neu datieren noch Trucky-Teilmengen / Weltservergesamtzahlen als Kings Onlinewert ausgeben.
- **Käufe/Circle/Shop:** offizielle Zahlungs-/Commerce-Quelle statt Discord-Supporter-Rolle als Kaufnachweis.

## 3. Monitoring und Betrieb
- **Technische Gesundheit:** GitHub Workflow-Status ≠ Zustand der Daten. Der Monitor kann erfolgreich laufen und dennoch korrekt `UNHEALTHY` feststellen. Live Tracker/Statistics/Core/Final Freeze bleiben solange blockiert, wie aktuelle volle Spieler-Map-Abdeckung fehlt.
- **Loyalty-Rollen:** Scheduled- und Push-Läufe strikt **dry-run**. Seit dem Sicherheitsfix #104 darf der Central Scheduler *keinen* `role_sync_mode=live`-Workflow automatisch dispatchen. Live-Rollenwrites nur nach manueller Einzelprüfung, gesondertem Opt-in und bei Entfernung zusätzlicher Zustimmung.
- **Backup:** regulärer `core-backup.yml`-Workflow und freigegebene Restore Points. Eine bloße ZIP-Erstellung ist kein erfolgreich verifizierter Restore. Vor jeder Wiederherstellung Backup-Health, Manifest/Checksummen und geschützte Recovery-Gates prüfen.
- **Publikation:** feste Dashboards nur nach eindeutiger Nachrichten-Identitätsprüfung PATCHen; keine ungeprüfte Neuerstellung oder automatische Duplikat-Entfernung. Ereignisbasierte News/Posts nur bei echten neuen Daten. Private Angaben nie in öffentlichen GitHub Actions Logs speichern.
- **Reparaturen:** zuerst read-only und isolierte Tests. Keine Rollen-/HR-/Ticket-/Guild-/Channel-Schreibaktionen ohne zuständige Freigabe.

## 4. Discord-Destinationen – geprüfter Stand und Beweisgrenzen
- **8/8 feste Nachrichten** direkt auf Discord gelesen (fünf Leadership-Dashboards, Live Tracker, Statistics, Central Overview).
- **13/13 direkte Channel-/Forum-Mappings**: Typ, Guild und Existenz live bestätigt.
- **7/7 konkrete Inhaltsverträge**: drei ehrliche Live-Outage-Embeds, Staff Rollen-/Appointment-Trennung, zuletzt publizierte News, System Monitor, Convoy Overview.
- **8/8 konfigurierte Webhook-Targets**: Live, Statistics, Central, News, Changelog, Milestones, Driver Updates und Monthly Report zeigen auf Kings-Discord. Korrekte Zielzuordnung allein beweist **keine** ereignisgetriebenen Nachrichten; deren einzelne tatsächliche Publikationsbelege stehen im verlinkten Auditbericht.
- **Zusätzliche ereignisabhängige Veröffentlichungsbeweise:** beide gespeicherten Monatsberichte, 4/4 Nachrichten des letzten Changelogs, eine technische System-Alert-Nachricht und der neueste erreichbare Driver-Update-Post auf Embed/Erwähnungen geprüft. Für Milestones und Staff Public Updates lagen **keine neuen Veröffentlichungsereignisse** vor. [Live-Lauf 44953466706](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44953466706); 461/461 isolierte Tests.
- **Live-Run-Nachweis:** [44951155556](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44951155556). Die Mengen überschneiden sich und dürfen nicht zu einer fiktiven Gesamtzahl einzigartiger Nachrichten addiert werden.
- **Convoy-Public und Leadership-Legacy separat geprüft:** historisch akzeptiertes Convoy-Event und sichtbare aktuelle öffentliche Kings-Event-Posts bestehen die direkten Content-Verträge ([Run 44955311413](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44955311413)); der separate zeitabhängige Verifier prüfte zuletzt 0 aktive Quelleinträge und beweist daher keine zukünftige Ankündigung. Alle vier unter gespeicherten IDs abgefragten alten Staff-/Management-Einzelberichte waren **NOT_VISIBLE** ([Run 44955985452](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44955985452)). Legacy-Skripte speichern nach Sicherheitsfix #122 keinen `suppressed`-Post mehr als `published`; historische Records bleiben bis #123 getrennt unverifiziert.
- **Noch ausstehend:** inhaltliche Vollprüfung aller historischen/ereignisgetriebenen Public Posts, Changelog, Staff/Driver Updates, Awards, Milestones, Monatsberichte, System Alerts, externe PostPing-/Galaxy-Bots und private HR-Berechtigungen. Alte Publikationen nicht heimlich überschreiben.
- **Audit-Matrix und Fundstellen:** [KINGS-DISCORD-PUBLICATION-AUDIT-2026-11-21.md](KINGS-DISCORD-PUBLICATION-AUDIT-2026-11-21.md). Verantwortliche Issues: #105 (Kanäle/Texte), #106 (Guides), #114 (historische Changelog-Aussagen). Der Map-Provider-Ausfall und #73 bleiben ausdrücklich offen.

## 5. Datenschutz und Datenmigration
- Aktueller Event Leadership Report State ist AES-256-GCM-verschlüsselt nach #101/#102.
- Vollständiges altes Convoy-Roharchiv ist verschlüsselt; aktueller öffentlicher Legacy Convoy Export enthält keine freien Staff-Notizen/Slot-Belegtexte/Bildbegleittexte (#103). **Operative Bild-/Discord-Verweise** können weiter öffentlich vorhanden sein und bleiben eigenes Datenschutz-ToDo #100.
- Historische Git Commits/Actions-Logs/Forks sind mit einem normalen Commit nicht retroaktiv gereinigt. Eventuelle History-Rewrites nur nach gesonderter CEO-Freigabe und Backup/Recovery-Plan.

## 6. Pflege der aktuellen Guides
1. Jeden Änderungsvorschlag mit aktiver Workflow-Datei, tatsächlichem Code und bestehendem Dateneigentümer abgleichen.
2. `implemented` (Code vorhanden), `configured` (Secrets/Kanäle), `live-verified` (echte Lauf-/Discord-Beweise), `planned` und `outage` ausdrücklich trennen.
3. Historische Baselines niemals löschen oder als aktuellen Gesundheitsstatus bewerben.
4. Alle 46 Workflows, Discord Sink-/Source-Verträge, Event-/Award-/HR-Richtlinien, Backup-Scope und CEO-Rechte nach Änderung in Docs und Tests aktualisieren.
5. Bei unklarer Quelle `unverified`/"unavailable" ausgeben statt Werte oder Freigaben zu erfinden.

Verfolgung: Issues #105 (Kanal-/Inhaltsprüfung), #106 (Guides), #107 (CEO System Command Center). Der spätere CEO-Kontrollkanal wird erst nach gesonderter Sicherheitsfreigabe produktiv aktiviert.
