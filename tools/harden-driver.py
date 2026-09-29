from pathlib import Path
import re

path = Path('driver-updates.js')
source = path.read_text(encoding='utf-8')

import_line = "const { resilientFetchJson } = require('./api-resilience');\n"
if import_line not in source:
    anchor = "require('./kings-branding').installDiscordBranding();\n"
    if anchor not in source:
        raise SystemExit('Branding anchor not found in driver-updates.js')
    source = source.replace(anchor, anchor + import_line, 1)

history_anchor = 'const HISTORY_FILE =\n  path.join(__dirname, "data", "driver-history.json");\n'
if 'driver-change-guard.json' not in source:
    if history_anchor not in source:
        raise SystemExit('HISTORY_FILE anchor not found')
    source = source.replace(
        history_anchor,
        history_anchor + '\nconst CHANGE_GUARD_FILE =\n  path.join(__dirname, "data", "driver-change-guard.json");\n',
        1
    )

new_get_members = '''async function getCurrentMembers() {
  console.log(
    "Loading Kings Logistics VTC members with API resilience..."
  );

  const data = await resilientFetchJson(
    MEMBERS_URL,
    {
      label: 'truckersmp-vtc-members',
      retries: 3,
      timeoutMs: 15000,
      fetchOptions: {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Kings Logistics Driver Automation"
        }
      },
      validateJson: (payload) =>
        Boolean(
          payload &&
          payload.response &&
          Array.isArray(payload.response.members)
        )
    }
  );

  const members =
    data.response.members
      .map(member => ({
        tmpId:
          Number(member.user_id),

        vtcMemberId:
          Number(member.id),

        username:
          String(
            member.username || ""
          ).trim(),

        joinDate:
          normalizeDate(
            member.joinDate
          )
      }))
      .filter(member =>
        Number.isFinite(
          member.tmpId
        ) &&
        member.username
      )
      .sort(
        (a, b) =>
          a.tmpId - b.tmpId
      );

  if (members.length === 0) {
    throw new Error(
      "Safety stop: TruckersMP returned an empty Kings member list."
    );
  }

  console.log(
    `Current Kings members: ${members.length}`
  );

  return members;
}
'''

pattern = re.compile(
    r'async function getCurrentMembers\(\) \{.*?\n\}\n\n// ======================================================\n// PUBLIC-SAFE DRIVER HISTORY',
    re.S
)
source, count = pattern.subn(
    new_get_members + '\n// ======================================================\n// PUBLIC-SAFE DRIVER HISTORY',
    source,
    count=1
)
if count != 1:
    raise SystemExit(f'getCurrentMembers replacement count was {count}')

guard_helpers = '''
function memberSnapshotFingerprint(currentMembers) {
  const stable = currentMembers
    .map((member) => Number(member.tmpId))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .join(',');

  return crypto
    .createHash('sha256')
    .update(`kings-driver-change-guard-v1\\0${stable}`)
    .digest('hex');
}

function clearChangeGuard() {
  if (!fs.existsSync(CHANGE_GUARD_FILE)) return;

  try {
    fs.unlinkSync(CHANGE_GUARD_FILE);
  } catch (error) {
    console.warn(`Could not clear Driver change guard: ${error.message}`);
  }
}

function destructiveChangeConfirmed(oldMembers, currentMembers, changes) {
  const oldCount = oldMembers.length;
  const currentCount = currentMembers.length;
  const leftCount = changes.left.length;
  const significant =
    leftCount >= 3 ||
    (oldCount >= 10 && leftCount / oldCount >= 0.10);

  if (!significant) {
    clearChangeGuard();
    return true;
  }

  const fingerprint = memberSnapshotFingerprint(currentMembers);
  const previous = readJson(CHANGE_GUARD_FILE, null);
  const now = Date.now();
  const previousObserved = previous?.observedAt
    ? new Date(previous.observedAt).getTime()
    : 0;
  const stillFresh =
    Number.isFinite(previousObserved) &&
    previousObserved > 0 &&
    now - previousObserved <= 2 * 60 * 60 * 1000;

  if (
    previous?.fingerprint === fingerprint &&
    previous?.oldCount === oldCount &&
    previous?.currentCount === currentCount &&
    stillFresh
  ) {
    console.warn(
      `Driver destructive-change guard confirmed the same ${leftCount}-leave snapshot on a second poll.`
    );
    clearChangeGuard();
    return true;
  }

  writeJson(
    CHANGE_GUARD_FILE,
    {
      version: 1,
      observedAt: nowISO(),
      oldCount,
      currentCount,
      leftCount,
      fingerprint
    }
  );

  console.warn(
    `Safety hold: ${leftCount} Driver leave(s) detected (${oldCount} -> ${currentCount}). ` +
    'No leave messages or permanent state changes will be made until the same snapshot is confirmed by the next poll.'
  );

  return false;
}
'''

if 'function destructiveChangeConfirmed(' not in source:
    anchor = '// ======================================================\n// MEMBER COMPARISON\n// ======================================================\n'
    if anchor not in source:
        raise SystemExit('Member comparison anchor not found')
    source = source.replace(anchor, guard_helpers + '\n' + anchor, 1)

validate_pattern = re.compile(
    r'function validateMemberChange\(\n  oldMembers,\n  currentMembers\n\) \{.*?\n\}',
    re.S
)
new_validate = '''function validateMemberChange(
  oldMembers,
  currentMembers
) {
  if (
    oldMembers.length >= 20 &&
    currentMembers.length <
      oldMembers.length * 0.5
  ) {
    throw new Error(
      `Safety stop: Member count suddenly changed from ` +
      `${oldMembers.length} to ${currentMembers.length}. ` +
      "This is treated as an untrusted API snapshot. No Driver Updates were processed."
    );
  }

  if (
    oldMembers.length >= 10 &&
    currentMembers.length === 0
  ) {
    throw new Error(
      "Safety stop: TruckersMP returned zero Kings members. No Driver Updates were processed."
    );
  }
}'''
source, count = validate_pattern.subn(new_validate, source, count=1)
if count != 1:
    raise SystemExit(f'validateMemberChange replacement count was {count}')

if '!destructiveChangeConfirmed(' not in source:
    anchor = '  if (!hasChanges) {\n'
    if anchor not in source:
        raise SystemExit('hasChanges anchor not found')
    source = source.replace(
        anchor,
        '''  if (
    !destructiveChangeConfirmed(
      oldMembers,
      currentMembers,
      changes
    )
  ) {
    return;
  }

  if (!hasChanges) {
''',
        1
    )

path.write_text(source, encoding='utf-8')
print('Driver Updates API hardening applied.')
