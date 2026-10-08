/* STRYDE Strava integration UI. OAuth server functions are required before connecting. */
window.strydeConnectStrava=()=>{const el=document.getElementById('strava-status');if(el)el.textContent='Secure Strava authorization is not yet active. Finish configuring the Strava Client ID and Client Secret in Supabase first.';};
window.strydeSyncStrava=()=>{const el=document.getElementById('strava-status');if(el)el.textContent='Connect Strava first to import runs.';};
