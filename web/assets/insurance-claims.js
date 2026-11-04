(function () {
  'use strict';
  const $=(s)=>document.querySelector(s);
  const $$=(s)=>[...document.querySelectorAll(s)];
  const patient=$('#mpPatientClaims');
  const clinic=$('#mpClinicClaims');
  const view=(mode)=>{
    const isClinic=mode==='clinic';
    if(patient)patient.hidden=isClinic;
    if(clinic)clinic.hidden=!isClinic;
    $$('[data-claim-view]').forEach((b)=>{
      const selected=b.dataset.claimView===(isClinic?'clinic':'patient');
      b.classList.toggle('active',selected);
      b.setAttribute('aria-selected',String(selected));
    });
    const url=new URL(location.href);
    if(isClinic)url.searchParams.set('mode','clinic');
    else url.searchParams.delete('mode');
    history.replaceState(null,'',url.pathname+url.search);
  };
  $$('[data-claim-view]').forEach((b)=>b.addEventListener('click',()=>view(b.dataset.claimView)));
  const boxes=$$('#mpPatientChecklist input[type="checkbox"]');
  const progress=()=>{
    const count=boxes.filter((b)=>b.checked).length;
    const el=$('#mpChecklistProgress');
    if(el)el.textContent=count+' / '+boxes.length+' 확인 · 공식 청구는 별도 진행';
  };
  boxes.forEach((box)=>box.addEventListener('change',progress));
  $('#mpChecklistReset')?.addEventListener('click',()=>{
    boxes.forEach((box)=>{box.checked=false;});progress();
  });
  view(new URLSearchParams(location.search).get('mode')==='clinic'?'clinic':'patient');
  progress();
})();
