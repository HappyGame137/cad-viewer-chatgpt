import {zipSync} from 'fflate';
import {mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const roots=['plugin.json','mcp.json','README.md','PRIVACY.md','RELEASE_NOTES.md','LICENSE','THIRD_PARTY_NOTICES.txt','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.gitignore','.agents','skills','assets','examples','dist','server','web','scripts','test'];
const files={};
async function add(path){const s=await stat(path);if(s.isDirectory()){for(const item of await readdir(path))await add(path+'/'+item);}else files[path.replaceAll('\\','/')]=new Uint8Array(await readFile(path));}
for(const path of roots)await add(path);
if(Object.keys(files).some(p=>/CPT|VCSEL|node_modules|\.local|\.git\//i.test(p)))throw new Error('Unexpected project or development data in release.');
await mkdir('release',{recursive:true});
const target='release/cad-viewer-0.1.0.zip';const bytes=zipSync(files,{level:6});await writeFile(target,bytes);
await writeFile('release/SHA256SUMS.txt',createHash('sha256').update(bytes).digest('hex')+'  cad-viewer-0.1.0.zip\n');
await writeFile('release/package-manifest.json',JSON.stringify({version:'0.1.0',files:Object.keys(files).sort(),bytes:bytes.length},null,2));
console.log(`Created ${target}: ${Object.keys(files).length} files, ${bytes.length} bytes.`);
