'use strict';
// Bounded GitHub Actions ZIP decoder for the Kings Convoy report artifact.
// Pure in-memory, read-only. No files, network, secrets or report logs.
// Prohibits ambiguous archive layouts, links, zip bombs and duplicate names.
const zlib=require('node:zlib');
const {TextDecoder}=require('node:util');
const ERROR='Kings Event Capacity standalone pilot archive invalid.';
const ALLOWED=new Set([
  'convoy-check-results.json','convoy-overview.json',
  'convoy-planning-limits.json','convoy-completeness.json','convoy-overview.md'
]);
const NEEDED=['convoy-check-results.json','convoy-overview.json'];
const MAX_ZIP=25*1024*1024,MAX_TOTAL=24*1024*1024,MAX_JSON=12*1024*1024;
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
function fail(){throw new Error(ERROR);}
const table=Array.from({length:256},(_,i)=>{
  let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(buf){
  let crc=0xffffffff;
  for(const b of buf)crc=table[(crc^b)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function parsePrivateConvoyArchive(zip){
  if(!Buffer.isBuffer(zip)||zip.length<22||zip.length>MAX_ZIP)fail();
  // Normal GitHub Actions artifacts have no trailing extra data or ZIP comments.
  const eocd=zip.length-22;
  if(zip.readUInt32LE(eocd)!==0x06054b50||
     zip.readUInt16LE(eocd+4)!==0||zip.readUInt16LE(eocd+6)!==0||
     zip.readUInt16LE(eocd+20)!==0)fail();
  const count=zip.readUInt16LE(eocd+10),onDisk=zip.readUInt16LE(eocd+8);
  const centralSize=zip.readUInt32LE(eocd+12),centralStart=zip.readUInt32LE(eocd+16);
  if(count<2||count>8||onDisk!==count||centralStart===0xffffffff||
     centralSize===0xffffffff||centralStart+centralSize!==eocd)fail();
  const files=new Map(),spans=[];
  let pos=centralStart,total=0;
  for(let i=0;i<count;i++){
    if(pos+46>eocd||zip.readUInt32LE(pos)!==0x02014b50)fail();
    const creator=zip.readUInt16LE(pos+4)>>>8;
    const flags=zip.readUInt16LE(pos+8),method=zip.readUInt16LE(pos+10);
    const crc=zip.readUInt32LE(pos+16),size=zip.readUInt32LE(pos+20);
    const decoded=zip.readUInt32LE(pos+24);
    const nameLen=zip.readUInt16LE(pos+28),extra=zip.readUInt16LE(pos+30);
    const comment=zip.readUInt16LE(pos+32),disk=zip.readUInt16LE(pos+34);
    const external=zip.readUInt32LE(pos+38);
    const off=zip.readUInt32LE(pos+42);
    const end=pos+46+nameLen+extra+comment;
    if(end>eocd||!nameLen||disk!==0||size===0xffffffff||
       decoded===0xffffffff||off===0xffffffff||
       (flags&~(0x0808|0x0006))!==0||(flags&1)!==0||
       (method!==0&&method!==8)||decoded===0||decoded>MAX_JSON||
       (method===0&&size!==decoded))fail();
    if(creator===3){
      const type=(external>>>16)&0o170000;
      if(type!==0&&type!==0o100000)fail();
    }
    let name;
    try{name=utf8.decode(zip.subarray(pos+46,pos+46+nameLen));}catch{fail();}
    if(!/^(?:output\/)?[a-z0-9-]+\.(?:json|md)$/.test(name))fail();
    const normalized=name.startsWith('output/')?name.slice(7):name;
    if(!ALLOWED.has(normalized)||files.has(normalized))fail();
    if(off+30>centralStart||zip.readUInt32LE(off)!==0x04034b50||
       zip.readUInt16LE(off+6)!==flags||zip.readUInt16LE(off+8)!==method)fail();
    const localNameLen=zip.readUInt16LE(off+26),localExtra=zip.readUInt16LE(off+28);
    const from=off+30+localNameLen+localExtra;
    const through=from+size;
    if(through>centralStart||localNameLen!==nameLen||
       !zip.subarray(off+30,off+30+localNameLen)
         .equals(zip.subarray(pos+46,pos+46+nameLen)))fail();
    if(!(flags&8)&&(zip.readUInt32LE(off+14)!==crc||
        zip.readUInt32LE(off+18)!==size||
        zip.readUInt32LE(off+22)!==decoded))fail();
    // GitHub Actions ZIPs use a bit-3 data descriptor after each
    // compressed member (usually signature 0x08074b50 + CRC and lengths).
    // Verify it against central-directory metadata; otherwise a malformed
    // descriptor could be silently ignored while data is treated as valid.
    let memberEnd=through;
    if(flags&8){
      const signed=through+4<=centralStart&&
        zip.readUInt32LE(through)===0x08074b50;
      const descriptorAt=through+(signed?4:0);
      if(descriptorAt+12>centralStart||
        zip.readUInt32LE(descriptorAt)!==crc||
        zip.readUInt32LE(descriptorAt+4)!==size||
        zip.readUInt32LE(descriptorAt+8)!==decoded)fail();
      memberEnd=descriptorAt+12;
    }
    spans.push([off,memberEnd]);
    total+=decoded;
    if(total>MAX_TOTAL)fail();
    let contents;
    try{
      contents=method===0?zip.subarray(from,through):
        zlib.inflateRawSync(zip.subarray(from,through),{maxOutputLength:decoded});
    }catch{fail();}
    if(contents.length!==decoded||crc32(contents)!==crc)fail();
    files.set(normalized,contents);
    pos=end;
  }
  if(pos!==eocd)fail();
  spans.sort((a,b)=>a[0]-b[0]);
  if(spans[0][0]!==0||spans.at(-1)[1]!==centralStart)fail();
  for(let i=1;i<spans.length;i++)if(spans[i][0]!==spans[i-1][1])fail();
  if(NEEDED.some(name=>!files.has(name)))fail();
  function decode(name){
    let text;
    try{text=utf8.decode(files.get(name));}catch{fail();}
    let value;
    try{value=JSON.parse(text);}catch{fail();}
    if(!value||typeof value!=='object'||Array.isArray(value))fail();
    return value;
  }
  // Never expose unrelated files or raw ZIP metadata to a public caller.
  return {report:decode(NEEDED[0]),overview:decode(NEEDED[1])};
}
module.exports={parsePrivateConvoyArchive};
