/* HIRA Hospital Info v2 — fixed official endpoint; server-only credential.
   Source: https://www.data.go.kr/data/15001698/openapi.do
   Never log, echo, store or export the credential or full upstream URL. */
export type HiraHospital = {
  id:string; name:string; category:string; address:string; phone:string|null;
  latitude:number|null; longitude:number|null; distanceKm:number|null;
  officialUrl:string|null; source:'HIRA'; coordinateSource:'HIRA_API'|'missing';
};
type Result = {ok:boolean;code:string;message:string;total:number;items:HiraHospital[];checkedAt:string};
const ENDPOINT='https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
const rate=new Map<string,{n:number;t:number}>();
const REQ_LIMIT=12;
export function isHiraConfigured():boolean{return Boolean(process.env.HIRA_HOSPITAL_SERVICE_KEY?.trim());}
export function allowRequest(ip:string):boolean {
 const key=ip.slice(0,100)||'unknown';const now=Date.now();
 if(rate.size>800){for(const [k,v] of rate){if(now-v.t>60000)rate.delete(k);}}
 const v=rate.get(key);
 if(!v||now-v.t>60000){rate.set(key,{n:1,t:now});return true;}
 if(v.n>=REQ_LIMIT)return false;v.n++;return true;
}
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<')
 .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
 .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).trim();
