// DuetSub capture snippet — HBO MAX / Max
// WHERE: on the HBO/Max *player* page. FIRST record which host it is (play.max.com vs play.hbomax.com vs other).
// HOW:
//   1. Start playback. Open DevTools -> Console. Paste this whole file, Enter. Prints {armed, host, selectors}.
//   2. Open the subtitles/CC menu, select a CHINESE track; wait ~5s. Then ENGLISH; wait ~5s.
//   3. Run:  copy(__duetDump())   then paste into research/findings/site-samples/hbomax-capture.json (or chat).
// Notes: subtitle files are WebVTT (.vtt). EXTRACTION.md expects native cues in [data-testid="CueBoxContainer"]
//        and controls under [data-testid="playback_controls"] — this snippet reports whether those selectors still exist.
(() => {
  if (window.__duet) return console.log('[duet] already armed');
  const sel = (s) => !!document.querySelector(s);
  const D = window.__duet = { site:'hbomax', host: location.host, url: location.href,
    selectors: { CueBoxContainer: sel('[data-testid="CueBoxContainer"]'), playback_controls: sel('[data-testid="playback_controls"]'), video: sel('video') },
    vttFetches: [], textTracks: [] };
  const isVtt = (u) => /\.vtt(\?|$)/i.test(u) || /\/subtitles?\//i.test(u) && /\.(vtt|webvtt)/i.test(u);
  const rec = (via,u,b) => { if (D.vttFetches.length<6) D.vttFetches.push({ via, url:u.slice(0,300), head:(b||'').slice(0,600), isWebVTT:/^\s*WEBVTT/.test(b||'') }); };
  const OF = window.fetch;
  window.fetch = function(input){ const u=(typeof input==='string')?input:(input&&input.url)||''; const p=OF.apply(this,arguments);
    if (isVtt(u)) p.then(r=>r.clone().text().then(t=>rec('fetch',u,t)).catch(()=>{})).catch(()=>{}); return p; };
  const OX = XMLHttpRequest.prototype.open, SX = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m,u){ this.__u=u; return OX.apply(this,arguments); };
  XMLHttpRequest.prototype.send = function(){ const u=this.__u||''; if (isVtt(u)) this.addEventListener('load', ()=>rec('xhr',u,this.responseText||'')); return SX.apply(this,arguments); };
  // also snapshot the <video>.textTracks the page exposes (language labels)
  try { const v=document.querySelector('video'); if (v) D.textTracks=[...v.textTracks].map(t=>({kind:t.kind,label:t.label,language:t.language,mode:t.mode})); } catch(e){}
  window.__duetDump = () => { try { const v=document.querySelector('video'); if (v) D.textTracks=[...v.textTracks].map(t=>({kind:t.kind,label:t.label,language:t.language,mode:t.mode})); } catch(e){} return JSON.stringify(D, null, 2); };
  console.log('[duet] armed. host=' + D.host + ' selectors=' + JSON.stringify(D.selectors) + '. switch subtitle tracks, then run: copy(__duetDump())');
  return { armed: true, host: D.host, selectors: D.selectors };
})();
