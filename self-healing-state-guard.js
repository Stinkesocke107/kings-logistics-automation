'use strict';

const fs = require('fs');
const path = require('path');
const {
  SAFE_REPAIRS,
  emptyState,
  normalizeState,
  recordAttempt,
  attemptBudget
} = require('./self-healing');

const ROOT = __dirname;
const DEFAULT_STATE_FILE = path.join(ROOT, 'data', 'self-healing-state.json');
const DEFAULT_REPORT_FILE = path.join(ROOT, 'output', 'self-healing-state-recovery.json');

function nowISO(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function validateParsedState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, reason: 'state-root-is-not-an-object' };
  }
  if (value.version !== 1) return { valid: false, reason: 'unsupported-state-version' };
  if (value.mode !== 'technical-safe-self-healing') return { valid: false, reason: 'unexpected-state-mode' };
  if (!value.repairs || typeof value.repairs !== 'object' || Array.isArray(value.repairs)) {
    return { valid: false, reason: 'repairs-is-not-an-object' };
  }

  const allowedIds = new Set(SAFE_REPAIRS.map((item) => item.id));
  const unknownIds = Object.keys(value.repairs).filter((id) => !allowedIds.has(id));
  if (unknownIds.length) {
    return { valid: false, reason: 'unknown-repair-ids', unknownIds };
  }

  return { valid: true, reason: null };
}

function lockedRecoveryState(nowMs = Date.now()) {
  let state = emptyState();
  for (const config of SAFE_REPAIRS) {
    for (let index = 0; index < config.maxAttemptsPerWindow; index += 1) {
      state = recordAttempt(
        state,
        config,
        {
          status: 'blocked-state-recovery',
          action: 'state-recovery-lock',
          runId: null
        },
        ['self-healing-state-corrupt'],
        nowMs - index * 1000
      );
    }
  }
  state.updatedAt = nowISO(nowMs);
  return normalizeState(state, nowMs);
}

function recoverStateText(text, nowMs = Date.now()) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch (error) {
    return {
      recovered: true,
      reason: 'invalid-json',
      error: String(error.message || error),
      state: lockedRecoveryState(nowMs)
    };
  }

  const validation = validateParsedState(parsed);
  if (!validation.valid) {
    return {
      recovered: true,
      reason: validation.reason,
      details: validation.unknownIds || null,
      state: lockedRecoveryState(nowMs)
    };
  }

  return {
    recovered: false,
    reason: null,
    state: normalizeState(parsed, nowMs)
  };
}

function verifyRecoveryLock(state, nowMs = Date.now()) {
  return SAFE_REPAIRS.every((config) => {
    const budget = attemptBudget(config, state, nowMs);
    return budget.allowed === false && ['cooldown', 'attempt-budget-exhausted'].includes(budget.reason);
  });
}

function main() {
  const stateFile = path.resolve(process.env.KINGS_SELF_HEAL_STATE_FILE || DEFAULT_STATE_FILE);
  const reportFile = path.resolve(process.env.KINGS_SELF_HEAL_STATE_RECOVERY_REPORT || DEFAULT_REPORT_FILE);
  const nowMs = Date.now();

  const sourceExists = fs.existsSync(stateFile);
  const sourceText = sourceExists
    ? fs.readFileSync(stateFile, 'utf8')
    : JSON.stringify(emptyState());

  const result = recoverStateText(sourceText, nowMs);
  const locked = result.recovered ? verifyRecoveryLock(result.state, nowMs) : false;

  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(result.state, null, 2)}\n`, 'utf8');

  const report = {
    version: 1,
    point: 22,
    checkedAt: nowISO(nowMs),
    sourceExists,
    recoveredFromCorruption: result.recovered,
    reason: result.reason,
    details: result.details || null,
    failClosedRepairLockActive: result.recovered ? locked : null,
    allowedRepairIds: SAFE_REPAIRS.map((item) => item.id),
    safety: {
      corruptStateNeverEnablesExtraRepair: true,
      automaticRestoreAllowed: false,
      forcePushAllowed: false,
      personnelActionsAllowed: false,
      convoyLiveActionsAllowed: false
    }
  };

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (result.recovered) {
    console.warn(`Self-Healing state guard recovered unsafe state (${result.reason}) into a fail-closed repair lock.`);
    console.warn('Automatic repairs are temporarily suppressed by cooldown/attempt budgets until a clean state window is available.');
  } else {
    console.log('Self-Healing state guard: state valid and normalized.');
  }

  if (result.recovered && !locked) {
    throw new Error('Recovered Self-Healing state did not activate fail-closed repair budgets.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Self-Healing state guard failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  validateParsedState,
  lockedRecoveryState,
  recoverStateText,
  verifyRecoveryLock
};
