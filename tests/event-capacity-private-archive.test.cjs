'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {parsePrivateConvoyArchive}=require('../event-capacity-private-archive');
function crc32(b){
  let v=0xffffffff;
  for(const byte of b){
    v^=byte;
    for(let j=0;j<8;j++)v=v&1?(v>>>1)^0xedb88320:v>>>1;
  }
  return (v^0xffffffff)>>>0;
}
function zip(entries){
  const chunks=[],central=[];
  let offset=0;
  for(const source of entries){
    const spec=typeof source==='string'?{name:source}:source;
    const name=Buffer.from(spec.name,'utf8');
    const bytes=Buffer.from(spec.data??JSON.stringify({synthetic:true}),'utf8');
    const compressed=spec.method===0?bytes:zlib.deflateRawSync(bytes);
    const method=spec.method===0?0:8;
    const crc=crc32(bytes);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);
    local.writeUInt16LE(name.length,26);
    chunks.push(local,name,compressed);
    const header=Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50,0);
    header.writeUInt16LE(0x0314,4);header.writeUInt16LE(20,6);
    header.writeUInt16LE(0x800,8);header.writeUInt16LE(method,10);
    header.writeUInt32LE(crc,16);
    header.writeUInt32LE(compressed.length,20);header.writeUInt32LE(bytes.length,24);
    header.writeUInt16LE(name.length,28);
    header.writeUInt32LE(0o100600<<16,38);
    header.writeUInt32LE(offset,42);
    central.push(header,name);
    offset+=local.length+name.length+compressed.length;
  }
  const cc=Buffer.concat(central);
  const e=Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50,0);
  e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);
  e.writeUInt32LE(cc.length,12);e.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,cc,e]);
}
function files(){
  return [
    {name:'convoy-check-results.json',data:JSON.stringify({guildId:'synthetic',threads:[]})},
    {name:'convoy-overview.json',data:JSON.stringify({guildId:'synthetic',registeredConvoys:[]})}
  ];
}
test('Parses only the two required JSON reports from bounded ZIP',()=>{
  const a=parsePrivateConvoyArchive(zip([...files(),
    {name:'convoy-overview.md',data:'Synthetic Markdown overview'}
  ]));
  assert.deepEqual(a.report,{guildId:'synthetic',threads:[]});
  assert.deepEqual(a.overview,{guildId:'synthetic',registeredConvoys:[]});
  assert.equal(JSON.stringify(a).includes('Synthetic Markdown'),false);
});
test('Accepts stored ZIP members and the optional output/ root',()=>{
  const entries=files().map(x=>({...x,name:'output/'+x.name,method:0}));
  assert.equal(parsePrivateConvoyArchive(zip(entries)).report.guildId,'synthetic');
});
test('Rejects missing Overview or Checker report and unknown files',()=>{
  assert.throws(()=>parsePrivateConvoyArchive(zip([files()[0]])));
  assert.throws(()=>parsePrivateConvoyArchive(zip([files()[0],{
    name:'staff-raw-private-data.json',data:'{}'
  }])));
});
test('Rejects ZIP path traversal and duplicate normalized filenames',()=>{
  assert.throws(()=>parsePrivateConvoyArchive(zip([
    ...files(),{name:'../convoy-overview.md',data:'test'}
  ])));
  assert.throws(()=>parsePrivateConvoyArchive(zip([
    ...files(),{name:'output/convoy-overview.json',data:'{}'}
  ])));
});
test('Rejects archive with a truncated or corrupted checksum',()=>{
  const data=zip(files());
  const tampered=Buffer.from(data);
  const at=tampered.indexOf(Buffer.from('"threads"'));
  assert.ok(at>0);
  tampered[at]^=1;
  assert.throws(()=>parsePrivateConvoyArchive(tampered));
  assert.throws(()=>parsePrivateConvoyArchive(data.subarray(0,data.length-10)));
});
test('Rejects inflated reports over size cap before JSON parsing',()=>{
  const huge=zip([
    {name:'convoy-check-results.json',data:'x'.repeat(12*1024*1024+1)},
    files()[1]
  ]);
  assert.throws(()=>parsePrivateConvoyArchive(huge));
});
test('Rejects invalid JSON, arrays, and malformed UTF-8 source reports',()=>{
  assert.throws(()=>parsePrivateConvoyArchive(zip([
    {name:'convoy-check-results.json',data:'{private'},
    files()[1]
  ])));
  assert.throws(()=>parsePrivateConvoyArchive(zip([
    {name:'convoy-check-results.json',data:'[]'},
    files()[1]
  ])));
  assert.throws(()=>parsePrivateConvoyArchive(zip([
    {name:'convoy-check-results.json',data:Buffer.from([0xff,0xfe])},
    files()[1]
  ])));
});
test('Rejects encrypted archive flags',()=>{
  const a=zip(files());
  const central=a.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  const tampered=Buffer.from(a);
  tampered.writeUInt16LE(0x801,central+8);
  assert.throws(()=>parsePrivateConvoyArchive(tampered));
});
test('Rejects symbolic link ZIP member from Unix metadata',()=>{
  const a=zip(files());
  const central=a.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  const tampered=Buffer.from(a);
  tampered.writeUInt32LE(0o120777<<16,central+38);
  assert.throws(()=>parsePrivateConvoyArchive(tampered));
});
test('Rejects non-Buffer payload and trailing extraneous bytes',()=>{
  assert.throws(()=>parsePrivateConvoyArchive({payload:files()}));
  assert.throws(()=>parsePrivateConvoyArchive(Buffer.concat([zip(files()),Buffer.from([1,2,3])])));
});
module.exports={makeSyntheticCapacityZip:zip};
