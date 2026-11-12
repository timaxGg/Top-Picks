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
const quelle=(w,k)=>{if(k.src==="Finnhub"&&Date.now()-k.t<12e4)return "live";const alt=Date.now()-k.t;
  if(k.t&&alt>60*6e4)return `noch kein neuer Handel · letzter Kurs ${new Date(k.t).toLocaleString("de-DE",{weekday:"short",hour:"2-digit",minute:"2-digit"})} Uhr`;
  const s=k.src==="liste"&&w.sess==="pre"?"vorbörslich · ":k.src==="liste"&&w.sess==="post"?"nachbörslich · ":"";
  return `${s}${istEU(w.s)?"ca. 15 Min. verzögert · ":""}${k.t?vor(k.t):""}`};
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
  <p class="small">An ${t.tage} Handelstagen jeweils die Top ${D.top} gekauft und nach ${H} Tagen verkauft (Kosten ${D.kostenRT!=null?pz(D.kostenRT,2).replace("+",""):""} je Kauf und Verkauf zusammen):</p>
  <div class="kz"><div><i>Top ${D.top} im Schnitt</i><b class="${kl(t.topAvg)}">${pz(t.topAvg,2)}</b></div><div><i>alle ${D.werte} Werte im Schnitt</i><b class="${kl(t.alleAvg)}">${pz(t.alleAvg,2)}</b></div>
  <div><i>Tage, an denen die Top ${D.top} vorn lagen</i><b>${t.besser} %</b></div><div><i>Käufe über den Kosten</i><b>${t.ueberKosten??t.plus} %</b></div>
  ${t.nachSteuer!=null?`<div><i>Top ${D.top} nach Kosten und Steuern</i><b class="${kl(t.nachSteuer)}">${pz(t.nachSteuer,2)}</b></div><div><i>Käufe, die dein Ziel geschafft haben</i><b>${t.ueberZiel} %</b></div>`:""}</div>
  <p class="small muted">${gut?"Die Rechnung lag öfter vorn als nicht, aber längst nicht immer.":"Die Rechnung lag kaum öfter vorn als der Durchschnitt. Nimm die Liste als Ideensammlung, nicht als Vorhersage."} Die KI-Auswahl selbst wird ab jetzt unter „Bilanz“ gemessen.</p></div>`}
function karte(x,H,voll){const k=kurs(x),d=dpVon(x,k.p),seit=x.p0?(k.p/x.p0-1)*100:null;
  return `<div class="card${voll?"":" tap"}" ${voll?"":`data-open="${esc(x.s)}" data-h="${H}"`}>
  <div class="sig-top">${x.platz?`<span class="rang">${x.platz}</span>`:""}<div class="nm"><b>${esc(x.n)}</b><span>${x.typ==="e"?"<em class=\"etf\">ETF</em> ":""}${esc(x.s)}${x.zuversicht?` · Zuversicht ${esc(x.zuversicht)}`:""}${x.eigen?" · aus deinem Depot":""}</span></div>
  <div class="px"><span data-px="${esc(x.s)}">${dez(k.p)} ${cs(x)}</span><small data-dp="${esc(x.s)}" class="${kl(d)}">${pz(d)} heute</small></div></div>
  <div class="lv">
   <div><i>Seit Liste</i><b>${seit!=null?`<span data-seit="${esc(x.s)}" data-p0="${x.p0}" class="${kl(seit)}">${pz(seit)}</span>`:"–"}</b></div>
   <div><i>4 Wochen</i><b class="${kl(x.wochen4)}">${pz(x.wochen4)}</b></div><div><i>3 Monate</i><b class="${kl(x.monate3)}">${pz(x.monate3)}</b></div>
   <div><i>Trend</i><b>${x.trend==="aufwärts"?"↗ auf":x.trend==="abwärts"?"↘ ab":"–"}</b></div></div>
  ${H<=7&&x.noetig!=null&&D.kostenRT!=null?`<div class="huerde ${x.typBew>=x.noetig?"ok":"knapp"}"><span>Nach Kosten im Plus ab <b>${pz(D.kostenRT,2)}</b></span><span>Für dein Ziel nötig <b>${pz(x.noetig,1)}</b></span><span>Übliche Bewegung <b>±${nf(x.typBew,1)} %</b></span></div>`:""}
  ${x.vomHoch10!=null&&x.vomHoch10<=-5||H<=7&&x.tage5!=null&&x.tage5<0?`<div class="tbruch">⚠️ ${x.vomHoch10!=null&&x.vomHoch10<=-5?`Gerade ${pz(x.vomHoch10)} unter dem 10-Tage-Hoch`:`Letzte 5 Tage ${pz(x.tage5)}`}: Der kurzfristige Anstieg ist vielleicht vorbei. Erst prüfen, nicht blind kaufen.</div>`:""}
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
    await ghC("data/top.enc",{method:"PUT",body:JSON.stringify({message:"Top-Aktien: Merkliste und Depot",content:btoa(await encJ({merk:MEIN.merk,depot:MEIN.depot,ziel:MEIN.ziel,kosten:MEIN.kosten,verkauft:MEIN.verkauft,notify:MEIN.notify,updatedAt:MEIN.updatedAt},SET.syncPass)),sha:cur?cur.sha:undefined,branch:"main"})});
    MEIN.sync=Date.now();merkeLokal();wecken(true)}catch(e){toast("Abgleich nicht möglich: "+e.message)}}
