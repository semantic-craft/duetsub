// DuetSub capture snippet — PRIME VIDEO
// WHERE: on a www.primevideo.com *player* page (video open & playing).
// HOW:
//   1. Start playback. Open DevTools -> Console. Paste this whole file, Enter. Prints {armed:true}.
//   2. Open the subtitles menu (speech-bubble icon), select a CHINESE track; wait ~5s. Then ENGLISH; wait ~5s.
//   3. Run:  copy(__duetDump())   then paste into research/findings/site-samples/primevideo-capture.json (or chat).
// Notes: clock element is  document.querySelector('#dv-web-player video')  ; subtitle files end in .ttml2 (EBU-TT/TTML).
//        subtitleUrls metadata (languageCode / trackGroupId / timedTextTrackId / url) comes from GetPlaybackResources JSON.
(() => {
  if (window.__duet) return console.log('[duet] already armed');
  const D = window.__duet = { site:'primevideo', host: location.host, url: location.href, subtitleUrls: [], ttmlFetches: [] };
  const scanForSubUrls = (o) => { try {
    const walk = (n, depth) => { if (!n || depth>6 || typeof n!=='object') return;
      if (Array.isArray(n.subtitleUrls)) n.subtitleUrls.forEach(s => D.subtitleUrls.push({ languageCode:s.languageCode, displayName:s.displayName, type:s.type, trackGroupId:s.trackGroupId, timedTextTrackId:s.timedTextTrackId, url:(s.url||'').slice(0,300) }));
      if (Array.isArray(n.forcedNarratives)) n.forcedNarratives.forEach(s => D.subtitleUrls.push({ languageCode:s.languageCode, forced:true, trackGroupId:s.trackGroupId, url:(s.url||'').slice(0,300) }));
      for (const k in n) { const v=n[k]; if (v && typeof v==='object') walk(v, depth+1); } };
    walk(o, 0);
  } catch(e){} };
  const OJP = JSON.parse;
  JSON.parse = function(){ const o = OJP.apply(this, arguments); if (o && typeof o==='object') scanForSubUrls(o); return o; };
  const isTtml = (u) => /\.ttml2?(\?|$)/i.test(u) || /subtitle/i.test(u) && /\.(ttml2?|xml)/i.test(u);
  const rec = (via,u,b) => { if (D.ttmlFetches.length<6) D.ttmlFetches.push({ via, url:u.slice(0,300), head:(b||'').slice(0,600) }); };
  const OF = window.fetch;
  window.fetch = function(input){ const u=(typeof input==='string')?input:(input&&input.url)||''; const p=OF.apply(this,arguments);
    if (isTtml(u)) p.then(r=>r.clone().text().then(t=>rec('fetch',u,t)).catch(()=>{})).catch(()=>{});
    // GetPlaybackResources responses are JSON but may not pass through JSON.parse hook if consumed as .json()
    if (/GetPlaybackResources|playbackresources/i.test(u)) p.then(r=>r.clone().json().then(j=>scanForSubUrls(j)).catch(()=>{})).catch(()=>{});
    return p; };
  const OX = XMLHttpRequest.prototype.open, SX = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m,u){ this.__u=u; return OX.apply(this,arguments); };
  XMLHttpRequest.prototype.send = function(){ const u=this.__u||''; this.addEventListener('load', ()=>{ if (isTtml(u)) rec('xhr',u,this.responseText||''); else if (/GetPlaybackResources|playbackresources/i.test(u)) { try{ scanForSubUrls(JSON.parse(this.responseText)); }catch(e){} } }); return SX.apply(this,arguments); };
  window.__duetDump = () => JSON.stringify(D, null, 2);
  console.log('[duet] armed. switch subtitle tracks, then run: copy(__duetDump())');
  return { armed: true };
})();
