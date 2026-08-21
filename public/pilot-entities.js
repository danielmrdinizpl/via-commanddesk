(() => {
  const style = document.createElement('style');
  style.textContent = `
    #entityModal .dialog{width:min(560px,94vw)}
    #entityModal .entity-note{font-size:9px;color:#858a91;margin:-4px 0 10px}
    #entityModal .entity-field{display:grid;gap:5px}
    #entityModal .entity-field label{font-size:9px;font-weight:750;color:#626872}
    #projectTable tr,#projectsSide .row{cursor:pointer;transition:.15s ease}
    #projectTable tr:hover,#projectsSide .row:hover{background:#fff7f1}
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'entityModal';
  modal.innerHTML = `<div class="dialog"><h2 id="entityTitle">Nova entidade</h2><div class="entity-note" id="entityNote"></div><div class="fields" id="entityFields"></div><div class="actions"><button class="btn" id="entityCancel">Cancelar</button> <button class="btn primary" id="entitySave">Salvar</button></div></div>`;
  document.body.appendChild(modal);

  const title = modal.querySelector('#entityTitle');
  const note = modal.querySelector('#entityNote');
  const fields = modal.querySelector('#entityFields');
  const save = modal.querySelector('#entitySave');
  let mode = null;
  let editingProjectId = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const teamOptions = (selected='') => (S?.team||[]).map((u)=>`<option value="${esc(u.id)}" ${u.id===selected?'selected':''}>${esc(u.name)} · ${esc(u.department||'Geral')}</option>`).join('');
  const statusOptions = (selected='Em andamento') => ['Planejado','Em andamento','Pausado','Concluído'].map((s)=>`<option ${s===selected?'selected':''}>${s}</option>`).join('');

  function openModal(){ modal.classList.add('open'); setTimeout(()=>fields.querySelector('input,select')?.focus(),0); }
  function closeModal(){ modal.classList.remove('open'); mode=null; editingProjectId=null; fields.innerHTML=''; }

  function openProject(project=null){
    mode=project?'project-edit':'project'; editingProjectId=project?.id||null;
    title.textContent=project?'Editar projeto':'Novo projeto';
    note.textContent=project?'Atualiza o projeto existente sem alterar suas tarefas vinculadas.':'Cria um projeto real na organização atual.';
    fields.innerHTML=`
      <div class="full"><input id="epName" placeholder="Nome do projeto" value="${esc(project?.name||'')}"></div>
      <div class="entity-field"><label for="epStatus">Status</label><select id="epStatus">${statusOptions(project?.status||'Em andamento')}</select></div>
      <div class="entity-field"><label for="epProgress">Progresso (%)</label><input id="epProgress" type="number" min="0" max="100" value="${Number(project?.progress??0)}" placeholder="0 a 100"></div>
      <div class="entity-field full"><label for="epOwner">Responsável</label><select id="epOwner"><option value="">Sem responsável</option>${teamOptions(project?.owner_id||'')}</select></div>`;
    save.textContent=project?'Salvar alterações':'Criar projeto'; openModal();
  }

  function openTeamMember(){
    mode='team'; editingProjectId=null; title.textContent='Novo integrante'; note.textContent='Adiciona uma pessoa ao time da organização atual.';
    fields.innerHTML=`<div class="full"><input id="etName" placeholder="Nome completo"></div><div class="full"><input id="etEmail" type="email" placeholder="E-mail"></div><input id="etDept" value="Geral" placeholder="Departamento"><input id="etJob" placeholder="Cargo"><select class="full" id="etRole"><option value="member" selected>Membro</option><option value="manager">Gestor</option><option value="admin">Administrador</option></select>`;
    save.textContent='Adicionar ao time'; openModal();
  }

  const projectPayload=()=>({name:fields.querySelector('#epName').value,status:fields.querySelector('#epStatus').value,progress:Number(fields.querySelector('#epProgress').value||0),ownerId:fields.querySelector('#epOwner').value||null});

  async function submit(){
    try{
      if(mode==='project'){
        await api('/api/projects',{method:'POST',body:JSON.stringify(projectPayload())}); toast('Projeto criado.');
      }else if(mode==='project-edit'){
        await api('/api/projects/'+encodeURIComponent(editingProjectId),{method:'PATCH',body:JSON.stringify(projectPayload())}); toast('Projeto atualizado.');
      }else if(mode==='team'){
        await api('/api/team',{method:'POST',body:JSON.stringify({name:fields.querySelector('#etName').value,email:fields.querySelector('#etEmail').value,department:fields.querySelector('#etDept').value,jobTitle:fields.querySelector('#etJob').value,role:fields.querySelector('#etRole').value})}); toast('Integrante adicionado ao time.');
      }else return;
      closeModal(); await load();
      window.CommandDeskOperations?.renderCommunications?.();
    }catch(error){toast(error.message)}
  }

  save.addEventListener('click',submit); modal.querySelector('#entityCancel').addEventListener('click',closeModal); modal.addEventListener('click',(e)=>{if(e.target===modal)closeModal()});

  function addButtons(){
    const ph=document.querySelector('#projects .head'); if(ph&&!document.querySelector('#newProject')){const b=document.createElement('button');b.className='btn primary';b.id='newProject';b.textContent='Novo projeto';b.onclick=()=>openProject();ph.appendChild(b)}
    const th=document.querySelector('#team .head'); if(th&&!document.querySelector('#newTeamMember')){const b=document.createElement('button');b.className='btn primary';b.id='newTeamMember';b.textContent='Novo integrante';b.onclick=openTeamMember;th.appendChild(b)}
  }
  const activeView=()=>document.querySelector('.view.active')?.id||'dashboard';
  const tableProject=(row)=>{const rows=Array.from(document.querySelectorAll('#projectTable tr'));const i=rows.indexOf(row);return i>=0?(S?.projects||[])[i]:null};
  const sideProject=(row)=>{const name=row.querySelector('b')?.textContent?.trim();return(S?.projects||[]).find((p)=>p.name===name)||null};

  document.addEventListener('click',(event)=>{
    const tr=event.target.closest('#projectTable tr'); if(tr){const p=tableProject(tr);if(p)openProject(p);return}
    const sr=event.target.closest('#projectsSide .row'); if(sr){const p=sideProject(sr);if(p)openProject(p)}
  });

  const plus=document.querySelector('#add'); if(plus) plus.onclick=()=>{const current=activeView();if(current==='projects')return openProject();if(current==='team')return openTeamMember();return openTask()};
  addButtons(); window.CommandDeskEntities={openProject,openTeamMember};

  function loadScript(src,key){if(document.querySelector(`script[data-${key}]`))return;const script=document.createElement('script');script.src=src;script.setAttribute(`data-${key}`,'true');document.body.appendChild(script)}
  loadScript('/pilot-search.js','commanddesk-search');
  loadScript('/pilot-operations.js','commanddesk-operations');
})();
