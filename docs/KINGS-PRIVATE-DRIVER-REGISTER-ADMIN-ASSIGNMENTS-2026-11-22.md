# Kings Logistics – Private Driver Register: Administrator-Zuweisungen (22.11.2026)

## CEO-Freigabe (22.11.2026) – präzisierte Administrator-Policy

Der Kings CEO bestätigt, dass **ausschließlich die CEO-Rolle und der Galaxy-Bot** Administrator-Rechte im Kings Discord besitzen sollen. Galaxy wird für Ticket-System und Moderations-/Ban-Befehle genutzt. **Das ist eine ausdrücklich akzeptierte technische Zugriffsmöglichkeit des Galaxy-Bots auf geschützte Kanäle.** Keine Rollen, Berechtigungen oder Channel-Overrides werden durch diese Codeänderung geändert.

Die vorherige Zuordnung "unapproved Administrator" war bezogen auf diese ausdrückliche Galaxy-Freigabe zu grob. Der neue Audit:
- Akzeptiert **nur** exakt benannte CEO-Rollen als menschliche Administrator-Policy-Ausnahme; gewöhnliches Head Management, Management und Staff erhalten nicht automatisch die Ausnahme.
- Akzeptiert den **Galaxy-Bot als Principal**, nicht pauschal jede Rolle mit seinem Namen: Die als `Galaxy` oder `Galaxy Bot` benannte, Discord-verwaltete Bot-Rolle muss per `tags.bot_id` und Live-Member-GET als echter Bot nachgewiesen werden. Galaxy kann seine Administratorrechte entweder direkt über diese managed-Rolle **oder durch eine zusätzlich zugewiesene Rolle** erhalten. Bei einer zusätzlichen globalen Admin-Rolle prüft der Audit vollständig, dass **kein anderes nicht freigegebenes Mitglied** diese Rechte dadurch erhält. Ein Rollenname allein reicht niemals.
- Prüft alle weiteren Rollen mit Administrator-Berechtigung weiterhin via **vollständiger anonymer Zuweisungsprüfung**. Ein zusätzlicher vergebener Admin-Role bleibt `ASSIGNED_PRIVATE_REVIEW_REQUIRED`.
- Verweigert eine grüne Meldung, wenn Galaxy nicht eindeutig als echter Bot nachgewiesen werden kann (`GALAXY_IDENTITY_UNVERIFIED`).
- `APPROVED_CEO_AND_GALAXY_ONLY` gilt bei direkt administrativer managed Galaxy Rolle und ausschließlich CEO. `NO_OTHER_ADMIN_ASSIGNMENTS_OBSERVED` bedeutet, dass eine **separate** Admin-Rolle durch das ganze Member-Audit nur bei Galaxy (oder Guild-Owner) zugeordnet war; diese Rolle bleibt separat zu überwachen, da spätere Zuweisungen möglich sind. Beide Aussagen betreffen ausschließlich den Prüfzeitpunkt; sie erlauben keine Zugriffsbehauptungen über die Vergangenheit.

Die strukturelle Kanalprüfung darf ihren `ADVISORY`-Status behalten, weil sie bewusst **keine** Mitglieder-/Bot-Zuweisungen prüft. Erst die separate Identitätsprüfung kann diese fehlende Beweisdimension abdecken.


## Was Issue #130 belegt – und was nicht

Der bestehende strukturelle Audit kontrolliert @everyone-Deny, Channel-Overrides, Rollenmetadaten und Bot-Leserechte des privaten Driver Registers. Er meldet eine mögliche Administrator-Ausnahme, ohne die tatsächlichen Rollenzuweisungen zu prüfen. Discord Administrator kann Channel-Overrides umgehen. Daraus ergibt sich **kein Nachweis eines tatsächlichen Datenzugriffs oder Datenschutzvorfalls**.

Die neue Ergänzung überprüft ausschließlich die momentane Administrator-Rollenzuweisung. Sie greift weder auf Driver-Register-Nachrichten noch auf HR-Datensätze oder vertrauliche Discord-Nachrichten zu.

