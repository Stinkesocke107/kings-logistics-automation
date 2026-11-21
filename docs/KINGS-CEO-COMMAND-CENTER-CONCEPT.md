# Kings Logistics CEO System Command Center – Sicherheits- und Funktionskonzept

**Status: GEPLANT, nicht aktiviert.** Ein neuer Discord-Kanal oder Bot-Command wurde durch dieses Dokument **nicht** erstellt. Ausschließlich Kings Logistics, unabhängig von Kings Hub und RealmMP.

## 1. Discord-Aufbau
Empfohlener privater Kanal: `👑｜ceo-system-control`. Optional zweiter geschützter, nur lesbarer Audit-Log-Kanal `🔐｜system-control-history`. Ein **echter Slash Command** wie `/kings status` ist besser als eine freie Textfolge `/!`: Discord verarbeitet die Interaktion strukturiert, erlaubt serverseitige Command-/Channel-Beschränkung und private Antworten.

Die Discord-UI-Berechtigung ist nur die erste Grenze. Für **jede** Aktion zusätzlich im vertrauenswürdigen Backend prüfen:
- echte Discord Interaction Signatur, Request-Zeitfenster und Nonce (Replay-Schutz);
- exakt Kings Logistics Guild ID und genehmigte Command-Channel-ID; keine DMs;
- exakte explizit konfigurierte CEO User-ID **und** aktuelle verifizierte CEO-Rolle;
- Bot-/Webhook-Absender ablehnen, keine Autorisierung allein durch Rollenname/Nickname oder beliebige Administratorrechte;
- Risiko eines `ADMINISTRATOR`-Bypasses und der `Manage Roles`-Berechtigung bei Discord berücksichtigen.
- separat geschützter Connector/GitHub App mit den **minimalen** Actions-Rechten; keine Discord-Nachricht trägt Github Tokens, Key-Dateien oder Webhooks.

## 2. Kommando-Vorschlag
| Slash Command | Risiko | Geplantes Verhalten |
| --- | --- | --- |
| `/kings help` | lesend | alle CEO-Funktionen und Sicherheitsregeln |
| `/kings status` | lesend | systemweite aktuelle Gesundheitsdaten mit echten Quell-Zeitstempeln |
| `/kings channels` | lesend | geprüfte 8 feste Messages, 13 Kanal-Mappings und offene Nachweise |
| `/kings audit` | lesend/Dispatch | vorab genehmigte **read-only** Prüfroutinen; Ergebnis erst nach realem Lauf |
| `/kings backup create` | geschützt | vorhandenen Restore-Point-Backup-Workflow mit zugelassenem Namen starten, Ergebnis/Prüfung abwarten |
| `/kings pause <system>` | geschützt | nur explizit freigegebene, reversible Publisher pausieren; systemweiter State mit Ablaufzeit |
| `/kings resume <system>` | geschützt | Zustand/Permissions/Datenquelle kontrollieren, dry-run, dann nur erlaubten Publisher fortsetzen |
| `/kings maintenance on/off` | geschützt | zeitbegrenzter Wartungsmodus für allowlistete Publisher, nicht Monitoring/Security/Backups |
| `/kings history` | lesend | minimaler, geschützter Audit-Trail ohne personenbezogene Discord-Daten |

**Keine direkten Chat-Befehle** für `restore apply`, Geheimnisrotation, Git-History-Rewrite, Staff-/Driver-/HR-Rollenänderungen, Vergabe von Awards, Guild-/Permission-Löschungen oder unbeschränkte `pause all`-Aktionen. Recovery bleibt im bestehenden, getrennt abgesicherten `kings-production-recovery`-GitHub-Environment mit zuständiger menschlicher Freigabe.

## 3. Zwei-Stufen-Freigabe
Für jeden schreibenden Befehl:
1. Privater Vorschau-Dialog mit Ziel (feste allowlist-ID), konkreter Wirkung, Risiko und Rücknahmeoption. Ohne echte Quellverifikation keine Bestätigung.
2. CEO bestätigt ein *einmaliges*, kurzlebiges, serverseitig gebundenes Bestätigungstoken; anschließend Job-ID oder Change-Record erzeugen. **Keine Erfolgsmeldung**, bis Aktion/Prüfung von GitHub oder Discord nachgewiesen wurde.

Mindestschutz: Cooldowns, Double-Submit-Erkennung, idempotente Requests, Ablaufzeit, Crash-safe Status, unabhängiger unveränderbarer Audit-Nachweis, Standard `deny`.

## 4. Betriebssemantik von Pause und Fortsetzen
Das bloße Deaktivieren von GitHub Actions ist keine sichere Pause. Ein geschütztes, zentral gepflegtes `pauseState` muss vor jeder einzelnen schreibenden Publisher-Aktion überprüft werden. Die Quellenabfragen/Monitoring können weiterlaufen; Security, Alerts, System Health, Backups, Datenintegrität und HR-Personalentscheidungsregeln werden **niemals** pausiert. Pausierte Veröffentlichungen werden beim Resume **nicht blind nachgeschoben**. Vorher Datenfrische, Message-ID, offene Duplikate und API-Gesundheit prüfen.

## 5. Einführung
**Phase 1:** dokumentierte CEO-only Command Permissions, Geheimnisverwaltung, Schlüssel-/Rollenkonzept und read-only `help/status/channels` mit Mocktests.

**Phase 2:** `audit` mit erlaubten read-only GitHub-Workflows. **Phase 3:** Backup Create und allowlistete Pause/Resume-Mechanik nach Einzeltests, manueller CEO-Freigabe und nachweisbarer Recovery-Möglichkeit.

Die echte CEO User-ID, CEO Role-ID und der bestätigte private Channel werden **nicht** aus Nicknames/alten Nachrichten erraten. Vorhandenes Bot-System nur nach API-/Berechtigungsprüfung wiederverwenden. Verfolgung: Issue #107.
