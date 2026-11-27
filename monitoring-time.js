'use strict';

// Keep signed UTC age: clamping a future timestamp to zero can turn an
// impossible source date into a falsely healthy workflow or data snapshot.
const MAX_FUTURE_SKEW_MINUTES = 5;

function ageMinutes(value, nowMs = Date.now()) {
  if (!value || !Number.isFinite(nowMs)) return Infinity;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return Math.floor((nowMs - time) / 60000);
}

function isFreshAge(age, maxAgeMinutes, futureSkewMinutes = MAX_FUTURE_SKEW_MINUTES) {
  return Number.isFinite(age) && Number.isFinite(maxAgeMinutes) &&
    maxAgeMinutes >= 0 && Number.isFinite(futureSkewMinutes) &&
    futureSkewMinutes >= 0 && age >= -futureSkewMinutes &&
    age <= maxAgeMinutes;
}

module.exports = { ageMinutes, isFreshAge, MAX_FUTURE_SKEW_MINUTES };
