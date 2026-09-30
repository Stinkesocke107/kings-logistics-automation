const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HEALTH_DIR = path.join(ROOT, 'data', 'api-health');
const MATRIX_REPORT = path.join(ROOT, 'output', 'api-resilience-verification.json');
const FINAL_REPORT = path.join(ROOT, 'output', 'api-resilience-final-report.json');

const REQUIRED_INTEGRATIONS = [
  'driver-management.js',
  'tracker.js',
  'staff-management.js',
  'news.js',
  'milestones.js',
  'convoy-truckersmp-sync.js',
  'kings-convoy-announcements.js',
  'system-monitoring.js'
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function main() {
  const issues = [];

  if (!fs.existsSync(MATRIX_REPORT)) {
    issues.push('Controlled failure-matrix report is missing.');
  }

  const matrix = fs.existsSync(MATRIX_REPORT) ? readJson(MATRIX_REPORT) : null;
  if (matrix) {
    if (matrix.healthy !== true) issues.push('Controlled failure matrix is not healthy.');
    if (Number(matrix.failed || 0) !== 0) issues.push(`Controlled failure matrix has ${matrix.failed} failed scenario(s).`);
    if (!Array.isArray(matrix.scenarios) || matrix.scenarios.length < 10) {
      issues.push(`Controlled failure matrix is incomplete: ${matrix.scenarios?.length || 0}/10 scenarios.`);
    }
    if (matrix.externalTraffic !== false) {
      issues.push('Failure injection was not isolated from external services.');
    }
  }

  const resilienceSource = readText('api-resilience.js');
  const capabilityChecks = {
    timeout: resilienceSource.includes('AbortController'),
    rateLimit429: resilienceSource.includes('status === 429'),
    serverErrors: resilienceSource.includes('status >= 500'),
    retryAfter: resilienceSource.includes('parseRetryAfter'),
    malformedResponseRetry: resilienceSource.includes('API_INVALID_RESPONSE'),
    nestedNetworkCodes: resilienceSource.includes('error?.cause?.code'),
    circuitBreaker: resilienceSource.includes('circuitOpenUntil') && resilienceSource.includes('CIRCUIT_OPEN'),
    persistentHealth: resilienceSource.includes("data', 'api-health") || resilienceSource.includes('KINGS_API_HEALTH_DIR')
  };

  for (const [name, ok] of Object.entries(capabilityChecks)) {
    if (!ok) issues.push(`Core resilience capability missing: ${name}.`);
  }

  const integration = {};
  for (const file of REQUIRED_INTEGRATIONS) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      integration[file] = { exists: false, resilient: false };
      issues.push(`Required API integration file missing: ${file}.`);
      continue;
    }

    const source = readText(file);
    const resilient = source.includes("require('./api-resilience')") || source.includes('resilientFetch');
    integration[file] = { exists: true, resilient };
    if (!resilient) issues.push(`API resilience is not wired into ${file}.`);
  }

  const health = {
    total: 0,
    healthy: 0,
    degraded: 0,
    down: 0,
    invalid: 0,
    openCircuits: 0,
    services: []
  };

  if (!fs.existsSync(HEALTH_DIR)) {
    issues.push('Production API health directory is missing.');
  } else {
    const files = fs.readdirSync(HEALTH_DIR).filter((name) => name.endsWith('.json')).sort();
    health.total = files.length;

    if (files.length < 15) {
      issues.push(`Too few production API health states: ${files.length}; expected at least 15.`);
    }

    for (const name of files) {
      const file = path.join(HEALTH_DIR, name);
      let value;
      try {
        value = readJson(file);
      } catch (error) {
        health.invalid += 1;
        health.services.push({ file: name, status: 'invalid', error: error.message });
        issues.push(`Invalid API health JSON: ${name}.`);
        continue;
      }

      const status = String(value?.status || '').toLowerCase();
      if (status === 'healthy') health.healthy += 1;
      else if (status === 'degraded') health.degraded += 1;
      else if (status === 'down') health.down += 1;
      else {
        health.invalid += 1;
        issues.push(`Unknown API health status in ${name}: ${status || 'missing'}.`);
      }

      const openUntil = value?.circuitOpenUntil ? new Date(value.circuitOpenUntil).getTime() : 0;
      const circuitOpen = Number.isFinite(openUntil) && openUntil > Date.now();
      if (circuitOpen) {
        health.openCircuits += 1;
        issues.push(`Production circuit is currently open: ${name}.`);
      }

      if (String(value?.namespace || '').includes('point-13-test') || name.includes('point-13-test')) {
        issues.push(`Test API health leaked into production state: ${name}.`);
      }

      health.services.push({
        file: name,
        service: value?.service || null,
        namespace: value?.namespace || null,
        status: status || 'unknown',
        consecutiveFailures: Number(value?.consecutiveFailures || 0),
        circuitOpen
      });
    }
  }

  if (health.down > 0) issues.push(`${health.down} production API service(s) are down.`);
  if (health.degraded > 0) issues.push(`${health.degraded} production API service(s) are degraded.`);

  const report = {
    version: 1,
    checkedAt: new Date().toISOString(),
    point: 13,
    mode: 'read-only-final-verification',
    controlledFailureMatrix: matrix
      ? {
          scenarios: matrix.scenarios.length,
          passed: Number(matrix.passed || 0),
          failed: Number(matrix.failed || 0),
          externalTraffic: matrix.externalTraffic
        }
      : null,
    capabilities: capabilityChecks,
    integrations: integration,
    productionApiHealth: health,
    falseAlertProtection: {
      isolatedHealthDirectoryForFailureInjection: matrix?.externalTraffic === false,
      productionHealthUnmodifiedByFailureMatrix: !health.services.some((item) => String(item.namespace || '').includes('point-13-test'))
    },
    issues,
    healthy: issues.length === 0
  };

  fs.mkdirSync(path.dirname(FINAL_REPORT), { recursive: true });
  fs.writeFileSync(FINAL_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('Kings API Resilience Final Verification');
  console.log(`Failure scenarios: ${report.controlledFailureMatrix?.passed || 0}/${report.controlledFailureMatrix?.scenarios || 0}`);
  console.log(`Production API health: ${health.healthy}/${health.total} healthy, ${health.degraded} degraded, ${health.down} down`);
  console.log(`Open production circuits: ${health.openCircuits}`);
  console.log(`Integration files: ${Object.values(integration).filter((item) => item.resilient).length}/${REQUIRED_INTEGRATIONS.length}`);
  console.log(`Issues: ${issues.length}`);
  for (const issue of issues) console.error(`- ${issue}`);

  if (issues.length > 0) process.exitCode = 1;
}

main();
