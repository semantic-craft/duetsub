// DuetSub capture snippet — NETFLIX
// WHERE: on a Netflix *watch* page (https://www.netflix.com/watch/...), pick a SERIES.
// HOW:
//   1. Start playback. Open DevTools (Cmd+Opt+I) -> Console. Paste this whole file, Enter. It prints {armed:true}.
//   2. In the player, open the Subtitles/Audio menu and select a CHINESE subtitle track; wait ~5s.
//   3. Switch the subtitle track to ENGLISH; wait ~5s.  (track switches force fresh timed-text fetches)
//   4. To also capture the track *metadata* JSON: click "Next Episode" (fresh manifest is parsed with the hook live).
//   5. Run:  copy(__duetDump())   then paste into research/findings/site-samples/netflix-capture.json (or into chat).
// Clock element for reference: document.querySelector('video')
(() => {
  if (window.__duet) return console.log('[duet] already armed');
  const D = window.__duet = { site:'netflix', host: location.host, url: location.href, manifests: [], tracks: [], subFetches: [] };
  // (A) JSON.parse hook — Netflix subtitle metadata lives in objects with result.timedtexttracks + result.movieId
  const OJP = JSON.parse;
  JSON.parse = function(txt) {
    const o = OJP.apply(this, arguments);
    try {
      const r = o && o.result;
      if (r && (r.timedtexttracks || r.timedText) && (r.movieId || r.viewableId)) {
        const tt = r.timedtexttracks || [];
        D.manifests.push({ movieId: r.movieId || r.viewableId, trackCount: tt.length });
        tt.forEach(t => {
          const dls = t.ttDownloadables || t.downloadables || {};
          const formats = Object.keys(dls);
          let oneUrl = null;
          for (const f of formats) { const d = dls[f]; const urls = d && (d.urls || d.downloadUrls); if (urls) { const first = Array.isArray(urls) ? (urls[0] && (urls[0].url||urls[0])) : Object.values(urls)[0]; if (first) { oneUrl = String(first); break; } } }
          D.tracks.push({ language: t.language, languageDescription: t.languageDescription, trackType: t.rawTrackType || t.trackType, isNone: t.isNoneTrack, isForced: t.isForcedNarrative, formats, oneUrl });
        });
      }
    } catch (e) {}
    return o;
  };
  // (B) fetch/XHR hooks — capture the actual timed-text file request + a body sample
  const looksSub = (u) => /nflxvideo\.net/.test(u) && /(\?|&)o=|\.(dfxp|ttml2?|xml|vtt|imsc)/i.test(u);
  const record = (via, u, body) => { if (D.subFetches.length < 6) D.subFetches.push({ via, url: u.slice(0, 300), head: (body||'').slice(0, 500) }); };
  const OF = window.fetch;
  window.fetch = function(input, init){ const u = (typeof input==='string')?input:(input&&input.url)||''; const p = OF.apply(this, arguments);
    if (looksSub(u)) p.then(r=>r.clone().text().then(t=>record('fetch',u,t)).catch(()=>{})).catch(()=>{}); return p; };
  const OX = XMLHttpRequest.prototype.open, SX = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m,u){ this.__u=u; return OX.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(){ const u=this.__u||''; if (looksSub(u)) this.addEventListener('load', ()=>record('xhr',u,this.responseText||'')); return SX.apply(this, arguments); };
  window.__duetDump = () => JSON.stringify(D, null, 2);
  console.log('[duet] armed. switch subtitle tracks, then run: copy(__duetDump())');
  return { armed: true };
})();
