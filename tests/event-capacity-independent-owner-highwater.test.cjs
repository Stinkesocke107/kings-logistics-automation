'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {issueHistoricalArchivePinOffline}
  =require('../event-capacity-historical-github-reader');
const {
  prepareOfflineOwnerHighwaterCard,compareRemoteHistoryToOfflineHighwater,
  fingerprintSignedOfflineOwnerFloor,inspectOfflineOwnerRecoveryCopies
}=require('../event-capacity-independent-owner-highwater');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
function specimen(){
  const x=setup();
  const card=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:x.previousOwnerReceipt,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  const compare=(overrides={})=>compareRemoteHistoryToOfflineHighwater({
    remoteJournal:x.afterJournal,
    remoteCheckpoint:x.next.checkpoint,
    remoteOwnerReceipt:x.nextOwnerReceipt,
    retainedOwnerCard:card,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW,
    ...overrides
  });
  return {x,card,compare};
}
test('Offline card carries signed owner receipt without an owner private key or implicit storage proof',()=>{
  const s=specimen();
  assert.equal(s.card.kind,'Kings Offline Owner Highwater Card');
  assert.equal(s.card.exportPerformed,false);
  assert.equal(s.card.independentlyRetained,false);
  assert.equal(s.card.githubWritePerformed,false);
  assert.equal(s.card.freeSlotsCertified,false);
  assert.equal(s.card.privateSigningKeyIncluded,false);
  assert.equal(JSON.stringify(s.card).includes(s.x.ownerPrivateKey),false);
  assert.equal(Object.isFrozen(s.card),true);
});
test('A remote history ahead of the retained owner floor remains human review only',()=>{
  const s=specimen(),out=s.compare();
  assert.equal(out.state,'Remote Ahead — Independent Owner Review Required');
  assert.equal(out.retainedRevision,1);
  assert.equal(out.remoteRevision,2);
  assert.equal(out.retainedHistoricalPrefixVerified,true);
  assert.equal(out.currentRetainedReceiptMatchesRemote,false);
  assert.equal(out.remoteAtOrAboveRetainedFloor,true);
  assert.equal(out.latestRemoteHighwaterIndependentlyConfirmed,false);
  assert.equal(out.humanReviewRequired,true);
  assert.equal(out.remoteWritePerformed,false);
  assert.equal(out.freeSlotsCertified,false);
});
test('Exact owner-signed remote journal and independently supplied floor match safely',()=>{
  const s=specimen();
  const same=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:s.x.nextOwnerReceipt,scope:SCOPE,
    ownerPublicKey:s.x.ownerPublicKey,nowMs:NOW
  });
  const out=s.compare({retainedOwnerCard:same});
  assert.equal(out.state,'Remote Matches Retained Signed Owner Floor');
  assert.equal(out.currentRetainedReceiptMatchesRemote,true);
  assert.equal(out.independentPhysicalCustodyAuthenticatedByCode,false);
  assert.equal(out.highwaterAdvancedAutomatically,false);
  assert.equal(out.humanReviewRequired,true);
  assert.equal(out.historicalCoverageCertified,false);
});
test('Remote version behind offline owner floor is a hard rollback failure',()=>{
  const s=specimen();
  const newFloor=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:s.x.nextOwnerReceipt,scope:SCOPE,
    ownerPublicKey:s.x.ownerPublicKey,nowMs:NOW
  });
  assert.throws(()=>s.compare({
    remoteJournal:s.x.beforeJournal,
    remoteCheckpoint:s.x.prior.checkpoint,
    remoteOwnerReceipt:s.x.previousOwnerReceipt,
    retainedOwnerCard:newFloor
  }));
});
test('Two different valid signatures at one revision but divergent archive cipher digest are a fork',()=>{
  const s=specimen();
  const altered={...s.x.next.checkpoint,archiveDigest:'0'.repeat(64)};
  const signed=issueHistoricalArchivePinOffline({
    checkpoint:altered,scope:SCOPE,
    ownerPrivateKey:s.x.ownerPrivateKey,
    issuedAt:'2027-05-18T10:00:00.000Z'
  });
  const fork=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:signed,scope:SCOPE,
    ownerPublicKey:s.x.ownerPublicKey,nowMs:NOW
  });
  assert.throws(()=>s.compare({retainedOwnerCard:fork}));
});
test('Two valid checkpoint receipts at same revision but different signed historical tips are a fork',()=>{
  const s=specimen();
  const changed={...s.x.next.checkpoint,tip:'1'.repeat(64)};
  const receipt=issueHistoricalArchivePinOffline({
    checkpoint:changed,scope:SCOPE,
    ownerPrivateKey:s.x.ownerPrivateKey,
    issuedAt:'2027-05-18T10:00:00.000Z'
  });
  const fork=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:receipt,scope:SCOPE,
    ownerPublicKey:s.x.ownerPublicKey,nowMs:NOW
  });
  assert.throws(()=>s.compare({retainedOwnerCard:fork}));
});
test('Valid remote receipt with changed checkpoint metadata is rejected',()=>{
  const s=specimen();
  assert.throws(()=>s.compare({remoteCheckpoint:{
    ...s.x.next.checkpoint,archiveDigest:'2'.repeat(64)
  }}));
  assert.throws(()=>s.compare({remoteCheckpoint:{
    ...s.x.next.checkpoint,revision:0
  }}));
});
test('Fake remote journal, forged owner key and mismatched scope all fail closed',()=>{
  const s=specimen();
  assert.throws(()=>s.compare({remoteJournal:{
    ...s.x.afterJournal,tip:'0'.repeat(64)
  }}));
  const attacker=crypto.generateKeyPairSync('ed25519');
  assert.throws(()=>s.compare({ownerPublicKey:attacker.publicKey.export({
    format:'pem',type:'spki'
  })}));
  assert.throws(()=>s.compare({scope:{
    ...SCOPE,forumId:'999999999999999999'
  }}));
});
test('Tampered owner signed receipt, wrong receipt timestamp and missing card fields fail closed',()=>{
  const s=specimen();
  const tampered=structuredClone(s.card);
  tampered.receipt.payload.revision=3;
  assert.throws(()=>s.compare({retainedOwnerCard:tampered}));
  const malicious=structuredClone(s.card);
  malicious.exportPerformed=true;
  assert.throws(()=>s.compare({retainedOwnerCard:malicious}));
  const future=issueHistoricalArchivePinOffline({
    checkpoint:s.x.prior.checkpoint,scope:SCOPE,
    ownerPrivateKey:s.x.ownerPrivateKey,
    issuedAt:'2027-06-30T10:00:00.000Z'
  });
  assert.throws(()=>prepareOfflineOwnerHighwaterCard({
    ownerReceipt:future,scope:SCOPE,
    ownerPublicKey:s.x.ownerPublicKey,nowMs:NOW
  }));
});
test('Private event IDs, archive data and offline keys are absent from comparison output',()=>{
  const s=specimen(),result=s.compare();
  const json=JSON.stringify(result);
  for(const sensitive of ['event:100','Partner Convoy',
    s.x.ownerPrivateKey,'PRIVATE KEY','GITHUB_TOKEN',
    'synthetic private encryption secret'])
    assert.equal(json.includes(sensitive),false);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
});

