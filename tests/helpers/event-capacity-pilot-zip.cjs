'use strict';
const zlib=require('node:zlib');
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
    const crc=crc32(bytes),descriptor=spec.descriptor===true;
    const flags=descriptor?0x808:0x800;
    let tail=Buffer.alloc(0);
    if(descriptor){
      const signature=spec.descriptorNoSignature!==true;
      tail=Buffer.alloc(signature?16:12);
      const at=signature?4:0;
      if(signature)tail.writeUInt32LE(0x08074b50,0);
      tail.writeUInt32LE(crc,at);
      tail.writeUInt32LE(compressed.length,at+4);
      tail.writeUInt32LE(bytes.length,at+8);
    }
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);
    local.writeUInt32LE(descriptor?0:crc,14);
    local.writeUInt32LE(descriptor?0:compressed.length,18);
    local.writeUInt32LE(descriptor?0:bytes.length,22);
    local.writeUInt16LE(name.length,26);
    chunks.push(local,name,compressed,tail);
    const header=Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50,0);
    header.writeUInt16LE(0x0314,4);header.writeUInt16LE(20,6);
    header.writeUInt16LE(flags,8);header.writeUInt16LE(method,10);
    header.writeUInt32LE(crc,16);
    header.writeUInt32LE(compressed.length,20);header.writeUInt32LE(bytes.length,24);
    header.writeUInt16LE(name.length,28);
    header.writeUInt32LE((0o100600*0x10000)>>>0,38);
    header.writeUInt32LE(offset,42);
    central.push(header,name);
    offset+=local.length+name.length+compressed.length+tail.length;
  }
  const cc=Buffer.concat(central);
  const e=Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50,0);
  e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);
  e.writeUInt32LE(cc.length,12);e.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,cc,e]);
}

module.exports={makeSyntheticCapacityZip:zip};
