# Kings Logistics — Monthly Report #35: wiederkehrender Originalnachweis

**Stand 27. November 2026 – technischer Draft, kein Produktivnachweis.**

## Befund

Die vorhandene Kings-Monatsveröffentlichung und der unabhängige
`Kings Monthly Report Verification`-Workflow sind bereits produktiv angelegt.
Der bisherige dauerhafte Produktionsbeweis in
`data/monthly-live-proof.json` wird aber ausdrücklich nur für den historischen
September 2026 angelegt. Selbst ein korrekter späterer Monatsbericht würde
hier keine neue periodenspezifische Abnahme erzeugen. Historische Belege
dürfen **nicht** mit aktuellen Zahlen überschrieben oder umgedeutet werden.

Darüber hinaus prüft der bisherige Verifier außerhalb des Monatswechsels
standardmäßig nur die noch laufende aktuelle Monatsabdeckung. Ein früher
veröffentlichter abgeschlossener Monat konnte so nicht gezielt erneut
überprüft werden.

## Implementierte, weiterhin sichere Erweiterung

- Bestehender **Workflow und Schedule bleiben unverändert**:
  weiterhin Monatsverification am 1. UTC-Tag um 11:00 UTC.
- Der vorhandene manuelle `workflow_dispatch` bietet ein Auswahlfeld
  `verify_month = current | previous`. Voreinstellung
  `current`; nur ein absichtlich gestarteter Lauf mit
  `previous` prüft den zuletzt abgeschlossenen UTC-Monat.
  Keine beliebigen Monats-/Datei-/Eventnamen über Workflow-Input.
- Ein neuer strikt **read-only** Evidenzvertrag akzeptiert ausschließlich
  die reale `monthly-report-verification.json`, wenn gleichzeitig:
  - Zielzeitraum exakt ein vollständiger abgeschlossener UTC-Monat ist;
  - Prüfbericht frisch, `healthy=true`, Modus
    `read-only` und Phase
    `post-publish`;
  - tatsächlich alle Kalendertage abgedeckt, keine Tage fehlen und der
    Monat beendet ist;
  - **genau ein** veröffentlichter echter Discord-WebHook-Bericht
    für den Monat gefunden wurde;
  - Discord-Channel, Webhook-ID und Message-ID valide sind;
  - veröffentlichter State-Entry denselben Monatskey und dieselbe
    ursprüngliche Discord-Message-ID besitzt.
- Erst dann erstellt der Sammler einen minimalen Beleg:
  `data/monthly-live-proofs/YYYY-MM.json`.
  Ein bereits gespeicherter passender Beleg bleibt unverändert; eine
  widersprechende neue Prüfung ist ein Fehler und darf den alten Beleg
  nicht überschreiben.
- Die bestehenden September-2026-Nachweise,
  `data/monthly-live-proof.json` und dessen Akzeptanzprüfung
  bleiben vollständig unangetastet.
- Kein neuer GitHub-Workflow, keine zusätzlichen Discord-Schreibvorgänge,
  keine künstlichen Tageswerte, keine rückwirkende Änderung der historischen
  Veröffentlichungen.

## Bedienung nach Review/Merge

Im bestehenden Repo: **Actions → Kings Monthly Report Verification → Run workflow**,
Branch **main**; Option
`verify_month = previous` nur für bewusst gewünschten
Rückblick auf den letzten abgeschlossenen UTC-Monat auswählen.

Das Ergebnis erscheint zunächst im privaten/verifizierenden GitHub-Lauf
und im read-only Verifikationsbericht. Nur echte vollständige
Abnahmen können als Monatsbeleg persistiert werden.
Unvollständige Statistiken, fehlende Discord-Nachrichten oder falsche
State-IDs bleiben **PENDING** beziehungsweise lassen den eigentlichen
Verifier korrekt fehlschlagen.

## Aktueller tatsächlicher Blocker

Laut bestehender Betriebsabnahme fehlen wegen externer Karten-/Statistik-
Datenstörungen tägliche Einträge ab dem **19. November 2026**.
Das ist ein realer Blocker für einen künftigen vollständigen
November-2026-Bericht. Die Code-Erweiterung darf das weder
auffüllen noch als behoben ausgeben.

## Abnahmegates

1. Green Offline-CI: Validator, fehlende Tage, doppelte Nachrichten,
   State-Konflikt, falsche Monate, Quellenfrische und Historienerhalt.
2. Tatsächlicher **manueller previous-mode**-Workflow auf der
   produktiven Originalquelle; ausschließlich GET-Operationen nachweisen.
3. Exakte veröffentlichte Monatsnachricht und Repo-State verifizieren.
4. Erst nach erfolgreichem realen Beleg: unveränderliche Monatsdatei
   und Bediener-/CEO-Freigabe. Ein grüner isolierter Test erfüllt nur Gate 1.

