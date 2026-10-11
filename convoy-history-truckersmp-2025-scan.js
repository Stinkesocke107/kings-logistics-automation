process.env.KINGS_HISTORY_SCAN_YEAR ||= '2025';
process.env.KINGS_HISTORY_FROM_DATE ||= '2025-01-01';
process.env.KINGS_HISTORY_TO_DATE ||= '2025-12-31';
process.env.KINGS_HISTORY_SCAN_OUTPUT ||= 'data/convoy-history-2025-scan.json';

const { main } = require('./convoy-history-truckersmp-2023-scan');

if (require.main === module) {
  main().catch(error => {
    console.error('2025 historical convoy scan failed:', error.message);
    process.exit(1);
  });
}

module.exports = { main };
