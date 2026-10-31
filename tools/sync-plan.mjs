// Three-way sync planner. Pure function: no I/O.
//   local:  Map path -> sha256 of LF-normalized content (files currently in the vault)
//   remote: Map path -> {hash, version, deleted}
//   base:   Map path -> {hash, version}  (state recorded at the last successful sync)
//   resolve: { path: 'local' | 'web' } for conflicts the user has decided
export function planSync({ local, remote, base, resolve = {} }) {
  const actions = [];
  const paths = new Set([...local.keys(), ...remote.keys(), ...base.keys()]);
  for (const path of [...paths].sort()) {
    const L = local.get(path), r = remote.get(path), R = r && !r.deleted ? r : undefined, B = base.get(path);
    let a = null;
    if(r?.deleted&&r.movedTo){
      if(L===undefined)a=B?{type:'forget'}:null;
      else a={type:L===r.hash?'retire-moved':'move-conflict',movedTo:r.movedTo,remoteVersion:r.version};
      if(a)actions.push({path,...a});
      continue; // Never resurrect a moved source path, even with --resolve=local.
    }
    if (!R) {
      if (L === undefined) a = B ? { type: 'forget' } : null;
      else a = { type: 'push', baseVersion: r ? r.version : 0 };
    } else if (L === undefined) {
      a = !B || B.hash !== R.hash ? { type: 'pull' } : { type: 'delete-remote', baseVersion: R.version };
    } else if (L === R.hash) a = { type: 'adopt' };
    else if (!B) a = { type: 'conflict' };
    else if (L === B.hash) a = { type: 'pull' };
    else if (R.hash === B.hash) a = { type: 'push', baseVersion: R.version };
    else a = { type: 'conflict' };
    if (a?.type === 'conflict' && resolve[path]) a = resolve[path] === 'local' ? { type: 'push', baseVersion: R.version } : { type: 'pull' };
    if (a) actions.push({ path, ...a, remoteVersion: R?.version });
  }
  return actions;
}
