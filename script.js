// Helpers
function timeToMinutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function minutesToTime(min){ const h=String(Math.floor(min/60)).padStart(2,'0'); const m=String(min%60).padStart(2,'0'); return `${h}:${m}`; }
function range(start,end,step){ const out=[]; for(let v=start; v<end; v+=step) out.push(v); return out; }

// State
const state = {
  members: [],
  palette: ['#7a6ff0','#ffb3c1','#b8f2e1','#ffd6a5','#bde0fe','#cdb4db'],
  dayPlan: {}, // { "540": ["Maxi","Ana"] }
};

// DOM
const teamList = document.getElementById('teamList');
const newMember = document.getElementById('newMember');
const addMemberBtn = document.getElementById('addMember');
const startTime = document.getElementById('startTime');
const endTime = document.getElementById('endTime');
const slotMinutes = document.getElementById('slotMinutes');
const maxConcurrent = document.getElementById('maxConcurrent');
const minGap = document.getElementById('minGap');
const autoPlan = document.getElementById('autoPlan');
const clearPlan = document.getElementById('clearPlan');
const calendarHeader = document.getElementById('calendarHeader');
const calendarGrid = document.getElementById('calendarGrid');
const datePicker = document.getElementById('datePicker');
const saveDay = document.getElementById('saveDay');
const loadDay = document.getElementById('loadDay');
const exportCsv = document.getElementById('exportCsv');

datePicker.valueAsDate = new Date();

// Storage
function storageKey(){ return `breakPlanner:${datePicker.value}`; }
function save(){ localStorage.setItem(storageKey(), JSON.stringify({members:state.members, dayPlan:state.dayPlan, params:params()})); }
function load(){ const data = JSON.parse(localStorage.getItem(storageKey())||'null'); if(!data) return false; state.members=data.members||[]; state.dayPlan=data.dayPlan||{}; setParams(data.params||{}); renderAll(); return true; }
function setParams(p){ if(p.startTime) startTime.value=p.startTime; if(p.endTime) endTime.value=p.endTime; if(p.slotMinutes) slotMinutes.value=p.slotMinutes; if(p.maxConcurrent) maxConcurrent.value=p.maxConcurrent; if(p.minGap) minGap.value=p.minGap; }
function params(){ return { startTime:startTime.value, endTime:endTime.value, slotMinutes:Number(slotMinutes.value), maxConcurrent:Number(maxConcurrent.value), minGap:Number(minGap.value) }; }

// Team
function renderTeam(){
  teamList.innerHTML='';
  state.members.forEach((name, idx)=>{
    const t=document.getElementById('memberTmpl').content.cloneNode(true);
    t.querySelector('.name').textContent=name;
    t.querySelector('.dot').style.background = state.palette[idx%state.palette.length];
    const el=t.querySelector('.member');
    el.querySelector('[data-action="up"]').onclick = ()=>{ if(idx>0){ [state.members[idx-1],state.members[idx]]=[state.members[idx],state.members[idx-1]]; renderAll(); } };
    el.querySelector('[data-action="down"]').onclick = ()=>{ if(idx<state.members.length-1){ [state.members[idx+1],state.members[idx]]=[state.members[idx],state.members[idx+1]]; renderAll(); } };
    el.querySelector('[data-action="remove"]').onclick = ()=>{ state.members.splice(idx,1); removeFromPlan(name); renderAll(); };
    teamList.appendChild(t);
  });
}
addMemberBtn.onclick = ()=>{ const n=newMember.value.trim(); if(!n) return; state.members.push(n); newMember.value=''; renderAll(); };
function removeFromPlan(name){
  for(const k of Object.keys(state.dayPlan)){
    state.dayPlan[k] = state.dayPlan[k].filter(n=>n!==name);
    if(state.dayPlan[k].length===0) delete state.dayPlan[k];
  }
}