## Datensparsamkeit

- Ausschließlich GET: eigene Bot-Identität, Server-Rollen- und Kanalmetadaten, eigene Bot-Rollen, Server-Owner und bei Bedarf paginierte Mitgliederliste.
- Nur falls eine strukturell nicht zugelassene Administrator-Rolle vorliegt, werden kurzfristig Guild-Member-Rollen im Arbeitsspeicher überprüft. Der Owner ist davon ausgenommen (er kann als Server-Owner ohnehin auf die Channels zugreifen).
- Discords List Guild Members erfordert den privilegierten GUILD_MEMBERS-Intent. Fehlender Zugriff oder unvollständige Pagination ergeben immer **INCONCLUSIVE**, niemals einen falschen grünen Sicherheitsnachweis.
- Keine Mitglieder-/Rollen-Namen, Discord-IDs, konkreten Rollenzuweisungen, Members-Listen oder Privatdaten in GitHub-Dateien, Action-Artefakten oder Ausgaben.
- Keine Channel- oder Rollenänderungen, keine Entarchivierung, keine gelesenen privaten Discord-Nachrichten. Kein Rückschluss auf historische Nachrichtenzugriffe möglich.

## Statusauswertung

- ASSIGNED_PRIVATE_REVIEW_REQUIRED: Mindestens eine unklare zusätzliche Administrator-Rolle ist einem Nicht-Owner zugewiesen. CEO/Management müssen privat die Legitimität prüfen. **Kein Beweis für Missbrauch.**
- NO_NONOWNER_ASSIGNMENTS_OBSERVED: Vollständig paginierte Liste zeigte zum Prüfzeitpunkt keine Zuweisung solcher Rollen an Nicht-Owner. Künftige Vergaben bleiben möglich.
- NO_UNAPPROVED_ADMIN_ROLES: Die Rollenmetadaten enthalten derzeit keine strukturell unbekannte Administrator-Rolle.
- INCONCLUSIVE_MEMBER_LIST, INCONCLUSIVE_TOO_MANY_MEMBERS, INCONCLUSIVE_METADATA, STRUCTURAL_REVIEW_REQUIRED: Kein ausreichender Nachweis. Manuelle Abnahme erforderlich.
- GUILD_WIDE_ADMINISTRATOR: @everyone hat Administrator; die Private-Channel-Sperre kann diese Berechtigung nicht aufheben.

## Vertrauliche CEO-Abnahme

1. Discord Servereinstellungen > Rollen > Berechtigungen: Administrator-Rollen, Zuweisungen und Notwendigkeit prüfen. Keine Inhaber, Rollen-IDs oder personenbezogenen Details in öffentlichen GitHub-Issues nennen.
2. Bestätigen, dass ausschließlich CEO, ausdrücklich genehmigte Management-Funktionen und der Kings Systems Bot Zugang zum privaten Driver Identity Register erhalten.
3. Falls Berechtigungen geändert werden sollen, nur nach ausdrücklicher CEO-Entscheidung. Der Audit selbst führt **keine Änderung** aus.
4. Die beiden optionalen HR-Channel-Konfigurationen bleiben separate Aufgaben; NOT_CONFIGURED ist niemals VERIFIED.
5. Das Issue #130 erst nach vertraulicher Owner-Abnahme schließen.

## Qualitätssicherung

- Vollständig synthetische Regressionstests für zugewiesene/unzugewiesene Administrator-Rollen, Owner-Ausnahme, GUILD_MEMBERS-Intent-Fehler, 1001-Member-Pagination, fehlerhafte Channel-Overrides und fehlende Rollenbeweise.
- Der Leadership Dashboard Verification Workflow führt den neuen Prüfungsschritt beratend, read-only und ohne Mitglieder-/Rollen-Namensausgaben aus.
- Erfolgreicher GitHub-Workflow ist kein vollständiger Privacy-Nachweis bei INCONCLUSIVE oder ASSIGNED_PRIVATE_REVIEW_REQUIRED.
