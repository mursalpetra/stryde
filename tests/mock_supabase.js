(() => {
 const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
 const cfg = window.__testConfig;
 const saved = localStorage.getItem('__test_mock_cloud');
 const m = window.__mock = {
  cloud: saved ? JSON.parse(saved) : clone(cfg.cloud || {}),
  user: JSON.parse(localStorage.getItem('__test_mock_user') || 'null'),
  calls: [], upserts: [], photoRows: clone(cfg.photos || []),
  failReads: !!(cfg.failReads || window.__testOffline), failWrites: !!(cfg.failWrites || window.__testOffline), deferredReads: [], holdReads: false,
  persist() { localStorage.setItem('__test_mock_cloud', JSON.stringify(this.cloud)); },
  session() { return this.user ? {user: clone(this.user), access_token: 'synthetic-test-token'} : null; },
  switchUser(id) {
   this.user = id ? {id, email: id + '@example.invalid'} : null;
   localStorage.setItem('__test_mock_user', JSON.stringify(this.user));
   for (const cb of listeners) cb(id ? 'SIGNED_IN' : 'SIGNED_OUT', this.session());
  },
  releaseReads() { this.holdReads = false; this.deferredReads.splice(0).forEach(fn => fn()); }
 };
 const listeners = [];
 function table(name) {
  let filters = [], operation = 'select', columns = '*';
  const q = {
   select(value) { columns = value; return q; },
   eq(key, value) { filters.push([key, value]); return q; },
   order() { return q; },
   delete() { operation = 'delete'; return q; },
   async insert(row) { m.calls.push({kind:'insert', table:name, row:clone(row)}); m.photoRows.push(clone(row)); return {error:null}; },
   async upsert(row, options) {
    m.calls.push({kind:'upsert', table:name, row:clone(row), options:clone(options)});
    if (m.failWrites) return {error:{message:'Synthetic offline save failure'}};
    m.upserts.push(clone(row)); m.cloud[row.user_id] = clone(row.payload); m.persist(); return {error:null};
   },
   async result(single=false) {
    m.calls.push({kind:operation, table:name, filters:clone(filters), columns});
    if (name === 'stryde_cloud_state') {
     if (m.holdReads) await new Promise(resolve => m.deferredReads.push(resolve));
     if (m.failReads) return {data:null,error:{message:'Synthetic offline read failure'}};
     const uid = filters.find(([k]) => k === 'user_id')?.[1];
     return {data:m.cloud[uid] ? {payload:clone(m.cloud[uid])} : null,error:null};
    }
    const match = r => filters.every(([key,value]) => r[key] === value);
    const rows = m.photoRows.filter(match);
    if (operation === 'delete') m.photoRows = m.photoRows.filter(r => !match(r));
    return {data:single ? clone(rows[0]) : clone(rows),error:null};
   },
   maybeSingle() { return q.result(true); }, single() { return q.result(true); },
   then(resolve,reject) { return q.result().then(resolve,reject); }
  };
  return q;
 }
 window.supabase = {createClient(_project,_key,options) {
  m.authOptions = {storageKey:options.auth.storageKey,persistSession:options.auth.persistSession};
  return {
   auth: {
    onAuthStateChange(cb) { listeners.push(cb); return {data:{subscription:{unsubscribe(){}}}}; },
    async getSession() { return {data:{session:m.session()},error:null}; },
    async getUser() { return {data:{user:clone(m.user)},error:null}; },
    async signOut() { m.switchUser(null); return {error:null}; },
    async signInWithPassword({email}) { m.switchUser(email.split('@')[0]); return {data:{session:m.session()},error:null}; },
   },
   from: table,
   storage: {from(bucket) { return {
    async upload(path,blob,options) { m.calls.push({kind:'photo-upload',bucket,path,size:blob.size,type:blob.type,options}); return {error:null}; },
    async download(path) { m.calls.push({kind:'photo-download',bucket,path}); return {data:new Blob(['synthetic image'],{type:'image/jpeg'}),error:null}; },
    async remove(paths) { m.calls.push({kind:'photo-remove',bucket,paths}); return {error:null}; }
   }; }}
  };
 }};
})();