function get(xml:string,name:string):string {
 const re=new RegExp('<(?:[\\w-]+:)?'+name+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?'+name+'>','i');
 return decode(xml.match(re)?.[1]||'');
}
function numberOrNull(v:string):number|null {const n=Number(v);return v.trim()&&Number.isFinite(n)?n:null;}
function haversine(a:number,b:number,c:number,d:number){
 const rad=Math.PI/180;const dl=(c-a)*rad,dx=(d-b)*rad;
 const h=Math.sin(dl/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dx/2)**2;
 return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
function parse(xml:string,origin?:{lat:number;lng:number}):Result{
 const code=get(xml,'resultCode')||get(xml,'returnReasonCode')||'UNKNOWN';
 const responseText=get(xml,'resultMsg')||get(xml,'returnAuthMsg')||get(xml,'errMsg')||'';
 const ok=code==='00'||code==='0'||code==='NORMAL_SERVICE'||code==='NORMAL_CODE';
 const items=Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).slice(0,30).map(m=>{
  const row=m[1],ykiho=get(row,'ykiho'),name=get(row,'yadmNm').slice(0,150);
  const lat=numberOrNull(get(row,'YPos')||get(row,'yPos'));
  const lng=numberOrNull(get(row,'XPos')||get(row,'xPos'));
  const coordinateValid=lat!==null&&lng!==null&&lat>=32&&lat<=39&&lng>=124&&lng<=132;
  const url=get(row,'hospUrl');
  let officialUrl:string|null=null;
  try{const u=new URL(url);if(['http:','https:'].includes(u.protocol))officialUrl=u.toString();}catch{}
  return {
   id:ykiho.slice(0,120),name,category:get(row,'clCdNm')||'의료기관',
   address:get(row,'addr').slice(0,220),phone:get(row,'telno').slice(0,30)||null,
   latitude:coordinateValid?lat:null,longitude:coordinateValid?lng:null,
   distanceKm:coordinateValid&&origin?Number(haversine(origin.lat,origin.lng,lat!,lng!).toFixed(2)):null,
   officialUrl,source:'HIRA' as const,coordinateSource:coordinateValid?'HIRA_API' as const:'missing' as const,
  };
 }).filter(x=>x.name);
 return {ok,code,message:ok?'정상 응답':responseText.slice(0,140)||'HIRA 인증 또는 서버 응답 확인 필요',total:Number(get(xml,'totalCount')||0),items:ok?items:[],checkedAt:new Date().toISOString()};
}
export async function queryHira(opts:{q?:string;lat?:number;lng?:number;radius?:number;pageNo?:number;numOfRows?:number}={}):Promise<Result> {
 const key=process.env.HIRA_HOSPITAL_SERVICE_KEY?.trim();
 if(!key)return {ok:false,code:'NOT_CONFIGURED',message:'서버 환경변수 미설정',total:0,items:[],checkedAt:new Date().toISOString()};
 const u=new URL(ENDPOINT);u.searchParams.set('serviceKey',key);
 u.searchParams.set('pageNo',String(Math.min(5,Math.max(1,Number(opts.pageNo)||1))));
 u.searchParams.set('numOfRows',String(Math.min(30,Math.max(1,Number(opts.numOfRows)||10))));
 const q=(opts.q||'').trim().slice(0,80);if(q)u.searchParams.set('yadmNm',q);
 const lat=opts.lat,lng=opts.lng;
 const point=lat!==undefined&&lng!==undefined&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=32&&lat<=39&&lng>=124&&lng<=132?{lat,lng}:undefined;
 if(point){u.searchParams.set('xPos',String(point.lng));u.searchParams.set('yPos',String(point.lat));u.searchParams.set('radius',String(Math.min(30000,Math.max(500,opts.radius||3000))));}
 try{
  const res=await fetch(u.toString(),{headers:{Accept:'application/xml,text/xml;q=0.9,*/*;q=0.8'},signal:AbortSignal.timeout(17500),cache:'no-store',redirect:'error'});
  const raw=await res.text();
  if(raw.length>1_500_000)return {ok:false,code:'RESPONSE_TOO_LARGE',message:'제공기관 응답 크기 제한',total:0,items:[],checkedAt:new Date().toISOString()};
  const parsed=parse(raw,point);
  if(!res.ok&&parsed.ok){parsed.ok=false;parsed.code='HTTP_'+res.status;parsed.message='제공기관 응답 오류';parsed.items=[];}
  return parsed;
 }catch (error:unknown) {
  // Report a safe failure class only. Never include the fetch URL or raw error/cause,
  // because they may contain the protected ServiceKey query parameter.
  const name=error && typeof error==='object' && 'name' in error ? String((error as {name?:unknown}).name||'') : '';
  const timedOut=name==='TimeoutError'||name==='AbortError';
  return {ok:false,code:timedOut?'HIRA_TIMEOUT':'HIRA_NETWORK_FAILURE',
    message:timedOut?'HIRA 응답 시간 초과. 기관 서비스 상태를 확인해 주세요.':
      'HIRA 서버 연결이 실패했습니다. 정부 API 접근 경로·네트워크 상태를 확인해 주세요.',
    total:0,items:[],checkedAt:new Date().toISOString()};
 }
}

/** HIRA detailed facility data (separate public API from the basic hospital list).
 * Never expose the API credential or treat counts as named physician rosters.
 * Official source: https://www.data.go.kr/data/15001699/openapi.do
 */
export type HiraDepartment={name:string;doctorCount:number|null};
export type HiraSpecialty={name:string;specialistCount:number|null};
export type HiraDetails={
 ok:boolean;code:string;message:string;departments:HiraDepartment[];
 specialties:HiraSpecialty[];physicianNamesAvailable:false;
 checkedAt:string;source:string;officialSourceUrl:string;
};
const DETAIL_ENDPOINT='https://apis.data.go.kr/B551182/MadmDtlInfoService2.8';
export function isHiraDetailsConfigured():boolean {
 return Boolean((process.env.HIRA_DETAIL_SERVICE_KEY||process.env.HIRA_HOSPITAL_SERVICE_KEY||'').trim());
}
function xmlItems(xml:string):string[]{
 return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,60).map(x=>x[1]);
}
function safeCount(value:string):number|null {
 if(!/^\d{1,6}$/.test(value.trim()))return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
}
async function fetchHiraDetailPart(name:'getDgsbjtInfo2.8'|'getSpcSbjtSdrInfo2.8',id:string,key:string){
 const u=new URL(DETAIL_ENDPOINT+'/'+name);
 u.searchParams.set('serviceKey',key);
 u.searchParams.set('ykiho',id);
 u.searchParams.set('pageNo','1');
 u.searchParams.set('numOfRows','60');
 u.searchParams.set('_type','xml');
 const res=await fetch(u.toString(),{headers:{Accept:'application/xml,text/xml;q=0.9'},signal:AbortSignal.timeout(14500),cache:'no-store',redirect:'error'});
 const raw=await res.text();
 if(!res.ok||raw.length>900000)throw Error('UPSTREAM_FAILURE');
 const code=get(raw,'resultCode')||get(raw,'returnReasonCode');
 if(!['00','0','NORMAL_SERVICE','NORMAL_CODE'].includes(code))throw Error(code?'UPSTREAM_RESULT':'INVALID_FORMAT');
 return xmlItems(raw);
}
export async function queryHiraDetails(id:string):Promise<HiraDetails> {
 const source='건강보험심사평가원 의료기관별상세정보서비스';
 const officialSourceUrl='https://www.data.go.kr/data/15001699/openapi.do';
 const checkedAt=new Date().toISOString();
 const empty=(code:string,message:string):HiraDetails=>({ok:false,code,message,departments:[],specialties:[],physicianNamesAvailable:false,checkedAt,source,officialSourceUrl});
 if(!/^[A-Za-z0-9+\/_=-]{16,160}$/.test(id))return empty('INVALID_ID','병원 식별정보가 유효하지 않습니다.');
 const key=(process.env.HIRA_DETAIL_SERVICE_KEY||process.env.HIRA_HOSPITAL_SERVICE_KEY||'').trim();
 if(!key)return empty('NOT_CONFIGURED','HIRA 기관별 상세정보 API 인증이 설정되지 않았습니다.');
 const [departmentsResult,specialtiesResult]=await Promise.allSettled([
   fetchHiraDetailPart('getDgsbjtInfo2.8',id,key),
   fetchHiraDetailPart('getSpcSbjtSdrInfo2.8',id,key)
 ]);
 const dept=departmentsResult.status==='fulfilled'?departmentsResult.value:[];
 const spec=specialtiesResult.status==='fulfilled'?specialtiesResult.value:[];
 if(departmentsResult.status==='rejected' && specialtiesResult.status==='rejected'){
   return empty('DETAIL_UNAVAILABLE','진료과목·전문의 수를 확인하지 못했습니다. 별도 API 이용권한 또는 제공기관 응답을 점검해 주세요.');
 }
 const departments=dept.map(row=>({name:get(row,'dgsbjtCdNm').slice(0,60),doctorCount:safeCount(get(row,'dgsbjtPrSdrCnt'))})).filter(x=>x.name);
 const specialties=spec.map(row=>({name:get(row,'dgsbjtCdNm').slice(0,60),specialistCount:safeCount(get(row,'dtlSdrCnt'))})).filter(x=>x.name);
 return {ok:true,code:'OK',message:departmentsResult.status==='rejected'||specialtiesResult.status==='rejected'?'일부 상세정보만 조회되었습니다.':'공식 상세정보 조회 완료',departments,specialties,physicianNamesAvailable:false,checkedAt:new Date().toISOString(),source,officialSourceUrl};
}
