import {allowRequest,isHiraConfigured,queryHira} from '@/lib/medipick/hira-client';
export const runtime='nodejs';
export const maxDuration=25;
export const preferredRegion='icn1';
export const dynamic='force-dynamic';
function roadKey(address:string):string {
 const normalized=address.normalize('NFKC').replace(/\([^)]*\)/g,' ');
 const m=normalized.match(/([가-힣0-9]+(?:대로|로|길))\s*(\d+(?:-\d+)?)/);
 return m?(m[1]+' '+m[2]).replace(/\s+/g,' ').trim():'';
}
export async function GET(request:Request){
 const ip=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 if(!allowRequest('hira-resolve:'+ip)){
  return Response.json({ok:false,code:'RATE_LIMIT',message:'요청이 많습니다.'},{status:429,headers:{'Cache-Control':'no-store'}});
 }
 if(!isHiraConfigured()){
  return Response.json({ok:false,code:'NOT_CONFIGURED',message:'HIRA 공식 검색 API 연결 확인 필요'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
 const params=new URL(request.url).searchParams;
 const name=(params.get('name')||'').trim().slice(0,100);
 const address=(params.get('address')||'').trim().slice(0,250);
 const road=roadKey(address);
 if(name.length<2||!road)return Response.json({ok:false,code:'NAME_ADDRESS_REQUIRED',message:'병원명과 대조할 도로명주소가 필요합니다.'},{status:400,headers:{'Cache-Control':'no-store'}});
 const result=await queryHira({q:name,pageNo:1,numOfRows:30});
 if(!result.ok)return Response.json({ok:false,code:result.code,message:result.message},{status:502,headers:{'Cache-Control':'no-store'}});
 const matches=result.items.filter(x=>x.name.normalize('NFKC').replace(/\s/g,'')===name.normalize('NFKC').replace(/\s/g,'')&&roadKey(x.address)===road);
 return Response.json({ok:true,matched:matches.length===1,match:matches.length===1?matches[0]:null,
  checkedAt:result.checkedAt,source:'HIRA 병원정보서비스',message:matches.length===1?'병원명과 도로명주소가 일치했습니다.':'병원명·주소가 동일한 HIRA 기관을 확인하지 못했습니다.'},
  {headers:{'Cache-Control':'public,s-maxage=300,stale-while-revalidate=300'}});
}
