"use strict";
/* Top-Aktien: eigene App neben dem Ki Aktien Helfer (eigenes Repository, eigene Adresse).
   Die Rangliste (3, 7, 30 Handelstage) rechnet der Wachmann (bot/signale.mjs), die Claude-Aufgabe recherchiert Gründe und Quellen.
   Alles kommt über kurse.json (Zweig „kurse“, Feld sig). US-Kurse laufen hier live über Finnhub nach.
   Einstellungen der Haupt-App (Speicher „kah“) werden nur gelesen, nie geändert. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const CS={EUR:"€",USD:"$",GBp:"p",GBP:"£",CHF:"CHF",DKK:"kr"};
let MAIN={};try{MAIN=JSON.parse(localStorage.getItem("kah")||"{}")||{}}catch(e){}
const SET=MAIN.settings||{};
let P={tab:"3",f:"alle"};try{Object.assign(P,JSON.parse(localStorage.getItem("kah-top")||"{}"))}catch(e){}
const saveP=()=>{try{localStorage.setItem("kah-top",JSON.stringify(P))}catch(e){}};
let D=null,KQ={},LIVE={},ladeFehler="",offenS=null,usStat="aus";

/* ---------- Format ---------- */
const nf=(v,d)=>(+v).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const dez=v=>{v=+v;return nf(v,v>=1?2:v>=.01?4:6)};
const pz=(v,d=1)=>v==null||!isFinite(v)?"–":(v>0?"+":v<0?"−":"±")+nf(Math.abs(v),d)+" %";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const kl=v=>v>0?"up":v<0?"down":"muted";
const datum=d=>d?new Date(String(d).length===10?d+"T12:00:00Z":d).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}):"";
const uhr=t=>new Date(t).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
const vor=t=>{const m=Math.round((Date.now()-t)/6e4);return m<1?"gerade eben":m<60?`vor ${m} Min.`:m<1440?`vor ${Math.round(m/60)} Std.`:`vor ${Math.round(m/1440)} Tagen`};
const cs=w=>CS[w.cur]||w.cur||"";
const istEU=s=>/\.(DE|AS|PA|SW|CO|MI|L|MC|BR|VI|ST|HE|OL|LS|IR|F)$/.test(s);
const toast=t=>{const e=$("#toast");e.textContent=t;e.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("on"),3200)};

/* ---------- Daten ---------- */
// Daten, Wachmann und Bot liegen im Repository der Haupt-App, diese App liegt in einem eigenen (eigene Adresse = eigene App auf dem Handy)
const HAUPT_REPO="timaxGg/638291738",HAUPT_APP="https://timaxgg.github.io/638291738/";
function repo(){return SET.ghRepo||HAUPT_REPO}
const kurseUrl=()=>repo()?`https://raw.githubusercontent.com/${repo()}/kurse/kurse.json?t=${Math.floor(Date.now()/6e4)}`:null;
async function laden(still){const u=kurseUrl();if(!u){ladeFehler="repo";render();return}
  try{const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);const k=await r.json();KQ=k.q||{};
    if(k.sig&&k.sig.listen){const neu=!D||D.t!==k.sig.t;D=k.sig;ladeFehler="";await schutzLesen();if(neu||!still)render();else flush();usLive()}
    else{ladeFehler="leer";render()}}catch(e){ladeFehler="netz";if(!D)render();status()}}
const alleWerte=()=>{if(!D)return [];const m=new Map();for(const H of D.horizonte)for(const x of [...(D.listen[H]||[]),...((D.weitere||{})[H]||[])])if(!m.has(x.s))m.set(x.s,x);return [...m.values()]};
function kurs(w){const c=[{p:w.p,t:w.mt||0,src:"liste"}],q=KQ[w.s];if(q&&q.c)c.push({p:q.c,t:q.t||0,src:"kurse"});if(LIVE[w.s])c.push(LIVE[w.s]);return c.sort((a,b)=>b.t-a.t)[0]}
const quelle=(w,k)=>k.src==="Finnhub"&&Date.now()-k.t<12e4?"live":`${istEU(w.s)?"ca. 15 Min. verzögert · ":""}${k.t?vor(k.t):""}`;
const dpVon=(w,p)=>{const prev=w.p/(1+(w.dp||0)/100);return (p/prev-1)*100};

