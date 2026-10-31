// Shared vault picker used by the chat, notes and import pages.
const KEY = 'aria.vault';
const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable: choice just isn't remembered */ } }
};

// select: <select>; api: (route, body?) => Promise; includeAll: add an "All vaults" choice (chat only);
// canChange: optional guard returning false to veto a switch; onChange(value) runs after a switch.
export async function mountVaults({ select, api, includeAll = false, createButton, canChange, onChange }) {
  let last = '';
  async function load(pick) {
    const { vaults } = await api('vaults');
    select.replaceChildren();
    if (includeAll) select.append(new Option('All vaults', 'all'));
    for (const v of vaults) select.append(new Option(v.name, v.id));
    const values = [...select.options].map(o => o.value), want = pick ?? store.get();
    select.value = values.includes(want) ? want : (values[0] ?? '');
    select.disabled = !values.length;
    last = select.value;
  }
  select.onchange = () => {
    if (canChange && !canChange()) { select.value = last; return; }
    last = select.value; store.set(last); onChange?.(last);
  };
  if (createButton) createButton.onclick = async () => {
    if (canChange && !canChange()) return;
    const name = prompt('Name for the new vault:');
    if (!name?.trim()) return;
    try {
      const r = await api('vault-create', { name: name.trim() });
      await load(r.id); store.set(r.id); onChange?.(r.id);
    } catch (e) { alert(e.message); }
  };
  await load();
  return { reload: load, get value() { return select.value; } };
}