async function pullMein(){if(!syncOn())return;try{const r=await ghC("data/top.enc");if(!r)return;const m=await decJ(atob(r.content.replace(/\n/g,"")),SET.syncPass);
    if((m.updatedAt||0)>(MEIN.updatedAt||0)){MEIN=Object.assign({merk:[],depot:[],verkauft:[]},m);merkeLokal();render()}}catch(e){}}
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
    <label class="f">Halten bis (Bot erinnert dich an dem Tag)<input name="bis" type="date" value="${(halte(x)||{}).iso||""}"></label>
    <button class="btn" data-uebern="${esc(x.s)}" data-n="${esc(x.n)}" data-cur="${esc(x.cur||"")}">In mein Top-Depot übernehmen</button></form></div>`}
function seiteMeine(){const dep=MEIN.depot,mk=MEIN.merk;
  const pos=d=>{const w=wert(d.s),x=w?w.x:null,sc=SCHUTZ[d.id]||{},p=x?kurs(x).p:(sc.p||d.k),ch=(p/d.k-1)*100,c=x?cs(x):(CS[d.cur]||d.cur||""),a=-Math.abs(d.a??10),warnV=ch<=a,gs=d.nl!==0;
    return `<div class="card pos${sc.warn||warnV?" warnt":""}"><div class="sig-top"><div class="nm"><b>${esc(d.n)}</b><span>${esc(d.s)} · ${nf(d.q,d.q%1?2:0)} Stk. · Kauf ${dez(d.k)} ${c} · seit ${datum(new Date(d.t).toISOString().slice(0,10))}${d.bis?` · halten bis ${datum(d.bis)}`:""}</span></div>
     <div class="px"><span>${dez(p)} ${c}</span><small class="${kl(ch)}">${pz(ch)} seit Kauf</small></div></div>
     <div class="small ${kl(ch)}" style="text-align:right">${(p-d.k)*d.q>=0?"+":"−"}${nf(Math.abs((p-d.k)*d.q),2)} ${c}</div>
     <div class="schutz"><div><i>🛡️ Gewinnschutz</i>${gs?`<b>${sc.lv!=null?`Schutzlinie ${pz(sc.lv)}`:"aktiv"}</b><small>${sc.ref!=null?`Höchststand ${pz(sc.ref)} · `:""}Abstand ${nf(d.nl>0?d.nl:.5,1)} Pkt.</small>`:"<b>aus</b>"}
       <span class="step"><button data-step="${d.id}:nl:-0.5" aria-label="enger">−</button><button data-step="${d.id}:nl:0.5" aria-label="weiter">+</button></span></div>
      <div><i>🔴 Verlustschutz</i>${d.a!==0?`<b>ab ${pz(a)}</b><small>${warnV?"Grenze erreicht":`noch ${nf(ch-a,1)} Pkt. Luft`}</small>`:"<b>aus</b>"}
       <span class="step"><button data-step="${d.id}:a:-1" aria-label="enger">−</button><button data-step="${d.id}:a:1" aria-label="weiter">+</button></span></div></div>
     ${sc.warn?`<p class="small down"><b>Schutzlinie unterschritten.</b> Der Bot hat dich gewarnt. Mit OK in Telegram setzt du den Schutz neu.</p>`:""}
     <div style="display:flex;gap:8px;margin-top:8px">${x?`<button class="btn ghost" data-open="${esc(d.s)}" data-h="${w.H}">Details</button>`:""}<button class="btn" data-vk-zeig>Verkaufen</button><button class="btn ghost" data-pos-del="${d.id}">Löschen</button></div>
     <form class="vk" hidden onsubmit="return false"><p class="small muted" style="margin-top:10px">Trag ein, zu welchem Kurs du verkauft hast. Der Gewinn nach Kosten und Steuern landet unter „Verkauft“, der Bot hört auf zu überwachen.</p>
      <div class="zielform"><label class="f">Verkaufskurs (${c})<input name="vk" type="number" inputmode="decimal" step="any" min="0" value="${(+p).toFixed(p>=1?2:4)}"></label><label class="f">Stück (von ${nf(d.q,d.q%1?2:0)})<input name="q" type="number" inputmode="decimal" step="any" min="0" max="${d.q}" value="${d.q}"></label></div>
      <button class="btn" data-vk="${d.id}">Verkauf speichern</button></form></div>`};
  return `${syncOn()?"":`<div class="card small">Ohne <b>GitHub-Token und Sync-Passwort</b> in der Haupt-App bleibt alles nur auf diesem Handy, und der Bot kann dich nicht warnen. Trag beides in der Haupt-App unter Einstellungen ein.</div>`}
  ${risikoListe()}
  ${zielSeite()}
  ${meldeKarte()}
  <h2>Mein Top-Depot</h2>${dep.length?dep.map(pos).join(""):`<div class="card small muted">Noch nichts übernommen. Öffne eine Aktie und tippe auf „Übernehmen“, wenn du sie gekauft hast.</div>`}
  <p class="small muted">Gewinnschutz: Die Schutzlinie läuft mit deinem höchsten Plus seit Kauf mit (minus Abstand, nie unter 0). Fällt das Plus darunter, warnt der Bot. Verlustschutz: Warnung, sobald das Minus die Grenze erreicht, danach bei jedem weiteren 2 Prozentpunkten. Getrennt vom Depot im Aktien Helfer.</p>
  ${verkauftListe()}
  <h2>Gemerkt</h2><div class="card" style="padding:4px 12px">${mk.length?mk.map(m=>{const w=wert(m.s),x=w&&w.x,k=x&&kurs(x),d=x?dpVon(x,k.p):null,li=inListen(m.s);
    return `<div class="row"${w?` data-open="${esc(m.s)}" data-h="${w.H}"`:""}><div class="nm"><b style="font-size:14.5px">${esc(m.n)}</b><span>${esc(m.s)}${li.length?" · "+li.join(", "):" · gerade in keiner Liste"}</span></div>
     ${x?`<div class="px"><span data-px="${esc(m.s)}">${dez(k.p)} ${cs(x)}</span><small data-dp="${esc(m.s)}" class="${kl(d)}">${pz(d)} heute</small></div>`:`<div class="px small muted">Kurs folgt</div>`}<button class="icon-btn klein" data-merk="${esc(m.s)}" aria-label="Nicht mehr merken">✕</button></div>`}).join(""):`<p class="small muted">Tippe bei einer Aktie auf „☆ Merken“.</p>`}</div>`}


/* ---------- Mein Ziel: einstellbar, ehrlich gemessen, mit Tipps aus den echten Zahlen ---------- */
const JE={tag:{n:"pro Tag",t:1},woche:{n:"pro Woche",t:5},monat:{n:"pro Monat",t:21}};
const proTag=(r,tage)=>(Math.pow(1+r/100,1/tage)-1)*100;         // Ergebnis über mehrere Handelstage auf einen Tag umgerechnet
const jahr=tagProz=>(Math.pow(1+tagProz/100,250)-1)*100;          // wie viel das im Jahr wäre
function zielSeite(){const Z=MEIN.ziel||{wert:1,je:"tag"},zt=proTag(Z.wert,JE[Z.je].t),jz=jahr(zt),T=(D&&D.test&&D.test.h)||{},F=(D&&D.bilanz&&D.bilanz.fertig)||{},tips=[];
  // Was haben Liste (Rückblick-Test) und echte Listen pro Tag gebracht?
  const zeilen=(D?D.horizonte:[]).map(H=>{const t=T[H]||{},f=F[H]||{},testT=t.tage?proTag(t.nachSteuer??t.topAvg,H):null,liveT=f.n?proTag(f.avg>0?f.avg*(1-(D.steuer??26.375)/100):f.avg,H):null,
      quote=f.werte&&f.werte.length?Math.round(f.werte.filter(r=>proTag(r>0?r*(1-(D.steuer??26.375)/100):r,H)>=zt).length/f.werte.length*100):null,
      tq=t.ueberZiel!=null?{ab:zt,q:t.ueberZiel}:t.zielQuote?(()=>{const k=Object.keys(t.zielQuote).map(Number).sort((a,b)=>a-b).filter(x=>x<=zt).pop();return k!=null?{ab:k,q:t.zielQuote[k]}:null})():null;
      return {H,testT,liveT,quote,tq,f,t}});
  // Top-Depot: Ergebnis seit Kauf, auf Tage umgerechnet (grob, Währungen nicht umgerechnet)
  const pos=MEIN.depot.map(d=>{const w=wert(d.s),sc=SCHUTZ[d.id]||{},p=w?kurs(w.x).p:(sc.p||d.k),tage=Math.max(1,Math.round((Date.now()-d.t)/864e5*5/7));return {d,ch:(p/d.k-1)*100,tage,wertNow:p*d.q,inListe:inListen(d.s).length>0}});
  const einsatz=pos.reduce((a,x)=>a+x.d.k*x.d.q,0),depR=einsatz?pos.reduce((a,x)=>a+x.ch*x.d.k*x.d.q,0)/einsatz:null,depTage=pos.length?Math.max(...pos.map(x=>x.tage)):0,depT=depR!=null?proTag(depR,depTage):null;
  // Tipps, nur aus den Zahlen abgeleitet
  if(zt>0.3)tips.push(["warn",`Dein Ziel entspricht ${nf(zt,2)} % pro Handelstag, also etwa ${jz>1e5?"mehr als dem 1000-Fachen":"dem "+nf(jz/100+1,0)+"-Fachen"} im Jahr. Der Aktienmarkt bringt langfristig etwa 7–10 % im Jahr. Ein Ziel um 0,05–0,1 % pro Tag (etwa 1–2 % pro Monat) wäre schon sehr ehrgeizig.`]);
  const best=zeilen.filter(z=>z.testT!=null).sort((a,b)=>b.testT-a.testT)[0];
  if(best)tips.push(["info",`Im Rückblick-Test brachte die ${best.H}-Tage-Liste am meisten pro Tag: ${pz(best.testT,3)} (Top ${D.top}, nach Kosten). ${best.t.besser>=55?`Sie lag an ${best.t.besser} % der Tage vor dem Durchschnitt.`:"Sie lag aber kaum öfter vorn als der Durchschnitt."} Wenn du dich an einer Liste orientierst, dann am ehesten an dieser.`]);
  const kurz=zeilen.find(z=>z.H===3);if(kurz&&kurz.testT!=null&&best&&best.H!==3)tips.push(["info",`Kurz traden kostet mehr: Jeder Kauf und Verkauf kostet Gebühren und Spread. Bei der 3-Tage-Liste fallen sie dreimal so oft an wie bei längeren Zeiträumen, das frisst einen großen Teil vom Gewinn.`]);
  if(pos.length){const ohneGS=pos.filter(x=>x.d.nl===0),weit=pos.filter(x=>Math.abs(x.d.a??10)>15),draussen=pos.filter(x=>!x.inListe&&x.ch<0&&x.tage>=5),gross=einsatz?pos.filter(x=>x.d.k*x.d.q/einsatz>.5&&pos.length>1):[];
    if(ohneGS.length)tips.push(["tipp",`Gewinnschutz ist aus bei ${ohneGS.map(x=>x.d.n).join(", ")}. Wer ein Tagesziel hat, sollte Gewinne sichern, statt sie wieder abzugeben.`]);
    if(weit.length)tips.push(["tipp",`Sehr weiter Verlustschutz (über 15 %) bei ${weit.map(x=>x.d.n).join(", ")}. Ein großes Minus braucht ein noch größeres Plus zum Ausgleich: −20 % holst du erst mit +25 % wieder auf.`]);
    if(draussen.length)tips.push(["tipp",`${draussen.map(x=>x.d.n).join(", ")} ${draussen.length>1?"sind":"ist"} im Minus und in keiner aktuellen Liste mehr. Prüfe, ob der Grund für den Kauf noch gilt.`]);
    if(gross.length)tips.push(["tipp",`${gross.map(x=>x.d.n).join(", ")} macht mehr als die Hälfte deines Top-Depots aus. Verteilt auf mehrere Werte schwankt das Depot weniger.`]);
    if(depT!=null&&depT<zt)tips.push(["info",`Dein Top-Depot liegt bei etwa ${pz(depT,2)} pro Handelstag, dein Ziel bei ${pz(zt,2)}. Bitte nicht versuchen, die Lücke mit höherem Einsatz oder Hebelprodukten zu schließen: Das vergrößert vor allem das Risiko.`])}
  else tips.push(["tipp","Noch nichts übernommen. Tipp: Probier die Listen erst ein paar Wochen nur mit „Merken“ aus und schau, ob die Zahlen in der Bilanz halten, bevor echtes Geld drinsteckt."]);
  tips.push(["tipp","Plane vor jedem Kauf, wann du verkaufst: Ziel, Stop und Zeitraum. Der Gewinn- und Verlustschutz hier hilft dabei, die Entscheidung triffst aber du."]);
  return `<h2>🎯 Mein Ziel</h2><div class="card ziel"><form onsubmit="return false" class="zielform"><label class="f">Gewinn-Ziel in %<input id="z-wert" type="number" inputmode="decimal" step="any" min="0" value="${Z.wert}"></label>
   <label class="f">Zeitraum<select id="z-je">${Object.entries(JE).map(([k,v])=>`<option value="${k}"${Z.je===k?" selected":""}>${v.n}</option>`).join("")}</select></label><button class="btn" data-ziel>Speichern</button></form>
   <h3>Kosten und Steuern</h3><form onsubmit="return false" class="zielform">${(()=>{const K=Object.assign({gebuehr:1,einsatz:1000,spread:.1,steuer:26.375},MEIN.kosten||{});
     return `<label class="f">Gebühr je Order (€)<input id="k-g" type="number" inputmode="decimal" step="any" min="0" value="${K.gebuehr}"></label><label class="f">Einsatz je Kauf (€)<input id="k-e" type="number" inputmode="decimal" step="any" min="1" value="${K.einsatz}"></label>
     <label class="f">Spread (%, Kauf+Verkauf)<input id="k-s" type="number" inputmode="decimal" step="any" min="0" value="${K.spread}"></label><label class="f">Steuer auf Gewinne (%)<input id="k-t" type="number" inputmode="decimal" step="any" min="0" value="${K.steuer}"></label>`})()}
     <button class="btn ghost" data-kosten>Kosten speichern</button></form>
   <p class="small muted">Steuer: 26,375 % = Abgeltungsteuer + Soli, mit Kirchensteuer etwa 27,8 %. Der Freibetrag (1.000 € im Jahr) ist nicht eingerechnet, das ist vorsichtig gerechnet. Die Liste rechnet ab dem nächsten Lauf mit deinen Werten.</p>
   ${D&&D.noetig?`<p class="small">Damit nach Kosten und Steuern dein Ziel übrig bleibt, muss eine Aktie in <b>3 Tagen ${pz(D.noetig[3],1)}</b> und in <b>7 Tagen ${pz(D.noetig[7],1)}</b> steigen. Ins Plus kommst du ab ${pz(D.kostenRT,2)}.</p>`:""}
   <p class="small">Das sind <b>${pz(zt,2)}</b> pro Handelstag, aufs Jahr gerechnet etwa <b>${jz>1e6?"über 1.000.000 %":pz(jz,0)}</b>.</p>
   <table><tr><th>Liste</th><th>Test pro Tag*</th><th>echt pro Tag*</th><th>Ziel erreicht</th></tr>${zeilen.map(z=>`<tr><td>${z.H} Tage</td><td class="${kl(z.testT)}">${z.testT!=null?pz(z.testT,3):"–"}</td><td class="${kl(z.liveT)}">${z.liveT!=null?pz(z.liveT,3):"–"}</td><td>${z.quote!=null?z.quote+" %":z.tq?`Test: ${z.tq.q} %`:"–"}</td></tr>`).join("")}
   ${depT!=null?`<tr><td>Mein Top-Depot</td><td>–</td><td class="${kl(depT)}">${pz(depT,3)}</td><td>${depT>=zt?"ja":"nein"}</td></tr>`:""}</table>
   <p class="small muted">* nach Kosten und Steuern. „Ziel erreicht“: Anteil der abgerechneten Listenwerte, die pro Tag mindestens dein Ziel gebracht haben (vor den ersten Abrechnungen: Rückblick-Test, grob gerechnet). Depot grob: Währungen nicht umgerechnet.</p>
   <h3>Tipps und Empfehlungen</h3><ul class="tips">${tips.map(([k,t])=>`<li class="${k}">${esc(t)}</li>`).join("")}</ul>
   <p class="small muted">Tipps aus deinen Zahlen und dem Rückblick-Test. Keine Anlageberatung.</p></div>`}


/* ---------- Risiko-Rangliste: meine Aktien, die meiste Aufmerksamkeit brauchen, zuerst ---------- */
// Feste, nachvollziehbare Punkte aus Schutz-Status, Kursdaten und Mustern. Jeder Punkt wird als Grund angezeigt.
function risiko(d){const w=wert(d.s),x=w?w.x:null,sc=SCHUTZ[d.id]||{},p=x?kurs(x).p:(sc.p||d.k),ch=(p/d.k-1)*100,a=-Math.abs(d.a??10),g=[];let pt=0,muss=false; // muss: eine Schutzgrenze ist erreicht, dann immer „Hoch“
  const add=(n,t)=>{pt+=n;g.push(t)};
  if(d.a!==0&&ch<=a){muss=true;add(50,`Verlustschutz erreicht: ${pz(ch)} seit Kauf (Grenze ${pz(a)})`)}
  else if(d.a!==0&&ch-a<3)add(20,`Nah am Verlustschutz: noch ${nf(ch-a,1)} Pkt. bis ${pz(a)}`);
  if(sc.warn&&!(d.a!==0&&ch<=a)){muss=true;add(50,`Gewinnschutz unterschritten: Plus ${pz(ch)}, Schutzlinie ${pz(sc.lv)}`)}
  else if(d.nl!==0&&sc.lv>0&&ch-sc.lv<.5)add(15,`Knapp über der Schutzlinie (${pz(sc.lv)})`);
  if(x){const dp=dpVon(x,p);if(dp<=-3)add(7,`Heute stark gefallen: ${pz(dp)}`);
    if(x.trend==="abwärts")add(10,"Trend abwärts (20- unter 50-Tage-Schnitt)");
    if(x.ueber50!=null&&x.ueber50<0)add(8,`Kurs ${pz(x.ueber50)} unter dem 50-Tage-Schnitt`);
    if(x.rsi!=null&&x.rsi>75)add(8,`Überhitzt (RSI ${x.rsi}): Rücksetzer möglich${ch>0?", Gewinne sichern prüfen":""}`);
    if(x.rsi!=null&&x.rsi<30)add(5,`Stark verkauft (RSI ${x.rsi})`);
    if(x.schwankungJahr>50)add(5,`Schwankt stark (${x.schwankungJahr} % pro Jahr)`);
    const neg=(x.muster||[]).filter(m=>m.urteil==="eher negativ");if(neg.length)add(8,`Muster mit eher negativem Rückblick: ${neg.map(m=>m.n).join(", ")} ⚠️ unsicher`)}
  if(d.bis&&new Date().toISOString().slice(0,10)>=d.bis)add(15,`Geplante Haltedauer bis ${datum(d.bis)} ist vorbei`);
  const li=inListen(d.s);if(!li.length&&ch<0)add(10,"Im Minus und in keiner aktuellen Liste mehr");
  if(li.length){pt-=5;g.push(`Spricht dagegen: steht in der Liste (${li.join(", ")})`)}
  if(!x)g.push("Für diesen Wert fehlen gerade Kursdaten");
  pt=Math.max(0,Math.min(100,pt));const st=muss||pt>=50?{k:"hoch",t:"Hoch – jetzt prüfen, Verkauf erwägen"}:pt>=25?{k:"mittel",t:"Mittel – genau beobachten"}:{k:"niedrig",t:"Niedrig – im Plan"};
  return {d,w,ch,p,pt,st,g}}
function risikoListe(){if(!MEIN.depot.length)return "";const l=MEIN.depot.map(risiko).sort((a,b)=>b.pt-a.pt||a.ch-b.ch);
  return `<h2>⚠️ Meine Aktien nach Risiko</h2><p class="small muted">Oben die Aktien, bei denen das Risiko und der Grund zum Verkaufen gerade am größten sind. Regel-Einschätzung aus Schutz, Trend und Kursdaten, keine Anlageberatung: Ob du verkaufst, entscheidest du.</p>
  ${l.map((r,i)=>`<div class="card risk ${r.st.k}"${r.w?` data-open="${esc(r.d.s)}" data-h="${r.w.H}"`:""}><div class="sig-top"><span class="rang r-${r.st.k}">${i+1}</span><div class="nm"><b>${esc(r.d.n)}</b><span>${esc(r.d.s)} · ${pz(r.ch)} seit Kauf</span></div>
    <div class="px"><span class="rpunkte">${r.pt}</span><small>Risiko-Punkte</small></div></div>
    <div class="rbar"><span style="width:${Math.max(4,r.pt)}%"></span></div><b class="rst">${r.st.t}</b>
    <ul class="why">${r.g.slice(0,5).map(t=>`<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}`}


/* ---------- Verkaufen: Gewinn nach Kosten und Steuern festhalten ---------- */
function kostenEin(){return Object.assign({gebuehr:1,einsatz:1000,spread:.1,steuer:26.375},MEIN.kosten||{})}
function abrechnung(k,vk,q){const K=kostenEin(),brutto=(vk-k)*q,kosten=2*K.gebuehr+(K.spread/100)*(k*q+vk*q)/2,vorSt=brutto-kosten,steuer=vorSt>0?vorSt*K.steuer/100:0;
  return {brutto,kosten,steuer,netto:vorSt-steuer,proz:(vorSt-steuer)/(k*q)*100}}
function verkauftListe(){const l=MEIN.verkauft||[];if(!l.length)return "";const sum=l.reduce((a,v)=>a+v.netto,0);
  return `<h2>Verkauft</h2><div class="card" style="padding:4px 12px">${l.slice().reverse().slice(0,30).map(v=>`<div class="row"><div class="nm"><b style="font-size:14.5px">${esc(v.n)}</b><span>${nf(v.q,v.q%1?2:0)} Stk. · ${dez(v.k)} → ${dez(v.vk)} ${esc(v.c||"")} · ${datum(new Date(v.t).toISOString().slice(0,10))} · ${v.tage} ${v.tage===1?"Tag":"Tage"} gehalten</span></div>
   <div class="px"><span class="${kl(v.netto)}">${v.netto>=0?"+":"−"}${nf(Math.abs(v.netto),2)}</span><small class="${kl(v.proz)}">${pz(v.proz)} netto</small></div></div>`).join("")}
   <p class="small">Zusammen nach Kosten und Steuern: <b class="${kl(sum)}">${sum>=0?"+":"−"}${nf(Math.abs(sum),2)}</b></p>
   <p class="small muted">Grob gerechnet mit deinen Kosten und dem Steuersatz, ohne Freibetrag und Verlustverrechnung, Währungen nicht umgerechnet.</p></div>`}

/* ---------- Einstieg: lohnt es sich genau jetzt, oder lieber warten? ---------- */
const ZFARBE={guenstig:"up",wende:"up",neutral:"muted",ueberdehnt:"warn",messer:"down"},ZICON={guenstig:"🟢",wende:"🟢",neutral:"⚪",ueberdehnt:"🟡",messer:"🔴"};
function einstiegKandidaten(){if(!D)return [];const m=new Map(),q=P.eq||(D.einstiegTop?"top":"3");
  const add=(x,H,quelle)=>{if(x&&x.einstieg&&!m.has(x.s))m.set(x.s,Object.assign({},x,{H,quelle}))};
  for(const H of (q==="alle"?D.horizonte:q==="top"||q==="meine"?[]:[+q]))(D.listen[H]||[]).forEach(x=>add(x,H,`Platz ${x.platz} (${H} T.)`));
  for(const H of (q==="alle"?D.horizonte:q==="top"||q==="meine"?[]:[+q]))((D.weitere||{})[H]||[]).forEach(x=>add(x,H,`Rechnung Platz ${x.rang} (${H} T.)`));
  if(q==="top")(D.einstiegTop||[]).forEach(x=>add(x,3,`Einstieg-Rang ${x.rang} von ${D.werte} Werten`));
  if(q==="meine")for(const mk of MEIN.merk){const w=wert(mk.s);if(w)add(w.x,w.H,"gemerkt")}
  return [...m.values()]}
// Plan in Worten: wann und zu welchem Kurs einsteigen, Uhrzeit aus dem Rückblick
function einstiegPlan(x){const be0=besterEinstieg(x),e=x.einstieg,k=kurs(x),zt=e.zeit,st=e.stat||{},sdT=x.sdTag||0,lim=k.p*Math.exp(-.5*sdT),bis=t=>{const [h,m]=t.split(":").map(Number),z=h*60+m+30;return String(Math.floor(z/60)%24).padStart(2,"0")+":"+String(z%60).padStart(2,"0")};
  const uhr=zt&&zt.best?`zwischen <b>${zt.best.t} und ${bis(zt.best.t)} Uhr</b> (dort lag das Tagestief an ${zt.best.tief} % von ${zt.tage} Tagen)`:"",z=[];
  if(e.z==="guenstig"||e.z==="wende"){z.push(be0&&be0.jetzt?`<b>Jetzt ist ein guter Moment.</b> Der Kurs hat nachgegeben, der Trend zeigt nach oben.`:be0&&be0.tag==="heute"?`<b>Günstig, der beste Moment kommt heute noch.</b> Der Kurs hat nachgegeben, der Trend zeigt nach oben. Bis zur Uhrzeit unten abwarten.`:`<b>Vorankündigung: günstig, aber der beste Moment ist erst ${esc(be0?be0.tag:"am nächsten Handelstag")}.</b> Jetzt noch nicht kaufen. Zur Uhrzeit schickt der Bot eine Nachricht, ob es dann noch gilt.`);
    if(uhr)z.push(`Am günstigsten war es im Rückblick meist ${uhr}.`);z.push(`Idee: Kauf-Limit knapp unter dem Kurs, bei etwa <b>${dez(lim)} ${cs(x)}</b> (eine halbe Tagesschwankung tiefer). Wird es heute nicht ausgeführt, morgen neu prüfen.`)}
  else if(e.z==="ueberdehnt"){z.push(`<b>Jetzt eher nicht.</b> Der Kurs ist gerade oben auf dem Berg.`);
    z.push(`Warte, bis er in die Zone um <b>${dez(e.ziel)} ${cs(x)}</b> zurückkommt (${pz(e.zielAbst)}).${st.faelle?` Früher passierte das in ${st.erreicht} % der Fälle innerhalb von 10 Handelstagen, meist nach etwa ${st.medTage} Tagen.`:""}`);
    if(uhr)z.push(`Ist er dort, am ehesten ${uhr} kaufen.`);if(st.wartenAvg!=null&&st.sofortAvg!=null&&st.wartenAvg<=st.sofortAvg)z.push(`<span class="warn">Ehrlich: Im Rückblick hat Warten bei solchen Werten nicht mehr gebracht als sofort kaufen. Der Kurs lief oft einfach weiter.</span>`)}
  else if(e.z==="messer"){z.push(`<b>Jetzt nicht.</b> Der Kurs fällt noch.`);z.push(`Erst wenn er an einem Tag über <b>${dez(e.ziel)} ${cs(x)}</b> schließt (${pz(e.zielAbst)}), ist die Wende da. Dann am nächsten Tag${uhr?" "+uhr:""} kaufen.`)}
  else{z.push(`<b>Weder günstig noch teuer.</b> Kein besonderer Grund, jetzt zu kaufen oder zu warten.`);if(uhr)z.push(`Wenn du kaufst, dann am ehesten ${uhr}.`)}
  const hb=halteBox(x);if(hb)z.push(hb);z.push(`Setz Gewinn- und Verlustschutz direkt beim Übernehmen. „Halten bis“ ist dort schon eingetragen, dann erinnert dich der Bot am letzten Tag.`);
  return (be0?`<div class="bestein">🗓️ Bester Einstieg (Schätzung): <b>${esc(be0.txt)}</b>${be0.bed?`<br><span class="small">${esc(be0.bed)}</span>`:""}</div>`:"")+z.map(t=>`<p class="small">${t}</p>`).join("")+`<p class="small muted">Tage ohne Feiertage gerechnet. Schätzung aus dem Rückblick, keine Vorhersage.</p>`}
function heuteGraph(x){const e=x.einstieg,h=e.heute||[];if(h.length<3)return `<p class="small muted">Heute noch kein Handel für diesen Wert.</p>`;
  const v=h.map(a=>a[1]),all=[...v,...(e.ziel?[e.ziel]:[])],lo=Math.min(...all),hi=Math.max(...all),W=600,Hh=110,Y=y=>Hh-14-(y-lo)/(hi-lo||1)*(Hh-24),X=i=>i/(h.length-1)*W;
  const ticks=h.map((a,i)=>[a[0],i]).filter(([t],i)=>t.endsWith(":00")&&i%2===0).slice(0,8);
  return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">${e.ziel?`<line x1="0" x2="${W}" y1="${Y(e.ziel)}" y2="${Y(e.ziel)}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`:""}
   <polyline points="${v.map((y,i)=>`${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--fg)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
   <div class="achse">${ticks.map(([t])=>`<span>${t}</span>`).join("")}</div>
   <p class="small muted">Heute, alle 15 Minuten, deutsche Zeit${e.ziel?' · <span style="color:var(--accent)">- - Einstiegsmarke</span>':""}. Tief heute: ${dez(Math.min(...v))} um ${h[v.indexOf(Math.min(...v))][0]} Uhr. Letzter Wert ${h[h.length-1][0]} Uhr · ${standTxt(x)}.</p>`}
function tagGraph(x){const z=x.einstieg.zeit;if(!z||!z.b||!z.b.length)return `<p class="small muted">Für die Uhrzeit fehlen noch Daten (kommt mit dem nächsten Lauf).</p>`;
  const mx=Math.max(...z.b.map(b=>b.tief),1);
  return `<div class="tagbars">${z.b.map(b=>`<div class="${z.best&&b.t===z.best.t?"best":""}" title="${b.t}: Tagestief an ${b.tief} % der Tage"><span style="height:${Math.max(3,b.tief/mx*100)}%"></span><i>${b.t.endsWith(":00")||b.t.endsWith(":30")&&z.b.length<12?b.t.replace(":00",""):""}</i></div>`).join("")}</div>
   <p class="small muted">Wie oft das Tagestief in dieser halben Stunde lag (letzte ${z.tage} Handelstage, deutsche Zeit). Hoch = dort war es oft am günstigsten. Muster über viele Tage, an einzelnen Tagen kann es ganz anders laufen.</p>`}
function einstiegDetail(x){if(!x.einstieg)return "";const e=x.einstieg;
  return `<div class="card ein e-${ZFARBE[e.z]}">${(zs=>`<div class="ezust ${zs.vor?"vor":ZFARBE[e.z]}" style="margin-top:0">${zs.i} ${esc(zs.t)}</div>`)(zustandText(x))}${einstiegPlan(x)}
   <h3 class="h3">Heute</h3>${heuteGraph(x)}<h3 class="h3">Zu welcher Uhrzeit war es meist am günstigsten?</h3>${tagGraph(x)}</div>`}
function einstiegKarte(x){const e=x.einstieg,k=kurs(x),st=e.stat||{},s3=st[3]||{},s7=st[7]||{},gut=e.z==="guenstig"||e.z==="wende",w=e.ziel!=null;
  const c=(x.spark||[]).slice(-30),gr=c.length>1?(()=>{const all=[...c,...(w?[e.ziel]:[]),...(e.s20?[e.s20]:[])],lo=Math.min(...all),hi=Math.max(...all),W=600,Hh=70,Y=v=>Hh-4-(v-lo)/(hi-lo||1)*(Hh-8);
    return `<svg class="spark mini" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">${e.s20?`<line x1="0" x2="${W}" y1="${Y(e.s20)}" y2="${Y(e.s20)}" stroke="var(--muted)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`:""}${w?`<line x1="0" x2="${W}" y1="${Y(e.ziel)}" y2="${Y(e.ziel)}" stroke="var(--${ZFARBE[e.z]==="down"?"up":"accent"})" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`:""}<polyline points="${c.map((v,i)=>`${(i/(c.length-1)*W).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--fg)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    ${(()=>{const dd=(x.sparkD||[]).slice(-c.length);return dd.length>1?`<div class="xachse">${[0,Math.round((c.length-1)/2),c.length-1].map(i=>`<span style="left:${(i/(c.length-1)*100).toFixed(1)}%">${dmy(dd[i])}</span>`).join("")}</div>`:""})()}
    <p class="small muted stand">${standTxt(x)}</p>`})():"";
  const warten=st.wartenAvg!=null&&st.sofortAvg!=null?(st.wartenAvg>st.sofortAvg+.2?`Im Rückblick hat sich Warten gelohnt: Ø ${pz(st.wartenAvg)} statt ${pz(st.sofortAvg)} bei sofortigem Kauf.`:`Ehrlich: Im Rückblick brachte Warten nicht mehr als sofort kaufen (Ø ${pz(st.wartenAvg)} statt ${pz(st.sofortAvg)}). Der Kurs läuft oft einfach weiter.`):"";
  return `<div class="card ein e-${ZFARBE[e.z]}" data-open="${esc(x.s)}" data-h="${x.H}"><div class="sig-top"><div class="nm"><b>${esc(x.n)}</b><span>${x.typ==="e"?"ETF · ":""}${esc(x.s)} · ${esc(x.quelle)}</span></div>
   <div class="px"><span data-px="${esc(x.s)}">${dez(k.p)} ${cs(x)}</span><small class="muted">RSI ${e.rsi??"–"}</small></div></div>
   ${(zs=>`<div class="ezust ${zs.vor?"vor":ZFARBE[e.z]}">${zs.i} ${esc(zs.t)}</div>`)(zustandText(x))}<p class="small" style="margin:4px 0 6px">${esc(e.t)}</p>${gr}
   <div class="lv"><div><i>zum Ø 20 Tage</i><b>${pz(e.ab20)}</b></div><div><i>vom Hoch 10 T.</i><b>${pz(e.vomHoch)}</b></div>
    <div><i>${e.z==="messer"?"Wende ab Kurs":"Einstiegszone"}</i><b>${w?dez(e.ziel):gut?"jetzt":"–"}</b>${w?`<small>${pz(e.zielAbst)}</small>`:""}</div><div><i>Rückblick 3 T.</i><b class="${kl(s3.avg)}">${s3.n?pz(s3.avg):"–"}</b><small>${s3.n?s3.plus+" % im Plus":""}</small></div></div>
   ${w&&st.faelle?`<p class="small">${e.z==="messer"?`Früher stieg der Kurs in <b>${st.erreicht} %</b> der Fälle innerhalb von 10 Handelstagen wieder über diese Marke`:`Früher kam der Kurs in <b>${st.erreicht} %</b> der Fälle innerhalb von 10 Handelstagen in diese Zone`}${st.medTage?`, meist nach etwa <b>${st.medTage} Tagen</b>`:""}. ${warten}</p>`:""}
   ${(()=>{const be=besterEinstieg(x);return be?`<div class="bestein">🗓️ Bester Einstieg (Schätzung): <b>${esc(be.txt)}</b>${be.bed?`<br><span class="small">${esc(be.bed)}</span>`:""}</div>`:""})()}
   ${["guenstig","wende","ueberdehnt","messer"].includes(e.z)?halteBox(x):""}
   ${e.zeit&&e.zeit.best?`<p class="small">🕒 Günstigste Uhrzeit im Rückblick: <b>${e.zeit.best.t} Uhr</b> (Tagestief dort an ${e.zeit.best.tief} % der Tage)</p>`:""}
   ${gut&&s3.n?`<p class="small">Kauf in diesem Zustand brachte im Rückblick in 3 Tagen Ø ${pz(s3.avg)}, in 7 Tagen Ø ${pz(s7.avg)} (nach Kosten).</p>`:""}</div>`}
function seiteEinstieg(){const l=einstiegKandidaten(),f=P.ef||"alle",rang={guenstig:0,wende:1,neutral:2,ueberdehnt:3,messer:4};
  const sicht=l.filter(x=>f==="alle"||(f==="jetzt"?["guenstig","wende"].includes(x.einstieg.z):f==="warten"?["ueberdehnt","messer"].includes(x.einstieg.z):x.einstieg.z==="neutral")).sort((a,b)=>rang[a.einstieg.z]-rang[b.einstieg.z]);
  const anz=k=>l.filter(x=>k.includes(x.einstieg.z)).length;
  return `<h2>⏱️ Einstieg: lohnt es sich jetzt?</h2><p class="small muted">Für die besten Werte: Kaufst du gerade oben auf dem Berg, oder nach einem Rücksetzer? Und wenn nicht jetzt, ab welchem Kurs. Zeitangaben sind Erfahrungswerte aus dem letzten Jahr, keine Vorhersage.</p>
  <div class="filters">${[...(D&&D.einstiegTop?[["top",`🏆 Beste aus allen ${D.werte}`]]:[]),["3","3 Tage"],["7","7 Tage"],["30","30 Tage"],["alle","Alle Listen"],["meine","Gemerkt"]].map(([k,n])=>`<button data-eq="${k}" class="${(P.eq||(D&&D.einstiegTop?"top":"3"))===k?"on":""}">${n}</button>`).join("")}</div>
  <div class="filters">${[["alle",`Alle (${l.length})`],["jetzt",`🟢 Günstig (${anz(["guenstig","wende"])})`],["warten",`🟡 Lieber warten (${anz(["ueberdehnt","messer"])})`],["neutral",`⚪ Neutral (${anz(["neutral"])})`]].map(([k,n])=>`<button data-ef="${k}" class="${f===k?"on":""}">${n}</button>`).join("")}</div>
  ${sicht.map(einstiegKarte).join("")||`<div class="card small muted">${l.length?"In diesem Filter gerade nichts.":"Noch keine Daten. Kommt mit dem nächsten Lauf des Wachmanns."}</div>`}
  <p class="small muted">Gemerkte Werte: Der Bot meldet sich in Telegram, sobald einer davon auf „Jetzt günstig“ springt. Keine Anlageberatung.</p>`}

/* ---------- Telegram-Benachrichtigungen dieser App ---------- */
function meldeKarte(){const M=(D&&D.meldungen)||{},N=MEIN.notify||{};if(!Object.keys(M).length)return "";
  return `<h2>🔔 Telegram-Benachrichtigungen</h2><div class="card">${Object.entries(M).map(([k,n])=>`<label class="sw"><input type="checkbox" data-notify="${k}"${N[k]===false?"":" checked"}><span>${esc(n)}</span></label>`).join("")}
   <label class="sw"><input type="checkbox" data-notify="nachts"${N.nachts===true?" checked":""}><span>Auch nachts (22–7 Uhr) benachrichtigen</span></label>
   <h3 style="font:700 14px var(--f-body);margin:14px 0 4px">Farben in den Nachrichten</h3>
   <p class="small" style="margin:0">🟢 steigt · 🟡 bleibt gleich · 🟠 aus dem Plus etwas gesunken · 🔴 fällt im Minus, oder hat vom Höchststand mehr als die Grenze verloren</p>
   <label class="f">Rot ab Verlust vom Höchststand (Prozentpunkte)<input id="n-grenze" type="number" inputmode="decimal" step="0.1" min="0.1" value="${N.grenze??0.5}"></label>
   <p class="small muted" style="margin-top:0">Beispiel mit ${nf(N.grenze??0.5,1)}: Eine Aktie war bei +1 % und fällt auf +${nf(Math.max(0,1-(N.grenze??0.5)),1)} % oder weniger → 🔴.</p>
   <p class="small muted">Der Bot prüft alle 5 Minuten, das Top-Depot zusätzlich etwa jede Minute, solange er läuft. Schutz-Warnungen kommen immer sofort, auch nachts. ${syncOn()?"":"Damit der Bot deine Einstellungen kennt, braucht die Haupt-App GitHub-Token und Sync-Passwort."}</p></div>`}

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
function render(){chips();status();$$(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===P.tab));{const tb=$('.tabs [data-tab="meine"]');if(tb)tb.classList.toggle("alarm",!!D&&MEIN.depot.some(d=>risiko(d).pt>=50))}const v=$("#view");
  if(!D){v.innerHTML=leer();return}v.innerHTML=P.tab==="bilanz"?seiteBilanz():P.tab==="meine"?seiteMeine():P.tab==="einstieg"?seiteEinstieg():seiteListe(+P.tab||3);if(offenS)detail(offenS.s,offenS.H,true)}
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

/* ---------- Zeiten: Achsen, Stand, bester künftiger Einstieg ---------- */
const WT=["So.","Mo.","Di.","Mi.","Do.","Fr.","Sa."];
const dmy=md=>{const [m,d]=String(md).split("-");return `${+d}.${+m}.`};
function handelstag(n){const d=new Date();let k=0;while(k<n){d.setDate(d.getDate()+1);if(d.getDay()%6)k++}return d} // ohne Feiertage
const tagTxt=d=>`${WT[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}.`;
const plus30=t=>{const [h,m]=t.split(":").map(Number),z=h*60+m+30;return String(Math.floor(z/60)%24).padStart(2,"0")+":"+String(z%60).padStart(2,"0")};
function standTxt(x){const k=kurs(x);return `Stand ${uhr(D.t)} Uhr · Kurs von ${k.t?new Date(k.t).toLocaleString("de-DE",{weekday:"short",hour:"2-digit",minute:"2-digit"}):"–"}`}
// Bester künftiger Einstieg: Tag (aus „meist nach N Tagen“) + Uhrzeit (aus dem Tagestief-Muster). Immer eine Schätzung.

// Haltedauer: Listen-Zeitraum, sonst der Zeitraum (3 oder 7 Tage), der im Rückblick für diesen Einstiegs-Zustand mehr gebracht hat
function halte(x){const e=x.einstieg;if(!e)return null;const be=besterEinstieg(x),hi=(D.einstiegInfo&&D.einstiegInfo.halte)||{},H=x.platz&&x.H?x.H:(hi[e.z]||3);
  const start=be&&!be.jetzt&&be.tag!=="heute"?handelstag(Math.max(1,be.n)):new Date(),ende=new Date(start);let k=0;while(k<H){ende.setDate(ende.getDate()+1);if(ende.getDay()%6)k++}
  const st=(e.stat||{})[H],zt=e.zeit&&e.zeit.teuer;
  return {H,start,ende,txt:`von ${be&&be.jetzt?"jetzt":tagTxt(start)} bis ca. ${tagTxt(ende)} (${H} Handelstage)`,raus:zt?zt.t:null,st,iso:`${ende.getFullYear()}-${String(ende.getMonth()+1).padStart(2,"0")}-${String(ende.getDate()).padStart(2,"0")}`}}
function halteBox(x){const h=halte(x);if(!h)return "";
  return `<div class="halte">⏳ Halten: <b>${esc(h.txt)}</b>${h.raus?`, am letzten Tag am ehesten gegen ${h.raus} Uhr verkaufen`:""}.<br><span class="small">Früher raus, wenn${x.noetig!=null?` dein Ziel (${pz(x.noetig,1)})`:" dein Ziel"} erreicht ist oder Gewinn- bzw. Verlustschutz auslöst.${h.st&&h.st.n?` Im Rückblick brachte dieser Zustand nach ${h.H} Tagen Ø ${pz(h.st.avg)} (${h.st.plus} % im Plus).`:""}</span></div>`}
function besterEinstieg(x){const e=x.einstieg;if(!e)return null;const z=e.zeit&&e.zeit.best,st=e.stat||{},jetzt=new Date(),hm=jetzt.getHours()*60+jetzt.getMinutes(),wt=jetzt.getDay()%6!==0;
  const fenster=z?`${z.t}–${plus30(z.t)} Uhr`:"";let tag,bed="",n=0;
  let jetztDrin=false;
  if(e.z==="guenstig"||e.z==="wende"||e.z==="neutral"){const [h,m]=z?z.t.split(":").map(Number):[0,0];if(wt&&z&&hm<h*60+m+30){tag="heute";jetztDrin=hm>=h*60+m}else{tag=jetzt.getDay()===5||jetzt.getDay()===6||!wt?tagTxt(handelstag(1)):"morgen";n=1}
    if(e.z==="neutral")bed="kein besonderer Vorteil, nur die günstigste Uhrzeit"}
  else if(e.z==="ueberdehnt"){n=Math.max(1,st.medTage||5);tag=`um ${tagTxt(handelstag(n))}`;bed=`wenn der Kurs bis dahin in die Zone um ${dez(e.ziel)} ${cs(x)} gefallen ist${st.erreicht!=null?` (früher in ${st.erreicht} % der Fälle)`:""}`}
  else if(e.z==="messer"){n=Math.max(1,(st.medTage||3));tag=`frühestens um ${tagTxt(handelstag(n+1))}`;bed=`wenn der Kurs vorher an einem Tag über ${dez(e.ziel)} ${cs(x)} schließt`}
  return {tag,fenster,bed,n,jetzt:jetztDrin,txt:jetztDrin?`jetzt (bis ${plus30(z.t)} Uhr)`:`${tag}${fenster?` · ${fenster}`:""}`}}
// Überschrift je nach Uhrzeit: jetzt einsteigen, heute später, oder Vorankündigung für einen späteren Tag
function zustandText(x){const e=x.einstieg,be=besterEinstieg(x);if(!(e.z==="guenstig"||e.z==="wende")||!be)return {i:ZICON[e.z],t:e.n,vor:false};
  if(be.jetzt)return {i:"🟢",t:"Jetzt einsteigen",vor:false};if(be.tag==="heute")return {i:"🟢",t:`Günstig – Einstieg heute ab ${e.zeit&&e.zeit.best?e.zeit.best.t:""} Uhr`,vor:false};
  return {i:"📅",t:`Vorankündigung – Einstieg erst ${be.tag} ${e.zeit&&e.zeit.best?e.zeit.best.t+" Uhr":""}`,vor:true}}
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
   <polyline points="${[...c,p].map((v,i)=>`${(i<n?X(i):xv).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
   ${(()=>{const be=besterEinstieg(x);if(!be||!x.einstieg||be.n>H)return "";const k=Math.max(0,be.n),py=x.einstieg.ziel&&x.einstieg.z==="ueberdehnt"?x.einstieg.ziel:p;if(py<lo||py>hi)return "";
     return `<line x1="${XZ(k)}" x2="${XZ(k)}" y1="0" y2="${Hh}" stroke="var(--up)" stroke-width="1.5" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><circle cx="${XZ(k)}" cy="${Y(py)}" r="${klein?5:7}" fill="var(--up)" stroke="var(--bg)" stroke-width="2"/>`})()}</svg>
  ${(()=>{const dd=(x.sparkD||[]).slice(-n);if(dd.length<2)return "";const idx=[0,Math.round((n-1)/3),Math.round(2*(n-1)/3)];
    return `<div class="xachse">${idx.map(i=>`<span style="left:${(X(i)/W*100).toFixed(1)}%">${dmy(dd[i])}</span>`).join("")}<span class="heute" style="left:${(xv/W*100).toFixed(1)}%">heute</span><span class="zuk" style="left:100%">${(d=>`${d.getDate()}.${d.getMonth()+1}.`)(handelstag(H))}</span></div>`})()}
  ${klein?`<p class="small muted stand">${standTxt(x)}</p>`:""}
  ${klein?"":`<div class="legende"><span><i class="l-kurs" style="background:${col}"></i>Verlauf ${n} Handelstage</span><span><i class="l-band"></i>übliche Schwankung in ${H} Tagen (2 von 3 Fällen, hell: 19 von 20)</span>${t.tage?`<span><i class="l-test"></i>Ø der Top ${D.top} im Rückblick-Test (${pz(t.topAvg)})</span>`:""}${x.p0?`<span><i class="l-p0"></i>Kurs bei Veröffentlichung</span>`:""}${me!=null?`<span><i class="l-mu"></i>Muster-Erwartung (${pz(me)}, ⚠️ unsicher)</span>`:""}</div>
  <p class="small muted stand">${standTxt(x)}${besterEinstieg(x)?` · <span style="color:var(--up)">● geschätzter bester Einstieg: ${esc(besterEinstieg(x).txt)}</span>`:""}</p>
  <p class="small muted">Der Bereich rechts ist keine Vorhersage, sondern zeigt, wie weit der Kurs normalerweise schwankt. Die gestrichelte Linie ist das, was die Top ${D.top} dieses Zeitraums im letzten Jahr im Schnitt gebracht haben.</p>`}`}
function detail(s,H,still){const x=(D.listen[H]||[]).find(y=>y.s===s)||(D.meine||{})[s]||(D.einstiegTop||[]).find(y=>y.s===s)||((D.weitere||{})[H]||[]).find(y=>y.s===s);if(!x)return;offenS={s,H};const auch=D.horizonte.filter(h=>h!==H&&(D.listen[h]||[]).some(y=>y.s===s));
  const li=(t,a)=>a&&a.length?`<h2>${t}</h2><ul class="why">${a.map(z=>`<li>${esc(z)}</li>`).join("")}</ul>`:"";
  $("#sheet").innerHTML=`<div class="grab"></div><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div class="brand" style="flex:1;font-size:19px">${esc(x.n)}</div><button class="icon-btn" data-zu aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  ${graph(x,H)}${karte(x,H,true)}
  ${x.ausblick?`<h2>Ausblick ${H_TEXT[H]}</h2><p>${esc(x.ausblick)}</p>`:""}
  ${x.szenarien&&(x.szenarien.gut||x.szenarien.schlecht)?`<div class="szen">${x.szenarien.gut?`<div class="gut"><i>Wenn es gut läuft</i>${esc(x.szenarien.gut)}</div>`:""}${x.szenarien.schlecht?`<div class="schlecht"><i>Was es kippen würde</i>${esc(x.szenarien.schlecht)}</div>`:""}</div>`:""}
  ${einstiegDetail(Object.assign({H},x))}
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
document.addEventListener("change",e=>{if(e.target.id==="n-grenze"){const v=+String(e.target.value).replace(",",".");if(v>0){MEIN.notify=Object.assign({},MEIN.notify||{},{grenze:v});meinGeaendert();render();toast("Grenze gespeichert")}return}const t=e.target.closest("[data-notify]");if(!t)return;MEIN.notify=Object.assign({},MEIN.notify||{},{[t.dataset.notify]:t.checked});meinGeaendert();toast(t.checked?"Eingeschaltet":"Ausgeschaltet")});
document.addEventListener("click",e=>{const t=e.target.closest("[data-eq],[data-ef],[data-vk-zeig],[data-vk],[data-kosten],[data-ziel],[data-merk],[data-uebern],[data-uebern-zeig],[data-step],[data-pos-del],[data-ent],[data-tab],[data-f],[data-open],[data-zu],[data-wecken],#refresh,#sheet-bg");if(!t)return;
  if(t.dataset.eq){P.eq=t.dataset.eq;saveP();render();return}
  if(t.dataset.ef){P.ef=t.dataset.ef;saveP();render();return}
  if(t.hasAttribute("data-vk-zeig")){const f=t.closest(".pos").querySelector(".vk");f.hidden=!f.hidden;return}
  if(t.dataset.vk){const d=MEIN.depot.find(x=>x.id===t.dataset.vk);if(!d)return;const f=t.closest("form"),v=n=>+String(f.elements[n].value).replace(",",".");const vk=v("vk"),q=Math.min(d.q,v("q"));
    if(!(vk>0)||!(q>0))return toast("Bitte Verkaufskurs und Stück eintragen.");const a=abrechnung(d.k,vk,q);
    if(!confirm(`${d.n}: ${nf(q,q%1?2:0)} Stück zu ${dez(vk)} verkauft?\nNach Kosten und Steuern etwa ${a.netto>=0?"+":"−"}${nf(Math.abs(a.netto),2)} (${pz(a.proz)}).`))return;
    MEIN.verkauft=(MEIN.verkauft||[]).concat({s:d.s,n:d.n,c:d.cur||"",k:d.k,vk,q,t:Date.now(),tage:Math.max(1,Math.round((Date.now()-d.t)/864e5)),netto:+a.netto.toFixed(2),proz:+a.proz.toFixed(2)}).slice(-200);
    if(q>=d.q-1e-9)MEIN.depot=MEIN.depot.filter(x=>x!==d);else d.q=+(d.q-q).toFixed(6);meinGeaendert();render();toast("Verkauf gespeichert.");return}
  if(t.hasAttribute("data-kosten")){const v=id=>+String($(id).value).replace(",",".");const K={gebuehr:Math.max(0,v("#k-g")||0),einsatz:Math.max(1,v("#k-e")||1000),spread:Math.max(0,v("#k-s")||0),steuer:Math.min(60,Math.max(0,v("#k-t")||0))};
    MEIN.kosten=K;meinGeaendert();render();toast(syncOn()?"Gespeichert. Die Liste rechnet ab dem nächsten Lauf damit (2–5 Min.).":"Gespeichert (nur auf diesem Handy, für die Liste braucht es den Abgleich).");return}
  if(t.hasAttribute("data-ziel")){const w=+String($("#z-wert").value).replace(",",".");if(!(w>0))return toast("Bitte ein Ziel über 0 eintragen.");MEIN.ziel={wert:w,je:$("#z-je").value};meinGeaendert();render();toast("Ziel gespeichert");return}
  if(t.dataset.merk){e.stopPropagation();merken(t.dataset.merk,t.dataset.n);if(offenS)detail(offenS.s,offenS.H,true);return}
  if(t.hasAttribute("data-uebern-zeig")){const f=t.closest(".mein").querySelector(".uebern");f.hidden=!f.hidden;return}
  if(t.dataset.uebern){const f=t.closest("form"),v=n=>+String(f.elements[n].value).replace(",",".");const k=v("k"),q=v("q");if(!(k>0)||!(q>0))return toast("Bitte Kaufkurs und Stück eintragen.");
    MEIN.depot.push({id:"p"+Date.now().toString(36),s:t.dataset.uebern,n:t.dataset.n,cur:t.dataset.cur,k,q,a:Math.abs(v("a")||0),nl:Math.max(0,v("nl")||0),bis:f.elements.bis&&f.elements.bis.value||undefined,t:Date.now()});
    if(!istGemerkt(t.dataset.uebern))MEIN.merk.push({s:t.dataset.uebern,n:t.dataset.n,t:Date.now()});meinGeaendert();toast(syncOn()?"Übernommen. Der Bot überwacht ab dem nächsten Lauf.":"Übernommen (nur auf diesem Handy).");detail(offenS.s,offenS.H,true);return}
  if(t.dataset.step){const [id,f,dlt]=t.dataset.step.split(":"),d=MEIN.depot.find(x=>x.id===id);if(!d)return;
    if(f==="nl")d.nl=Math.max(0,+((d.nl>0?d.nl:d.nl===0?0:.5)+ +dlt).toFixed(1));else d.a=Math.max(0,Math.abs(d.a??10)+ +dlt);meinGeaendert();render();return}
  if(t.dataset.posDel){const d=MEIN.depot.find(x=>x.id===t.dataset.posDel);if(d&&confirm(`${d.n} löschen? Das ist für Fehleingaben gedacht: Es wird kein Verkauf gespeichert, der Bot überwacht die Aktie nicht mehr.`)){MEIN.depot=MEIN.depot.filter(x=>x!==d);meinGeaendert();render()}return}
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