test('Two signed offline recovery copies match one externally supplied fingerprint without claiming custody',()=>{
  const {x,card}=specimen();
  const copy=structuredClone(card);
  const expectedFingerprint=fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:card,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  assert.match(expectedFingerprint,/^[a-f0-9]{64}$/);
  const result=inspectOfflineOwnerRecoveryCopies({
    primaryCard:card,recoveryCard:copy,expectedFingerprint,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  assert.equal(result.bothSignedCopiesCryptographicallyVerified,true);
  assert.equal(result.bothCopiesMatchRecordedFingerprint,true);
  assert.equal(result.independentMediaCustodyProvenByCode,false);
  assert.equal(result.independentlyRetainedLatestHighwaterProven,false);
  assert.equal(result.safeToActivate,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(JSON.stringify(result).includes('event:100'),false);
});
test('Recovery audit rejects a mismatched, missing or reformatted external fingerprint',()=>{
  const {x,card}=specimen();
  const pin=fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:card,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  for(const value of [undefined,'',pin.toUpperCase(),'0'.repeat(64),'a'.repeat(12)]){
    assert.throws(()=>inspectOfflineOwnerRecoveryCopies({
      primaryCard:card,recoveryCard:structuredClone(card),
      expectedFingerprint:value,scope:SCOPE,
      ownerPublicKey:x.ownerPublicKey,nowMs:NOW
    }));
  }
});
test('Owner recovery cards must be separate objects; duplicates are not evidence of independent custody',()=>{
  const {x,card}=specimen();
  const pin=fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:card,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  assert.throws(()=>inspectOfflineOwnerRecoveryCopies({
    primaryCard:card,recoveryCard:card,expectedFingerprint:pin,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  }));
});
test('Two authentic but different dated owner-signed receipts are not silently treated as the same backup',()=>{
  const {x,card}=specimen();
  const other=issueHistoricalArchivePinOffline({
    checkpoint:x.prior.checkpoint,scope:SCOPE,
    ownerPrivateKey:x.ownerPrivateKey,issuedAt:'2027-05-19T10:00:00.000Z'
  });
  const another=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:other,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  const pin=fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:card,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  assert.throws(()=>inspectOfflineOwnerRecoveryCopies({
    primaryCard:card,recoveryCard:another,
    expectedFingerprint:pin,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  }));
});
test('Fake recovery copy, changed card metadata and wrong signing identity fail closed',()=>{
  const {x,card}=specimen();
  const pin=fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:card,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  const tampered=structuredClone(card);
  tampered.receipt.payload.archiveDigest='0'.repeat(64);
  const wrongFlag=structuredClone(card);wrongFlag.independentlyRetained=true;
  const unexpected=structuredClone(card);unexpected.token='private token';
  const otherKey=crypto.generateKeyPairSync('ed25519').publicKey.export({
    format:'pem',type:'spki'
  });
  for(const copy of [tampered,wrongFlag,unexpected]){
    assert.throws(()=>inspectOfflineOwnerRecoveryCopies({
      primaryCard:card,recoveryCard:copy,expectedFingerprint:pin,
      scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
    }),e=>{
      assert.doesNotMatch(String(e),/private token|event:100/);
      return true;
    });
  }
  assert.throws(()=>inspectOfflineOwnerRecoveryCopies({
    primaryCard:card,recoveryCard:structuredClone(card),expectedFingerprint:pin,
    scope:SCOPE,ownerPublicKey:otherKey,nowMs:NOW
  }));
});
test('Offline fingerprint is tied to the signed scope and bounded verification time',()=>{
  const {x,card}=specimen();
  assert.throws(()=>fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:card,
    scope:{...SCOPE,forumId:'999999999999999999'},
    ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  }));
  assert.throws(()=>fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:{...card,sourceCompletenessProven:true},
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  }));
  assert.throws(()=>fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:card,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,nowMs:-1
  }));
});
