import {mkdir,realpath,lstat,readFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {cleanPath,normalize} from '../web/lib/notes.js';

// Retain the old local copy in a hidden same-volume archive rather than deleting it.
// The destination cloud note is already committed by the atomic move RPC.
export async function retireMovedFile(vaultRoot,relative,expectedHash){
  cleanPath(relative);const root=await realpath(vaultRoot),source=path.resolve(root,...relative.split('/'));
  const inside=p=>{const rel=path.relative(root,p);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
  if(!inside(source)||!inside(await realpath(source))||(await lstat(source)).isSymbolicLink())throw new Error('Moved note resolves outside the vault or is a symlink.');
  const backupDir=path.join(root,'.aria-moved');await mkdir(backupDir,{recursive:true});
  if(!inside(await realpath(backupDir))||(await lstat(backupDir)).isSymbolicLink())throw new Error('Move archive resolves outside the vault.');
  const current=normalize(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(source)));
  if(createHash('sha256').update(current).digest('hex')!==expectedHash)throw new Error('Note changed locally since the move. Local copy kept for review.');
  const backup=path.join(backupDir,randomUUID()+'-'+path.basename(relative));
  await rename(source,backup);
  // Even a change during the final read/rename race remains recoverable in the archive.
  return backup;
}
