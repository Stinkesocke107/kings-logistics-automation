'use strict';
// Read-only next-step requirements for every registered Kings workflow.
// These are PENDING EVIDENCE TASKS, never proof of successful acceptance.
// Add a case here whenever the registered workflow inventory changes.
const {WORKFLOW_REGISTRY}=require('./kings-workflow-registry');

const REQUIREMENTS=Object.freeze(Object.fromEntries(
  [
  [
    "add-changelog-entry.yml",
    [
      "Manuellen berechtigten Changelog-Eintrag mit Validierung und Dublettenprüfung testen.",
      "Korrekte sichere Übergabe an den Changelog Publisher sowie Fehlerwiederanlauf belegen."
    ]
  ],
  [
    "api-resilience-verification.yml",
    [
      "Zeitüberschreitungen, HTTP-Fehler, ungültiges JSON und Wiederherstellung anhand isolierter und echter Nachweise prüfen.",
      "Retry-/Circuit-Breaker-Zustände mit Monitoring abgleichen, ohne Quellenstörungen zu verbergen."
    ]
  ],
  [
    "backup-recovery-verification.yml",
    [
      "Den nachgewiesenen isolierten 441-Dateien-Restore von einer echten Notfallwiederherstellung getrennt dokumentieren.",
      "Autorisierte Recovery-Prozedur, Schlüsselverwahrung, Wiederinbetriebnahme und Freigabe kontrolliert abnehmen."
    ]
  ],
  [
    "central-scheduler.yml",
    [
      "Alle freigegebenen Zeitpläne, überfälligen Läufe, Parallelität, Sperrfristen und echten Wiederanlauf prüfen.",
      "Nicht freigegebene Personal-/Loyalty-Live-Aktionen und manuelle Restore-Workflows von automatischer Ausführung ausschließen."
    ]
  ],
  [
    "changelog.yml",
    [
      "Echte neue Changelog-Veröffentlichung bis zur vorhandenen Discord-Nachricht nachvollziehen.",
      "Deduplizierung, Zustellfehler, Retry und einmalige Publikation bestätigen."
    ]
  ],
  [
    "convoy-announcement-verifier.yml",
    [
      "Vollständige, doppelte, veraltete und fehlende reale Event-Ankündigungen gegen die Originalquelle prüfen.",
      "Fehlerszenarien und sichere erneute Prüfung nach Quelländerungen nachweisen."
    ]
  ],
  [
    "convoy-checker.yml",
    [
      "Echte Event-Originaldaten auf Pflichtfelder, Änderungen und konflikthafte Abfahrtszeiten prüfen.",
      "Calendar/Capacity/Announcement-Ausgaben abgleichen; keine Buchungs- oder Freigabezusage erzeugen."
    ]
  ],
  [
    "core-backup.yml",
    [
      "Produktive Backup-Läufe samt Vollständigkeit, Aufbewahrung und Integrität prüfen.",
      "Backup-Ausfall, Alarmierung, sichere Recovery-Bereitschaft und Operator-Übergabe nachweisen."
    ]
  ],
  [
    "core-baseline-verification.yml",
    [
      "Die tatsächlichen externen Karten-/Datenfrischeblocker beheben oder ihre Wiederherstellung nachweisen.",
      "Erst danach einen erfolgreichen vollständigen, unverfälschten Baseline-Lauf belegen."
    ]
  ],
  [
    "core-e2e-verification.yml",
    [
      "Reale Datenquelle → Zustand → Discord-Ausgabe mit frischen übereinstimmenden Generationen prüfen.",
      "Vier aktuelle kritische Map-/Freshness-Befunde dürfen bei der Freigabe nicht ausgeblendet werden."
    ]
  ],
  [
    "core-recovery.yml",
    [
      "Manuelle berechtigte Recovery-Freigabeschritte und sichere Wiederherstellung in isolierter Umgebung belegen.",
      "Wiederinbetriebnahme, Fehlerbehandlung und Schutz vor produktivem Überschreiben ohne Autorisierung abnehmen."
    ]
  ],
  [
    "driver-achievements.yml",
    [
      "Achievement-Kriterien und Fortschritt mit echten Driver-Daten gegenprüfen.",
      "Einmalige Vergabe, korrekte Fahrerzuordnung und ausdrückliche Freigabe von Live-Rollenaktionen prüfen."
    ]
  ],
  [
    "driver-leadership-reports.yml",
    [
      "Echte Mitgliederzahlen, Driver-Änderungen und LOA-Status mit Originalquellen abgleichen.",
      "Privaten Leadership-Bericht, Zustellung und Recovery nachweisen."
    ]
  ],
  [
    "driver-management.yml",
    [
      "Echte autorisierte LOA-Anfrage und Rückkehr bis zum geschützten Zustand und Discord-/Leadership-Ausgabe prüfen.",
      "Git-Konflikt, Wiederholung, private Daten und Recovery kontrolliert abnehmen."
    ]
  ],
  [
    "driver-updates.yml",
    [
      "Echten VTC-Beitritt/Austritt bis zur gespeicherten Änderung und Discord-Mitteilung verfolgen.",
      "Mit Driver Management abgleichen; Dubletten und unsichere Verlustfälle prüfen."
    ]
  ],
  [
    "driver-register-onboarding.yml",
    [
      "Echte Registrierung mit TruckersMP-/Discord-Abgleich, fehlenden Angaben und Dubletten prüfen.",
      "Sichere HR-Übergabe und nachvollziehbare Korrektur ohne unerlaubte Rollenänderung bestätigen."
    ]
  ],
  [
    "driver-tmp-vtc-review.yml",
    [
      "Eintritts-/VTC-Datumsquelle mit echten TruckersMP-Originalangaben abgleichen.",
      "Nur manuell freigegebene Korrekturhinweise ohne automatische Mitgliedschaftsänderungen erproben."
    ]
  ],
  [
    "driver-weekly-summary.yml",
    [
      "Vollständigen echten Kalenderwochenzeitraum samt Driver-Aktivität und LOA-Fällen prüfen.",
      "Fehlende Quellen, Deduplizierung und einmalige private Veröffentlichung abnehmen."
    ]
  ],
  [
    "event-leadership-reports.yml",
    [
      "Echte Capacity-, History-, Calendar- und Invitation-Originaldaten konsistent zusammenführen.",
      "Staff-Review-Status, private Discord-Zustellung und fehlende Evidenz fail-closed prüfen."
    ]
  ],
  [
    "event-operations-discord-review.yml",
    [
      "Neuen echten autorisierten Staff-Befehl → Verschlüsselung → Dashboard-Refresh → Discord-Readback nachweisen.",
      "Mit Event #12/#14/#15/#16 gemeinsam abnehmen; Team- und CEO-Freigabe dokumentieren."
    ]
  ],
  [
    "event-operations-manual-review.yml",
    [
      "Manuelle Staff-Review-Eingabe, Berechtigungen, Konflikte und gespeicherte Statusänderung sicher testen.",
      "Nachweisbare Übergabe an Discord Review #18 und Leadership Dashboard kontrollieren."
    ]
  ],
  [
    "final-freeze-verification.yml",
    [
      "Alle kritischen externen Map-/Freshness-Befunde und sonstigen Pflichtgates erfolgreich beheben und prüfen.",
      "Echten vollständigen Lauf, Recovery, Operator-Übergabe und ausdrückliche CEO-Freigabe einfordern."
    ]
  ],
  [
    "git-state-hardening-verification.yml",
    [
      "Geschützte Schreibvorgänge und Konfliktbehandlung auch bei gleichzeitiger Quelländerung prüfen.",
      "Kontrollierte Recovery ohne verlorene oder unbefugte Git-Zustandsupdates nachweisen."
    ]
  ],
  [
    "hr-leadership-reports.yml",
    [
      "Echte autorisierte HR-Entscheidungen und offene Fristen aus Originalnachweisen auswerten.",
      "Privaten Leadership-Zugriff, Zustellung und Fehlerwiederanlauf prüfen."
    ]
  ],
  [
    "hr-leadership.yml",
    [
      "Neuen echten HR-/Probation-Befehl aus berechtigter Quelle bis zur verschlüsselten Speicherung prüfen.",
      "Privaten Leadership-Bericht, ursprünglichen Entscheidungsbeleg und Recovery bestätigen."
    ]
  ],
  [
    "hr-weekly-summary.yml",
    [
      "Abgeschlossene und offene HR-Fälle für eine vollständige echte Woche gegen Originaldaten abgleichen.",
      "Nur berechtigte Zustellung, Deduplizierung und Nachlaufprüfung abnehmen."
    ]
  ],
  [
    "leadership-dashboard-verification.yml",
    [
      "Tatsächliche Rollen-/Datenquellenänderungen mit den Discord-Embeds und GET-Readback abgleichen.",
      "Berechtigungen, verlorene Nachrichten, veraltete Daten und Wiederanlauf nachweisen."
    ]
  ],
  [
    "leadership-dashboard.yml",
    [
      "Driver, Staff, HR, Events und Management anhand echter frischer Quellen zusammenführen.",
      "Eine reale Änderung je Bereich bis zur privaten Anzeige, Datenschutz und Rückleseprüfung nachweisen."
    ]
  ],
  [
    "legacy-convoy-import.yml",
    [
      "Originalarchiv auf Vollständigkeit, Dubletten, UTC-Daten und sichere wiederholbare Importe prüfen.",
      "Historische Holds nicht ohne Originalgenehmigung zu bestätigten neuen Events hochstufen."
    ]
  ],
  [
    "live-tracker.yml",
    [
      "Wiederhergestellte vollständige ATS-/ETS2-Kartenscans sämtlicher aktiver Server nachweisen; unbekannte Kings-Online-Zahl nie als null anzeigen.",
      "Drei übereinstimmende frische Discord-Anzeigen und mehrfachen automatischen Map-/Fallback-Wechsel prüfen."
    ]
  ],
  [
    "management-monthly-report.yml",
    [
      "Echten Monatsabschluss aus allen vorhandenen Abteilungsquellen rechnerisch und zeitlich prüfen.",
      "Fehlende/widersprüchliche Zahlen, Berechtigungen und einmalige Veröffentlichung sicher behandeln."
    ]
  ],
  [
    "management-weekly-overview.yml",
    [
      "Echte Wochenübersicht für Drivers, HR, Staff und Events über denselben Zeitraum abgleichen.",
      "Private Leadership-Übergabe, Deduplizierung und vollständige Zustellung nachweisen."
    ]
  ],
  [
    "milestones.yml",
    [
      "Tatsächliche Kings-VTC-Meilensteine aus maßgeblicher Quelle erkennen und vergleichen.",
      "Doppelte Posts, Datenänderungen und Fehlerwiederanlauf testen."
    ]
  ],
  [
    "monthly-report-verification.yml",
    [
      "Echten abgeschlossenen Monatsbericht unabhängig von seinem Erzeuger anhand Originaldaten überprüfen.",
      "Zustellung, Einmaligkeit, Rechte und Recovery bestätigen."
    ]
  ],
  [
    "monthly-report.yml",
    [
      "Monatsdaten aus allen vorgesehenen Quellen vollständig und korrekt zusammenführen.",
      "Nur genau einmal veröffentlichen; Wiederanlauf und unvollständige Quellen abnehmen."
    ]
  ],
  [
    "news-production-verification.yml",
    [
      "Tatsächlich veröffentlichte TruckersMP-News mit Originalartikel und gespeicherter Discord-Ausgabe prüfen.",
      "Veraltete/fehlende/doppelte Beiträge und Verifikationsfehler sichtbar halten."
    ]
  ],
  [
    "news.yml",
    [
      "Neuen echten TruckersMP-Artikel korrekt erkennen, formatieren und im Discord veröffentlichen.",
      "Dubletten, API-Ausfälle, fehlende Inhalte und erneuten sicheren Versand testen."
    ]
  ],
  [
    "probation.yml",
    [
      "Echte Probezeitfristen, Erinnerungen und Statuswechsel nachprüfen.",
      "Ausschließlich authentische HR-Entscheidung anwenden; keine automatische Personalentscheidung ableiten."
    ]
  ],
  [
    "self-healing-stress-verification.yml",
    [
      "Gleichzeitige Fehler, Sperrfenster und Eskalation in isolierten Stressfällen testen.",
      "Sicherstellen, dass kein Live-Rollen-, Staff-, Event- oder Restore-Write ohne Berechtigung ausgelöst wird."
    ]
  ],
  [
    "self-healing.yml",
    [
      "Erlaubte Reparaturversuche, Wiederholungsgrenzen und Eskalationen gegen reale/isolierte Fehler prüfen.",
      "Keine externen Kartenstörungen oder unautorisierte Schreibvorgänge als erfolgreich repariert melden."
    ]
  ],
  [
    "staff-leadership-live-overview.yml",
    [
      "Echte Staff-Rollenänderungen bis zur privaten/öffentlichen Discord-Übersicht nachverfolgen.",
      "Hierarchie, Datenschutz, korrekte Zählung und Aktualisierungswiederanlauf prüfen."
    ]
  ],
  [
    "staff-leadership-reports.yml",
    [
      "Echte Staff-Struktur, Zuständigkeiten und Rollenwechsel mit Originaldaten abgleichen.",
      "Privaten Bericht, Veröffentlichung und sichere Fehlerbehandlung prüfen."
    ]
  ],
  [
    "staff-management.yml",
    [
      "Echten Staff-Beitritt, Beförderung und Austritt anhand autorisierter Quelle nachweisen.",
      "Öffentliche Meldung, verschlüsselte Historie, Wiederholungen und Git-Konfliktschutz prüfen."
    ]
  ],
  [
    "system-monitoring.yml",
    [
      "Alle 46 registrierten Workflows samt API-Zuständen, Frische und Fehlern einzeln überwachen.",
      "Echte Discord-Alarmierung, Entwarnung und korrekte Trennung von grünem Fallback und defekter Karte prüfen."
    ]
  ],
  [
    "system-tests.yml",
    [
      "Gesamtes Workflow-Register und alle betroffenen Funktionen durch isolierte Regressionstests abdecken.",
      "Testprotokolle pro Einzelsystem dokumentieren; Offline-SUCCESS nicht als echte Betriebsabnahme deklarieren."
    ]
  ],
  [
    "weekly-reports-verification.yml",
    [
      "Echte Driver-/HR-/Management-Wochenberichte auf gemeinsamen Zeitraum und Quelldaten prüfen.",
      "Vollständigkeit, genau einmalige Zustellung und Fehlerbehandlung unabhängig bestätigen."
    ]
  ]
].map(([file,tasks])=>[
    file,Object.freeze(tasks)
  ])
));

function individualCloseoutRequirements(registry=WORKFLOW_REGISTRY){
  if(!Array.isArray(registry))throw Error('Invalid Kings workflow registry');
  const keys=Object.keys(REQUIREMENTS);
  if(keys.length!==registry.length||keys.includes('event-booking-slot-management.yml'))
    throw Error('Kings individual closeout inventory mismatch');
  const unique=new Set();
  for(const item of registry){
    if(!item?.file||unique.has(item.file)||!Object.hasOwn(REQUIREMENTS,item.file)||
       !Array.isArray(REQUIREMENTS[item.file])||REQUIREMENTS[item.file].length<2||
       REQUIREMENTS[item.file].some(t=>typeof t!=='string'||!t.trim()))
      throw Error('Missing individual Kings workflow review: '+String(item?.file));
    unique.add(item.file);
  }
  return REQUIREMENTS;
}
individualCloseoutRequirements();
module.exports={individualCloseoutRequirements};
