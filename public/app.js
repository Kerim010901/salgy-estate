import locations from './locations.js';
import {locationKey, parsePlace, parseRequest, regionLabel, regionOf} from './assistant.js';
import {drawMap} from './map.js';

const paths = {
logo:'<path d="M12 22s7.4-4.5 7.4-11a7.4 7.4 0 1 0-14.8 0c0 6.5 7.4 11 7.4 11Z"/><path d="m8.7 11.2 3.3-3 3.3 3v3.7H8.7z"/>',
sparkles:'<path d="M12 3c.7 5.2 3.8 8.3 9 9-5.2.7-8.3 3.8-9 9-.7-5.2-3.8-8.3-9-9 5.2-.7 8.3-3.8 9-9ZM19 2v4m-2-2h4"/>',
home:'<path d="M3 11 12 3l9 8v10H3zM9 21v-7h6v7"/>', pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>', building:'<path d="M4 21V5l8-3v19m0-14h8v14M2 21h20M7 8h2m-2 4h2m-2 4h2m6-5h2m-2 5h2"/>', search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>', user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>', plus:'<path d="M12 5v14M5 12h14"/>', heart:'<path d="M20.8 9c0 4.5-8.8 10-8.8 10S3.2 13.5 3.2 9a4.5 4.5 0 0 1 8.8-1.3A4.5 4.5 0 0 1 20.8 9Z"/>', sliders:'<path d="M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4"/>', map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16"/>', arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', chart:'<path d="M4 3v17h17M7 15l5-5 4 2 5-6"/>', calculator:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 7h8m-8 5h1m5 0h1m-7 5h1m5 0h1"/>', checklist:'<path d="M4 6h2l2-2m2 2h10M4 12h2l2-2m2 2h10M4 18h2l2-2m2 2h10"/>', x:'<path d="m6 6 12 12M18 6 6 18"/>', bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9m-8 12h4"/>'
};
const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const money = number => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(number).replaceAll(',',' ') + ' TMT';
const regions=Object.keys(locations);
const placeNames=regions.flatMap(region=>[region,...locations[region]]);
const displayPlace=item=>[item.district,regionLabel(item.region||regionOf(item.district)||'Aşgabat')].join(' · ');
const types = {apartment:'Kwartira',house:'Ýaşaýyş jaýy',room:'Aýratyn otag',land:'Ýer bölegi',office:'Ofis',retail:'Söwda meýdany',warehouse:'Ammar',investment:'Maýa goýum emlägi'};
const modes = {buy:'Satylyk',rent:'Kärende',commercial:'Täjirçilik'};
const amenities = {balcony:'Balkon',parking:'Awtoulag duralgasy',furnished:'Mebelli',elevator:'Lift',terrace:'Eýwan',short:'Gysga möhletli kärende'};
const state = {listings:[],records:[],agents:[],inquiries:[],me:false,online:false,compare:new Set(),mode:'buy',filters:{mode:'buy'},searched:false,sort:'new'};
const all = () => state.listings;
const get = id => all().find(item => item.id === id);
const entries = kind => state.records.filter(item => item.kind === kind);
const favorites = () => new Set(entries('favorite').map(item => item.id));
const btn = (text,action,cls='outline',props='') => '<button type="button" class="' + cls + '" data-action="' + action + '" ' + props + '>' + text + '</button>';
const options = (list,value='',blank='') => (blank ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(([key,label]) => '<option value="' + esc(key) + '"' + (key===value?' selected':'') + '>'+esc(label)+'</option>').join('');
const input = (label,name,value='',attrs='') => '<label><span>'+esc(label)+'</span><input name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>';
const select = (label,name,list,value='',blank='') => '<label><span>'+esc(label)+'</span><select name="'+name+'">'+options(list,value,blank)+'</select></label>';
const area = (label,name,value='',attrs='') => '<label><span>'+esc(label)+'</span><textarea name="'+name+'" '+attrs+'>'+esc(value)+'</textarea></label>';
const checkbox = (label,name,value,checked) => '<label class="check"><input type="checkbox" name="'+name+'" value="'+esc(value)+'"'+(checked?' checked':'')+'> '+esc(label)+'</label>';
const submit = text => '<button class="btn" type="submit">'+text+'</button>';
const form = (name,body) => '<form class="form" data-form="'+name+'">'+body+'</form>';
const record = html => '<div class="record">'+html+'</div>';
const empty = text => '<p class="notice">'+text+'</p>';
let toastTimer;
function toast(message){
  const notices=document.querySelectorAll('#toast,#dialog-status');
  notices.forEach(el=>el.classList.remove('on'));
  const el=$('#dialog').open?$('#dialog-status'):$('#toast');
  el.textContent=message; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('on'),4000);
}
async function api(path,method='GET',data){
  const response=await fetch('/api/'+path,{method,headers:method!=='GET'?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error||'Amaly ýerine ýetirip bolmady. Täzeden synanyşyň.');
  return result;
}
async function refresh(){
  const data=await api('state');
  Object.assign(state,data,{online:true});
  render();
}
function modal(title,body){
  $('#dialog-status').classList.remove('on');
  $('#dialog-title').textContent=title;
  $('#dialog-body').innerHTML=body;
  if(!$('#dialog').open) $('#dialog').showModal();
  $('#dialog').scrollTop=0;
}
function matches(item,filters){
  const query=locationKey(filters.location);
  const place=parsePlace(query);
  const region=item.region||regionOf(item.district);
  const text=locationKey([item.district,item.address,item.title].join(' '));
  const hasPlace=place.location
    ? region===place.region&&(place.location===place.region||item.district===place.location)
    : query.split(/\s+/).filter(Boolean).every(word=>text.includes(word));
  return (!filters.mode||item.mode===filters.mode) && hasPlace &&
    (!filters.type||item.type===filters.type) && (!filters.max||item.price<=Number(filters.max)) &&
    (!filters.min||item.price>=Number(filters.min)) && (!filters.rooms||item.rooms>=Number(filters.rooms)) &&
    (!filters.minArea||item.area>=Number(filters.minArea)) && (filters.features||[]).every(feature=>item.features.includes(feature));
}
function found(){
  const active=state.listings.filter(item=>item.active!==false);
  const list=active.filter(item=>matches(item,state.filters));
  if(state.sort==='asc') return list.sort((a,b)=>a.price-b.price);
  if(state.sort==='desc') return list.sort((a,b)=>b.price-a.price);
  if(state.sort==='area') return list.sort((a,b)=>b.area-a.area);
  return list;
}
function card(item){
  const saved=favorites().has(item.id);
  return '<article class="card">'+(item.photos[0]?'<img class="photo" loading="lazy" src="'+esc(item.photos[0])+'" alt="'+esc(item.title)+'">':'<div class="photo photo-alt">'+icon('building')+'</div>')+
    btn(icon('heart'),'favorite','icon'+(saved?' active':''),'data-id="'+item.id+'" aria-label="Halanlaryma goş ýa-da aýyr" aria-pressed="'+saved+'"')+
    '<div class="card-body"><div class="card-top"><span class="badge">'+modes[item.mode]+'</span>'+''+'</div><h3>'+btn(esc(item.title),'details','', 'data-id="'+item.id+'"')+'</h3><div class="meta">'+icon('pin')+' '+esc(displayPlace(item))+' · '+esc(types[item.type])+'</div><div class="meta">'+item.rooms+' otag · '+item.area+' m²</div><div class="card-bottom"><strong>'+money(item.price)+(item.mode==='rent'?' <small>/ aý</small>':'')+'</strong>'+checkbox('Deňeşdir','compare',item.id,state.compare.has(item.id))+'</div></div></article>';
}
function render(){
  const list=found();
  $('#result-title').textContent=state.searched?'Gözleg netijeleri':'Emläk bildirişleri';
  $('#result-note').textContent=state.online?list.length+' bildiriş':'Bildirişler ýüklenýär…';
  $('#results-tools').hidden=false;
  $('#comparison-count').textContent=state.compare.size?'('+state.compare.size+')':'';
  $('#result-grid').innerHTML=list.length?list.map(card).join(''):'<div class="empty"><h3>Gabat gelýän bildiriş tapylmady</h3><p>Süzgüçleri giňeldiň ýa-da gözlegiňizi saklaň.</p>'+btn('Süzgüçleri arassala','reset','text-btn')+'</div>';
}
const scrollResults=()=>$('#listings').scrollIntoView({block:'start',behavior:'instant'});
function mode(value){
  const selected=$('#type').value;
  state.mode=value;
  document.querySelectorAll('.tabs [data-mode]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.mode===value));
  const typesForMode=Object.entries(types).filter(([key])=>!value?true:value==='commercial'?['office','retail','warehouse','land','investment'].includes(key):['apartment','house','room','land','investment'].includes(key));
  $('#type').innerHTML=options(typesForMode,selected,'Ähli görnüşler');
}
function details(id,index=0){
  const item=get(id); if(!item)return;
  history.replaceState(null,'','#emlak-'+id);
  const photo=item.photos[index];
  modal(item.title,'<div class="stack">'+(photo?'<img class="detail-photo" src="'+esc(photo)+'" alt="'+esc(item.title)+'">':'')+
    (item.photos.length>1?'<div class="row">'+btn('‹','gallery','outline','aria-label="Öňki surat" data-id="'+id+'" data-index="'+((index-1+item.photos.length)%item.photos.length)+'"')+' '+(index+1)+' / '+item.photos.length+' '+btn('›','gallery','outline','aria-label="Indiki surat" data-id="'+id+'" data-index="'+((index+1)%item.photos.length)+'"')+'</div>':'')+
    '<div class="meta">'+icon('pin')+' '+esc(displayPlace(item))+' · '+esc(item.address)+'</div><h3>'+money(item.price)+(item.mode==='rent'?' / aý':'')+'</h3><div class="meta">'+esc(types[item.type])+' · '+item.rooms+' otag · '+item.area+' m² · '+modes[item.mode]+'</div><p>'+esc(item.description)+'</p>'+
    (item.features.length?'<p class="notice">'+item.features.map(key=>amenities[key]).join(' · ')+'</p>':'')+
    
    '<div class="row">'+(!item.owned?btn('Ýüz tut','contact','btn','data-id="'+id+'"'):'')+btn('Karta','map','outline','data-place="'+esc(item.district)+'"')+btn('Baglanyşygy göçür','share','outline')+'</div></div>');
}
function filters(){
  const f=state.filters;
  modal('Gözleg süzgüçleri',form('filters',select('Geleşik','mode',Object.entries(modes),f.mode,'Ähli geleşikler')+
    input('Şäher ýa-da etrap','location',f.location,'list="locations" maxlength="80"')+select('Emlägiň görnüşi','type',Object.entries(types),f.type,'Ähli görnüşler')+
    '<div class="three">'+input('Iň pes baha (TMT)','min',f.min,'type="number" min="0"')+input('Iň ýokary baha (TMT)','max',f.max,'type="number" min="1"')+input('Iň az otag sany','rooms',f.rooms,'type="number" min="0"')+'</div>'+
    input('Iň az meýdan (m²)','minArea',f.minArea,'type="number" min="0"')+
    '<div class="two">'+Object.entries(amenities).map(([key,label])=>checkbox(label,'features',key,f.features?.includes(key))).join('')+'</div>'+submit('Netijeleri görkez')));
}
function auth(kind='login'){
  const register=kind==='register';
  modal(register?'Hasap döret':'Hasabyňyza giriň',form(kind,
    (register?input('Adyňyz','name','','required maxlength="80" autocomplete="name"'):'')+
    input('E-poçta','email','','required type="email" maxlength="254" autocomplete="email"')+
    input('Açar sözi','password','','required type="password" minlength="10" maxlength="128" autocomplete="'+(register?'new-password':'current-password')+'"')+
    '<p class="notice">Açar sözi azyndan 10 belgiden ybarat bolmaly.</p>'+
    submit(register?'Hasap döret':'Hasaba gir'))+
    btn(register?'Hasabym bar':'Täze hasap döret','auth','text-btn','data-kind="'+(register?'login':'register')+'"'));
}
function needAccount(){
  if(state.me) return true;
  if(!state.online){toast('Hyzmata birigip bolmady. Sahypany täzeläň.');return false;}
  auth();
  return false;
}
function publish(item){
  if(!needAccount())return;
  const p=item||{photos:[],features:[]};
  modal(item?'Bildirişi üýtget':'Täze bildiriş',form('publish',
    '<input type="hidden" name="id" value="'+esc(p.id)+'">'+input('Bildirişiň ady','title',p.title,'required maxlength="90"')+
    '<div class="two">'+select('Geleşik','mode',Object.entries(modes),p.mode)+select('Emlägiň görnüşi','type',Object.entries(types),p.type)+
    placeFields(p)+'</div>'+input('Köçe ýa-da salgynyň beýany','address',p.address,'required maxlength="100"')+
    '<div class="three">'+input('Baha (TMT)','price',p.price,'required type="number" min="1" max="1000000000"')+
    input('Meýdan (m²)','area',p.area,'required type="number" min="1" max="1000000" step="any"')+
    input('Otag sany','rooms',p.rooms,'required type="number" min="0" max="100"')+'</div>'+
    area('Emlägiň beýany','description',p.description,'required maxlength="2400"')+
    '<div class="two">'+Object.entries(amenities).map(([key,label])=>checkbox(label,'features',key,p.features.includes(key))).join('')+'</div>'+
    '<label><span>Suratlar (iň köp 3)</span><input name="photos" type="file" accept="image/jpeg,image/webp,image/png" multiple></label>'+
    (p.photos.length?checkbox('Öňki suratlary aýyr','removePhotos','1',false):'')+
    '<p class="notice">Özüňize degişli ýa-da ulanmaga rugsat berlen suratlary ýükläň.</p>'+submit(item?'Üýtgeşmeleri ýatda sakla':'Bildirişi ýerleşdir')));
}
function placeFields(item){
  const region=item.region||regionOf(item.district)||regions[0];
  return select('Şäher ýa-da welaýat','region',regions.map(name=>[name,regionLabel(name)]),region)+
    select('Şäher ýa-da etrap','district',locations[region].map(name=>[name,name]),item.district);
}
function drawPlaces(){
  $('#locations').innerHTML=options(placeNames.map(name=>[name,regions.includes(name)?regionLabel(name):name]));
  $('#place-grid').innerHTML=regions.map(region=>
    '<article class="place-card"><div class="place-head"><span class="tool-icon">'+icon('pin')+'</span><h3>'+esc(regionLabel(region))+'</h3>'+
    '<button type="button" class="place-link" data-quick="district" data-value="'+esc(region)+'" aria-label="'+esc(regionLabel(region))+' boýunça gözle">'+icon('arrow')+'</button></div><div class="place-tags">'+
    locations[region].map(name=>'<button type="button" data-quick="district" data-value="'+esc(name)+'">'+esc(name)+'</button>').join('')+'</div></article>'
  ).join('');
}
function map(place=state.filters.location||''){
  const selection=parsePlace(place);
  const active=selection.region;
  const mapFilters={...state.filters,location:selection.location||''};
  const list=state.listings.filter(item=>item.active).filter(item=>matches(item,mapFilters));
  const chips=(names,selected,className='place-tags')=>'<div class="'+className+'">'+names.map(name=>btn(esc(regions.includes(name)?regionLabel(name):name),'map',name===selected?'selected':'','data-place="'+esc(name)+'" aria-pressed="'+(name===selected)+'"')).join('')+'</div>';
  modal('Türkmenistanyň emläk kartasy','<div class="stack"><div class="map-shell"><canvas aria-label="Türkmenistanyň bäş welaýaty we Aşgabat şäheri"></canvas></div>'+
    chips(regions,active,'place-tags map-regions')+
    (active?chips(locations[active],selection.location):'')+
    '<div class="map-summary"><strong>'+list.length+' bildiriş</strong>'+btn('Netijelere geç','map-results','text-btn','data-place="'+esc(selection.location||'')+'"')+'</div>'+
    (list.length?list.slice(0,8).map(item=>record(btn(esc(item.title),'details','text-btn','data-id="'+item.id+'"')+' · '+esc(displayPlace(item)))).join(''):empty('Bu ýere gabat gelýän bildiriş ýok.'))+
    '<p class="notice">Karta welaýatlary we Aşgabat şäherini görkezýär. <a class="map-credit" href="https://www.geoboundaries.org/" target="_blank" rel="noopener noreferrer">geoBoundaries</a></p></div>');
  drawMap($('#dialog canvas'),active,region=>map(region)).catch(()=>{
    const shell=$('#dialog .map-shell');
    if(shell) shell.innerHTML=empty('Kartany ýükläp bolmady. Ýeri aşakdaky sanawdan saýlap bilersiňiz.');
  });
}
const suggestions=['Aşgabatda 3 otagly satylýan kwartira','Maryda 3000 TMT çenli kärende','Lebapda awtoulag duralgaly ofis'];
let assistantFilters=null;
let assistantHistory=[];
let assistantController=null;
let assistantSession=0;
async function assistant(){
  assistantController?.abort();
  assistantSession++;
  const session=assistantSession;
  assistantFilters=null;
  assistantHistory=[];
  modal('Salgy kömekçi','<div class="stack"><p class="notice" id="assistant-status">Hyzmat barlanýar…</p><div class="place-tags prompts">'+suggestions.map((query,index)=>btn(esc(query),'assistant-prompt','','data-index="'+index+'"')).join('')+'</div>'+
    '<div id="assistant-conversation" class="assistant-conversation" aria-live="polite"></div>'+
    form('assistant',area('Soragyňyz ýa-da emläk islegiňiz','query','','required maxlength="800" rows="3" placeholder="Meselem, Aşgabatda iki otagly kärende öý gözleýärin"')+submit('Iber'))+
    '<div id="assistant-answer" aria-live="polite"></div></div>');
  try{
    const status=await api('assistant-status');
    const el=$('#assistant-status');
    if(el&&assistantSession===session)el.textContent=status.configured?'Türkmençe ýa-da iňlisçe emläk islegiňizi ýazyň.':'Ýeri, otag sanyny we býujeti ýazyp gözläň. Kömekçi sözleri gözleg süzgüçlerine öwürýär.';
  }catch{
    const el=$('#assistant-status');
    if(el&&assistantSession===session)el.textContent='Hyzmata birigip bolmady. Ýönekeý emläk gözlegi elýeterli.';
  }
}
async function suggestSearch(query){
  query=query.trim();
  if(!query)return;
  assistantController?.abort();
  const controller=new AbortController();
  assistantController=controller;
  const session=assistantSession;
  const target=$('#assistant-answer');
  if(!target)return;
  assistantFilters=null;
  target.innerHTML='<p class="notice" role="status">Soragyňyz işlenýär…</p>';
  const formEl=$('[data-form="assistant"]');
  const submitButton=formEl.querySelector('button[type="submit"]');
  submitButton.disabled=true;
  let filters=parseRequest(query), reply='', notice='';
  const timeout=setTimeout(()=>controller.abort(),25000);
  try{
    const response=await fetch('/api/assistant',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query,history:assistantHistory.slice(-6)}),signal:controller.signal
    });
    const result=await response.json();
    if(response.ok){
      filters=result.filters||{};
      reply=typeof result.reply==='string'?result.reply:'';
      assistantHistory.push({role:'user',content:query},{role:'assistant',content:reply});
    }else{
      notice=result.error||'Gözlegi ýerine ýetirip bolmady. Ýönekeý gözlegi ulanyp bilersiňiz.';
    }
  }catch{
    notice='Jogaby alyp bolmady. Ýönekeý gözlegiň netijesi aşakda.';
  }finally{
    clearTimeout(timeout);
    if(assistantController===controller)submitButton.disabled=false;
  }
  if(!target.isConnected||!$('#dialog').open||session!==assistantSession||assistantController!==controller)return;
  const tags=[
    filters.location&&(regions.includes(filters.location)?regionLabel(filters.location):filters.location),
    filters.mode&&modes[filters.mode],filters.type&&types[filters.type],filters.rooms&&'Azyndan '+filters.rooms+' otag',
    filters.max&&money(filters.max)+' çenli',filters.minArea&&filters.minArea+' m² we ondan uly',
    ...(filters.features||[]).map(key=>amenities[key])
  ].filter(Boolean);
  assistantFilters=tags.length?filters:null;
  const inventory=state.listings.filter(item=>item.active);
  const results=inventory.filter(item=>matches(item,filters));
  const transcript=$('#assistant-conversation');
  const bubble=document.createElement('p');
  bubble.className='assistant-user';
  bubble.textContent=query;
  transcript.append(bubble);
  if(!reply&&!tags.length){
    reply=/^(salam|hello|hi|salom|привет)[!,.\s]*$/i.test(query)?'Salam! Haýsy şäherden ýa-da welaýatdan öý gözleýärsiňiz? Satyn almak isleýärsiňizmi ýa-da kärendesine almak?':'Ýeri, otag sanyny we býujeti ýazyp görüň. Meselem, «Aşgabatda iki otagly kärende kwartira, 3000 manat çenli».';
  }
  if(reply){
    const answer=document.createElement('p');
    answer.className='assistant-reply';
    answer.textContent=reply;
    transcript.append(answer);
  }
  transcript.scrollTop=transcript.scrollHeight;
  formEl.elements.query.value='';
  target.innerHTML='<div class="assistant-answer">'+(notice?'<p class="notice">'+esc(notice)+'</p>':'')+
    (tags.length?'<div class="place-tags">'+tags.map(tag=>'<span>'+esc(tag)+'</span>').join('')+'</div>'+
      '<p>'+results.length+' '+'bildiriş'+' gabat gelýär.</p>'+
      (results.length?results.slice(0,3).map(item=>record(btn(esc(item.title),'details','text-btn','data-id="'+item.id+'"')+' · '+money(item.price))).join(''):empty('Bu talaplara laýyk bildiriş tapylmady. Ýeri ýa-da býujeti üýtgedip görüň.'))+
      btn('Gözleg netijelerine geç','assistant-apply','btn'):'')+'</div>';
}
function compare(){
  const list=[...state.compare].map(get).filter(Boolean);
  if(!list.length){modal('Emläkleri deňeşdir',empty('Deňeşdirmek isleýän emläkleriňizi bildirişlerden saýlaň.'));return;}
  const row=(label,value)=>'<tr><th scope="row">'+label+'</th>'+list.map(item=>'<td>'+esc(value(item))+'</td>').join('')+'</tr>';
  modal('Emläkleri deňeşdir','<div class="table-scroll"><table><thead><tr><th>Emläk</th>'+list.map(item=>'<th scope="col">'+btn(esc(item.title),'details','text-btn','data-id="'+item.id+'"')+'</th>').join('')+'</tr></thead><tbody>'+row('Geleşik',x=>modes[x.mode])+row('Baha',x=>money(x.price)+(x.mode==='rent'?' / aý':''))+row('Meýdan',x=>x.area+' m²')+row('Otag',x=>x.rooms)+row('Ýerleşýän ýeri',displayPlace)+row('Görnüş',x=>types[x.type])+'</tbody></table></div>');
}
const checklist = ['Täze jaýyň ölçeglerini barla','Göçüş senesini kesgitle','Ulag sargyt et','Salgynyň üýtgändigini habar ber','Kommunal hyzmatlaryň görkezijilerini ýaz','Açarlary tabşyr'];
const workspaceTabs={overview:'Umumy',saved:'Halanlarym',searches:'Gözlegler',owned:'Bildirişlerim',inbox:'Hatlar',profile:'Profil'};
const savedAction=(label,kind,id)=>btn(label,'remove-record','text-btn','data-kind="'+kind+'" data-id="'+id+'"');
function workspace(tab='overview'){
  if(!needAccount())return;
  let body='';
  const owned=state.listings.filter(item=>item.owned);
  if(tab==='overview'){
    const name=entries('profile')[0]?.data?.name;
    const summaries=[
      ['owned','building',owned.length,'Bildirişlerim'],
      ['inbox','bell',state.inquiries.length,'Hatlar'],
      ['saved','heart',entries('favorite').filter(({id})=>get(id)).length,'Halanlarym'],
      ['searches','search',entries('search').length,'Saklanan gözlegler']
    ];
    body='<div class="account-overview"><h3>'+esc(name?'Salam, '+name+'!':'Şahsy otagyňyza hoş geldiňiz!')+'</h3>'+
      '<div class="account-grid">'+summaries.map(([key,symbol,count,label])=>
        btn('<span class="tool-icon">'+icon(symbol)+'</span><strong>'+count+'</strong><span>'+label+'</span>','workspace','account-summary','data-tab="'+key+'"')
      ).join('')+'</div><div class="row">'+btn('Profili üýtget','workspace','outline','data-tab="profile"')+btn('Bildiriş goş','publish','btn')+btn('Hasapdan çyk','logout','text-btn')+'</div></div>';
  }else if(tab==='saved'){
    body=entries('favorite').map(({id})=>get(id)).filter(Boolean).map(item=>record(btn(esc(item.title),'details','text-btn','data-id="'+item.id+'"')+' · '+money(item.price)+' '+savedAction('Aýyr','favorite',item.id))).join('')||empty('Halan emläkleriňizi ýürek nyşany bilen saklaň.');
  }else if(tab==='searches'){
    body=entries('search').map(({id,data})=>{
      const matchesNow=state.listings.filter(item=>item.active&&matches(item,data.filters));
      const newer=matchesNow.filter(item=>item.created>data.created).length;
      return record('<strong>'+esc(data.title)+'</strong><p>'+matchesNow.length+' işjeň laýyk bildiriş'+(newer?' · '+newer+' täze':'')+'</p><div class="row">'+btn('Netijeler','run-saved','outline','data-id="'+id+'"')+savedAction('Aýyr','search',id)+'</div>');
    }).join('')||empty('Gözleg süzgüçlerini saklaň. Täze laýyk bildirişleri şu ýerden görersiňiz.');
    body+=btn('Isleg sanawyna goş','save-search');
  }else if(tab==='owned'){
    body=owned.map(item=>record('<strong>'+esc(item.title)+'</strong><p>'+(item.active?'Işjeň':'Arhiwde')+' · '+money(item.price)+'</p><div class="row">'+btn('Üýtget','publish','outline','data-id="'+item.id+'"')+btn(item.active?'Arhiwle':'Gaýtadan işjeňleşdir','toggle-listing','outline','data-id="'+item.id+'"')+'</div>')).join('')||empty('Siziň emläk bildirişiňiz entek ýok.');
    body+=btn('Bildiriş goş','publish','btn');
  }else if(tab==='inbox'){
    body=state.inquiries.map(item=>record('<strong>'+esc(item.title)+'</strong><p>'+esc(item.name)+' · '+new Date(item.created).toLocaleDateString()+'</p><p>'+esc(item.message)+'</p>'+(item.visit?'<p><time datetime="'+esc(item.visit)+'">'+esc(item.visit)+'</time></p>':'')+'<p>'+esc(item.email)+'</p>'+ (item.incoming?btn('Jogap ýaz','reply','outline','data-id="'+item.id+'"'):'') )).join('')||empty('Gelýän we iberen ýüz tutmalaryňyz şu ýerde görkeziler.');
  }else{
    const data=entries('profile')[0]?.data||{};
    body=form('profile',input('Adyňyz','name',data.name,'required maxlength="80"')+
      input('Telefon (islege görä)','phone',data.phone,'type="tel" maxlength="30"')+
      area('Ýaşaýyş jaýy boýunça islegleriňiz','about',data.about,'maxlength="800"')+submit('Profili sakla'));
  }
  modal(tab==='saved'?'Halanlarym':'Şahsy otagym','<div class="tabs">'+Object.entries(workspaceTabs).map(([key,label])=>btn(label,'workspace','','data-tab="'+key+'" aria-pressed="'+(key===tab)+'"')).join('')+'</div><div class="panel-list">'+body+'</div>');
}
function saveSearch(){
  if(!needAccount())return;
  const name=[state.filters.location,state.filters.mode&&modes[state.filters.mode],state.filters.type&&types[state.filters.type]].filter(Boolean).join(' · ')||'Aşgabat';
  modal('Gözlegi sakla',form('save-search',input('Gözlegiň ady','title',name,'required maxlength="80"')+
    empty('Bu gözlege laýyk täze bildirişleri şahsy otagyňyzda görüp bilersiňiz.')+submit('Sakla')));
}
function contact(id,reply){
  if(!needAccount())return;
  const target=reply?state.inquiries.find(item=>item.id===id&&item.incoming):get(id);
  if(!target)return;
  const profile=entries('profile')[0]?.data||{};
  modal(reply?'Ýüz tutma jogap ber':'Emläk barada ýüz tut',form(reply?'reply':'contact',
    '<input type="hidden" name="id" value="'+id+'">'+input('Adyňyz','name',profile.name,'required maxlength="80"')+
    (!reply?input('Görmek isleýän senäňiz (islege görä)','visit','','type="date"'):'')+
    area('Hatyňyz','message','','required maxlength="1800"')+submit('Iber')));
}
function calculator(kind){
  if(kind==='finance'){
    modal('Karz hasaplaýjysy',form(kind,input('Emlägiň bahasy (TMT)','price','','type="number" min="1" max="1000000000" required')+
      '<div class="three">'+input('Ilkinji töleg (TMT)','deposit','','type="number" min="0" required')+input('Ýyllyk göterim (%)','rate','','type="number" min="0" max="100" step="any" required')+input('Möhlet (ýyl)','years','','type="number" min="1" max="50" required')+'</div>'+
      empty('Hasaplama deň aýlyk töleglere esaslanýar. Bank ýygymlary bu hasaba girizilmeýär.')+submit('Hasapla')+'<output class="calc-result" hidden></output>'));
  }else{
    modal('Emlägiň bahasyny hasapla',form(kind,input('Emlägiň meýdany (m²)','area','','type="number" min="1" max="1000000" step="any" required')+
      input('Saýlan nyrhyňyz (TMT/m²)','unit','','type="number" min="1" max="1000000000" step="any" required')+empty('Saýlan nyrhyňyz boýunça ugur görkeziji hasaplama.')+submit('Hasapla')+'<output class="calc-result" hidden></output>'));
  }
}
function agents(query=''){
  const list=state.agents.filter(item=>[item.name,item.agency,displayPlace(item)].some(value=>value.toLocaleLowerCase('tk').includes(query.toLocaleLowerCase('tk'))));
  modal('Emläk araçylary','<div class="stack">'+form('find-agent',input('Ady, edarasy ýa-da etraby','query',query,'maxlength="80"')+submit('Gözle'))+
    (list.map(item=>record('<strong>'+esc(item.name)+'</strong><p>'+esc(item.agency)+' · '+esc(displayPlace(item))+'</p><p>'+esc(item.about)+'</p><a class="text-btn" href="tel:'+esc(item.phone.replace(/[^+\d]/g,''))+'">'+esc(item.phone)+'</a>')).join('')||empty('Bu gözlege laýyk emläk hünärmeni tapylmady.'))+
    btn('Hünärmen profilini goş','agent-profile')+'</div>');
}
function agentProfile(){
  if(!needAccount())return;
  const data=state.agents.find(item=>item.owned)||{};
  modal('Hünärmen profili',form('agent',input('Adyňyz','name',data.name,'required maxlength="80"')+
    input('Edaranyň ady','agency',data.agency,'required maxlength="80"')+'<div class="two">'+placeFields(data)+'</div>'+
    input('Habarlaşmak üçin telefon','phone',data.phone,'required type="tel" maxlength="30"')+area('Hyzmatlaryňyz','about',data.about,'required maxlength="800"')+submit('Profili ýerleşdir')));
}
function moving(){
  if(!needAccount())return;
  const checked=entries('checklist')[0]?.data?.checked||[];
  modal('Göçmek meýilnamasy',form('checklist',checklist.map((task,index)=>checkbox(task,'checked',index,checked.includes(String(index)))).join('')+submit('Meýilnamany sakla')));
}
async function photos(files){
  if(files.length>3) throw new Error('Iň köp üç surat saýlaň.');
  return Promise.all(files.map(async file=>{
    if(file.size>15*1024*1024) throw new Error('Her surat 15 MB-dan kiçi bolmaly.');
    let image;
    try { image=await createImageBitmap(file); } catch { throw new Error('Suraty okap bolmady. JPEG, PNG ýa-da WebP ulanyň.'); }
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,1100/Math.max(image.width,image.height));
    canvas.width=Math.max(1,Math.round(image.width*scale)); canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    image.close();
    const data=canvas.toDataURL('image/jpeg',.74);
    if(data.length>530000) throw new Error('Surat örän uly. Has kiçi surat saýlaň.');
    return data;
  }));
}
const close=()=>$('#dialog').close();
function search(filters){
  state.filters=filters; state.searched=true;
  mode(filters.mode||'');
  const searchForm=$('#search');
  searchForm.elements.location.value=filters.location||'';
  searchForm.elements.max.value=filters.max||'';
  searchForm.elements.type.value=filters.type||'';
  if(searchForm.elements.type.selectedIndex<0){searchForm.elements.type.value='';delete state.filters.type;}
  render(); scrollResults();
}
async function action(name,d){
  const id=d.id||'';
  switch(name){
    case 'auth': return auth(d.kind);
    case 'retry': return refresh();
    case 'logout': await api('auth/logout','POST',{}); state.compare.clear(); await refresh(); close(); return;
    case 'filters': return filters();
    case 'map': return map(d.place);
    case 'map-results': close(); return search({...state.filters,location:d.place||''});
    case 'assistant': return assistant();
    case 'assistant-prompt': {
      const query=suggestions[Number(d.index)];
      $('[data-form="assistant"]').elements.query.value=query;
      return suggestSearch(query);
    }
    case 'assistant-apply':
      if(assistantFilters){close();return search(assistantFilters);}
      return;
    case 'details': return details(id);
    case 'gallery': return details(id,Number(d.index));
    case 'compare': return compare();
    case 'reset': $('#search').reset(); return search({});
    case 'workspace': return workspace(d.tab);
    case 'publish': return publish(get(id));
    case 'save-search': return saveSearch();
    case 'valuation': case 'finance': return calculator(name);
    case 'agents': return agents();
    case 'agent-profile': return agentProfile();
    case 'checklist': return moving();
    case 'contact': return contact(id,false);
    case 'reply': return contact(id,true);
    case 'close': return close();
    case 'share': await navigator.clipboard.writeText(location.href); return toast('Baglanyşyk göçürildi.');
    case 'credits': return modal('Suratlaryň çeşmeleri','<div class="stack"><p>Aşgabatdaky ýaşaýyş jaýlarynyň hakyky fotosuratlary.</p><ul><li><a class="text-btn" href="https://commons.wikimedia.org/wiki/File:Apartment_blocks_Ashgabat.jpg">A. Nyýazow şaýoly — Bayram A</a></li><li><a class="text-btn" href="https://commons.wikimedia.org/wiki/File:Ashgabat_apartment_blocks2.jpg">Türkmenbaşy şaýoly — Bayram A</a></li></ul><a class="text-btn" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></div>');
    case 'favorite':
      if(!needAccount())return;
      await api('records/favorite/'+id,favorites().has(id)?'DELETE':'PUT',favorites().has(id)?undefined:{});
      return refresh();
    case 'remove-record': await api('records/'+d.kind+'/'+id,'DELETE'); await refresh(); return workspace(d.kind==='search'?'searches':'saved');
    case 'run-saved': {
      const saved=entries('search').find(item=>item.id===id);
      if(saved){ close(); search(saved.data.filters); } return;
    }
    case 'toggle-listing': await api('listings/'+id+'/status','PUT',{active:!get(id).active}); await refresh(); return workspace('owned');
  }
}
document.addEventListener('click',async event=>{
  const el=event.target.closest('button'); if(!el)return;
  if(el.dataset.mode){
    const data=Object.fromEntries(new FormData($('#search')));
    search({...state.filters,...data,mode:el.dataset.mode});
  }
  if(el.dataset.quick){
    const f=el.dataset.quick==='district'?{location:el.dataset.value}:{rooms:el.dataset.value};
    $('#search').elements.location.value=f.location||'';
    search({...state.filters,...f});
  }
  if(el.dataset.action){
    el.disabled=true;
    try {await action(el.dataset.action,el.dataset);} catch(error){toast(error.message);} finally {el.disabled=false;}
  }
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.name==='region'&&el.form?.elements.district){
    el.form.elements.district.innerHTML=options(locations[el.value].map(name=>[name,name]));
  }
  if(el.id==='sort'){state.sort=el.value; render();}
  if(el.name==='compare'){
    if(!el.checked) state.compare.delete(el.value);
    else if(state.compare.size<4) state.compare.add(el.value);
    else {el.checked=false;toast('Bir gezekde dört emlägi deňeşdirip bolýar.');}
    $('#comparison-count').textContent=state.compare.size?'('+state.compare.size+')':'';
  }
});
$('#dialog').addEventListener('close',()=>{
  assistantController?.abort();
  if(location.hash.startsWith('#emlak-')) history.replaceState(null,'',location.pathname+location.search);
});
$('#search').addEventListener('submit',event=>{
  event.preventDefault(); search({...state.filters,...Object.fromEntries(new FormData(event.target)),mode:state.mode});
});
document.addEventListener('submit',async event=>{
  const element=event.target;
  const kind=element.dataset.form;
  if(!kind)return;
  event.preventDefault();
  const data=new FormData(element), values=Object.fromEntries(data), button=element.querySelector('button[type=submit]');
  button.disabled=true;
  try{
    if(kind==='login'||kind==='register'){
      await api('auth/'+kind,'POST',values);
      await refresh(); workspace('overview'); return;
    }
    if(kind==='assistant'){
      await suggestSearch(values.query); return;
    }
    if(kind==='filters'){
      if(values.max&&Number(values.min)>Number(values.max)) throw new Error('Iň pes baha iň ýokary bahadan uly bolup bilmez.');
      close(); search({...values,features:data.getAll('features')}); return;
    }
    if(kind==='finance'||kind==='valuation'){
      const output=element.querySelector('output');
      if(kind==='finance'){
        const principal=Number(values.price)-Number(values.deposit);
        if(principal<0)throw new Error('Ilkinji töleg emlägiň bahasyndan uly bolup bilmez.');
        const rate=Number(values.rate)/1200, n=Number(values.years)*12;
        const monthly=rate===0?principal/n:principal*rate/(-Math.expm1(-n*Math.log1p(rate)));
        output.innerHTML='<strong>'+money(monthly)+' / aý</strong><br>Karz boýunça jemi '+money(monthly*n)+'<br>Göterim boýunça jemi '+money(monthly*n-principal);
      }else{
        output.textContent='Çak edilýän baha · '+money(Number(values.area)*Number(values.unit));
      }
      output.hidden=false; return;
    }
    if(kind==='find-agent'){agents(values.query);return;}
    if(kind==='publish'){
      const files=data.getAll('photos').filter(file=>file.size>0);
      const payload={...values,features:data.getAll('features'),photos:await photos(files)};
      await api(values.id?'listings/'+values.id:'listings',values.id?'PUT':'POST',payload);
      await refresh(); workspace('owned'); toast('Bildiriş saklandy.'); return;
    }
    if(kind==='save-search'){
      await api('records/search/'+crypto.randomUUID(),'PUT',{title:values.title,filters:state.filters,created:Date.now()});
      await refresh(); workspace('searches'); return;
    }
    if(kind==='contact'||kind==='reply'){
      await api('inquiries/'+values.id+(kind==='reply'?'/reply':''),'POST',values);
      await refresh(); workspace('inbox'); toast('Hat iberildi.'); return;
    }
    if(kind==='agent'){
      await api('agent','PUT',values); await refresh(); agents(); return;
    }
    if(kind==='checklist'||kind==='profile'){
      await api('records/'+kind+'/main','PUT',kind==='checklist'?{checked:data.getAll('checked')}:values);
      await refresh(); toast('Saklandy.');
    }
  }catch(error){toast(error.message);}finally{button.disabled=false;}
});
mode('buy'); drawPlaces(); render();
refresh().catch(()=>{
  $('#result-note').textContent='Serwere birigip bolmady.';
  $('#result-grid').innerHTML='<div class="empty"><h3>Bildirişleri ýükläp bolmady</h3><p>Internet birikmäňizi barlaň we täzeden synanyşyň.</p>'+btn('Täzeden synanyş','retry','outline')+'</div>';
}).finally(()=>{
  if(location.hash.startsWith('#emlak-')) details(location.hash.slice(7));
});
