# Kings Logistics — Staff & Leadership: zentrale Datenquellen

**Stand 21. November 2026 · Kings Logistics intern**

## Grundsatz: Staff-Rolle ist nicht gleich Personalentscheidung

Unsere Systeme erfassen drei **fachlich verschiedene** Tatsachen. Sie dürfen nicht gemischt werden:

| Information | Maßgebliche Quelle | Automatischer Status |
|---|---|---|
| Wer hat **jetzt** eine Kings Staff-/Leadership-Hierarchierolle auf Discord? | Aktueller, vollständiger Discord Guild Member- und Role-Snapshot | **Aktiv**, reine Anzeige |
| Wer hat eine **Staff-klassifizierte Rolle innerhalb der TruckersMP-VTC**? | Offizielle TruckersMP-VTC-Member- und Rollen-API | **Aktiv**, separate VTC-Klassifikation |
| Wer wurde durch berechtigte HR/Management-Entscheidung in **welche Staff-Position/Abteilung** berufen und seit wann? | Noch zu bestätigendes privates Kings Staff Appointment Register | **Nicht konfiguriert** – keine Vermutung |

**Der letzte geprüfte TMP-VTC-Snapshot enthielt 14 VTC-klassifizierte Staff-Accounts**. Das ist **nicht** automatisch die Zahl der auf Discord aktiven Staff oder der durch HR bestätigten Staff-Anstellungen. Außerdem können VTC-Rollen wie „Official Streamer“ in einer TMP Staff-Rollenklassifikation enthalten sein, ohne dass daraus eine offizielle Kings-Personalentscheidung folgt.

Die Discord-Staff-Struktur nutzt bereits die fünf vorhandenen Hierarchierollen **Head Management, Management, Director, Team Lead, Staff**. Die Rolle **CEO** bleibt die alleinige höchste Entscheidungsinstanz; sie wird in dieser bisherigen fünfstufigen Staff-Zählung nicht als eigener automatisch gezählter Unterbereich eingeführt. Mehrfachrollen zählen beim eindeutigen Gesamtwert nur einmal, innerhalb der einzelnen Rollen jeweils separat.

## Jetzt umgesetzt

- `kings-staff-role-source.js` ist eine **rein lesende** Quelle für aktuelle Discord-Hierarchierollen. Sie nimmt den vollständigen, gerade abgefragten Guild-Role- und Member-Bestand entgegen, prüft eindeutige IDs, Abwesenheit von Duplikaten, Hierarchie-Rollen und Mehrfachzugehörigkeiten und liefert **nur aggregierte Zahlen**.
- Das bestehende **Kings Staff Leadership — Live Role Overview** verwendet diesen gemeinsamen Baustein. Der bestehende Discord-Bericht zeigt weiterhin die bekannten fünf Stufen und die Anzahl eindeutig zugeordneter Menschen, ohne IDs oder Nicknames in GitHub-Zusammenfassungen abzulegen.
- Der Bericht kennzeichnet **Staff appointment / HR authorization** ausdrücklich als **Not verified**, bis es einen fachlich genehmigten, geschützten Staff-Appointment-Nachweis gibt. Aus der aktuellen Discord-Rolle wird **weder ein Ernennungsdatum noch eine ausdrückliche Personalentscheidung** abgeleitet.
- `kings-data-sources.js` unterscheidet `staff` (Discord-Hierarchie), `staffVtc` (TMP-Klassifikation) und `staffAppointments` (geplante menschliche Personalentscheidung) als drei **separate Feldquellen**.
- Keine neuen Discord-Kanäle, keine Personalentscheidungen, Rollenänderungen oder zusätzlichen automatischen Personendatenimporte.

## Nächster Staff-Register-Ausbauschritt (noch nicht aktiv)

Für **aktuelle und zukünftige Staff-Mitglieder** wäre nach CEO/HR-Freigabe eine unabhängige, private Quelle für bestätigte Ernennungs-/Positionsdaten sinnvoll. Sie sollte mindestens diese **fachlich notwendigen Felder** enthalten, ohne unnötige personenbezogene Informationen:

- Verifizierte **Discord-ID** als Identitätsschlüssel und vorhandene Kings-Driver-Verknüpfung, soweit tatsächlich bestätigt.
- **Menschenbestätigte** Ernennung, Position, Department, Team Lead/Director/Management-Zuständigkeit, wirksames Datum und gegebenenfalls bestätigte Beendigung oder Abteilungswechsel.
- **Nachweisreferenz** auf das ursprüngliche HR-/Management-Ticket oder die schriftlich freigegebene Entscheidung, inklusive Autorisierung der für Kings zuständigen Führungskraft.
- Versions- und Korrekturhistorie. Eine spätere Änderung ergänzt einen nachvollziehbaren Eintrag; sie überschreibt nicht kommentarlos einen früheren Ernennungsnachweis.

**Dabei wichtig:**

1. Die aktuelle Discord-Rolle bestätigt nur die momentane technische Berechtigung und ist **nicht selbst** die Ernennungsurkunde.
2. `staff-management.json` enthält verschlüsselte **TruckersMP-VTC-Rollenbeobachtungen**, keine vollständige Liste bestätigter Discord-Staff-Ernennungen. `firstObservedAt` ist **nicht** `staff_appointment_date`.
3. **Kein** Staff-Aufstieg, Rückstufung, Entzug der Rolle oder Abteilungswechsel wird aus einer Abweichung automatisch vorgenommen. Solche Änderungen bleiben bei den jeweils berechtigten Kings-Instanzen.
4. Department- und Leadership-Daten dürfen nicht öffentlich oder in beliebigen GitHub-Actions-Logs mit konkreten User-IDs/Personaldaten veröffentlicht werden. Eine HR-interne Einzelfallansicht benötigt zuvor geprüfte Berechtigungen.
5. Der geplante Staff-Bereich ist **Kings Logistics-spezifisch**. Management bei Kings erhält durch die spätere Webseite keine automatische Führungsrolle bei Kings Hub oder RealmMP; deren Rollen-/Entscheidungssysteme bleiben unabhängig.

## Technische Integration danach

Als erste sichere Phase sollte eine vollständige **private Staff-Appointment-Quellenprüfung** implementiert werden, die zunächst nur verifizierte und fehlende Personalnachweise zählt. Erst anschließend sollten private HR-Personendaten gezielt für die künftige Kings Website / Driver Hub abgerufen werden.

**Nie versuchen, ein originales Kings-Beitrittsdatum aus dem Staff-Eintritt oder ein Staff-Ernennungsdatum aus einem VTC-/Discord-Join zu rekonstruieren.**

Der zentrale [Kings Data Sources Masterplan](KINGS-DATA-SOURCES-MASTERPLAN.md) enthält die übergreifende Reihenfolge und Datenschutzgrenzen.
