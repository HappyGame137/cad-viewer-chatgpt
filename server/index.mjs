import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { openFile, convertBytes, summary, demoModel, measure, MAX_FILE_BYTES } from './cad.mjs';

const UI='ui://cad-viewer/v0.2.0/viewer.html';
const html=await readFile(new URL('./viewer.html',import.meta.url),'utf8');
const readonly={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const modelReply=model=>({content:[{type:'text',text:JSON.stringify(summary(model))}],structuredContent:summary(model),_meta:{model}});
const errorReply=e=>({isError:true,content:[{type:'text',text:e.message}]});
const options={tolerance:z.number().min(.01).max(2).default(.05),stlUnits:z.enum(['mm','cm','m','in']).default('mm')};

export function createCadServer() {
  const server=new McpServer({name:'cad-viewer',version:'0.2.0'});
  registerAppResource(server,'CAD viewer',UI,{},async()=>({contents:[{uri:UI,mimeType:RESOURCE_MIME_TYPE,text:html,_meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}}}}]}));
  registerAppTool(server,'open_cad',{
    title:'Open CAD model',description:'View a user-selected local STEP/STL model and its approximate dimensions. Supply an absolute path; omit it to open the viewer. Files are read only. STL source units default to mm and can be specified.',
    inputSchema:{path:z.string().optional(),...options},annotations:readonly,
    _meta:{ui:{resourceUri:UI},'openai/ui':{entrypoints:[{type:'thread'},{type:'file',extensions:['.step','.stp','.stl']}]}}
  },async({path,...opts})=>{try{return path?modelReply(await openFile(path,opts)):{content:[{type:'text',text:'CAD viewer ready. Choose a STEP or STL file.'}]};}catch(e){return errorReply(e);}});
  registerAppTool(server,'convert_cad',{
    title:'Display selected CAD file',description:'Convert explicitly selected CAD file bytes to a display mesh. No files are written.',
    inputSchema:{name:z.string().max(250),base64:z.string().max(Math.ceil(MAX_FILE_BYTES*4/3)+4),...options},annotations:readonly,
    _meta:{ui:{resourceUri:UI,visibility:['app']}}
  },async({name,base64,...opts})=>{try{
    if(!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)||base64.length%4)throw new Error('Malformed base64 file data.');
    return modelReply(await convertBytes(Buffer.from(base64,'base64'),name,opts));
  }catch(e){return errorReply(e);}});
  registerAppTool(server,'cad_demo',{title:'CAD viewer demo',description:'Open a generic three-part CAD demo containing no user project data.',inputSchema:{},annotations:readonly,_meta:{ui:{resourceUri:UI}}},async()=>modelReply(demoModel()));
  server.registerTool('measure_points',{title:'Measure two XYZ points',description:'Calculate Euclidean distance and axis differences between two points in millimetres. Points selected from a display mesh have mesh approximation error.',inputSchema:{a:z.tuple([z.number(),z.number(),z.number()]),b:z.tuple([z.number(),z.number(),z.number()])},annotations:readonly},async({a,b})=>{try{const result=measure(a,b);return{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}catch(e){return errorReply(e);}});
  return server;
}

async function preview() {
  const getArg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:fallback;};
  const port=Number(getArg('--port','3941'));
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local preview port.');
  const path=getArg('--model',null);
  const initial=path?await openFile(path):demoModel();
  const host=`127.0.0.1:${port}`;
  const server=createServer(async(req,res)=>{
    if(req.headers.host!==host || (req.headers.origin&&req.headers.origin!==`http://${host}`)){res.writeHead(403).end('Local requests only');return;}
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");res.end(html);return;}
    if(req.method==='GET'&&req.url==='/api/model'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({_meta:{model:initial}}));return;}
    if(req.method==='GET'&&req.url==='/api/demo'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(modelReply(demoModel())));return;}
    if(req.method==='POST'&&req.url==='/api/convert'&&req.headers['content-type']==='application/json'){
      const chunks=[];let size=0;
      try{for await(const chunk of req){size+=chunk.length;if(size>MAX_FILE_BYTES*1.4)throw new Error('File too large');chunks.push(chunk);}
        const args=JSON.parse(Buffer.concat(chunks));const model=await convertBytes(Buffer.from(args.base64,'base64'),args.name,{tolerance:args.tolerance,stlUnits:args.stlUnits});
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(modelReply(model)));
      }catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message}));}return;
    }
    res.writeHead(404).end('Not found');
  });
  server.listen(port,'127.0.0.1',()=>console.error(`CAD preview: http://${host}`));
}
if(process.argv.includes('--preview'))await preview();
else if(process.argv[1]===fileURLToPath(import.meta.url))await createCadServer().connect(new StdioServerTransport());
