const app = document.querySelector("#app");
const confirmDialog = document.querySelector("#confirm");
const actions = {
  advance: "पुढील टप्प्यावर पाठवा", return: "दुरुस्तीसाठी परत पाठवा",
  reject: "अर्ज नामंजूर करा", approve: "अर्ज मंजूर करा", resubmit: "दुरुस्ती नोंदवून पुन्हा सादर करा"
};
const stages = {intake:"प्राथमिक छाननी",field:"पुरावा पडताळणी",decision:"अंतिम निर्णय"};
const roles = {intake:"तहसील लिपिक",field:"अव्वल कारकून",decision:"नायब तहसीलदार"};
const statuses = {active:"प्रलंबित",returned:"दुरुस्तीसाठी परत",approved:"मंजूर",rejected:"नामंजूर"};
const eventLabels = {received:"अर्ज प्राप्त",submitted:"अर्ज सादर",created:"अर्ज नोंदवला",advance:"पुढील टप्प्यावर पाठवला",return:"दुरुस्तीसाठी परत पाठवला",approve:"अर्ज मंजूर",reject:"अर्ज नामंजूर",resubmit:"दुरुस्तीनंतर पुन्हा सादर"};
const number = new Intl.NumberFormat("mr-IN");
const currency = n => n == null ? "नोंद उपलब्ध नाही" : new Intl.NumberFormat("mr-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
const date = (d, withTime = false) => {
  if (!d || !Number.isFinite(Date.parse(d))) return "—";
  return new Intl.DateTimeFormat("mr-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric",...(withTime ? {hour:"2-digit",minute:"2-digit"} : {})}).format(new Date(d));
};
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brand = '<div class="brand"><i class="mark" aria-hidden="true"></i><span>लोकसेवा<small>महसूल कार्यकक्ष · सातारा</small></span></div>';
let user = null, cases = [], current = null, generation = 0, toastTimer;
const filters = {query:"",status:"active",stage:"all"};
class RequestError extends Error {constructor(message,status){super(message);this.status=status}}
async function api(path, payload) {
  let response;
  try {
    response = await fetch("/api/"+path,payload===undefined ? {cache:"no-store"} : {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});
  } catch {throw new RequestError("संपर्क होऊ शकला नाही. इंटरनेट तपासून पुन्हा प्रयत्न करा.",0)}
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    if (response.status===401 && path!=="login") {user=null;current=null;cases=[];generation++;login();}
    throw new RequestError(data.error || "विनंती पूर्ण झाली नाही. पुन्हा प्रयत्न करा.",response.status);
  }
  return data;
}
function toast(message){const el=document.querySelector("#alert");el.textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.textContent="",4500)}
function shell(content) {
  return '<header class="bar"><div class="bar-inner">'+brand+'<div class="tools"><span class="name">'+esc(user?.name)+'</span><button type="button" id="logout">बाहेर पडा</button></div></div></header><main class="wrap page" id="main" tabindex="-1">'+content+'</main>';
}
function bindLogout(){document.querySelector("#logout").onclick=async e=>{
  e.currentTarget.disabled=true;
  try{await api("logout",{});user=null;current=null;cases=[];generation++;history.replaceState(null,"",location.pathname);login()}
  catch(err){toast(err.message);const b=document.querySelector("#logout");if(b)b.disabled=false}
}}
function login() {
  document.title="अधिकारी प्रवेश · लोकसेवा";
  app.innerHTML='<main id="main" class="signin"><section class="intro">'+brand+'<div class="intro-copy"><h1>उत्पन्न प्रमाणपत्र<br>कार्यकक्ष</h1><p>अर्जाची छाननी, पुराव्यांची पडताळणी आणि अंतिम निर्णय एकाच ठिकाणी नोंदवा.</p></div><p class="intro-foot">सातारा जिल्हा · महाराष्ट्र</p></section><section class="login-area"><div class="login-card"><h2>अधिकारी प्रवेश</h2><p class="sub">कार्यसूची पाहण्यासाठी खात्यात प्रवेश करा.</p><form id="login"><label class="field">वापरकर्ता नाव<input name="username" autocomplete="username" required autocapitalize="none" spellcheck="false"></label><label class="field">संकेतशब्द<input type="password" name="password" required autocomplete="current-password"></label><p class="error" role="alert"></p><button class="primary" type="submit">प्रवेश करा</button></form><div class="demo"><strong>प्रात्यक्षिक खाते</strong><p class="sub">या खात्यात सरावासाठी काल्पनिक अर्ज आहेत.</p><button id="fill" type="button">प्रात्यक्षिक खात्याचे तपशील भरा</button></div></div></section></main>';
  const f=document.querySelector("#login");
  document.querySelector("#fill").onclick=()=>{f.username.value="officer";f.password.value="Kenpath2026!";f.querySelector("button").focus()};
  f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector("button");b.disabled=true;f.querySelector(".error").textContent="";
    try{await api("login",{username:f.username.value.trim(),password:f.password.value});user=(await api("session")).user;if(!user)throw new Error("सत्र सुरू झाले नाही. कुकीजना परवानगी देऊन पुन्हा प्रयत्न करा.");await route()}
    catch(err){f.querySelector(".error").textContent=err.message;b.disabled=false}
  };
}
function dueDays(c){
  const indianDate=d=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
  return Math.round((Date.parse(indianDate(new Date(c.due)))-Date.parse(indianDate(new Date())))/86400000);
}
function dueTag(c){
  if(c.status==="approved"||c.status==="rejected")return '<span class="sub">'+esc(date(c.due))+'</span>';
  const n=dueDays(c);
  const label=n<0 ? number.format(-n)+" दिवस विलंब" : n===0 ? "आज अंतिम दिवस" : number.format(n)+" दिवस शिल्लक";
  return '<span class="urgency '+(n<0?"late":n<=3?"soon":"")+'">'+label+'</span>';
}
function stageTag(c){
 const key=c.status==="active"?c.stage:c.status;
 return '<span class="stage-tag tag-'+esc(key)+'">'+esc(stages[key]||statuses[key]||key)+'</span>';
}
function options(map,selected){return Object.entries(map).map(([k,v])=>'<option value="'+esc(k)+'" '+(k===selected?'selected':'')+'>'+esc(v)+'</option>').join("")}
function queue() {
 current=null;document.title="अर्ज कार्यसूची · लोकसेवा";
 const active=cases.filter(c=>c.status==="active");
 const metrics=[["प्रलंबित अर्ज",active.length],["तीन दिवसांत देय किंवा विलंबित",active.filter(c=>dueDays(c)<=3).length],["दुरुस्तीसाठी परत",cases.filter(c=>c.status==="returned").length],["निर्णय झालेले",cases.filter(c=>["approved","rejected"].includes(c.status)).length]];
 app.innerHTML=shell('<div class="heading-line"><div><p class="eyebrow">उत्पन्न प्रमाणपत्र</p><h1>अर्ज कार्यसूची</h1></div><p class="date">'+esc(date(new Date().toISOString()))+'</p></div><section class="stats" aria-label="अर्जांचा आढावा">'+metrics.map(([s,n])=>'<div class="stat"><span>'+s+'</span><b>'+number.format(n)+'</b></div>').join("")+'</section><section class="panel"><div class="panel-top"><h2>अर्ज नोंदवही</h2><p class="sub">ज्यांची मुदत जवळ आहे ते अर्ज आधी दिसतात.</p><div class="filterbar"><input id="search" type="search" placeholder="नाव, अर्ज क्रमांक किंवा गाव शोधा" aria-label="अर्ज शोधा" value="'+esc(filters.query)+'"><select aria-label="अर्जाची स्थिती" id="status">'+options({all:"सर्व स्थिती",...statuses},filters.status)+'</select><select aria-label="अर्जाचा टप्पा" id="stage">'+options({all:"सर्व टप्पे",...stages},filters.stage)+'</select></div></div><div class="list-head" aria-hidden="true"><span>अर्जदार / अर्ज क्रमांक</span><span>गाव</span><span>सध्याची स्थिती</span><span>सेवा मुदत</span></div><div id="rows"></div><p class="foot" aria-live="polite" id="count"></p></section>');
 bindLogout();document.querySelector("#search").oninput=e=>{filters.query=e.target.value;drawRows()};["stage","status"].forEach(k=>document.querySelector("#"+k).onchange=e=>{filters[k]=e.target.value;drawRows()});drawRows();
}
function drawRows(){
 const q=filters.query.trim().toLocaleLowerCase();
 const visible=cases.filter(c=>(filters.status==="all"||c.status===filters.status)&&(filters.stage==="all"||c.stage===filters.stage)&&[c.name,c.id,c.village].some(v=>String(v).toLocaleLowerCase().includes(q))).sort((a,b)=>Date.parse(a.due)-Date.parse(b.due)||a.id.localeCompare(b.id));
 document.querySelector("#rows").innerHTML=visible.length?visible.map(c=>'<button class="case-row" data-id="'+esc(c.id)+'"><span><strong>'+esc(c.name)+'</strong><small>'+esc(c.id)+'</small></span><span class="place">'+esc(c.village)+'</span><span class="queue-stage">'+stageTag(c)+'</span><span class="queue-due">'+dueTag(c)+'</span></button>').join(""):'<p class="empty">या निवडीत अर्ज सापडले नाहीत.</p>';
 document.querySelectorAll(".case-row").forEach(b=>b.onclick=()=>{location.hash="/case/"+encodeURIComponent(b.dataset.id)});
 document.querySelector("#count").textContent=number.format(visible.length)+" अर्ज दिसत आहेत · एकूण "+number.format(cases.length);
}
function fact(k,v){return '<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>'}
function details(c){
 current=c;document.title=c.id+" · लोकसेवा";
 const active=c.status==="active", returned=c.status==="returned",editable=active||returned, intake=active&&c.stage==="intake", field=active&&c.stage==="field";
 const flow=Object.keys(stages);
 const steps=flow.map((s,i)=>'<div class="step '+(s===c.stage?"current":i<flow.indexOf(c.stage)?"done":"")+'" '+(s===c.stage?'aria-current="step"':'')+'>'+number.format(i+1)+'. '+stages[s]+'</div>').join("");
 const documents=(c.documents||[]).map(d=>'<label class="doc">'+((intake||returned)?'<input type="checkbox" name="check" value="'+esc(d.id)+'" '+((d.verified||(returned&&d.present))?'checked ':'')+((intake&&!d.present)||(returned&&d.present)?'disabled ':'')+'>':'')+'<span><strong>'+esc(d.label)+'</strong><small>'+esc(d.detail)+'</small>'+(!d.present?'<small class="missing">पुरावा प्राप्त नाही</small>':d.verified?'<small>तपासलेले</small>':'')+'</span></label>').join("");
 const available=returned?["resubmit"]:c.stage==="decision"?["approve","return","reject"]:["advance","return"];
 const editor=editable?'<section class="panel section"><h2>'+(returned?"दुरुस्ती प्राप्त झाली":"अधिकाऱ्याची कार्यवाही")+'</h2><p class="sub">'+(returned?"मिळालेले नवीन पुरावे वर निवडा आणि बदलाची नोंद लिहा.":"कार्यवाहीची कारणे आणि पुराव्यांचा संदर्भ नोंदवा.")+'</p><form id="act">'+(field?'<label class="field">पडताळलेले वार्षिक उत्पन्न (रुपये)<input type="number" name="income" min="0" step="1" value="'+esc(c.fieldIncome??"")+'"></label>':'')+'<label class="field">कार्यवाहीची नोंद<textarea name="note" required maxlength="1500" placeholder="या अर्जावर केलेली पडताळणी किंवा निर्णयाचे कारण लिहा"></textarea></label><p class="error" role="alert"></p><div class="actions">'+available.map((a,i)=>'<button name="action" value="'+a+'" class="'+(i===0?"primary":a==="reject"?"reject":"")+'">'+actions[a]+'</button>').join("")+'</div></form></section>':'';
 const log=[...(c.history||[])].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 app.innerHTML=shell('<a class="back" href="#/">कार्यसूचीकडे परत</a><div class="detail-top"><div><p class="eyebrow">उत्पन्न प्रमाणपत्र · '+esc(c.id)+'</p><h1>'+esc(c.name)+'</h1><p class="sub">'+esc(c.village)+' · '+esc(c.district)+'</p></div>'+stageTag(c)+'</div><div class="stepper" aria-label="अर्जाचा प्रवास">'+steps+'</div><div class="columns"><div class="stack"><section class="panel section"><h2>अर्जाचा तपशील</h2><dl class="facts">'+fact("व्यवसाय",c.occupation)+fact("घोषित वार्षिक उत्पन्न",currency(c.declaredIncome))+fact("अर्ज प्राप्त",date(c.received))+fact("अंतिम मुदत",date(c.due))+fact("या टप्प्याचा अधिकारी",roles[c.stage])+(c.fieldIncome!=null?fact("पडताळलेले वार्षिक उत्पन्न",currency(c.fieldIncome)):"")+(c.fieldNote?fact("पडताळणीची नोंद",c.fieldNote):"")+'</dl></section><section class="panel section"><h2>कागदपत्रे आणि पुरावे</h2>'+(intake?'<p class="sub">प्रत्येक उपलब्ध पुरावा तपासल्यावर खूण करा.</p>':returned?'<p class="sub">दुरुस्तीत मिळालेल्या पुराव्यांवर खूण करा.</p>':'')+documents+'</section>'+editor+'</div><aside class="stack">'+(editable?'<section class="panel section assist"><h2>AI सहाय्यक</h2><p class="sub">या टप्प्यासाठी अर्जातील नोंदींवर आधारित सूचना मिळवा. अंतिम निर्णय अधिकारी घेतात.</p><div id="assist-body" class="assist-body" aria-live="polite"></div><button id="assist">सूचना मिळवा</button></section>':'')+'<section class="panel section"><h2>अर्जाचा इतिहास</h2><ol class="timeline">'+log.map(h=>'<li><strong>'+esc(eventLabels[h.action]||h.action)+'</strong><small>'+esc(h.actor)+' · '+esc(date(h.at,true))+'</small><p>'+esc(h.note)+'</p></li>').join("")+'</ol></section></aside></div>');
 bindLogout();if(editable){document.querySelector("#assist").onclick=()=>assist(c);document.querySelector("#act").onsubmit=e=>submitAction(e,c)}
}
async function assist(c){
 const button=document.querySelector("#assist"),el=document.querySelector("#assist-body");button.disabled=true;el.textContent="सूचना तयार होत आहेत…";
 try{const data=await api("cases/"+encodeURIComponent(c.id)+"/assist",{});
   el.innerHTML=(data.title?'<h3>'+esc(data.title)+'</h3>':'')+'<p>'+esc(data.summary||data.text)+'</p>'+(Array.isArray(data.items)?'<ul>'+data.items.map(i=>'<li><strong>'+esc(i.label)+'</strong><p>'+esc(i.detail)+'</p><small>'+esc(i.source)+'</small></li>').join("")+'</ul>':'')+'<small>'+esc(data.method||data.source)+'</small>';button.textContent="पुन्हा सूचना मिळवा";
 }catch(err){el.textContent=err.message}finally{button.disabled=false}
}
function confirmAction(action,note) {
 document.querySelector("#confirm-title").textContent=actions[action]+"?";
 document.querySelector("#confirm-text").textContent="इतिहासात पुढील नोंद जतन होईल.\n"+note;
 confirmDialog.returnValue="cancel";
 return new Promise(resolve=>{confirmDialog.addEventListener("close",()=>resolve(confirmDialog.returnValue==="confirm"),{once:true});confirmDialog.showModal()});
}
async function submitAction(e,c){
 e.preventDefault();const form=e.currentTarget,action=e.submitter?.value;if(!actions[action])return;
 const errEl=form.querySelector(".error");errEl.textContent="";
 const note=form.note.value.trim();
 if(!note){errEl.textContent="कार्यवाहीची नोंद लिहा.";form.note.focus();return}
 const checks=[...document.querySelectorAll('input[name="check"]:checked')].map(x=>x.value);
 if(action==="advance"&&c.stage==="intake"&&c.documents.some(d=>!d.present||!checks.includes(d.id))){errEl.textContent="सर्व आवश्यक पुरावे तपासा. पुरावा अपुरा असल्यास अर्ज दुरुस्तीसाठी परत पाठवा.";return}
 const income=form.elements.namedItem("income");
 if(action==="advance"&&income&&income.value===""){errEl.textContent="पडताळलेले वार्षिक उत्पन्न नोंदवा.";income.focus();return}
 if(!await confirmAction(action,note)||current!==c)return;
 const buttons=[...form.querySelectorAll("button")];buttons.forEach(b=>b.disabled=true);
 try{
  const data=await api("cases/"+encodeURIComponent(c.id)+"/action",{action,version:c.version,note,checks,...(income?.value?{fieldIncome:Number(income.value)}:{})});
  if(current===c){details(data.case);document.querySelector("#main").focus();toast("कार्यवाहीची नोंद जतन झाली.")}
 }catch(err){if(err.status===409&&current===c){await route();toast("अर्जाची अद्ययावत आवृत्ती उघडली. नोंद तपासून पुन्हा प्रयत्न करा.")}else errEl.textContent=err.message}
 finally{buttons.forEach(b=>b.disabled=false)}
}
async function route(){
 const token=++generation, id=location.hash.match(/^#\/case\/([^/]+)$/)?.[1];
 try{
  if(!user){login();return}
  if(id){const data=await api("cases/"+encodeURIComponent(decodeURIComponent(id)));if(token===generation)details(data.case)}
  else{const data=await api("cases");if(token===generation){cases=data.cases;queue()}}
  if(token===generation)document.querySelector("#main")?.focus();
 }catch(err){if(token!==generation)return;app.innerHTML=shell('<section class="panel section"><h2>अर्ज उघडता आला नाही</h2><p>'+esc(err.message)+'</p><div class="actions"><button id="retry">पुन्हा प्रयत्न करा</button><a class="button" href="#/">कार्यसूची उघडा</a></div></section>');bindLogout();document.querySelector("#retry").onclick=route}
}
window.addEventListener("hashchange",route);
async function start(){try{user=(await api("session")).user;await route()}catch(err){app.innerHTML='<main id="main" class="loading"><p>'+esc(err.message)+'</p><button id="retry">पुन्हा प्रयत्न करा</button></main>';document.querySelector("#retry").onclick=start}}
start();
