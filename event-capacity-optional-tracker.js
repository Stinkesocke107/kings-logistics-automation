'use strict';
// Draft-only presentation boundary. This module never fetches a player map,
// exposes coordinates or changes the independent Event Capacity policy.
// Callers MUST independently authenticate and validate a complete provider
// snapshot before setting sourceAuthenticated/coverageComplete. Never derive
// those flags from an untrusted API response or a cached last-good value.
const MAX_AGE_MS = 15 * 60 * 1000;
const SOURCES = new Set(['TruckersMP', 'HaulMP']);
const FALLBACK = Object.freeze({
  optional:true,mode:'WITHOUT_MAP',status:'Unavailable',
  provider:null,observedAtUtc:null,positionsIncluded:false,
  capacityIndependent:true
});
function projectOptionalTracker(source=null,{nowMs=Date.now()}={}){
  // A bad optional provider must not fail or modify the capacity calendar.
  if(!Number.isFinite(nowMs))return FALLBACK;
  if(!source || typeof source!=='object' || Array.isArray(source) ||
     Object.getPrototypeOf(source)!==Object.prototype)return FALLBACK;
  if(source.sourceAuthenticated!==true || source.coverageComplete!==true ||
     source.mapAvailable!==true || !SOURCES.has(source.provider))return FALLBACK;
  const observed=source.observedAtUtc;
  if(typeof observed!=='string' ||
     !/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(observed))return FALLBACK;
  const captured=Date.parse(observed);
  if(!Number.isFinite(captured) || new Date(captured).toISOString()!==observed ||
     captured>nowMs+60*1000 || nowMs-captured>MAX_AGE_MS)return FALLBACK;
  return Object.freeze({
    optional:true,mode:'WITH_MAP',status:'Available',
    provider:source.provider,observedAtUtc:observed,
    positionsIncluded:false,capacityIndependent:true
  });
}
module.exports={projectOptionalTracker};
