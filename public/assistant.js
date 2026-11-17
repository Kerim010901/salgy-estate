import locations from './locations.js';

export const regionOf = district => Object.keys(locations).find(region=>locations[region].includes(district));
export const regionLabel = region => region==='Aşgabat'?region:region+' welaýaty';
export const locationKey = text => String(text??'').toLocaleLowerCase('tk').replace(/[äçňöşüýž]/g,letter=>({ä:'a',ç:'c',ň:'n',ö:'o',ş:'s',ü:'u',ý:'y',ž:'z'}[letter])).trim();
const aliases = {
  Aşgabat:['ashgabat','ashkhabad'], Daşoguz:['dashoguz'], Ahal:['akhal'],
  'Türkmenabat şäheri':['turkmenabat','turkmenabad'], 'Türkmenbaşy şäheri':['turkmenbashy','turkmenbashi'],
  'Balkanabat şäheri':['balkanabat'], 'Mary şäheri':['mary city'],
  'Daşoguz şäheri':['dashoguz city'], 'Baýramaly şäheri':['bayramaly']
};
const known = Object.entries(locations).flatMap(([region,areas])=>[
  ...areas.map(district=>[district,region,true]),
  [region,region,false]
]);
export function parsePlace(query) {
  const text=locationKey(query);
  const place=known.filter(([name])=>
    [name,...(aliases[name]||[])].some(term=>{
      const key=locationKey(term).replace(/ seheri$/,'');
      const suffix=name==='Mary şäheri'||name==='Daşoguz şäheri'?'':'(?:da|de|nda|nde|dan|den|daky|daki)?';
      const actual=name==='Mary şäheri'||name==='Daşoguz şäheri'?locationKey(term):key;
      return new RegExp('(?:^|[^a-z0-9])'+actual+suffix+'(?:$|[^a-z0-9])').test(text);
    })
  ).sort((a,b)=>Number(b[2])-Number(a[2])||b[0].length-a[0].length)[0];
  return place?{location:place[0],region:place[1]}:{};
}
const patternGroups = {
  mode: {rent:/karend|arend|kirey|kire|\brent\w*\b|ayyna|per month/,buy:/satyn|satyl|satylyk|\bbuy\b|for sale|purchase/,commercial:/tajircilik|commercial|retail space/},
  type:{apartment:/kwartir|kvartir|kwatir|apartment|\bflat\b/,house:/yasayys jay|hususy jay|howly|\boy\b|\bjay\b|\bhouse\b|\bvilla\b/,office:/\bofis\w*|\boffice\w*/,land:/yer boleg|yer meydan|\bland\b|\bplot\b/,warehouse:/ammar|warehouse/,retail:/sowda meydan|retail/,room:/ayratyn otag|private room/},
  feature:{balcony:/balkon|balcony/,parking:/duralga|parking/,furnished:/mebelli|furnished/,elevator:/\blift\w*|elevator/,terrace:/eywan|terrace/,short:/gysga mohlet|short.term/}
};
function amount(raw,unit) {
  const compact=raw.replace(/\s/g,'');
  const numeric=/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)?compact.replace(/[.,]/g,''):compact.replace(',','.');
  return Number(numeric)*({mun:1000,thousand:1000,k:1000,million:1e6,mln:1e6,m:1e6}[unit]||1);
}
export function parseRequest(query) {
  const numberWords={bir:1,iki:2,uc:3,dort:4,bas:5,alty:6,yedi:7,sekiz:8,dokuz:9};
  const text=locationKey(query).replace(/\b(bir|iki|uc|dort|bas|alty|yedi|sekiz|dokuz)(?=\s+otag)/g,word=>numberWords[word]);
  const filters={...parsePlace(query)};
  for(const group of ['mode','type']){
    const first=Object.entries(patternGroups[group]).find(([,pattern])=>pattern.test(text));
    if(first)filters[group]=first[0];
  }
  if(!filters.mode&&['office','warehouse','retail'].includes(filters.type))filters.mode='commercial';
  const features=Object.entries(patternGroups.feature).filter(([,pattern])=>{
    const match=text.match(pattern);
    if(!match)return false;
    const after=text.slice(match.index+match[0].length,match.index+match[0].length+22);
    const before=text.slice(Math.max(0,match.index-12),match.index);
    return !/^(?:\w*)?\s*(?:dal|yok|bolmasyn|gerek dal)/.test(after)&&!/(?:without|no)\s*$/.test(before);
  }).map(([key])=>key);
  if(features.length)filters.features=features;
  const rooms=text.match(/\b(\d{1,2})\s*[- ]?\s*(?:otag|bedroom|bed\b|room)/);
  if(rooms&&+rooms[1]>0)filters.rooms=+rooms[1];
  const area=text.match(/\b(\d{1,5})\s*(?:m²|m2|sqm|sq\.?\s*m)\b|\b(\d{1,5})\s*m²/);
  if(area)filters.minArea=Number(area[1]||area[2]);
  const budget=text.match(/(\d{1,3}(?:[ ,.]\d{3})+|\d+(?:[.,]\d+)?)\s*(mun|thousand|million|mln|k|m)?\s*(?:tmt|manat)\b/)||
    text.match(/(?:under|up to|max\.?|budget|cenli|baha)\s*(\d{1,3}(?:[ ,.]\d{3})+|\d+(?:[.,]\d+)?)\s*(mun|thousand|million|mln|k\b|m\b)?/)||
    text.match(/(\d{1,3}(?:[ ,.]\d{3})+|\d+(?:[.,]\d+)?)\s*(mun|thousand|million|mln|k\b|m\b)?\s*(?:cenli|gymmat dal)\b/);
  if(budget){
    const max=amount(budget[1],budget[2]);
    if(max>0&&max<=1e9) filters.max=max;
  }
  return filters;
}