// Calendar
function buildSlots(){ const p=params(); return range(timeToMinutes(p.startTime), timeToMinutes(p.endTime), p.slotMinutes); }
function renderCalendarHeader(){
  const slots=buildSlots(); calendarHeader.innerHTML='';
  const label=document.createElement('div'); label.className='cell'; label.textContent='Agente / Hora'; calendarHeader.appendChild(label);
  slots.forEach(min=>{ const c=document.createElement('div'); c.className='cell'; c.textContent=minutesToTime(min); calendarHeader.appendChild(c); });
}
function renderCalendarGrid(){
  const slots=buildSlots(); calendarGrid.innerHTML='';
  state.members.forEach((name, idx)=>{
    const rowLabel=document.createElement('div'); rowLabel.className='row-label'; rowLabel.textContent=name; calendarGrid.appendChild(rowLabel);
    slots.forEach(min=>{
      const key=String(min); const assigned=(state.dayPlan[key]||[]).includes(name);
      const s=document.createElement('div'); s.className='slot';
      if(assigned){
        const b=document.createElement('div'); b.className='badge';
        b.innerHTML=`<span>${minutesToTime(min)} · ${params().slotMinutes}'</span><button class='x' title='Quitar'>✕</button>`;
        b.querySelector('.x').onclick=(e)=>{e.stopPropagation(); toggleAssign(name,min);};
        s.appendChild(b);
      }
      s.onclick=()=> toggleAssign(name,min);
      calendarGrid.appendChild(s);
    });
  });
}
function renderAll(){ renderTeam(); renderCalendarHeader(); renderCalendarGrid(); }

function toggleAssign(name,min){
  const key=String(min);
  const arr=state.dayPlan[key]||[];
  const idx=arr.indexOf(name);
  if(idx>=0){ arr.splice(idx,1); }
  else{
    const p=params();
    if(arr.length>=p.maxConcurrent){ alert('Máximo de personas en este horario alcanzado.'); return; }
    for(const k of Object.keys(state.dayPlan)){
      if(state.dayPlan[k].includes(name)){
        const delta=Math.abs(Number(k)-min);
        if(delta<p.minGap){ alert(`Respetar separación mínima de ${p.minGap} minutos entre breaks.`); return; }
      }
    }
    arr.push(name);
  }
  if(arr.length>0) state.dayPlan[key]=arr; else delete state.dayPlan[key];
  renderCalendarGrid();
}

// Auto-plan (2 breaks/person, separación mínima, límite de simultáneos)
function autoPlanDay(){
  state.dayPlan={};
  const p=params(); const slots=buildSlots();
  const perPerson=2; let slotIdx=0;
  for(let round=0; round<perPerson; round++){
    for(let m=0; m<state.members.length; m++){
      const name=state.members[m]; let placed=false; let guard=0;
      while(!placed && guard<slots.length){
        const min=slots[slotIdx%slots.length];
        if(canPlace(name,min)){ place(name,min); placed=true; }
        slotIdx++; guard++;
      }
      slotIdx += Math.floor(p.minGap/p.slotMinutes); // separa rondas
    }
  }
  renderCalendarGrid();
}
function canPlace(name,min){
  const p=params(); const key=String(min); const arr=state.dayPlan[key]||[];
  if(arr.length>=p.maxConcurrent) return false;
  for(const k of Object.keys(state.dayPlan)){
    if(state.dayPlan[k].includes(name)){
      const delta=Math.abs(Number(k)-min);
      if(delta<p.minGap) return false;
    }
  }
  return true;
}
function place(name,min){ const key=String(min); state.dayPlan[key]=state.dayPlan[key]||[]; state.dayPlan[key].push(name); }

// Guardar/Cargar por fecha y Exportar CSV
saveDay.onclick=()=>{ save(); alert('Guardado ✅'); };
loadDay.onclick=()=>{ if(!load()) alert('No hay plan guardado para esta fecha.'); };
exportCsv.onclick=()=>{
  const p=params(); const slots=buildSlots(); let rows=[['Fecha','Nombre','Hora inicio','Duración (min)']];
  state.members.forEach(name=>{
    slots.forEach(min=>{
      const key=String(min);
      if((state.dayPlan[key]||[]).includes(name)){
        rows.push([datePicker.value, name, minutesToTime(min), p.slotMinutes]);
      }
    });
  });
  const csv=rows.map(r=>r.join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`breaks_${datePicker.value}.csv`; a.click(); URL.revokeObjectURL(url);
};

// Eventos
document.getElementById('autoPlan').onclick=autoPlanDay;
document.getElementById('clearPlan').onclick=()=>{ state.dayPlan={}; renderCalendarGrid(); };
datePicker.addEventListener('change', ()=>{ load(); });
[startTime,endTime,slotMinutes,maxConcurrent,minGap].forEach(el=> el.addEventListener('change', ()=> renderAll() ));
renderAll();
