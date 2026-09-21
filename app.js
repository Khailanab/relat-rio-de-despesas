const RATE = 1.23;
const MAX_FILE_MB = 8;
let sb, session, profile, reports = [], supervisors = [], currentFilters = {};
let editingReport = null;

const $ = (s) => document.querySelector(s);
const money = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateBR = s => s ? new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fileOk = f => !f || (f.size <= MAX_FILE_MB*1024*1024);

function show(id,on=true){$(id).classList.toggle('hidden',!on)}
function setError(id,msg=''){ $(id).textContent=msg; }

function normalizeMz(v){ return v.trim().toUpperCase().replace(/\s+/g,''); }
function syntheticEmail(mz){ return `${normalizeMz(mz).toLowerCase().replace(/[^a-z0-9_-]/g,'') || 'user'}@mz.internal`; }

async function boot(){
  if(typeof SUPABASE_URL==='undefined' || SUPABASE_URL.includes('SEU-PROJETO')){
    setError('#loginError','Configure o config.js antes de usar o sistema.');
    return;
  }
  sb = supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const {data:{session:s}}=await sb.auth.getSession();
  if(s){session=s;await enter();} else show('#loginScreen',true);
  sb.auth.onAuthStateChange(async(_e,s)=>{session=s;if(s) await enter();});
  bind();
}
async function enter(){
  const {data,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  if(error){setError('#loginError','Usuário sem cadastro no sistema.');await sb.auth.signOut();return}
  profile=data; show('#loginScreen',false);show('#app',true);
  $('#currentUser').textContent=`${profile.full_name} · ${profile.mz}`;
  if(profile.role==='coordinator'){show('#adminView',true);show('#supervisorView',false);await loadAdmin();}
  else {show('#adminView',false);show('#supervisorView',true);await loadSupervisor();}
}
function bind(){
  $('#loginForm').addEventListener('submit',login);
  $('#logoutBtn').onclick=()=>sb.auth.signOut();
  $('#newReportBtn').onclick=()=>openReport();
  $('#addExpenseBtn').onclick=()=>addExpense();
  $('#reportForm').addEventListener('submit',saveReport);
  $('#kmStart').oninput=$('#kmEnd').oninput=updateKm;
  $('#filterBtn').onclick=loadAdmin;
  $('#clearFilterBtn').onclick=()=>{['#filterFrom','#filterTo'].forEach(x=>$(x).value='');$('#filterSupervisor').value='';loadAdmin()};
  $('#exportBtn').onclick=exportWorkbook;
  $('#templateBtn').onclick=downloadTemplate;
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close]');if(close)close.closest('dialog').close();
  });
}
async function login(e){
  e.preventDefault();setError('#loginError');
  const mz=normalizeMz($('#loginMz').value), password=$('#loginPassword').value;
  if(!mz||!password)return;
  const {data,error}=await sb.auth.signInWithPassword({email:syntheticEmail(mz),password});
  if(error)setError('#loginError','MZ ou senha inválidos.');
  else {session=data.session;await enter();}
}

