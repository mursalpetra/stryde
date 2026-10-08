/* STRYDE account sheet, remembered sign-in, and private cloud sync.
 * Only the public Supabase key belongs in this browser file. Never store passwords.
 */
(() => {
  'use strict';
  const PROJECT = 'https://vkmduzvfvyjtedtynhkv.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_N4y1DWQJo5dKDKve6Eoodw_SUyHTuCy';
  const AUTH_KEY = 'sb-vkmduzvfvyjtedtynhkv-auth-token'; // Preserve existing sessions.
  const PREF_KEY = 'stryde-remember-me';
  const DATA_KEY = 'stryde-v1';
  const OWNER_KEY = 'stryde-cloud-owner-v1';
  const volatile = new Map();
  let storageBlocked = false;
  const store = (area, action, key, value) => {
    try { return window[area][action](key, value); }
    catch { storageBlocked = true; return action === 'getItem' ? null : undefined; }
  };
  let remember = store('sessionStorage', 'getItem', PREF_KEY) === 'no'
    ? false : store('localStorage', 'getItem', PREF_KEY) !== 'no';
  const authStorage = {
    getItem(key) {
      return store(remember ? 'localStorage' : 'sessionStorage', 'getItem', key) ?? volatile.get(key) ?? null;
    },
    setItem(key, value) {
      volatile.set(key, value);
      store(remember ? 'localStorage' : 'sessionStorage', 'setItem', key, value);
    },
    removeItem(key) {
      volatile.delete(key);
      store('localStorage', 'removeItem', key);
      store('sessionStorage', 'removeItem', key);
    }
  };
  function setRemember(value) {
    // Move only Supabase's auth records, never the workout log or a password.
    const keys = [AUTH_KEY, AUTH_KEY + '-code-verifier', AUTH_KEY + '-user'];
    const records = keys.map(key => [key, authStorage.getItem(key)]);
    remember = Boolean(value);
    store('localStorage', 'setItem', PREF_KEY, remember ? 'yes' : 'no');
    store('sessionStorage', 'setItem', PREF_KEY, remember ? 'yes' : 'no');
    for (const [key, record] of records) {
      authStorage.removeItem(key);
      if (record) authStorage.setItem(key, record);
    }
  }
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const parse = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
  const valid = value => value && typeof value === 'object' && !Array.isArray(value)
    && (!value.logs || (typeof value.logs === 'object' && !Array.isArray(value.logs)))
    && (!value.profile || (typeof value.profile === 'object' && !Array.isArray(value.profile)))
    && (!value.milestones || Array.isArray(value.milestones));
  const copy = value => JSON.parse(JSON.stringify(value));
  function localData() {
    // Prefer the current in-memory data so a queued edit cannot be overwritten.
    if (typeof state !== 'undefined' && valid(state)) return copy(state);
    return parse(store('localStorage', 'getItem', DATA_KEY));
  }
  function signature(value) {
    const transient = new Set(['week', 'selectedDay', 'lastSeenV2']);
    function sorted(v, top = false) {
      if (Array.isArray(v)) return v.map(item => sorted(item));
      if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort()
        .filter(key => !top || !transient.has(key)).map(key => [key, sorted(v[key])]));
      return v;
    }
    return JSON.stringify(sorted(value || {}, true));
  }
  let client = null, user = null, initialized = false, ready = false;
  let syncStatus = 'Checking account…', epoch = 0, loading = false, saving = false;
  let queued = null, conflict = null, activeRead = null, buttonSignature = '';
  let dialog = null, mode = 'login', returnFocus = null, formBusy = false;
  const rootElement = document.getElementById('root');
  document.getElementById('cloud-status')?.remove(); // Remove the old full-width form.

  function paintButton() {
    const top = rootElement?.querySelector('.top');
    if (!top) return;
    let button = top.querySelector('[data-stryde-account]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.className = 'stryde-account-button';
      button.setAttribute('data-stryde-account', '');
      button.setAttribute('aria-haspopup', 'dialog');
      button.addEventListener('click', () => openAccount());
      const old = top.querySelector('.avatar');
      if (old) old.replaceWith(button); else top.append(button);
      buttonSignature = '';
    }
    const initials = user?.email?.charAt(0)?.toUpperCase() || 'S';
    const label = user ? 'Account' : initialized ? 'Log in' : 'Account';
    const key = [label, initials, syncStatus, Boolean(user)].join('|');
    if (buttonSignature === key && button.dataset.ready === 'true') return;
    buttonSignature = key; button.dataset.ready = 'true';
    button.classList.toggle('is-signed-in', Boolean(user));
    button.innerHTML = user
      ? '<span class="stryde-account-initial" aria-hidden="true">' + html(initials) + '</span><span>Account</span>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 21v-2a7 7 0 0 1 14 0v2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg><span>' + label + '</span>';
    button.setAttribute('aria-label', user ? 'Open account. ' + syncStatus : 'Log in to STRYDE');
    button.title = user ? syncStatus : 'Log in or create your STRYDE account';
  }
  function setStatus(text) {
    syncStatus = text; paintButton();
    const status = dialog?.querySelector('[data-sync-status]');
    if (status) status.textContent = text;
  }
  function message(text, error = false) {
    const node = dialog?.querySelector('[data-auth-message]');
    if (node) { node.textContent = text; node.classList.toggle('is-error', error); }
  }
  function closeAccount() {
    if (!dialog?.open) return;
    dialog.close();
    const password = dialog.querySelector('input[type="password"], #stryde-login-password');
    if (password) password.value = '';
    formBusy = false;
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'stryde-account-dialog'; dialog.className = 'stryde-auth-dialog';
    dialog.setAttribute('aria-labelledby', 'stryde-auth-title');
    document.body.append(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeAccount();
      }
    });
    dialog.addEventListener('close', () => {
      const password = dialog.querySelector('#stryde-login-password');
      if (password) password.value = '';
      document.body.classList.remove('stryde-auth-open');
      if (returnFocus?.isConnected) returnFocus.focus();
    });
  }
  function openAccount(nextMode = 'login') {
    ensureDialog(); mode = nextMode; returnFocus = document.activeElement;
    drawDialog();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('stryde-auth-open');
    requestAnimationFrame(() => dialog.querySelector(user ? '[data-close-account]' : '#stryde-login-email')?.focus());
  }
  function drawDialog() {
    if (!dialog || formBusy) return;
    const signedIn = Boolean(user);
    const title = signedIn ? 'Your account' : mode === 'signup' ? 'Make it yours.' : 'Welcome back.';
    const lead = signedIn ? 'One account for your workouts and connected runs.'
      : mode === 'signup' ? 'Keep your training history together, across your devices.'
      : 'Your training, right where you left it.';
    let content = '<div class="stryde-auth-shell"><button type="button" class="stryde-auth-close" data-close-account aria-label="Close account">×</button>'
      + '<div class="stryde-auth-brand">STRYDE</div><h2 id="stryde-auth-title">' + title + '</h2><p class="stryde-auth-lead">' + lead + '</p>';
    if (!signedIn) {
      content += '<form id="stryde-login-form"><label for="stryde-login-email">Email</label>'
        + '<input id="stryde-login-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="you@example.com">'
        + '<label for="stryde-login-password">Password</label><div class="stryde-password-field">'
        + '<input id="stryde-login-password" name="password" type="password" autocomplete="' + (mode === 'signup' ? 'new-password' : 'current-password') + '" required' + (mode === 'signup' ? ' minlength="8"' : '') + ' placeholder="' + (mode === 'signup' ? 'At least 8 characters' : 'Your password') + '">'
        + '<button type="button" id="stryde-show-password" aria-label="Show password" aria-pressed="false">Show</button></div>'
        + '<label class="stryde-remember"><input id="stryde-remember" type="checkbox" ' + (remember ? 'checked' : '') + '><span>Remember me on this device</span></label>'
        + '<p class="stryde-auth-hint">Use on your own device. Uncheck for tab-only sign-in. Your password is never saved by STRYDE.</p>'
        + '<p data-auth-message class="stryde-auth-message" role="status" aria-live="polite"></p>'
        + '<button type="submit" class="stryde-auth-primary">' + (mode === 'signup' ? 'Create account' : 'Log in') + '</button></form>'
        + '<div class="stryde-auth-switch">' + (mode === 'signup' ? 'Already have an account?' : 'New to STRYDE?')
        + ' <button type="button" id="stryde-auth-switch">' + (mode === 'signup' ? 'Log in' : 'Create account') + '</button></div>'
        + '<button type="button" class="stryde-auth-link" data-close-account>Continue without signing in</button>';
    } else {
      content += '<div class="stryde-account-identity"><span class="stryde-account-initial">' + html(user.email?.charAt(0).toUpperCase() || 'S')
        + '</span><div><strong>Signed in</strong><span>' + html(user.email || 'Your STRYDE account') + '</span></div></div>'
        + '<div class="stryde-sync-summary"><span class="stryde-status-dot" aria-hidden="true"></span><span data-sync-status>' + html(syncStatus) + '</span></div>';
      if (conflict) content += '<section class="stryde-sync-review"><h3>Choose the workout copy to use</h3><p>This device and your account have different saved data. Neither has been overwritten.</p>'
        + '<button type="button" class="stryde-auth-primary" id="stryde-use-cloud">Use this account’s cloud copy</button>'
        + '<button type="button" class="stryde-auth-secondary" id="stryde-use-device">Keep this device’s copy and sync it</button>'
        + '<p class="stryde-auth-hint">A backup of the replaced copy is kept on this device before either change.</p></section>';
      content += '<label class="stryde-remember"><input id="stryde-remember" type="checkbox" ' + (remember ? 'checked' : '') + '><span>Remember me on this device</span></label>'
        + '<p class="stryde-auth-hint">' + (storageBlocked ? 'Your browser blocked storage. Sign-in may not survive reopening.' : 'Checked: sign-in is restored on this device. Unchecked: tab-only sign-in.') + '</p>'
        + '<p data-auth-message class="stryde-auth-message" role="status" aria-live="polite"></p>'
        + '<div class="stryde-account-actions"><button type="button" class="stryde-auth-secondary" id="stryde-sync-now">Sync now</button>'
        + '<button type="button" class="stryde-auth-secondary" id="stryde-strava-open">Strava connection</button>'
        + '<button type="button" class="stryde-auth-link" id="stryde-sign-out">Sign out on this device</button></div>'
        + '<p class="stryde-auth-hint">Signing out stops cloud sync. The offline workout copy stays on this device.</p>';
    }
    dialog.innerHTML = content + '</div>';
    dialog.querySelectorAll('[data-close-account]').forEach(button => button.addEventListener('click', closeAccount));
    if (!signedIn) {
      dialog.querySelector('#stryde-auth-switch').onclick = () => { mode = mode === 'signup' ? 'login' : 'signup'; drawDialog(); };
      dialog.querySelector('#stryde-show-password').onclick = event => {
        const input = dialog.querySelector('#stryde-login-password');
        const show = input.type === 'password'; input.type = show ? 'text' : 'password';
        event.currentTarget.textContent = show ? 'Hide' : 'Show';
        event.currentTarget.setAttribute('aria-pressed', String(show));
        event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      };
      dialog.querySelector('#stryde-login-form').addEventListener('submit', submitLogin);
    } else {
      dialog.querySelector('#stryde-remember').onchange = event => { setRemember(event.target.checked); drawDialog(); };
      dialog.querySelector('#stryde-sign-out').onclick = signOut;
      dialog.querySelector('#stryde-sync-now').onclick = async () => {
        if (conflict) return message('Choose the workout copy above before syncing.');
        try { if (queued && ready) await flush(); else await loadCloud(user.id, epoch); }
        catch { setStatus('Sync unavailable. Your device copy is safe.'); }
      };
      dialog.querySelector('#stryde-strava-open').onclick = () => { closeAccount(); window.go?.('strava'); };
      if (conflict) {
        dialog.querySelector('#stryde-use-cloud').onclick = () => resolveConflict('cloud');
        dialog.querySelector('#stryde-use-device').onclick = () => resolveConflict('device');
      }
    }
  }
  async function submitLogin(event) {
    event.preventDefault(); if (formBusy) return;
    if (!client) return message('Sign-in service could not load. Check your connection and reopen STRYDE.', true);
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    setRemember(dialog.querySelector('#stryde-remember').checked);
    const signup = mode === 'signup'; formBusy = true;
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    message(signup ? 'Creating your account…' : 'Signing in…');
    try {
      const result = signup ? await client.auth.signUp({ email, password }) : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      form.elements.password.value = '';
      if (result.data?.session) { closeAccount(); scheduleSession(result.data.session); }
      else message('Check your email to confirm your account, then return here to log in.');
    } catch (error) { message(error?.message || 'Unable to sign in. Please try again.', true); }
    finally { formBusy = false; submit.disabled = false; }
  }
  function backup(payload, label) {
    const key = 'stryde-backup-' + label + '-' + Date.now();
    try { window.localStorage.setItem(key, JSON.stringify(payload)); }
    catch { throw new Error('Backup could not be saved. Export your workouts before replacing a copy.'); }
  }
  function applyCloud(payload) {
    if (!valid(payload)) throw new Error('Unrecognized cloud data. No device data was changed.');
    const local = localData() || {};
    const next = { ...copy(payload), week: local.week || 1, selectedDay: local.selectedDay, lastSeenV2: true };
    store('localStorage', 'setItem', DATA_KEY, JSON.stringify(next));
    if (typeof state !== 'undefined') state = next;
    if (typeof normalize === 'function') normalize();
    if (typeof render === 'function') render();
  }
  const fingerprintKey = uid => 'stryde-sync-fingerprint-' + uid;
  function markSynced(uid, payload) {
    store('localStorage', 'setItem', OWNER_KEY, uid);
    store('localStorage', 'setItem', fingerprintKey(uid), signature(payload));
    ready = true; setStatus(storageBlocked ? 'Signed in · storage is unavailable' : 'Synced');
  }
  async function loadCloud(uid, version) {
    if (!client || loading || user?.id !== uid || version !== epoch) return;
    loading = true; ready = false; setStatus('Checking saved workouts…');
    try {
      const { data, error } = await client.from('stryde_cloud_state').select('payload').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (user?.id !== uid || epoch !== version) return;
      const remote = valid(data?.payload) && Object.keys(data.payload).length ? data.payload : null;
      const local = localData();
      const owner = store('localStorage', 'getItem', OWNER_KEY);
      const lastSync = store('localStorage', 'getItem', fingerprintKey(uid));
      const oldOwner = Boolean(owner && owner !== uid);
      const same = remote && signature(remote) === signature(local);
      if (oldOwner || (remote && local && !same && lastSync !== signature(local) && lastSync !== signature(remote))) {
        conflict = { uid, remote, version }; queued = null; setStatus('Signed in · review sync');
        if (dialog?.open) drawDialog();
        return;
      }
      if (remote && (!local || (lastSync === signature(local) && !same))) {
        if (local) backup(local, 'before-cloud');
        applyCloud(remote); queued = null; markSynced(uid, remote);
      } else if (remote && same) { queued = null; markSynced(uid, remote); }
      else {
        ready = true; queued = local || null;
        if (queued) await flush(); else setStatus('Signed in · no workouts to sync yet');
      }
    } catch {
      if (epoch === version) setStatus('Signed in · sync unavailable; device data is safe');
    } finally { loading = false; }
  }
  async function resolveConflict(choice) {
    const item = conflict; if (!item || user?.id !== item.uid) return;
    try {
      const local = localData();
      if (choice === 'cloud') {
        if (local) backup(local, 'before-cloud');
        const remote = item.remote || { week: local?.week || 1, logs: {}, profile: {}, milestones: [] };
        applyCloud(remote); conflict = null; queued = null; markSynced(item.uid, remote);
      } else {
        if (item.remote) backup(item.remote, 'before-device');
        conflict = null; ready = true; queued = local; await flush();
      }
      drawDialog();
    } catch (error) { message(error.message || 'No saved data was replaced.', true); }
  }
  async function flush() {
    if (saving || !ready || !user || conflict || !queued) return;
    saving = true;
    let failedPayload = null, failedUid = null;
    try {
      while (queued && ready && user && !conflict) {
        const payload = queued, uid = user.id, version = epoch; queued = null;
        failedPayload = payload; failedUid = uid;
        setStatus('Saving workouts…');
        const { error } = await client.from('stryde_cloud_state').upsert({ user_id: uid, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (epoch !== version || user?.id !== uid) return;
        if (error) { queued = queued || payload; setStatus('Cloud save failed · saved on this device'); return; }
        markSynced(uid, payload); failedPayload = null;
      }
    } catch {
      if (user?.id === failedUid) queued = queued || failedPayload;
      setStatus('Offline · saved on this device');
    }
    finally { saving = false; }
  }
  let sessionTimer = null;
  function scheduleSession(session) {
    // Supabase callbacks remain synchronous. No database/auth await inside the auth lock.
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => acceptSession(session), 0);
  }
  function acceptSession(session) {
    initialized = true;
    const next = session?.user || null;
    const changed = next?.id !== user?.id;
    if (changed) { epoch++; ready = false; conflict = null; queued = null; }
    user = next;
    if(changed) window.dispatchEvent(new CustomEvent('stryde-account-change',{detail:{userId:user?.id||null}}));
    paintButton();
    if (!user) { setStatus('Not signed in'); if (dialog?.open && !formBusy) drawDialog(); return; }
    if (changed || (!ready && !loading && !conflict && !activeRead)) {
      const uid = user.id, version = epoch;
      activeRead = loadCloud(uid, version).finally(() => { activeRead = null; });
    }
    if (dialog?.open && !formBusy) drawDialog();
  }
  async function signOut() {
    if (!client) return;
    if (queued && !window.confirm('Some workouts are not synced yet. Sign out and keep them on this device?')) return;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      acceptSession(null); closeAccount();
    } catch (error) { message(error.message || 'Could not sign out. Try again.', true); }
  }
  window.strydeOpenAccount = openAccount;
  window.strydeCloudSave = payload => {
    if (!valid(payload)) return;
    queued = copy(payload);
    if (ready && user && !conflict) void flush();
  };
  window.strydeStravaRequest = async (action, method = 'GET') => {
    if (!client) return { error: 'Sign-in service unavailable. Please reload STRYDE.' };
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) { openAccount(); return { error: 'Log in to STRYDE, then connect Strava.' }; }
    try {
      const response = await fetch(PROJECT + '/functions/v1/stryde-strava?action=' + encodeURIComponent(action), {
        method, headers: { Authorization: 'Bearer ' + data.session.access_token, apikey: PUBLIC_KEY }
      });
      return await response.json();
    } catch { return { error: 'Could not reach Strava sync. Check your connection and retry.' }; }
  };

  // Authenticated, owner-scoped media operations. No auth token or service key leaves this closure.
  window.strydeAccountStatus = () => ({signedIn:Boolean(user),userId:user?.id||null,ready,conflict:Boolean(conflict),status:syncStatus});
  async function photoUser() {
    if (!client || !user) { openAccount(); throw Error('Log in before uploading private photos.'); }
    if (conflict) throw Error('Resolve the account sync choice before saving photos.');
    const {data,error}=await client.auth.getUser();
    if(error||!data.user||data.user.id!==user.id)throw Error('Please sign in again.');
    return data.user.id;
  }
  const photoReference = meta => {
    if(!['goal','benchmark'].includes(meta.reference_type)||!/^[a-zA-Z0-9_-]{1,120}$/.test(meta.reference_id||''))throw Error('Choose a saved goal or benchmark first.');
  };
  window.strydePrivatePhotos = {
    async list(type,reference) {
      const uid=await photoUser(); photoReference({reference_type:type,reference_id:reference});
      const {data,error}=await client.from('stryde_photo_entries').select('id,reference_type,reference_id,stage,view_label,photo_date,caption,object_path').eq('user_id',uid).eq('reference_type',type).eq('reference_id',reference).order('photo_date',{ascending:true});
      if(error)throw Error('Unable to load private photos.');
      if(user?.id!==uid)throw Error('Account changed. Reopen this page.');
      return data||[];
    },
    async upload(blob,meta) {
      const uid=await photoUser();photoReference(meta);
      if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||blob.size>4194304)throw Error('Use a JPEG photo under 4 MB after compression.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(meta.photo_date||''))throw Error('Choose a photo date.');
      const id=crypto.randomUUID(),path=uid+'/'+id+'.jpg';
      const {error:uploadError}=await client.storage.from('stryde-private-photos').upload(path,blob,{upsert:false,contentType:'image/jpeg',cacheControl:'0'});
      if(uploadError)throw Error('Photo upload failed. Check your connection and retry.');
      if(user?.id!==uid)throw Error('Account changed. Reopen this page before continuing.');
      const row={id,user_id:uid,reference_type:meta.reference_type,reference_id:meta.reference_id,stage:['baseline','followup','progress'].includes(meta.stage)?meta.stage:'progress',view_label:['front','side','back','other'].includes(meta.view_label)?meta.view_label:'other',photo_date:meta.photo_date,caption:String(meta.caption||'').slice(0,500),object_path:path};
      const {error}=await client.from('stryde_photo_entries').insert(row);
      if(error){await client.storage.from('stryde-private-photos').remove([path]);throw Error('Photo details could not be saved. Please retry.');}
      return {...row,user_id:undefined};
    },
    async download(path) {
      const uid=await photoUser();
      if(typeof path!=='string'||!path.startsWith(uid+'/')||path.includes('..'))throw Error('Photo access denied.');
      const {data,error}=await client.storage.from('stryde-private-photos').download(path);
      if(error||user?.id!==uid)throw Error('Unable to open this private photo.');
      return data;
    },
    async remove(id) {
      const uid=await photoUser();
      const {data,error}=await client.from('stryde_photo_entries').select('object_path').eq('id',id).eq('user_id',uid).single();
      if(error||!data.object_path.startsWith(uid+'/'))throw Error('Photo not found for this account.');
      const deleted=await client.storage.from('stryde-private-photos').remove([data.object_path]);
      if(deleted.error)throw Error('Unable to delete photo. Please retry.');
      const result=await client.from('stryde_photo_entries').delete().eq('id',id).eq('user_id',uid);
      if(result.error)throw Error('The image was removed; its details could not be cleared yet.');
    }
  };

  if (rootElement) new MutationObserver(paintButton).observe(rootElement, { childList: true, subtree: true });
  paintButton();
  window.addEventListener('online', () => {
    if (!user || conflict) return;
    if (ready && queued) void flush();
    else if (!ready && !loading) void loadCloud(user.id, epoch);
  });
  async function init() {
    if (!window.supabase) { initialized = true; setStatus('Sign-in library unavailable'); return; }
    client = window.supabase.createClient(PROJECT, PUBLIC_KEY, {
      auth: { storageKey: AUTH_KEY, storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.onAuthStateChange((_event, session) => scheduleSession(session));
    try { const { data, error } = await client.auth.getSession(); if (error) throw error; scheduleSession(data.session); }
    catch { initialized = true; setStatus('Sign-in could not be restored. Please log in.'); }
  }
  void init();
})();
