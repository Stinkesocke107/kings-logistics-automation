'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {syncEmbedMessage,verifyEmbedDelivery}=require('../leadership-message-sync');
const CHANNEL='777777777777777770',MESSAGE='777777777777777771';
const embed={
  title:'Kings Event Leadership Dashboard',
  description:'Synthetic review state',
  color:1744895,
  footer:{text:'Source is not an Event approval'},
  fields:[
    {name:'Manual Staff Progress',value:'In review **3**',inline:false},
    {name:'Event Capacity',value:'No free slots certified',inline:false}
  ]
};
function mockResponse(body,status=200){
  return {ok:status>=200&&status<300,status,
    text:async()=>typeof body==='string'?body:JSON.stringify(body)};
}
async function withFetch(mock,fn){
  const old=global.fetch;
  const oldMode=process.env.LEADERSHIP_CONSOLIDATED_ONLY;
  process.env.LEADERSHIP_CONSOLIDATED_ONLY='false';
  global.fetch=mock;
  try{return await fn()}
  finally{
    global.fetch=old;
    if(oldMode===undefined)delete process.env.LEADERSHIP_CONSOLIDATED_ONLY;
    else process.env.LEADERSHIP_CONSOLIDATED_ONLY=oldMode;
  }
}
const opts={token:'SYNTHETIC_FAKE_BOT',channelId:CHANNEL,marker:embed.title,
  embed,messageId:MESSAGE,verifyDelivery:true};
test('Event dashboard verifies its actual saved Discord embed after PATCH',async()=>{
  const calls=[];
  await withFetch(async(url,options)=>{
    calls.push(options.method);
    assert.match(url,/^https:\/\/discord\.com\/api\/v10\/channels\//);
    if(options.method==='PATCH')
      return mockResponse({id:MESSAGE,embeds:[embed]});
    if(options.method==='GET')
      return mockResponse({id:MESSAGE,embeds:[embed]});
    throw Error('Unexpected synthetic call');
  },async()=>{
    const result=await syncEmbedMessage(opts);
    assert.deepEqual(calls,['PATCH','GET']);
    assert.equal(result.action,'updated');
    assert.equal(result.messageId,MESSAGE);
    assert.equal(result.deliveryVerified,true);
  });
});
test('stale or incomplete message readback is rejected without printing private field content',async()=>{
  const privateValue='SYNTHETIC_PRIVATE_STAFF_NOT_FOR_LOGGING';
  await withFetch(async(_url,options)=>{
    if(options.method==='PATCH')return mockResponse({id:MESSAGE,embeds:[embed]});
    return mockResponse({id:MESSAGE,embeds:[{
      ...embed,fields:[{...embed.fields[0],value:privateValue}]
    }]});
  },async()=>{
    await assert.rejects(()=>syncEmbedMessage(opts),error=>
      error.message==='Leadership embed delivery not verified'&&
      !error.message.includes(privateValue));
  });
});
test('Discord GET access error cannot leak response body or channel path',async()=>{
  const privateValue='PRIVATE_DISCORD_EVENT_RECORD_NOT_FOR_LOGGING';
  await withFetch(async(_url,options)=>{
    if(options.method==='PATCH')return mockResponse({id:MESSAGE,embeds:[embed]});
    return mockResponse(privateValue,403);
  },async()=>{
    await assert.rejects(()=>syncEmbedMessage(opts),error=>
      /Discord API 403/.test(error.message)&&
      !error.message.includes(privateValue)&&
      !error.message.includes(CHANNEL));
  });
});
test('empty message identifier blocks delivery verification without any network call',async()=>{
  await withFetch(async()=>{throw Error('Network not allowed')},async()=>{
    await assert.rejects(()=>verifyEmbedDelivery({
      token:'SYNTHETIC_FAKE_BOT',channelId:CHANNEL,messageId:null,embed
    }),/delivery not verified/);
  });
});
