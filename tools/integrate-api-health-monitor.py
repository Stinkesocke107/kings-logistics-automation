from pathlib import Path

path = Path('system-monitoring.js')
source = path.read_text(encoding='utf-8')

if "  'api-resilience.js',\n" not in source:
    anchor = "  'system-monitoring.js',\n"
    if anchor not in source:
        raise SystemExit('Critical files anchor not found')
    source = source.replace(
        anchor,
        anchor + "  'api-resilience.js',\n  'kings-branding.js',\n",
        1
    )

api_function = r'''
function checkApiHealth(issues) {
  const directory = path.join(DATA_DIR, 'api-health');

  if (!fs.existsSync(directory)) {
    return {
      initialized: false,
      services: [],
      healthy: 0,
      degraded: 0,
      down: 0,
      invalid: 0
    };
  }

  const files = fs.readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort();

  const services = [];
  let healthy = 0;
  let degraded = 0;
  let down = 0;
  let invalid = 0;

  for (const name of files) {
    const relativePath = `data/api-health/${name}`;
    const file = path.join(directory, name);
    let data;

    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      invalid += 1;
      issues.push(issue(
        `api-health-invalid:${name}`,
        'critical',
        'API Resilience',
        `API health state is invalid JSON: ${relativePath}`,
        { error: String(error.message || error) }
      ));
      services.push({ file: relativePath, service: name.replace(/\.json$/i, ''), status: 'invalid' });
      continue;
    }

    const service = String(data?.service || name.replace(/\.json$/i, '')).trim();
    const status = String(data?.status || 'unknown').toLowerCase();
    const details = {
      service,
      consecutiveFailures: Number(data?.consecutiveFailures || 0),
      lastSuccessAt: data?.lastSuccessAt || null,
      lastFailureAt: data?.lastFailureAt || null,
      circuitOpenUntil: data?.circuitOpenUntil || null,
      lastError: data?.lastError || null
    };

    if (status === 'healthy') {
      healthy += 1;
    } else if (status === 'degraded') {
      degraded += 1;
      issues.push(issue(
        `api-health:${service}`,
        'warning',
        'API Resilience',
        `${service} is degraded after repeated request failures.`,
        details
      ));
    } else if (status === 'down') {
      down += 1;
      issues.push(issue(
        `api-health:${service}`,
        'critical',
        'API Resilience',
        `${service} is down or its circuit breaker is open.`,
        details
      ));
    } else {
      degraded += 1;
      issues.push(issue(
        `api-health:${service}`,
        'warning',
        'API Resilience',
        `${service} has an unknown API health state.`,
        details
      ));
    }

    services.push({
      file: relativePath,
      service,
      status,
      consecutiveFailures: details.consecutiveFailures,
      lastSuccessAt: details.lastSuccessAt,
      lastFailureAt: details.lastFailureAt,
      circuitOpenUntil: details.circuitOpenUntil
    });
  }

  return {
    initialized: files.length > 0,
    services,
    healthy,
    degraded,
    down,
    invalid
  };
}

'''

if 'function checkApiHealth(issues)' not in source:
    anchor = 'function checkCrossSystemIntegrity(issues) {'
    if anchor not in source:
        raise SystemExit('Cross-system integrity anchor not found')
    source = source.replace(anchor, api_function + anchor, 1)

if 'const apiHealth = checkApiHealth(issues);' not in source:
    anchor = '  const freshData = checkFreshData(issues);\n'
    if anchor not in source:
        raise SystemExit('main freshData anchor not found')
    source = source.replace(anchor, anchor + '  const apiHealth = checkApiHealth(issues);\n', 1)

if 'apiServicesChecked:' not in source:
    anchor = '      freshDataHealthy: freshData.filter((item) => item.ok).length,\n'
    if anchor not in source:
        raise SystemExit('summary freshness anchor not found')
    source = source.replace(
        anchor,
        anchor +
        '      apiServicesChecked: apiHealth.services.length,\n' +
        '      apiServicesHealthy: apiHealth.healthy,\n' +
        '      apiServicesDegraded: apiHealth.degraded,\n' +
        '      apiServicesDown: apiHealth.down,\n',
        1
    )

if 'apiHealth,' not in source:
    anchor = '      freshness: freshData,\n'
    if anchor not in source:
        raise SystemExit('data freshness anchor not found')
    source = source.replace(anchor, anchor + '      apiHealth,\n', 1)

if 'API services healthy:' not in source:
    anchor = "    `- Critical files present: **${result.summary.criticalFilesPresent}/${result.summary.criticalFilesExpected}**`,\n"
    if anchor not in source:
        raise SystemExit('step summary critical files anchor not found')
    source = source.replace(
        anchor,
        anchor + "    `- API services healthy: **${result.summary.apiServicesHealthy}/${result.summary.apiServicesChecked}** · Degraded: **${result.summary.apiServicesDegraded}** · Down: **${result.summary.apiServicesDown}**`,\n",
        1
    )

if 'API services: ${result.summary.apiServicesHealthy}' not in source:
    anchor = "  console.log(`Critical files: ${result.summary.criticalFilesPresent}/${result.summary.criticalFilesExpected}`);\n"
    if anchor not in source:
        raise SystemExit('console critical files anchor not found')
    source = source.replace(
        anchor,
        anchor + "  console.log(`API services: ${result.summary.apiServicesHealthy}/${result.summary.apiServicesChecked} healthy, ${result.summary.apiServicesDegraded} degraded, ${result.summary.apiServicesDown} down`);\n",
        1
    )

path.write_text(source, encoding='utf-8')
print('API health monitoring integration applied.')