/* ---------- US-Kurse live (Finnhub, Schlüssel aus der Haupt-App) ---------- */
let wsF=null,wsFn=0,fhRest=0;const dirty=new Set();
function setLive(s,p,src,t=Date.now()){if(!(p>0))return;const a=LIVE[s];LIVE[s]={p,t,src,alt:a&&a.p};dirty.add(s);if(!flush.r)flush.r=requestAnimationFrame(()=>{flush.r=0;flush()})}
async function usLive(){if(!SET.fhKey||!D)return;const sy=alleWerte().map(w=>w.s).filter(s=>!istEU(s));if(!sy.length)return;
  if(Date.now()-fhRest>6e4){fhRest=Date.now();for(const s of sy){try{const r=await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${encodeURIComponent(SET.fhKey)}`);
    if(r.status===401||r.status===403){usStat="Schlüssel ungültig";chips();return}if(!r.ok)continue;const q=await r.json();if(q&&q.c>0)setLive(s,q.c,"Finnhub",(q.t||0)*1000)}catch(e){}}}
  if(wsF||wsFn>5)return;try{wsF=new WebSocket("wss://ws.finnhub.io?token="+encodeURIComponent(SET.fhKey))}catch(e){return}
  wsF.onopen=()=>{wsFn=0;sy.forEach(s=>wsF.send(JSON.stringify({type:"subscribe",symbol:s})));usStat="Finnhub";chips()};
  wsF.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==="trade")for(const x of m.data||[])setLive(x.s,x.p,"Finnhub",x.t)}catch(_){}};
  wsF.onclose=()=>{wsF=null;usStat="aus";chips();if(document.hidden)return;wsFn++;setTimeout(usLive,Math.min(6e4,5e3*wsFn))}}
function usOffen(){const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),g=k=>p.find(x=>x.type===k).value,m=+g("hour")*60+ +g("minute");
  return !["Sat","Sun"].includes(g("weekday"))&&m>=570&&m<960}
function flush(){for(const w of alleWerte()){const k=kurs(w),l=LIVE[w.s],S=CSS.escape(w.s);
  $$(`[data-px="${S}"]`).forEach(e=>{const t=`${dez(k.p)} ${cs(w)}`;if(e.textContent!==t){e.textContent=t;if(l&&l.alt&&k.src===l.src){e.classList.remove("tick-up","tick-down");void e.offsetWidth;e.classList.add(l.p>=l.alt?"tick-up":"tick-down")}}});
  $$(`[data-dp="${S}"]`).forEach(e=>{const d=dpVon(w,k.p);e.textContent=pz(d)+" heute";e.className=kl(d)});
  $$(`[data-seit="${S}"]`).forEach(e=>{const p0=+e.dataset.p0,r=(k.p/p0-1)*100;e.textContent=pz(r);e.className=kl(r)});
  $$(`[data-q="${S}"]`).forEach(e=>e.textContent=quelle(w,k))}dirty.clear()}

/* ---------- Bausteine ---------- */
const H_TEXT={3:"3 Handelstage",7:"7 Handelstage",30:"30 Handelstage"};
function testBox(H){const t=(D.test&&D.test.h||{})[H]||{};if(!t.tage)return `<div class="card small muted">Der Rückblick-Test läuft, sobald alle Kursverläufe geladen sind.</div>`;
  const gut=t.besser>=55&&t.topAvg>t.alleAvg;
  return `<div class="card test-k"><b>Wie gut war diese Rechnung im letzten Jahr?</b>
  <p class="small">An ${t.tage} Handelstagen jeweils die Top ${D.top} gekauft und nach ${H} Tagen verkauft (nach Kosten):</p>
  <div class="kz"><div><i>Top ${D.top} im Schnitt</i><b class="${kl(t.topAvg)}">${pz(t.topAvg,2)}</b></div><div><i>alle ${D.werte} Werte im Schnitt</i><b class="${kl(t.alleAvg)}">${pz(t.alleAvg,2)}</b></div>
  <div><i>Tage, an denen die Top ${D.top} vorn lagen</i><b>${t.besser} %</b></div><div><i>Einzelwerte im Plus</i><b>${t.plus} %</b></div></div>
  <p class="small muted">${gut?"Die Rechnung lag öfter vorn als nicht, aber längst nicht immer.":"Die Rechnung lag kaum öfter vorn als der Durchschnitt. Nimm die Liste als Ideensammlung, nicht als Vorhersage."} Die KI-Auswahl selbst wird ab jetzt unter „Bilanz“ gemessen.</p></div>`}
function karte(x,H,voll){const k=kurs(x),d=dpVon(x,k.p),seit=x.p0?(k.p/x.p0-1)*100:null;
  return `<div class="card${voll?"":" tap"}" ${voll?"":`data-open="${esc(x.s)}" data-h="${H}"`}>
  <div class="sig-top">${x.platz?`<span class="rang">${x.platz}</span>`:""}<div class="nm"><b>${esc(x.n)}</b><span>${x.typ==="e"?"<em class=\"etf\">ETF</em> ":""}${esc(x.s)}${x.zuversicht?` · Zuversicht ${esc(x.zuversicht)}`:""}${x.eigen?" · aus deinem Depot":""}</span></div>
  <div class="px"><span data-px="${esc(x.s)}">${dez(k.p)} ${cs(x)}</span><small data-dp="${esc(x.s)}" class="${kl(d)}">${pz(d)} heute</small></div></div>
  <div class="lv">
   <div><i>Seit Liste</i><b>${seit!=null?`<span data-seit="${esc(x.s)}" data-p0="${x.p0}" class="${kl(seit)}">${pz(seit)}</span>`:"–"}</b></div>
   <div><i>4 Wochen</i><b class="${kl(x.wochen4)}">${pz(x.wochen4)}</b></div><div><i>3 Monate</i><b class="${kl(x.monate3)}">${pz(x.monate3)}</b></div>
   <div><i>Trend</i><b>${x.trend==="aufwärts"?"↗ auf":x.trend==="abwärts"?"↘ ab":"–"}</b></div></div>
  ${x.einschaetzung?`<p class="fazit">${esc(x.einschaetzung)}</p>`:""}
  ${voll?"":graph(x,H,true)}
  ${x.warum?`<p class="warum">${esc(voll?x.warum:String(x.warum).split(/(?<=[.!?])\s/).slice(0,2).join(" "))}</p>`:`<p class="small muted">KI-Recherche steht noch aus. Platz aus der Kurs-Rechnung.</p>`}
  ${x.quellen&&x.quellen.length&&!voll?`<p class="small muted">${x.quellen.length} ${x.quellen.length===1?"Quelle":"Quellen"} · Tippen für Details</p>`:""}
  <div class="small muted" data-q="${esc(x.s)}" style="text-align:right">${esc(quelle(x,k))}</div></div>`}


/* ---------- Meine: Merkliste und übernommene Aktien (eigenes Depot dieser App) ---------- */
// Lokal gespeichert und zusätzlich verschlüsselt (Sync-Passwort der Haupt-App) als data/top.enc im Haupt-Repository,
// damit der Bot Gewinnschutz und Verlustschutz überwachen kann. Getrennt vom Depot des Aktien Helfers.
const te=new TextEncoder(),td=new TextDecoder(),b64=u=>btoa(String.fromCharCode(...u)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function cKey(pass,salt){const k=await crypto.subtle.importKey("raw",te.encode(pass),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encJ(o,pass){const sa=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const c=await crypto.subtle.encrypt({name:"AES-GCM",iv},await cKey(pass,sa),te.encode(JSON.stringify(o)));return JSON.stringify({v:1,s:b64(sa),i:b64(iv),c:b64(new Uint8Array(c))})}
async function decJ(t,pass){const o=typeof t==="string"?JSON.parse(t):t;return JSON.parse(td.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(o.i)},await cKey(pass,unb64(o.s)),unb64(o.c))))}
let MEIN={merk:[],depot:[],updatedAt:0},SCHUTZ={};try{Object.assign(MEIN,JSON.parse(localStorage.getItem("kah-top-mein")||"{}"))}catch(e){}
const syncOn=()=>!!(SET.ghToken&&SET.syncPass&&repo());
const merkeLokal=()=>{try{localStorage.setItem("kah-top-mein",JSON.stringify(MEIN))}catch(e){}};
function meinGeaendert(){MEIN.updatedAt=Date.now();merkeLokal();clearTimeout(meinGeaendert.t);meinGeaendert.t=setTimeout(pushMein,1500)}
async function ghC(path,opt){const r=await fetch(`https://api.github.com/repos/${repo()}/contents/${path}${opt?"":"?ref=main"}`,Object.assign({headers:{Authorization:`Bearer ${SET.ghToken}`,Accept:"application/vnd.github+json"}},opt||{}));
  if(r.status===404)return null;if(!r.ok)throw new Error("GitHub "+r.status);return r.json()}
async function pushMein(){if(!syncOn())return;try{const cur=await ghC("data/top.enc");
    await ghC("data/top.enc",{method:"PUT",body:JSON.stringify({message:"Top-Aktien: Merkliste und Depot",content:btoa(await encJ({merk:MEIN.merk,depot:MEIN.depot,updatedAt:MEIN.updatedAt},SET.syncPass)),sha:cur?cur.sha:undefined,branch:"main"})});
    MEIN.sync=Date.now();merkeLokal();wecken(true)}catch(e){toast("Abgleich nicht möglich: "+e.message)}}
async function pullMein(){if(!syncOn())return;try{const r=await ghC("data/top.enc");if(!r)return;const m=await decJ(atob(r.content.replace(/\n/g,"")),SET.syncPass);
    if((m.updatedAt||0)>(MEIN.updatedAt||0)){MEIN=Object.assign({merk:[],depot:[]},m);merkeLokal();render()}}catch(e){}}
async function schutzLesen(){if(D&&D.schutz&&SET.syncPass){try{SCHUTZ=await decJ(D.schutz,SET.syncPass)}catch(e){SCHUTZ={}}}}
const istGemerkt=s=>MEIN.merk.some(m=>m.s===s);
function wert(s){if(!D)return null;for(const H of D.horizonte){const x=(D.listen[H]||[]).find(y=>y.s===s);if(x)return {x,H}}const m=(D.meine||{})[s];return m?{x:m,H:7}:null}
function merken(s,n){if(istGemerkt(s)){MEIN.merk=MEIN.merk.filter(m=>m.s!==s);toast("Nicht mehr gemerkt")}else{MEIN.merk.push({s,n:n||s,t:Date.now()});toast("Gemerkt. Findest du unter „Meine“.")}meinGeaendert();render()}
function inListen(s){return D?D.horizonte.map(H=>{const x=(D.listen[H]||[]).find(y=>y.s===s);return x?`${H} T. Platz ${x.platz}`:""}).filter(Boolean):[]}
function meinBox(x){const pos=MEIN.depot.filter(d=>d.s===x.s),k=kurs(x),al=Math.abs(SET.alertDefault??-10),nl=SET.nlDefault??.5;
  return `<div class="card mein"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ${istGemerkt(x.s)?"ghost":""}" data-merk="${esc(x.s)}" data-n="${esc(x.n)}">${istGemerkt(x.s)?"★ Gemerkt":"☆ Merken"}</button>
   <button class="btn ghost" data-uebern-zeig>${pos.length?"Weitere Stücke übernehmen":"Übernehmen"}</button></div>
   ${pos.length?`<p class="small">In deinem Top-Depot: ${pos.map(d=>`${nf(d.q,d.q%1?2:0)} Stk. zu ${dez(d.k)} ${cs(x)}`).join(", ")}</p>`:""}
   <form class="uebern" hidden onsubmit="return false"><p class="small muted" style="margin-top:10px">Übernehmen heißt: Du hast die Aktie gekauft und trägst sie hier ein. Der Bot überwacht dann Gewinn- und Verlustschutz und warnt dich in Telegram.</p>
    <label class="f">Kaufkurs (${cs(x)})<input name="k" type="number" inputmode="decimal" step="any" min="0" value="${(+k.p).toFixed(k.p>=1?2:4)}"></label>
    <label class="f">Stück<input name="q" type="number" inputmode="decimal" step="any" min="0" value="1"></label>
    <label class="f">Verlustschutz: warnen ab Minus von (%)<input name="a" type="number" inputmode="decimal" step="any" min="0" value="${al}"></label>
    <label class="f">Gewinnschutz: Abstand zum Höchstwert (Prozentpunkte, 0 = aus)<input name="nl" type="number" inputmode="decimal" step="any" min="0" value="${nl}"></label>
    <button class="btn" data-uebern="${esc(x.s)}" data-n="${esc(x.n)}" data-cur="${esc(x.cur||"")}">In mein Top-Depot übernehmen</button></form></div>`}
function seiteMeine(){const dep=MEIN.depot,mk=MEIN.merk;
  const pos=d=>{const w=wert(d.s),x=w?w.x:null,sc=SCHUTZ[d.id]||{},p=x?kurs(x).p:(sc.p||d.k),ch=(p/d.k-1)*100,c=x?cs(x):(CS[d.cur]||d.cur||""),a=-Math.abs(d.a??10),warnV=ch<=a,gs=d.nl!==0;
    return `<div class="card pos${sc.warn||warnV?" warnt":""}"><div class="sig-top"><div class="nm"><b>${esc(d.n)}</b><span>${esc(d.s)} · ${nf(d.q,d.q%1?2:0)} Stk. · Kauf ${dez(d.k)} ${c} · seit ${datum(new Date(d.t).toISOString().slice(0,10))}</span></div>
     <div class="px"><span>${dez(p)} ${c}</span><small class="${kl(ch)}">${pz(ch)} seit Kauf</small></div></div>
     <div class="small ${kl(ch)}" style="text-align:right">${(p-d.k)*d.q>=0?"+":"−"}${nf(Math.abs((p-d.k)*d.q),2)} ${c}</div>
     <div class="schutz"><div><i>🛡️ Gewinnschutz</i>${gs?`<b>${sc.lv!=null?`Schutzlinie ${pz(sc.lv)}`:"aktiv"}</b><small>${sc.ref!=null?`Höchststand ${pz(sc.ref)} · `:""}Abstand ${nf(d.nl>0?d.nl:.5,1)} Pkt.</small>`:"<b>aus</b>"}
       <span class="step"><button data-step="${d.id}:nl:-0.5" aria-label="enger">−</button><button data-step="${d.id}:nl:0.5" aria-label="weiter">+</button></span></div>
      <div><i>🔴 Verlustschutz</i>${d.a!==0?`<b>ab ${pz(a)}</b><small>${warnV?"Grenze erreicht":`noch ${nf(ch-a,1)} Pkt. Luft`}</small>`:"<b>aus</b>"}
       <span class="step"><button data-step="${d.id}:a:-1" aria-label="enger">−</button><button data-step="${d.id}:a:1" aria-label="weiter">+</button></span></div></div>
     ${sc.warn?`<p class="small down"><b>Schutzlinie unterschritten.</b> Der Bot hat dich gewarnt. Mit OK in Telegram setzt du den Schutz neu.</p>`:""}
     <div style="display:flex;gap:8px;margin-top:8px">${x?`<button class="btn ghost" data-open="${esc(d.s)}" data-h="${w.H}">Details</button>`:""}<button class="btn ghost" data-pos-del="${d.id}">Entfernen</button></div></div>`};
  return `${syncOn()?"":`<div class="card small">Ohne <b>GitHub-Token und Sync-Passwort</b> in der Haupt-App bleibt alles nur auf diesem Handy, und der Bot kann dich nicht warnen. Trag beides in der Haupt-App unter Einstellungen ein.</div>`}
  <h2>Mein Top-Depot</h2>${dep.length?dep.map(pos).join(""):`<div class="card small muted">Noch nichts übernommen. Öffne eine Aktie und tippe auf „Übernehmen“, wenn du sie gekauft hast.</div>`}
  <p class="small muted">Gewinnschutz: Die Schutzlinie läuft mit deinem höchsten Plus seit Kauf mit (minus Abstand, nie unter 0). Fällt das Plus darunter, warnt der Bot. Verlustschutz: Warnung, sobald das Minus die Grenze erreicht, danach bei jedem weiteren 2 Prozentpunkten. Getrennt vom Depot im Aktien Helfer.</p>
  <h2>Gemerkt</h2><div class="card" style="padding:4px 12px">${mk.length?mk.map(m=>{const w=wert(m.s),x=w&&w.x,k=x&&kurs(x),d=x?dpVon(x,k.p):null,li=inListen(m.s);
    return `<div class="row"${w?` data-open="${esc(m.s)}" data-h="${w.H}"`:""}><div class="nm"><b style="font-size:14.5px">${esc(m.n)}</b><span>${esc(m.s)}${li.length?" · "+li.join(", "):" · gerade in keiner Liste"}</span></div>
     ${x?`<div class="px"><span data-px="${esc(m.s)}">${dez(k.p)} ${cs(x)}</span><small data-dp="${esc(m.s)}" class="${kl(d)}">${pz(d)} heute</small></div>`:`<div class="px small muted">Kurs folgt</div>`}<button class="icon-btn klein" data-merk="${esc(m.s)}" aria-label="Nicht mehr merken">✕</button></div>`}).join(""):`<p class="small muted">Tippe bei einer Aktie auf „☆ Merken“.</p>`}</div>`}

/* ---------- Seiten ---------- */
function leer(){if(ladeFehler==="repo")return `<div class="card empty"><b>Repository unbekannt</b><p class="muted">Öffne die App über deine GitHub-Pages-Adresse oder trag in der Haupt-App dein GitHub-Repository ein.</p><a class="btn ghost" href="${HAUPT_APP}">Zur Haupt-App</a></div>`;
  if(ladeFehler==="netz")return `<div class="card empty"><b>Keine Verbindung</b><p class="muted">Die Kursdatei ließ sich nicht laden. Ich versuche es gleich wieder.</p></div>`;
  return `<div class="card empty"><b>Noch keine Liste</b><p class="muted">Der Wachmann lädt beim ersten Mal zwei Jahre Kursverlauf für rund 70 Aktien und braucht dafür 2–3 Läufe (10–15 Minuten). Die KI-Recherche kommt dann um 7:15, 13:15 und 19:15 Uhr.</p>${SET.ghToken?`<button class="btn" data-wecken>Wachmann jetzt starten</button>`:""}</div>`}
function seiteListe(H){const l=D.listen[H]||[],ki=D.ki;
  return `${ki?`<div class="card markt"><div class="small muted">KI-Recherche ${esc(ki.slot||"")} · ${uhr(ki.erstellt||D.t)} Uhr</div>${ki.markt?`<p>${esc(ki.markt)}</p>`:""}${(ki.marktQuellen||[]).length?`<p class="small">${ki.marktQuellen.map(q=>`<a href="${esc(q.u)}" target="_blank" rel="noopener">${esc(q.q||q.t)}</a>`).join(" · ")}</p>`:""}</div>`
    :`<div class="card markt small muted">Die KI-Recherche für heute steht noch aus (7:15, 13:15, 19:15 Uhr). Bis dahin: reine Rangliste aus den Kursdaten.</div>`}
  <h2>Die besten für die nächsten ${H_TEXT[H]}</h2>
  ${l.map(x=>karte(x,H)).join("")||`<div class="card muted">Keine Werte.</div>`}
  ${ki&&ki.aussortiert&&ki.aussortiert.filter(a=>String(a.h)===String(H)).length?`<details class="card"><summary><b>Aussortiert trotz guter Rechnung</b></summary><ul class="why">${ki.aussortiert.filter(a=>String(a.h)===String(H)).map(a=>`<li><b>${esc(a.s)}</b>: ${esc(a.grund)}</li>`).join("")}</ul></details>`:""}
  ${testBox(H)}
  ${weitere(H)}`}
function weitere(H){const l=((D.weitere||{})[H]||[]).filter(w=>P.f==="alle"||(P.f==="etf"?w.typ==="e":w.typ!=="e"));
  return `<h2>Weitere starke Werte aus allen ${D.werte}</h2><p class="small muted">Nur aus der Kurs-Rechnung, ohne KI-Recherche. Sortiert nach Punktzahl für ${H_TEXT[H]}.</p>
  <div class="filters">${[["alle","Alle"],["aktie","Aktien"],["etf","ETFs"]].map(([k,n])=>`<button data-f="${k}" class="${P.f===k?"on":""}">${n}</button>`).join("")}</div>
  <div class="card" style="padding:4px 12px">${l.map(w=>{const k=kurs(w),d=dpVon(w,k.p);return `<div class="row"><span class="rang klein">${w.rang}</span><button class="icon-btn klein" data-merk="${esc(w.s)}" data-n="${esc(w.n)}" aria-label="Merken">${istGemerkt(w.s)?"★":"☆"}</button><div class="nm"><b style="font-size:14.5px">${esc(w.n)}</b><span>${w.typ==="e"?"ETF · ":""}${esc(w.s)} · 4 Wo. ${pz(w.wochen4)} · 3 Mon. ${pz(w.monate3)}</span></div>
   <div class="px"><span data-px="${esc(w.s)}">${dez(k.p)} ${cs(w)}</span><small data-dp="${esc(w.s)}" class="${kl(d)}">${pz(d)} heute</small></div></div>`}).join("")||`<p class="muted small">Keine Werte in dieser Auswahl.</p>`}</div>`}
function seiteUpdates(){const V=D.vorschlag,mo=D.modell||{},pr=D.pruefung,par=mo.param||{};
  const tz=t=>`<tr><td>Ganzes Jahr</td><td>${pz(t.jahr.alt.vorsprung,2)}</td><td class="${t.jahr.neu.vorsprung>t.jahr.alt.vorsprung?"up":"down"}">${pz(t.jahr.neu.vorsprung,2)}</td><td>${t.jahr.alt.besser} % → ${t.jahr.neu.besser} %</td></tr>
   <tr><td>1. Hälfte</td><td>${pz(t.h1.alt.vorsprung,2)}</td><td class="${t.h1.neu.vorsprung>t.h1.alt.vorsprung?"up":"down"}">${pz(t.h1.neu.vorsprung,2)}</td><td>${t.h1.alt.besser} % → ${t.h1.neu.besser} %</td></tr>
   <tr><td>2. Hälfte</td><td>${pz(t.h2.alt.vorsprung,2)}</td><td class="${t.h2.neu.vorsprung>t.h2.alt.vorsprung?"up":"down"}">${pz(t.h2.neu.vorsprung,2)}</td><td>${t.h2.alt.besser} % → ${t.h2.neu.besser} %</td></tr>`;
  return `<h2>Updates der Rechnung</h2>
  ${V?`<div class="card upd ${V.status}"><div class="small muted">Vorschlag der KI · ${V.horizont} Tage · ${V.status==="offen"?"wartet auf dich":V.status}</div><b style="font-size:16px">${esc(V.titel)}</b>
   <h3>Was sich ändert</h3><table><tr><th>Einstellung</th><th>jetzt</th><th>neu</th></tr>${V.liste.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.von}</td><td>${x.nach}</td></tr>`).join("")}</table>
   <h3>Warum</h3><p class="small">${esc(V.warum)}</p>${V.erwartung?`<p class="small muted">${esc(V.erwartung)}</p>`:""}
   <h3>Test am letzten Jahr</h3><p class="small muted">Vorsprung = wie viel die Top ${D.top} je Kauf besser waren als der Durchschnitt aller Werte. „Besser“ = Anteil der Tage, an denen sie vorn lagen.</p>
   <table><tr><th></th><th>jetzt</th><th>neu</th><th>besser</th></tr>${tz(V.test)}</table>
   <p class="urteil ${V.test.urteil==="besteht"?"up":V.test.urteil==="unsicher"?"warn":"down"}"><b>Urteil: ${esc(V.test.urteil)}.</b> ${esc(V.test.text)}</p>
   ${V.status==="offen"?(SET.ghToken&&repo()?`<div style="display:flex;gap:8px"><button class="btn" data-ent="ja" data-id="${esc(V.id)}">✅ Übernehmen</button><button class="btn ghost" data-ent="nein" data-id="${esc(V.id)}">❌ Ablehnen</button></div>`:`<p class="small">Zustimmen kannst du im Telegram-Bot (Knöpfe unter der Nachricht) oder hier, wenn in der Haupt-App ein GitHub-Token eingetragen ist.</p>`):""}</div>`
   :`<div class="card small muted">Gerade kein Vorschlag. Die KI darf einmal pro Woche (abends) ein Update vorschlagen, wenn der Test dafür spricht.</div>`}
  ${pr?`<div class="card"><b>Prüfung nach dem Update: ${esc(pr.titel)}</b><p class="small muted">Seit ${datum(pr.seit)} laufen alte und neue Rechnung nebeneinander (${pr.tage} ${pr.tage===1?"Tag":"Tage"}). Abgerechnet wird nach 3, 7 bzw. 30 Handelstagen.</p>
   <table><tr><th>Zeitraum</th><th>neu Ø</th><th>alt Ø</th><th>Fälle</th></tr>${D.horizonte.map(H=>{const n=pr.h[H].neu,a=pr.h[H].alt;return `<tr><td>${H} Tage</td><td class="${kl(n.avg)}">${n.n?pz(n.avg,2):"–"}</td><td class="${kl(a.avg)}">${a.n?pz(a.avg,2):"–"}</td><td>${n.n}</td></tr>`}).join("")}</table>
   ${SET.ghToken&&repo()?`<button class="btn ghost" style="margin-top:10px" data-ent="zurueck" data-id="x">↩️ Update rückgängig machen</button>`:""}</div>`:""}
  <details class="card"><summary><b>Aktuelle Einstellungen</b> (Version ${mo.version||0})</summary><table><tr><th>Einstellung</th>${D.horizonte.map(H=>`<th>${H} T.</th>`).join("")}</tr>
   ${Object.entries(par).map(([k,d])=>`<tr><td>${esc(d.n)}</td>${D.horizonte.map(H=>{const v=mo.params[H][k],st=mo.standard[H][k];return `<td${v!==st?' class="up"':""}>${v}</td>`}).join("")}</tr>`).join("")}</table><p class="small muted">Grün = vom Standard abweichend, durch ein Update geändert.</p></details>
  ${(mo.verlauf||[]).length?`<details class="card"><summary><b>Bisherige Updates</b></summary>${mo.verlauf.map(v=>`<p class="small"><b>${datum(v.datum)} · ${esc(v.titel)}</b><br>${(v.aenderung||[]).map(a=>`${esc(a.name)}: ${a.von} → ${a.nach}`).join(", ")}${v.test?` · Test: ${esc(v.test.urteil)}`:""} · zugestimmt über ${esc(v.zugestimmt||"")}</p>`).join("")}</details>`:""}`}
function seiteMuster(){const M=D.muster||{},sp=M.speicher;
  return `<h2>Muster-Speicher <span class="vorsicht">⚠️ mit Vorsicht</span></h2><p class="small muted">Bekannte Kursmuster, an allen ${D.werte} Werten der letzten 2 Jahre nachgeprüft: Was passierte danach im Schnitt, verglichen mit dem Gesamtmarkt? Muster werden in der Liste angezeigt, verändern die Rangliste aber nicht.</p>
  ${(M.info||[]).map(m=>{const x=sp&&sp[m.id];return `<div class="card"><b>${esc(m.n)}</b>${x?` <span class="pill-s ${x.urteil==="leicht positiv"?"up":x.urteil==="eher negativ"?"down":"muted"}">${esc(x.urteil)}</span>`:""}<p class="small muted">${esc(m.t)}</p>
   ${x?`<table><tr><th>danach</th><th>Fälle</th><th>Ø</th><th>im Plus</th><th>vs. Markt</th></tr>${D.horizonte.map(H=>{const h=x.h[H]||{};return `<tr><td>${H} Tage</td><td>${h.n||0}</td><td class="${kl(h.avg)}">${h.n?pz(h.avg):"–"}</td><td>${h.n?h.plus+" %":"–"}</td><td class="${kl(h.vorsprung)}">${h.n?pz(h.vorsprung):"–"}</td></tr>`}).join("")}</table>`:`<p class="small muted">Wird berechnet, sobald alle Kursverläufe geladen sind.</p>`}</div>`}).join("")}`}
function seiteBilanz(){const b=D.bilanz||{},f=b.fertig||{};
  return `${seiteUpdates()}
  <h2>Wie haben sich die Listen entwickelt?</h2>
  <div class="card"><p class="small" style="margin-top:0">Jede KI-Liste wird mit den Kursen zum Zeitpunkt der Veröffentlichung gemerkt und nach 3, 7 bzw. 30 Handelstagen abgerechnet (nach Kosten), im Vergleich zum Durchschnitt aller ${D.werte} Werte.</p>
  <table><tr><th>Zeitraum</th><th>Werte</th><th>Ø Liste</th><th>Ø alle</th><th>besser</th><th>im Plus</th></tr>
  ${D.horizonte.map(H=>{const x=f[H]||{n:0};return `<tr><td>${H} Tage</td><td>${x.n}</td><td class="${kl(x.avg)}">${x.n?pz(x.avg,2):"–"}</td><td>${x.n?pz(x.bench,2):"–"}</td><td>${x.n?x.besser+" %":"–"}</td><td>${x.n?x.plus+" %":"–"}</td></tr>`}).join("")}</table>
  ${D.horizonte.every(H=>!(f[H]||{}).n)?`<p class="small muted">Noch nichts abgerechnet: die ersten Ergebnisse gibt es nach 3 Handelstagen.</p>`:""}</div>
  <h2>Letzte Listen, Stand jetzt</h2>
  ${(b.laufend||[]).map(x=>`<div class="card"><b>${datum(x.d)} ${esc(x.slot||"")}</b>${D.horizonte.map(H=>`<div class="small" style="margin-top:6px"><span class="muted">${H} Tage:</span> ${(x.h[H]||[]).map(p=>`${esc(p.n)} <span class="${kl(p.r)}">${pz(p.r)}</span>`).join(" · ")||"–"}</div>`).join("")}</div>`).join("")||`<div class="card small muted">Noch keine KI-Liste veröffentlicht.</div>`}
  ${seiteMuster()}
  <h2>So entsteht die Liste</h2>
  <div class="card small"><ol style="padding-left:18px;margin:0">
   <li>Der Wachmann holt täglich zwei Jahre Kursverlauf für rund ${D.werte} große Aktien aus den USA und Europa (dazu deine Depotwerte).</li>
   <li>Rechnung je Zeitraum: Kursanstieg im Verhältnis zur normalen Schwankung (3 und 7 Tage: letzte 4 Wochen, 7 und 30 Tage: zusätzlich 3 und 6 Monate), plus Trend, minus Überhitzung (RSI über 75).</li>
   <li>Die 8 besten je Zeitraum bekommt die KI mit Meldungen und Terminen. Sie recherchiert im Netz, wählt 5 aus, begründet sie und verlinkt die Quellen. Aussortiertes steht mit Grund dabei.</li>
   <li>Jede Liste wird danach abgerechnet (oben), damit du siehst, ob sie wirklich besser ist als der Durchschnitt.</li></ol>
   <p class="muted">Keine erfundenen Zahlen: Kurswerte kommen aus Kursdaten, alles andere aus verlinkten Quellen. „Übliche Schwankung“ ist keine Prognose, sondern die normale Bandbreite. Kurzfristig ist an der Börse viel Zufall dabei. Keine Anlageberatung.</p></div>
  <div class="card small"><b>Kurse</b><br>US-Aktien: ${SET.fhKey?"live über deinen Finnhub-Schlüssel.":"ohne Finnhub-Schlüssel alle 5–15 Minuten."} EU-Aktien: ca. 15 Minuten verzögert plus Takt des Wachmanns.<br><br><b>Telegram</b><br>/beste zeigt die Listen, /beste 7 nur einen Zeitraum, /warum NVDA die Begründung mit Quellen.
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${SET.ghToken&&repo()?`<button class="btn" data-wecken>Wachmann jetzt starten</button>`:""}<a class="btn ghost" href="${HAUPT_APP}">Zur Haupt-App</a></div></div>`}
function render(){chips();status();$$(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===P.tab));const v=$("#view");
  if(!D){v.innerHTML=leer();return}v.innerHTML=P.tab==="bilanz"?seiteBilanz():P.tab==="meine"?seiteMeine():seiteListe(+P.tab||3);if(offenS)detail(offenS.s,offenS.H,true)}
function status(){const e=$("#status");if(!D){e.textContent=ladeFehler==="netz"?"Keine Verbindung":"Warte auf die erste Liste";return}
  e.textContent=`Aus ${D.werte} Aktien und ETFs · ${D.ki?"mit KI-Recherche":"nur Kurs-Rechnung"} · ${uhr(D.t)} Uhr${Date.now()-D.t>45*6e4?" (älter)":""}`}
function chips(){const uo=usOffen();$("#live").innerHTML=`<span class="chip"><span class="dot ${!SET.fhKey?"mid":usStat==="Finnhub"?(uo?"on":"mid"):"off"}"></span>US ${!SET.fhKey?"5–15 Min.":usStat==="Finnhub"?(uo?"live":"Börse zu"):usStat==="aus"?"verbindet …":usStat}</span><span class="chip"><span class="dot mid"></span>EU ≈ 15 Min. verzögert</span>`}

/* ---------- Detail ---------- */
// Graph: Verlauf der letzten Handelstage + übliche Schwankung für die nächsten H Tage (Trichter, keine Prognose)
// + Ø-Ergebnis der Top 5 dieses Zeitraums im Rückblick-Test (gestrichelt) + Kurs bei Veröffentlichung.
// Muster-Erwartung: Ø der erkannten Muster im Rückblick (nur Muster mit mindestens 30 Fällen). Mit Vorsicht!
function musterErw(x,H){const l=(x.muster||[]).filter(m=>m.stat&&m.stat.n>=30);return l.length?l.reduce((a,m)=>a+m.stat.avg,0)/l.length:null}
function musterBlock(x,H){const l=x.muster||[];if(!l.length)return `<h2>Erkannte Muster</h2><p class="small muted">In den letzten 5 Handelstagen wurde kein bekanntes Muster erkannt.</p>`;
  return `<h2>Erkannte Muster <span class="vorsicht">⚠️ mit Vorsicht</span></h2><div class="card">${l.map(m=>`<div class="muster"><b>${esc(m.n)}</b> <span class="muted small">${m.vor?`vor ${m.vor} Handelstag${m.vor>1?"en":""}`:"heute"}</span>
   <p class="small">${m.stat?`Früher danach in ${H} Tagen: Ø <b class="${kl(m.stat.avg)}">${pz(m.stat.avg)}</b>, ${m.stat.plus} % im Plus, gegenüber dem Markt ${pz(m.stat.vorsprung)} · ${m.stat.n} Fälle`:"Noch keine Rückblick-Daten."}${m.urteil?` · Urteil: ${esc(m.urteil)}`:""}</p></div>`).join("")}
   <p class="small muted">Muster wiederholen sich oft nicht. Die Zahlen sind Durchschnitte über viele Fälle in den letzten 2 Jahren, der Einzelfall kann ganz anders laufen. Muster fließen nicht in die Rangliste ein.</p></div>`}
function graph(x,H,klein){const c=(x.spark||[]).slice(klein?-30:-60);if(c.length<2)return "";const p=kurs(x).p,sd=x.sdTag||0,t=(D.test&&D.test.h||{})[H]||{};
  const me=musterErw(x,H);
  const zuk=[...Array(H+1).keys()].map(k=>({k,mu:me!=null?p*(1+me/100*k/H):null,o1:p*Math.exp(sd*Math.sqrt(k)),u1:p*Math.exp(-sd*Math.sqrt(k)),o2:p*Math.exp(2*sd*Math.sqrt(k)),u2:p*Math.exp(-2*sd*Math.sqrt(k)),m:t.tage?p*(1+t.topAvg/100*k/H):null}));
  const ws=[...c,p,...(x.p0?[x.p0]:[]),...(me!=null?[p*(1+me/100)]:[]),...zuk.flatMap(z=>klein?[z.o1,z.u1]:[z.o2,z.u2])],lo=Math.min(...ws),hi=Math.max(...ws);
  const W=600,Hh=klein?90:190,n=c.length,anteil=Math.min(.45,Math.max(.2,H/(H+n)*1.6)),xv=W*(1-anteil),X=i=>i/(n-1)*xv,XZ=k=>xv+k/H*(W-xv-4),Y=v=>Hh-6-(v-lo)/(hi-lo||1)*(Hh-12);
  const poly=(a,b)=>[...zuk.map(z=>`${XZ(z.k).toFixed(1)},${Y(z[a]).toFixed(1)}`),...zuk.slice().reverse().map(z=>`${XZ(z.k).toFixed(1)},${Y(z[b]).toFixed(1)}`)].join(" ");
  const col=c[c.length-1]>=c[0]?"var(--up)":"var(--down)";
  return `<svg class="${klein?"spark klein":"spark"}" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="Kursverlauf und üblicher Bereich für ${H} Tage">
   ${klein?"":`<polygon points="${poly("o2","u2")}" fill="var(--accent)" opacity=".10"/>`}<polygon points="${poly("o1","u1")}" fill="var(--accent)" opacity=".22"/>
   <line x1="${xv}" x2="${xv}" y1="0" y2="${Hh}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>
   ${x.p0?`<line x1="0" x2="${xv}" y1="${Y(x.p0)}" y2="${Y(x.p0)}" stroke="var(--muted)" stroke-dasharray="3 4" stroke-width="1" vector-effect="non-scaling-stroke"/>`:""}
   ${t.tage?`<polyline points="${zuk.map(z=>`${XZ(z.k).toFixed(1)},${Y(z.m).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-dasharray="6 5" stroke-width="2" vector-effect="non-scaling-stroke"/>`:""}
   ${me!=null?`<polyline points="${zuk.map(z=>`${XZ(z.k).toFixed(1)},${Y(z.mu).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--warn)" stroke-dasharray="2 4" stroke-width="2" vector-effect="non-scaling-stroke"/>`:""}
   <polyline points="${[...c,p].map((v,i)=>`${(i<n?X(i):xv).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>
  ${klein?"":`<div class="legende"><span><i class="l-kurs" style="background:${col}"></i>Verlauf ${n} Handelstage</span><span><i class="l-band"></i>übliche Schwankung in ${H} Tagen (2 von 3 Fällen, hell: 19 von 20)</span>${t.tage?`<span><i class="l-test"></i>Ø der Top ${D.top} im Rückblick-Test (${pz(t.topAvg)})</span>`:""}${x.p0?`<span><i class="l-p0"></i>Kurs bei Veröffentlichung</span>`:""}${me!=null?`<span><i class="l-mu"></i>Muster-Erwartung (${pz(me)}, ⚠️ unsicher)</span>`:""}</div>
  <p class="small muted">Der Bereich rechts ist keine Vorhersage, sondern zeigt, wie weit der Kurs normalerweise schwankt. Die gestrichelte Linie ist das, was die Top ${D.top} dieses Zeitraums im letzten Jahr im Schnitt gebracht haben.</p>`}`}
function detail(s,H,still){const x=(D.listen[H]||[]).find(y=>y.s===s)||(D.meine||{})[s];if(!x)return;offenS={s,H};const auch=D.horizonte.filter(h=>h!==H&&(D.listen[h]||[]).some(y=>y.s===s));
  const li=(t,a)=>a&&a.length?`<h2>${t}</h2><ul class="why">${a.map(z=>`<li>${esc(z)}</li>`).join("")}</ul>`:"";
  $("#sheet").innerHTML=`<div class="grab"></div><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div class="brand" style="flex:1;font-size:19px">${esc(x.n)}</div><button class="icon-btn" data-zu aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  ${graph(x,H)}${karte(x,H,true)}
  ${x.ausblick?`<h2>Ausblick ${H_TEXT[H]}</h2><p>${esc(x.ausblick)}</p>`:""}
  ${x.szenarien&&(x.szenarien.gut||x.szenarien.schlecht)?`<div class="szen">${x.szenarien.gut?`<div class="gut"><i>Wenn es gut läuft</i>${esc(x.szenarien.gut)}</div>`:""}${x.szenarien.schlecht?`<div class="schlecht"><i>Was es kippen würde</i>${esc(x.szenarien.schlecht)}</div>`:""}</div>`:""}
  ${meinBox(x)}
  <p class="small muted">${x.platz?`Platz ${x.platz} für ${H_TEXT[H]}`:"Gerade in keiner Liste. Zahlen für 7 Handelstage"}${x.rechenRang?` · Kurs-Rechnung: Platz ${x.rechenRang}`:""}${auch.length?` · auch in der Liste für ${auch.map(h=>h+" Tage").join(" und ")}`:""}</p>
  ${musterBlock(x,H)}
  ${li("Was den Kurs antreiben kann",x.treiber)}${li("Risiken",x.risiken)}${li("Termine",x.termine)}
  <h2>Kennzahlen</h2><div class="kz">
   <div><i>5 Tage</i><b class="${kl(x.tage5)}">${pz(x.tage5)}</b></div><div><i>6 Monate</i><b class="${kl(x.monate6)}">${pz(x.monate6)}</b></div>
   <div><i>RSI (14)</i><b>${x.rsi??"–"}</b></div><div><i>Schwankung pro Jahr</i><b>${x.schwankungJahr!=null?x.schwankungJahr+" %":"–"}</b></div>
   <div><i>Abstand 50-Tage-Schnitt</i><b class="${kl(x.ueber50)}">${pz(x.ueber50)}</b></div><div><i>Übliche Bandbreite in ${H} Tagen</i><b style="font-size:12.5px">${x.bereich?`${dez(x.bereich.lo)}–${dez(x.bereich.hi)}`:"–"}</b></div></div>
  <p class="small muted">Die Bandbreite ist die normale Schwankung (etwa 2 von 3 Fällen), keine Prognose.</p>
  ${x.quellen&&x.quellen.length?`<h2>Quellen</h2><div class="card" style="padding:4px 12px">${x.quellen.map(q=>`<a class="quelle" href="${esc(q.u)}" target="_blank" rel="noopener"><b>${esc(q.t||q.u)}</b><span>${esc(q.q||"")}${q.d?" · "+datum(q.d):""}</span></a>`).join("")}</div>`:""}`;
  if(!still){$("#sheet").classList.add("open");$("#sheet-bg").classList.add("open");$("#sheet").scrollTop=0;history.pushState({s},"","#s-"+encodeURIComponent(s))}}
function zu(){offenS=null;$("#sheet").classList.remove("open");$("#sheet-bg").classList.remove("open")}
window.addEventListener("popstate",()=>{if(offenS)zu()});

/* ---------- Bedienung ---------- */
async function entscheiden(id,antwort){const r=repo();if(!SET.ghToken||!r)return toast("Dafür braucht die Haupt-App einen GitHub-Token.");
  const frage=antwort==="ja"?"Update wirklich übernehmen? Die Liste rechnet danach anders, die alte Rechnung läuft 30 Tage zur Kontrolle mit.":antwort==="nein"?"Vorschlag ablehnen?":"Update rückgängig machen? Die Liste rechnet dann wieder wie vorher.";
  if(!confirm(frage))return;const url=`https://api.github.com/repos/${r}/contents/data/beste-entscheidung.json`,h={Authorization:`Bearer ${SET.ghToken}`,Accept:"application/vnd.github+json"};
  try{let sha;const g=await fetch(url+"?ref=main",{headers:h});if(g.ok)sha=(await g.json()).sha;
    const inhalt=JSON.stringify({id,antwort,t:Date.now()});const x=await fetch(url,{method:"PUT",headers:h,body:JSON.stringify({message:`Top-Aktien: Entscheidung ${antwort}`,content:btoa(unescape(encodeURIComponent(inhalt))),sha,branch:"main"})});
    if(!x.ok)throw new Error("GitHub "+x.status);toast("Gespeichert. Der Wachmann übernimmt es beim nächsten Lauf (2–5 Min.).");wecken(true)}catch(e){toast("Speichern nicht möglich: "+e.message)}}
async function wecken(still){const r=repo();if(!SET.ghToken||!r)return toast("Dafür braucht die Haupt-App einen GitHub-Token.");
  try{const x=await fetch(`https://api.github.com/repos/${r}/actions/workflows/wachmann.yml/dispatches`,{method:"POST",headers:{Authorization:`Bearer ${SET.ghToken}`,Accept:"application/vnd.github+json"},body:JSON.stringify({ref:"main"})});
    if(!still)toast(x.status===204?"Wachmann gestartet. Neue Werte in etwa 2–5 Minuten.":"Start nicht möglich (GitHub "+x.status+")");if(x.status===204)[120,240,360].forEach(s=>setTimeout(()=>laden(true),s*1000))}catch(e){toast("Keine Verbindung zu GitHub")}}
document.addEventListener("click",e=>{const t=e.target.closest("[data-merk],[data-uebern],[data-uebern-zeig],[data-step],[data-pos-del],[data-ent],[data-tab],[data-f],[data-open],[data-zu],[data-wecken],#refresh,#sheet-bg");if(!t)return;
  if(t.dataset.merk){e.stopPropagation();merken(t.dataset.merk,t.dataset.n);if(offenS)detail(offenS.s,offenS.H,true);return}
  if(t.hasAttribute("data-uebern-zeig")){const f=t.closest(".mein").querySelector(".uebern");f.hidden=!f.hidden;return}
  if(t.dataset.uebern){const f=t.closest("form"),v=n=>+String(f.elements[n].value).replace(",",".");const k=v("k"),q=v("q");if(!(k>0)||!(q>0))return toast("Bitte Kaufkurs und Stück eintragen.");
    MEIN.depot.push({id:"p"+Date.now().toString(36),s:t.dataset.uebern,n:t.dataset.n,cur:t.dataset.cur,k,q,a:Math.abs(v("a")||0),nl:Math.max(0,v("nl")||0),t:Date.now()});
    if(!istGemerkt(t.dataset.uebern))MEIN.merk.push({s:t.dataset.uebern,n:t.dataset.n,t:Date.now()});meinGeaendert();toast(syncOn()?"Übernommen. Der Bot überwacht ab dem nächsten Lauf.":"Übernommen (nur auf diesem Handy).");detail(offenS.s,offenS.H,true);return}
  if(t.dataset.step){const [id,f,dlt]=t.dataset.step.split(":"),d=MEIN.depot.find(x=>x.id===id);if(!d)return;
    if(f==="nl")d.nl=Math.max(0,+((d.nl>0?d.nl:d.nl===0?0:.5)+ +dlt).toFixed(1));else d.a=Math.max(0,Math.abs(d.a??10)+ +dlt);meinGeaendert();render();return}
  if(t.dataset.posDel){const d=MEIN.depot.find(x=>x.id===t.dataset.posDel);if(d&&confirm(`${d.n} aus deinem Top-Depot entfernen? Der Bot überwacht die Aktie dann nicht mehr.`)){MEIN.depot=MEIN.depot.filter(x=>x!==d);meinGeaendert();render()}return}
  if(t.dataset.ent){entscheiden(t.dataset.id,t.dataset.ent);return}
  if(t.dataset.tab){P.tab=t.dataset.tab;saveP();render();scrollTo(0,0)}
  else if(t.dataset.f){P.f=t.dataset.f;saveP();const y=scrollY;render();scrollTo(0,y)}
  else if(t.dataset.open)detail(t.dataset.open,+t.dataset.h);
  else if(t.hasAttribute("data-zu")||t.id==="sheet-bg")history.back();
  else if(t.hasAttribute("data-wecken"))wecken();
  else if(t.id==="refresh"){t.classList.add("spin");fhRest=0;laden().finally(()=>setTimeout(()=>t.classList.remove("spin"),400))}});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)laden(true)});

/* ---------- Start ---------- */
(async()=>{const h=decodeURIComponent(location.hash||"");render();await Promise.all([laden(),pullMein()]);
  if(h.startsWith("#s-")&&D){const s=h.slice(3),w=wert(s);history.replaceState(null,"",location.pathname);if(w){P.tab=(D.listen[w.H]||[]).some(y=>y.s===s)?String(w.H):"meine";render();detail(s,w.H)}}
  setInterval(()=>{if(!document.hidden)laden(true)},6e4);setInterval(()=>{if(!document.hidden){if(SET.fhKey&&!wsF){fhRest=0;usLive()}chips();flush()}},6e4)})();
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js",{scope:"./"}).catch(()=>{});
