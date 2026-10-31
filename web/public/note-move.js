// One shared destination picker for the explorer, open tabs and Quick history.
export function createMovePicker({api,localFolders=()=>[]}) {
  const dialog=document.createElement('dialog');dialog.className='move-dialog';
  dialog.innerHTML=`<form><h2>Move to…</h2><p class="move-name"></p><label>Vault<select name="vault" required></select></label><label>Folder<input name="folder" list="move-folders" placeholder="Vault root (or enter a folder path)" autocomplete="off"></label><datalist id="move-folders"></datalist><div class="move-folders" aria-label="Destination folders"></div><p class="move-error" role="status"></p><div class="ab"><button type="button" class="move-cancel">Cancel</button><button class="move-submit">Move</button></div></form>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form'),vault=form.elements.vault,folder=form.elements.folder,list=dialog.querySelector('.move-folders'),error=dialog.querySelector('.move-error'),submit=dialog.querySelector('.move-submit');
  let resolve,ticket=0,busy=false,execute;
  async function load(){
    const seq=++ticket;submit.disabled=true;list.replaceChildren();error.textContent='Loading folders…';
    try{
      const {notes}=await api('notes?vault='+vault.value);if(seq!==ticket||!dialog.open)return;
      const paths=new Set(localFolders(vault.value));
      for(const n of notes){let parts=n.path.split('/');parts.pop();while(parts.length){paths.add(parts.join('/'));parts.pop();}}
      const options=['',...[...paths].sort((a,b)=>a.localeCompare(b))];
      dialog.querySelector('datalist').replaceChildren(...options.filter(Boolean).map(p=>new Option(p,p)));
      for(const path of options){const b=document.createElement('button');b.type='button';b.textContent=path||'Vault root';b.title=path;b.style.paddingLeft=(10+path.split('/').length*8)+'px';b.onclick=()=>{folder.value=path;list.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));};list.append(b);}
      error.textContent='';submit.disabled=false;
    }catch(e){if(seq===ticket)error.textContent=e.message;}
  }
  vault.onchange=()=>{folder.value='';load();};
  dialog.querySelector('.move-cancel').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.onclose=()=>{ticket++;resolve?.(null);resolve=null;};
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;busy=true;submit.disabled=true;vault.disabled=true;folder.disabled=true;
    try{const dest={vault:vault.value,folder:folder.value.trim().replace(/\/$/,'')};const result=await execute(dest);resolve?.(result);resolve=null;dialog.close();}
    catch(e){error.textContent=e.message;}
    finally{busy=false;submit.disabled=false;vault.disabled=false;folder.disabled=false;}
  };
  return async(source,move)=>{
    if(dialog.open)return null;
    const {vaults}=await api('vaults');
    vault.replaceChildren(...vaults.map(v=>new Option(v.name,v.id)));vault.value=source.vault;
    folder.value=source.path.split('/').slice(0,-1).join('/');dialog.querySelector('.move-name').textContent=source.path;
    execute=move;error.textContent='';dialog.showModal();void load();
    return new Promise(r=>{resolve=r;});
  };
}