async function loadSupervisor(){
  const {data,error}=await sb.from('daily_reports').select('*, expenses(*), supervisor:profiles(full_name,mz)').eq('supervisor_id',profile.id).order('route_date',{ascending:false});
  if(error)return toast(error.message); reports=data||[];renderSupervisor();
}
function renderSupervisor(){
  $('#supervisorReports').innerHTML=reports.length?reports.map(r=>`
    <article class="report-card" data-id="${r.id}">
      <div class="report-main"><strong>${dateBR(r.route_date)}</strong><small>${esc(r.plate)} · ${Number(r.km_travelled||0).toLocaleString('pt-BR')} km</small></div>
      <div class="report-meta"><small>Valor KM</small><strong>${money(r.km_value)}</strong></div>
      <div class="report-meta"><small>Extras + hotel</small><strong>${money(r.total_extras)}</strong></div>
      <div class="amount">${money(Number(r.km_value||0)+Number(r.total_extras||0))}</div>
    </article>`).join(''):`<div class="report-card"><div><strong>Nenhum relatório enviado.</strong><small>Comece pelo botão “Novo relatório”.</small></div></div>`;
  $('#supervisorReports').querySelectorAll('.report-card[data-id]').forEach(x=>x.onclick=()=>openDetail(x.dataset.id));
}
async function loadAdmin(){
  const from=$('#filterFrom').value,to=$('#filterTo').value,sup=$('#filterSupervisor').value;
  let q=sb.from('daily_reports').select('*, expenses(*), supervisor:profiles(full_name,mz)').order('route_date',{ascending:false});
  if(from)q=q.gte('route_date',from);if(to)q=q.lte('route_date',to);if(sup)q=q.eq('supervisor_id',sup);
  const {data,error}=await q;if(error)return toast(error.message);
  reports=data||[];const {data:ps}=await sb.from('profiles').select('id,full_name,mz').eq('role','supervisor').order('full_name');
  supervisors=ps||[];fillSupervisors();renderAdmin();
}
function fillSupervisors(){
  const sel=$('#filterSupervisor'), old=sel.value;
  sel.innerHTML='<option value="">Todos</option>'+supervisors.map(p=>`<option value="${p.id}">${esc(p.full_name)}</option>`).join('');
  sel.value=old;
}
function renderAdmin(){
  const km=reports.reduce((a,r)=>a+Number(r.km_travelled||0),0);
  const kmv=reports.reduce((a,r)=>a+Number(r.km_value||0),0);
  const total=reports.reduce((a,r)=>a+Number(r.km_value||0)+Number(r.total_extras||0),0);
  $('#statReports').textContent=reports.length;$('#statKm').textContent=km.toLocaleString('pt-BR');$('#statKmValue').textContent=money(kmv);$('#statTotal').textContent=money(total);
  $('#adminReports').innerHTML=`<table><thead><tr><th>Data</th><th>Supervisor</th><th>Placa</th><th>KM</th><th>Valor KM</th><th>Extras</th><th>Total</th></tr></thead><tbody>${reports.map(r=>`<tr data-id="${r.id}"><td>${dateBR(r.route_date)}</td><td>${esc(r.supervisor?.full_name||'')}</td><td>${esc(r.plate)}</td><td>${Number(r.km_travelled||0).toLocaleString('pt-BR')}</td><td>${money(r.km_value)}</td><td>${money(r.total_extras)}</td><td><strong>${money(Number(r.km_value||0)+Number(r.total_extras||0))}</strong></td></tr>`).join('')}</tbody></table>`;
  $('#adminReports').querySelectorAll('tr[data-id]').forEach(x=>x.onclick=()=>openDetail(x.dataset.id));
}
function openReport(id=null){
  editingReport=id?reports.find(r=>r.id===id):null;
  $('#reportForm').reset();$('#expenses').innerHTML='';
  $('#reportId').value=editingReport?.id||'';$('#dialogTitle').textContent=editingReport?'Editar relatório':'Novo relatório';
  $('#routeDate').value=editingReport?.route_date||new Date().toISOString().slice(0,10);
  $('#plate').value=editingReport?.plate||'';
  $('#kmStart').value=editingReport?.km_start??'';$('#kmEnd').value=editingReport?.km_end??'';
  $('#hotelValue').value=editingReport?.hotel_value??0;$('#notes').value=editingReport?.notes||'';
  if(editingReport?.expenses?.length)editingReport.expenses.forEach(addExpense);else addExpense();
  $('#photoStart').required=!editingReport;$('#photoEnd').required=!editingReport;
  updateKm();$('#reportDialog').showModal();
}
function addExpense(data=null){
  const row=document.createElement('div');row.className='expense-row';
  row.innerHTML=`<div class="expense-head"><strong>Despesa</strong><button type="button" class="remove-expense">Remover</button></div>
  <div class="expense-grid"><label>Tipo<select class="expense-type"><option>Pedágio</option><option>Estacionamento</option><option>Diversas</option></select></label>
  <label>Valor<input class="expense-value" type="number" min="0" step="0.01" value="${data?.amount??''}"></label>
  <label>Comprovante<input class="expense-file" type="file" accept="image/*,.pdf"></label></div>`;
  $('#expenses').append(row);
  if(data)row.querySelector('.expense-type').value=data.type;
  row.querySelector('.remove-expense').onclick=()=>row.remove();
}
function updateKm(){
  const a=Number($('#kmStart').value||0),b=Number($('#kmEnd').value||0),km=Math.max(0,b-a);
  $('#kmPreview').innerHTML=`KM percorridos: <strong>${km.toLocaleString('pt-BR')}</strong> · Valor: <strong>${money(km*RATE)}</strong>`;
}
async function uploadFile(file,folder){
  if(!file)return null;if(!fileOk(file))throw new Error(`O arquivo ${file.name} ultrapassa ${MAX_FILE_MB} MB.`);
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${profile.id}/${folder}/${crypto.randomUUID()}-${safe}`;
  const {error}=await sb.storage.from('expense-files').upload(path,file,{upsert:false});
  if(error)throw error;return path;
}
async function saveReport(e){
  e.preventDefault();setError('#formError');
  try{
    const start=Number($('#kmStart').value),end=Number($('#kmEnd').value);
    if(end<start)throw new Error('O KM final não pode ser menor que o KM inicial.');
    const rows=[...document.querySelectorAll('.expense-row')];
    for(const row of rows){const v=Number(row.querySelector('.expense-value').value||0),f=row.querySelector('.expense-file').files[0];if(v>0&&!f&&!editingReport)throw new Error('Cada despesa declarada precisa de comprovante.');}
    const km=end-start, hotel=Number($('#hotelValue').value||0);
    let startPath=editingReport?.photo_start_path||null,endPath=editingReport?.photo_end_path||null,hotelPath=editingReport?.hotel_receipt_path||null;
    if($('#photoStart').files[0])startPath=await uploadFile($('#photoStart').files[0],'odometro-inicial');
    if($('#photoEnd').files[0])endPath=await uploadFile($('#photoEnd').files[0],'odometro-final');
    if($('#hotelReceipt').files[0])hotelPath=await uploadFile($('#hotelReceipt').files[0],'hotel');
   const payload={
  supervisor_id:profile.id,
  route_date:$('#routeDate').value,
  plate:$('#plate').value.trim().toUpperCase(),
  km_start:start,
  km_end:end,
  hotel_value:hotel,
  hotel_receipt_path:hotelPath,
  notes:$('#notes').value.trim()};
    let reportId=editingReport?.id;
    if(reportId){const {error}=await sb.from('daily_reports').update(payload).eq('id',reportId);if(error)throw error;await sb.from('expenses').delete().eq('report_id',reportId)}
    else {const {data,error}=await sb.from('daily_reports').insert(payload).select('id').single();if(error)throw error;reportId=data.id}
    for(const row of rows){
      const amount=Number(row.querySelector('.expense-value').value||0);if(!amount)continue;
      const f=row.querySelector('.expense-file').files[0];let receipt=editingReport?.expenses?.find(x=>x.type===row.querySelector('.expense-type').value && Number(x.amount)===amount)?.receipt_path||null;
      if(f)receipt=await uploadFile(f,'comprovantes');
      const {error}=await sb.from('expenses').insert({report_id:reportId,type:row.querySelector('.expense-type').value,amount,receipt_path:receipt});
      if(error)throw error;
    }
    $('#reportDialog').close();await (profile.role==='coordinator'?loadAdmin():loadSupervisor());toast('Relatório salvo.');
  }catch(err){setError('#formError',err.message||'Não foi possível salvar.')}
}
async function openDetail(id){
  const r=reports.find(x=>x.id===id);if(!r)return;
  editingReport=r;
  $('#detailTitle').textContent=`${dateBR(r.route_date)} · ${r.plate}`;
  const ex=(r.expenses||[]).map(x=>`<div class="detail-line"><span>${esc(x.type)}</span><strong>${money(x.amount)}</strong></div>`).join('');
  $('#detailBody').innerHTML=`<div class="detail-grid">
    <div><small>Supervisor</small><strong>${esc(r.supervisor?.full_name||profile.full_name)}</strong></div>
    <div><small>KM</small><strong>${Number(r.km_travelled).toLocaleString('pt-BR')}</strong></div>
    <div><small>Valor KM</small><strong>${money(r.km_value)}</strong></div>
    <div><small>Hospedagem</small><strong>${money(r.hotel_value)}</strong></div>
  </div><div class="section-title">Despesas</div>${ex||'<div class="muted">Nenhuma despesa extra.</div>'}
  <div class="section-title">Observações</div><p>${esc(r.notes||'—')}</p>`;
  $('#editDetailBtn').onclick=()=>{$('#detailDialog').close();openReport(r.id)};
  $('#detailDialog').showModal();
}
async function exportWorkbook(){
  if(!window.XLSX)return toast('Gerador de Excel indisponível.');
  if(!reports.length)return toast('Não há relatórios no filtro atual.');
  const wb=XLSX.utils.book_new();
  const rows=[['Data','MZ','Nome','Função','C.Custo','Placa','KM inicial','KM final','KM Rodado','Valor KM','Pedágio','Estacionamento','Diversas','TT Reembolsável','Hotel','Adiantamento / Saldo','Valor a depositar','Observações']];
  for(const r of reports){
    const by={Pedágio:0,Estacionamento:0,Diversas:0};(r.expenses||[]).forEach(e=>by[e.type]=(by[e.type]||0)+Number(e.amount||0));
    const total=Number(r.km_value||0)+by.Pedágio+by.Estacionamento+by.Diversas+Number(r.hotel_value||0);
    rows.push([r.route_date,r.supervisor?.mz||'',r.supervisor?.full_name||'','Supervisor','',r.plate,r.km_start,r.km_end,r.km_travelled,r.km_value,by.Pedágio,by.Estacionamento,by.Diversas,total,Number(r.hotel_value||0),'',total,r.notes||'']);
  }
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=rows[0].map((_,i)=>({wch:i===2?30:16}));
  XLSX.utils.book_append_sheet(wb,ws,'Dados do sistema');
  XLSX.writeFile(wb,`controle-despesas-${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Excel exportado.');
}
function downloadTemplate(){toast('O modelo oficial fica no pacote do projeto. Na implantação, ele deve ser enviado ao bucket privado como modelo oficial.')}
function toast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2600)}
boot();
