import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';

test('bundled MCP server: tool metadata, UI resource, STEP, STL and measurement',async()=>{
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../dist/server.mjs',import.meta.url))],stderr:'pipe'});
  const client=new Client({name:'cad-viewer-test',version:'1'});let diagnostics='';transport.stderr.on('data',c=>diagnostics+=c.toString());
  try{
    await client.connect(transport);
    const {tools}=await client.listTools();assert.equal(tools.length,4);
    const opener=tools.find(t=>t.name==='open_cad');assert.equal(opener.annotations.readOnlyHint,true);
    assert.ok(opener._meta['openai/ui'].entrypoints.some(e=>e.type==='file'));
    const ui=await client.readResource({uri:'ui://cad-viewer/v1/viewer.html'});assert.match(ui.contents[0].mimeType,/mcp-app/);assert.match(ui.contents[0].text,/CAD Viewer/);
    const demo=await client.callTool({name:'cad_demo',arguments:{}});assert.equal(demo._meta.model.parts.length,3);
    const result=await client.callTool({name:'measure_points',arguments:{a:[0,0,0],b:[3,4,12]}});assert.equal(result.structuredContent.distance,13);
    for(const [file,parts] of [['demo.step',3],['cube-20mm.stl',1]]){
      const r=await client.callTool({name:'open_cad',arguments:{path:fileURLToPath(new URL('../examples/'+file,import.meta.url))}});
      assert.ok(!r.isError,JSON.stringify(r));assert.equal(r._meta.model.parts.length,parts);
      if(file.endsWith('.stl'))assert.deepEqual(r.structuredContent.bounds.size,[20,20,20]);
      else assert.deepEqual(r.structuredContent.bounds.size,[40,24,27]);
    }
    const invalid=await client.callTool({name:'convert_cad',arguments:{name:'fake.step',base64:Buffer.from('invalid STEP').toString('base64')}});assert.equal(invalid.isError,true);
    assert.equal(diagnostics,'','No library diagnostics may corrupt stdio');
  }finally{await client.close();}
});
