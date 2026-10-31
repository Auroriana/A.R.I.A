import path from 'node:path';
export function validateSyncConfig(value) {
  if(!value||!Array.isArray(value.vaults)||!value.vaults.length)throw new Error('Configure at least one vault pair.');
  const locals=new Set(),clouds=new Set();
  const vaults=value.vaults.map(v=>{
    if(!v||typeof v.localPath!=='string'||!path.isAbsolute(v.localPath)||typeof v.cloudName!=='string'||!v.cloudName.trim())throw new Error('Every vault needs an absolute localPath and a cloudName.');
    const local=path.resolve(v.localPath).toLowerCase(),cloud=v.cloudName.trim().toLowerCase();
    if(locals.has(local)||clouds.has(cloud))throw new Error('Each local folder and cloud vault can be paired only once.');
    for(const other of locals)if(local.startsWith(other+path.sep)||other.startsWith(local+path.sep))throw new Error('Paired vaults cannot contain one another.');
    locals.add(local);clouds.add(cloud);return {...v,cloudName:v.cloudName.trim()};
  });
  const intervalSeconds=value.intervalSeconds??30;
  if(!Number.isInteger(intervalSeconds)||intervalSeconds<10||intervalSeconds>3600)throw new Error('intervalSeconds must be between 10 and 3600.');
  return {vaults,intervalSeconds};
}
