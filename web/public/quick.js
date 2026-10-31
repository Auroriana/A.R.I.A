const element=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};

export function mountQuick(root,{api,open,move,confirm:confirmBox}) {
  root.innerHTML=`<div class="quick-workspace"><h1>Quick note</h1>
    <form id="quick-form"><label class="sr-only" for="quick-text">Quick note</label><textarea id="quick-text" rows="3" maxlength="12000" placeholder="Write a note…" required></textarea>
    <div class="quick-controls"><label class="sw"><input id="quick-detailed" type="checkbox"><i></i><span id="quick-mode">Concise</span></label><button id="quick-send">Send</button></div>
    <p class="quick-help">Organized with Gemini · Original kept · AI search off by default</p></form>
    <p id="quick-status" role="status" aria-live="polite"></p><div id="quick-outbox"></div>
    <div class="quick-history-heading"><h2>Recent notes</h2><button id="quick-refresh" type="button">Refresh</button></div><div id="quick-history"></div>
    <div id="quick-menu" class="ctx" role="menu" hidden></div><div class="quick-pages"><button id="quick-prev">Newer</button><button id="quick-next">Older</button></div></div>`;
  const $=id=>root.querySelector('#'+id);
  let account='',epoch=0,offset=0,rows=[],timer,flushing=false,kicking=false,refreshing=false;
  const key=()=>`aria.quick.outbox.${account}`;
  const tell=m=>$('quick-status').textContent=m;
  const read=()=>{const items=JSON.parse(localStorage.getItem(key())??'[]');if(!Array.isArray(items))throw new Error('The local outbox could not be read.');return items;};
  const write=items=>localStorage.setItem(key(),JSON.stringify(items));
  // Serialize storage changes across tabs; always reread before modifying the outbox.
  const locked=fn=>navigator.locks?navigator.locks.request(key(),fn):Promise.resolve().then(fn);
  function renderOutbox(){
    const box=$('quick-outbox');box.replaceChildren();if(!account)return;
    let items;try{items=read();}catch(e){tell(e.message);return;}if(!items.length)return;
    box.append(element('p',`${items.length} note${items.length===1?'':'s'} saved on this browser, waiting for server confirmation. Reopen Aria here to resend.`));
    for(const item of items){const d=element('details');d.append(element('summary',item.text.slice(0,80)),element('pre',item.text));box.append(d);}
    const retry=element('button','Resend now');retry.onclick=()=>flush();box.append(retry);
  }
  function render(){
    const list=$('quick-history');list.replaceChildren();
    if(!rows.length)list.append(element('p','Your quick notes will appear here.'));
    for(const n of rows){
      const card=element('article');card.className='quick-item';
      if(n.status==='filed'&&!n.note_deleted){card.oncontextmenu=e=>{e.preventDefault();showMenu(e.clientX,e.clientY,n);};}
      const top=element('div');top.className='quick-item-top';
      const title=element(n.status==='filed'&&!n.note_deleted?'button':'strong',n.title||n.text.slice(0,80));
      if(title.tagName==='BUTTON'){title.className='quick-note-link';title.onclick=()=>open(n.path,n.vault_id);}
      const pill=element('span',n.note_deleted?'Note deleted':n.status);pill.className='quick-pill '+n.status;top.append(title,pill);if(n.status==='filed'&&!n.note_deleted){const more=element('button','⋯');more.className='quick-more';more.setAttribute('aria-label','Actions for '+n.title);more.onclick=e=>{e.stopPropagation();const r=more.getBoundingClientRect();showMenu(r.left,r.bottom,n);};top.append(more);}card.append(top);
      const where=n.path?`${n.vault_name??'Vault'} / ${n.path}`:'Awaiting filing';card.append(element('small',where+' · '+new Date(n.created_at).toLocaleString()));
      if(n.error)card.append(element('p',n.error+(n.status==='queued'?' Next attempt: '+new Date(n.next_attempt_at).toLocaleTimeString():'')));
      if(n.status==='filed'&&n.confidence<0.75)card.append(element('p','Kept in Unsorted for your review.'));
      const original=element('details');original.append(element('summary','Original · '+n.mode),element('pre',n.text));card.append(original);
      const actions=element('div');actions.className='quick-actions';
      if(n.status==='filed'&&!n.note_deleted){
        const label=element('label'),toggle=element('input');toggle.type='checkbox';toggle.checked=n.ai_enabled;
        label.className='sw';label.append(toggle,element('i'),element('span','AI search'));actions.append(label);
        toggle.onchange=async()=>{toggle.disabled=true;try{await api('quick-ai',{vault:n.vault_id,path:n.path,version:n.version,enabled:toggle.checked});await refresh();}catch(e){toggle.checked=n.ai_enabled;tell(e.message);}finally{toggle.disabled=false;}};
      }
      if(n.status==='failed'){
        const retry=element('button','Retry');retry.onclick=async()=>{retry.disabled=true;try{await api('quick-retry',{id:n.id});await refresh();kick();}catch(e){tell(e.message);}finally{retry.disabled=false;}};actions.append(retry);
      }
      if(['failed','queued'].includes(n.status)){
        const del=element('button','Delete');del.onclick=async()=>{if(!await confirmBox('Remove this pending quick note? Its original text will disappear from this history.','Delete'))return;del.disabled=true;try{await api('quick-delete',{id:n.id});await refresh();}catch(e){tell(e.message);}finally{del.disabled=false;}};actions.append(del);
      }
      card.append(actions);list.append(card);
    }
    $('quick-prev').disabled=offset===0;$('quick-next').disabled=rows.length<50;
  }
  const hideMenu=()=>{$('quick-menu').hidden=true;};
  function showMenu(x,y,n){
    const menu=$('quick-menu');menu.replaceChildren();const b=element('button','Move to…');b.setAttribute('role','menuitem');b.onclick=async()=>{hideMenu();try{const r=await move(n.path,n.vault_id,n.version);if(r){tell('Note moved.');await refresh();}}catch(e){tell(e.message);}};menu.append(b);menu.hidden=false;menu.style.left=Math.max(4,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(4,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';b.focus();
  }
  document.addEventListener('click',hideMenu);document.addEventListener('keydown',e=>{if(e.key==='Escape')hideMenu();});root.addEventListener('scroll',hideMenu,true);window.addEventListener('resize',hideMenu);
  window.addEventListener('aria-note-moved',()=>refresh());
  async function kick(){
    if(!account||kicking)return;const ticket=epoch;kicking=true;
    try{await api('quick-kick',{});if(ticket===epoch)await refresh();}
    catch(e){if(ticket===epoch)tell(e.message+' Server-confirmed notes remain in the queue.');}
    finally{kicking=false;}
  }
  async function flush(){
    if(!account||flushing)return;flushing=true;const ticket=epoch;let uploaded=false;
    try{
      for(;;){
        if(ticket!==epoch)break;
        const item=read()[0];if(!item)break;
        await api('quick-enqueue',item);
        uploaded=true;
        if(ticket!==epoch)break;
        await locked(()=>{if(ticket===epoch)write(read().filter(x=>x.key!==item.key));});
        if(ticket!==epoch)break;
        tell('Saved to the server. You can close Aria; background filing continues once the worker is configured.');
      }
      if(ticket===epoch){renderOutbox();await refresh();if(uploaded||rows.some(n=>n.status==='queued'&&Date.parse(n.next_attempt_at)<=Date.now()))kick();}
    }catch(e){if(ticket===epoch){tell(e.message+' Your unsent text is kept in this browser.');renderOutbox();}}
    finally{flushing=false;}
  }
  function schedule(){clearTimeout(timer);if(!account)return;timer=setTimeout(async()=>{if(!document.hidden&&!root.hidden){await flush();await refresh();}schedule();},rows.some(n=>['queued','processing'].includes(n.status))?5000:30000);}
  async function refresh(){
    if(!account||refreshing)return;refreshing=true;const ticket=epoch,page=offset;
    try{const data=await api('quick-list?offset='+page);if(ticket!==epoch||offset!==page)return;rows=data.notes;render();renderOutbox();}
    catch(e){if(ticket===epoch)tell(e.message);}
    finally{refreshing=false;if(ticket===epoch&&offset!==page)void refresh();else schedule();}
  }
  $('quick-detailed').onchange=()=>$('quick-mode').textContent=$('quick-detailed').checked?'Detailed':'Concise';
  $('quick-form').onsubmit=async e=>{
    e.preventDefault();if(!account){tell('Sign in before sending a quick note.');return;}
    const text=$('quick-text').value;if(!text.trim())return;
    const ticket=epoch,item={key:crypto.randomUUID(),text,mode:$('quick-detailed').checked?'detailed':'concise'};
    $('quick-send').disabled=true;
    try{await locked(()=>{if(ticket!==epoch)throw new Error('Sign-in changed before sending.');const items=read();if(items.length>=100)throw new Error('Local outbox is full. Resend pending notes first.');write([...items,item]);});
      $('quick-text').value='';tell('Saved on this browser. Sending…');renderOutbox();void flush();
    }catch(e){tell(e.message+' Your text is still in the composer.');}
    finally{$('quick-send').disabled=false;}
  };
  $('quick-refresh').onclick=()=>flush();
  $('quick-prev').onclick=()=>{offset=Math.max(0,offset-50);refresh();};
  $('quick-next').onclick=()=>{offset+=50;refresh();};
  window.addEventListener('online',()=>flush());
  window.addEventListener('storage',e=>{if(account&&e.key===key())try{renderOutbox();}catch(err){tell(err.message);}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&account)flush();});
  return {
    init(identity){account=identity;epoch++;offset=0;rows=[];render();try{renderOutbox();}catch(e){tell(e.message);}void flush();schedule();},
    refresh(){void refresh();},
    clear(){hideMenu();account='';epoch++;rows=[];clearTimeout(timer);$('quick-text').value='';$('quick-history').replaceChildren();$('quick-outbox').replaceChildren();tell('');}
  };
}
