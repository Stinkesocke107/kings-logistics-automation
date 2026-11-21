# Kings Logistics – Aktuelles System- und Betriebshandbuch

**Live-Inventur vom 21. November 2026.** Für den tatsächlichen aktuellen Produktionszustand immer das `main`-Repository, `kings-workflow-registry.js`, `.github/workflows/` und jüngste GitHub-Run- sowie Discord-GET-Nachweise prüfen. Dieses Dokument ist ein Master-Einstiegspunkt, **kein** abgeschlossener Vollaudit aller Discord-Inhalte.

## 1. Geltungsbereich
Nur Kings Logistics (ETS2 / ATS auf allen offiziell unterstützten Multiplayer-Plattformen). Kings Hub und RealmMP werden später mit eigenen Teams, Rollen, Rollenrechten und Datenquellen aufgebaut; Kings Logistics Management erhält dort keine automatischen Führungstitel. CEO ist die alleinige höchste Kings Logistics Entscheidungsinstanz.

**44 produktiv registrierte Workflow-Dateien**: 32 mit Schedule, 12 on-change/manuell laut aktuellem Register. `SYSTEM-INVENTORY.md` ist ein historisches Cleanup-Protokoll; `docs/final-core-documentation.md` dokumentiert den Stand September 2026 und ist **nicht** alleinige Quelle für 2026-November-Betriebsregeln.

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

## 4. Discord-Destinationen – echte Beweisgrenzen
- **8/8 feste Nachrichten** wurden am 21. November 2026 im bestehenden `discord-fixed-message-audit.js` per Discord GET direkt geprüft: fünf Leadership-Dashboards (Driver, HR, Staff, Event, Management) und Live Tracker, Advanced Statistics, Central Overview. Diese Prüfung verifiziert Nachricht/Embed und einzelne Datenkontrakte, **nicht jeden** Inhalt oder jeden Public Channel.
- **13 direkte Kanal-/Forum-Mappings** sind im neuen `discord-channel-inventory-audit.js` dokumentiert (Leadership, Staff Public, Public Convoys/Overview, interne Convoy-Quellen und technische System-Kanäle). Das separate read-only Produktionsresultat entscheidet, ob sie zur Laufzeit erreichbar sind.
- **Noch nicht voll inhaltsgeprüft**: News, Changelog, Milestones, Driver Updates, Staff Updates, Convoy/Slot-Publikationen, System Monitor/Alerts, restliche Reports, externe PostPing- und Galaxy-Ausgaben sowie eigens geschützte HR Register. Webhook-Targets brauchen geprüfte Zuordnung; keine Schätzung aus Kanalnamen.
- **Prüfmatrix**: erwarteter Publisher + tatsächlicher Channel/Forum + berechtigte Rollen/Bot + Message-ID/Owner + Datenquelle + Timestamp + aktuelle Kings Policy + Fehler-/Duplikatstatus + unmittelbarer Nachweis. Bestehende Discord-Nachrichten nicht blind ersetzen.
- `#105` ist der vollständige Nachweisauftrag; Live map provider `#42/#72` und Audit `#73` bleiben unabhängig.

## 5. Datenschutz und Datenmigration
- Aktueller Event Leadership Report State ist AES-256-GCM-verschlüsselt nach #101/#102.
- Vollständiges altes Convoy-Roharchiv ist verschlüsselt; aktueller öffentlicher Legacy Convoy Export enthält keine freien Staff-Notizen/Slot-Belegtexte/Bildbegleittexte (#103). **Operative Bild-/Discord-Verweise** können weiter öffentlich vorhanden sein und bleiben eigenes Datenschutz-ToDo #100.
- Historische Git Commits/Actions-Logs/Forks sind mit einem normalen Commit nicht retroaktiv gereinigt. Eventuelle History-Rewrites nur nach gesonderter CEO-Freigabe und Backup/Recovery-Plan.

## 6. Pflege der aktuellen Guides
1. Jeden Änderungsvorschlag mit aktiver Workflow-Datei, tatsächlichem Code und bestehendem Dateneigentümer abgleichen.
2. `implemented` (Code vorhanden), `configured` (Secrets/Kanäle), `live-verified` (echte Lauf-/Discord-Beweise), `planned` und `outage` ausdrücklich trennen.
3. Historische Baselines niemals löschen oder als aktuellen Gesundheitsstatus bewerben.
4. Alle 44 Workflows, Discord Sink-/Source-Verträge, Event-/Award-/HR-Richtlinien, Backup-Scope und CEO-Rechte nach Änderung in Docs und Tests aktualisieren.
5. Bei unklarer Quelle `unverified`/"unavailable" ausgeben statt Werte oder Freigaben zu erfinden.

Verfolgung: Issues #105 (Kanal-/Inhaltsprüfung), #106 (Guides), #107 (CEO System Command Center). Der spätere CEO-Kontrollkanal wird erst nach gesonderter Sicherheitsfreigabe produktiv aktiviert.
