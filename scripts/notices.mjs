import {readdir,readFile,writeFile} from 'node:fs/promises';
const entries=await readdir('node_modules/.pnpm',{withFileTypes:true});
const seen=new Set();const blocks=[];
async function visit(folder){
  let p;try{p=JSON.parse(await readFile(folder+'/package.json','utf8'));}catch{return;}
  const key=p.name+'@'+p.version;if(seen.has(key))return;seen.add(key);
  let content=`${key}\nLicense: ${p.license||'See upstream'}\nRepository: ${typeof p.repository==='string'?p.repository:p.repository?.url||''}\n`;
  const files=await readdir(folder);
  for(const file of files.filter(f=>/^(license|copying|notice)(\.|$)/i.test(f))){try{content+='\n'+file+'\n'+await readFile(folder+'/'+file,'utf8');}catch{}}
  blocks.push(content);
}
for(const entry of entries.filter(e=>e.isDirectory()&&e.name!=='node_modules')){
  const modules='node_modules/.pnpm/'+entry.name+'/node_modules';let names;try{names=await readdir(modules);}catch{continue;}
  for(const name of names){if(name.startsWith('@')){for(const child of await readdir(modules+'/'+name))await visit(modules+'/'+name+'/'+child);}else await visit(modules+'/'+name);}
}
blocks.sort();
const preface=`Third-party notices for CAD Viewer 0.1.0\n\nOriginal plugin code: MIT, Copyright 2026 HappyGame137.\nBundled occt-import-js 0.0.23 and Open CASCADE retain LGPL-2.1 and the Open CASCADE exception. Their unmodified JavaScript and WebAssembly files are separate, replaceable components in dist/vendor.\nImporter source and build scripts: https://github.com/kovacsv/occt-import-js/tree/c2148e54b456b571238d35cac037d304053d64b2\nPinned OCCT source: https://github.com/Open-Cascade-SAS/OCCT/tree/d2abb6d844231cb8f29be6894440874a4700e4a5\nA matching third-party source archive accompanies the release.\nFull library license texts: dist/vendor/license.occt-import-js.txt and dist/vendor/license.occt.txt.\nThe sections below also include development-only dependencies for reproducibility.\n\n`;
await writeFile('THIRD_PARTY_NOTICES.txt',preface+blocks.join('\n\n'+'='.repeat(72)+'\n\n'));
console.log(`Recorded ${blocks.length} dependency license notices.`);
