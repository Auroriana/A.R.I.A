import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {retireMovedFile} from '../tools/sync-moves.mjs';
test('moved local copy is archived without changing bytes, and edited copies stay put',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'aria-move-'));await mkdir(path.join(root,'Folder'));
 const p=path.join(root,'Folder','Note.md'),text='Exact\r\n42.50';await writeFile(p,text);
 const hash=createHash('sha256').update('Exact\n42.50').digest('hex');
 await assert.rejects(retireMovedFile(root,'../Note.md',hash));
 await assert.rejects(retireMovedFile(root,'Folder/Note.md','wrong'),/changed locally/);assert.equal(await readFile(p,'utf8'),text);
 const backup=await retireMovedFile(root,'Folder/Note.md',hash);assert.equal(await readFile(backup,'utf8'),text);await assert.rejects(access(p));assert.ok(backup.startsWith(path.join(root,'.aria-moved')));
});
