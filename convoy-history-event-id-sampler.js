const fs = require('fs');
const { resilientFetchJson } = require('./api-resilience');

const START = Number(process.env.KINGS_EVENT_ID_SAMPLE_START || '14000');
const END = Number(process.env.KINGS_EVENT_ID_SAMPLE_END || '20500');
const STEP = Number(process.env.KINGS_EVENT_ID_SAMPLE_STEP || '250');
const OUTPUT = process.env.KINGS_EVENT_ID_SAMPLE_OUTPUT || 'data/convoy-history-event-id-samples.json';

function eventDate(event) {
  const raw = event?.meetup_at || event?.start_at || null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

async function fetchEvent(id) {
  try {
    const payload = await resilientFetchJson(`https://api.truckersmp.com/v2/events/${id}`, {
      label: 'truckersmp-history-sample',
      retries: 1,
      timeoutMs: 10000,
      fetchOptions: { headers: { Accept: 'application/json', 'User-Agent': 'Kings Logistics Convoy History Sampler/1.0' } },
      validateJson: data => Boolean(data && typeof data === 'object')
    });
    if (payload?.error || !payload?.response?.id) return { id, found:false };
    return {
      id,
      found:true,
      date:eventDate(payload.response),
      name:payload.response.name || null,
      vtcId:payload.response.vtc?.id || null,
      vtcName:payload.response.vtc?.name || null
    };
  } catch (error) {
    return { id, found:false, error:error.message };
  }
}

async function main() {
  const ids=[];
  for(let id=START; id<=END; id+=STEP) ids.push(id);
  const samples=[];
  for(const id of ids){
    const item=await fetchEvent(id);
    samples.push(item);
    console.log(id, item.found ? item.date : 'not-found');
  }
  const output={version:1,generatedAt:new Date().toISOString(),start:START,end:END,step:STEP,samples};
  fs.mkdirSync('data',{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(output,null,2)+'\n');
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exit(1);});
}
