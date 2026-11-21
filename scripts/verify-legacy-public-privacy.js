'use strict';
// Auditable, zero-network, read-only CI/push gate for the public Legacy file.
const fs=require('node:fs');
const path=require('node:path');
const {assertPublicLegacyArchiveSafe}=require('../legacy-convoy-privacy');
function run(file=path.join(__dirname,'..','data','legacy-convoys.json')){
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 assertPublicLegacyArchiveSafe(data);
 console.log('Legacy public privacy check passed; source IDs, internal links, staff notes and attachment metadata are absent. Events: '+data.convoys.length);
 return data.convoys.length;
}
if(require.main===module)try{run()}catch{
 console.error('Legacy public privacy check FAILED. No private content printed.');
 process.exitCode=1;
}
module.exports={run};
