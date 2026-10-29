(() => {
  'use strict';
  const el = (id) => document.getElementById(id);
  let token = '', permission = 'schedule_read';
  const today = new Date(), plus = new Date(today.getTime() + 30 * 86400000);
  const iso = (d) => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  el('opsFrom').value=iso(today);el('opsTo').value=iso(plus);
  const msg = (t) => { el('opsResult').textContent = t; };
  async function api(path,method='GET',body=null){
    if (!token) throw Error('먼저 담당자 키를 연결해주세요.');
    const res = await fetch(path, {method,cache:'no-store',headers:{'Authorization':'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json','X-Medipick-Clinic':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const d=await res.json();if(!res.ok)throw Error(d.error||'요청 실패');return d;
  }
  async function connect(){
    token=el('opsKey').value.trim();el('opsKey').value='';
    try{const p=await api('/api/clinic/profile');permission=p.permission;
      el('opsProfile').textContent=p.provider.name+' · '+(permission==='schedule_manage'?'예약관리':'조회 전용')+' · 만료 '+p.expires_at.slice(0,10);
      await refresh();msg('해당 병원 일정만 표시됩니다.');
    }catch(err){token='';el('opsProfile').textContent='접근키를 확인해주세요.';msg(err.message);}
  }
  function stat(label,val){const b=document.createElement('div');b.className='op-stat';b.textContent=label;const n=document.createElement('b');n.textContent=val;b.append(n);return b;}
  async function refresh(){
    try{let d=await api('/api/clinic/dashboard'), node=el('opsStats');node.replaceChildren(
      stat('접수 요청',d.status_counts.requested||0),stat('확정',d.status_counts.confirmed||0),stat('완료',d.status_counts.completed||0),stat('알림 대기',d.pending_notifications||0));
      await load();
    }catch(err){msg(err.message);}
  }
  const states={requested:'접수 요청',confirmed:'확정',declined:'거절',cancelled:'취소',completed:'완료'};
  async function change(id,status){
    if(permission!=='schedule_manage')return msg('조회 전용 계정은 예약 상태를 변경할 수 없습니다.');
    if(!window.confirm('예약 상태를 '+states[status]+'(으)로 변경할까요?'))return;
    try{let d=await api('/api/clinic/appointments/'+id+'/status','POST',{status});msg('상태: '+states[d.status]+' · 알림은 현재 발송되지 않습니다.');await refresh();}
    catch(err){msg(err.message);}
  }
  async function load(){
    const from=el('opsFrom').value,to=el('opsTo').value;
    try{const d=await api('/api/clinic/schedule?'+new URLSearchParams({from,to}));const root=el('opsSchedule');root.replaceChildren();
      if(!d.events.length){const empty=document.createElement('p');empty.className='op-empty';empty.textContent='선택한 기간에 예약이 없습니다.';root.append(empty);return;}
      for(const ev of d.events){
        let item=document.createElement('article');item.className='op-item';
        let text=document.createElement('div'), title=document.createElement('strong');title.textContent=ev.date+'  '+ev.time+' · '+ev.title;
        let badge=document.createElement('small');badge.textContent='상태: '+(states[ev.status]||ev.status)+' · 요청번호 '+ev.public_id;text.append(title,badge);item.append(text);
        let actions=document.createElement('div');actions.className='op-actions';
        let statuses=ev.status==='requested'?['confirmed','declined']:ev.status==='confirmed'?['completed','cancelled']:[];
        if(permission==='schedule_manage')for(const s of statuses){let b=document.createElement('button');b.textContent=states[s];if(s!=='confirmed')b.className='secondary';b.addEventListener('click',()=>change(ev.id,s));actions.append(b);}
        if(!statuses.length){let status=document.createElement('span');status.className='op-tag';status.textContent=states[ev.status]||ev.status;actions.append(status)}
        item.append(actions);root.append(item);
      }
    }catch(err){msg(err.message);}
  }
  el('opsConnect').addEventListener('click',connect);el('opsRefresh').addEventListener('click',refresh);el('opsLoad').addEventListener('click',load);
})();
