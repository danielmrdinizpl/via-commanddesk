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
  modal.innerHTML = `
    <div class="dialog">
      <h2 id="entityTitle">Nova entidade</h2>
      <div class="entity-note" id="entityNote"></div>
      <div class="fields" id="entityFields"></div>
      <div class="actions">
        <button class="btn" id="entityCancel">Cancelar</button>
        <button class="btn primary" id="entitySave">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const title = modal.querySelector('#entityTitle');
  const note = modal.querySelector('#entityNote');
  const fields = modal.querySelector('#entityFields');
  const save = modal.querySelector('#entitySave');
  const cancel = modal.querySelector('#entityCancel');
  let mode = null;
  let editingProjectId = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function openModal() {
    modal.classList.add('open');
    setTimeout(() => fields.querySelector('input,select')?.focus(), 0);
  }

  function closeModal() {
    modal.classList.remove('open');
    mode = null;
    editingProjectId = null;
    fields.innerHTML = '';
  }

  function teamOptions(selectedId = '') {
    return (S?.team || []).map((user) =>
      `<option value="${esc(user.id)}" ${user.id === selectedId ? 'selected' : ''}>${esc(user.name)} · ${esc(user.department || 'Geral')}</option>`
    ).join('');
  }

  function projectStatusOptions(selected = 'Em andamento') {
    return ['Planejado', 'Em andamento', 'Pausado', 'Concluído']
      .map((status) => `<option ${status === selected ? 'selected' : ''}>${status}</option>`)
      .join('');
  }

  function openProject(project = null) {
    mode = project ? 'project-edit' : 'project';
    editingProjectId = project?.id || null;
    title.textContent = project ? 'Editar projeto' : 'Novo projeto';
    note.textContent = project
      ? 'Atualiza o projeto existente sem alterar suas tarefas vinculadas.'
      : 'Cria um projeto real na organização atual.';
    fields.innerHTML = `
      <div class="full"><input id="epName" placeholder="Nome do projeto" value="${esc(project?.name || '')}"></div>
      <div class="entity-field"><label for="epStatus">Status</label><select id="epStatus">${projectStatusOptions(project?.status || 'Em andamento')}</select></div>
      <div class="entity-field"><label for="epProgress">Progresso (%)</label><input id="epProgress" type="number" min="0" max="100" value="${Number(project?.progress ?? 0)}" placeholder="0 a 100"></div>
      <div class="entity-field full"><label for="epOwner">Responsável</label><select id="epOwner"><option value="">Sem responsável</option>${teamOptions(project?.owner_id || '')}</select></div>`;
    save.textContent = project ? 'Salvar alterações' : 'Criar projeto';
    openModal();
  }

  function openTeamMember() {
    mode = 'team';
    editingProjectId = null;
    title.textContent = 'Novo integrante';
    note.textContent = 'Adiciona uma pessoa ao time da organização atual.';
    fields.innerHTML = `
      <div class="full"><input id="etName" placeholder="Nome completo"></div>
      <div class="full"><input id="etEmail" type="email" placeholder="E-mail"></div>
      <input id="etDept" value="Geral" placeholder="Departamento">
      <input id="etJob" placeholder="Cargo">
      <select class="full" id="etRole">
        <option value="member" selected>Membro</option>
        <option value="manager">Gestor</option>
        <option value="admin">Administrador</option>
      </select>`;
    save.textContent = 'Adicionar ao time';
    openModal();
  }

  function projectPayload() {
    return {
      name: fields.querySelector('#epName').value,
      status: fields.querySelector('#epStatus').value,
      progress: Number(fields.querySelector('#epProgress').value || 0),
      ownerId: fields.querySelector('#epOwner').value || null
    };
  }

  async function submit() {
    try {
      if (mode === 'project') {
        await api('/api/projects', {
          method: 'POST',
          body: JSON.stringify(projectPayload())
        });
        toast('Projeto criado.');
      } else if (mode === 'project-edit') {
        await api('/api/projects/' + encodeURIComponent(editingProjectId), {
          method: 'PATCH',
          body: JSON.stringify(projectPayload())
        });
        toast('Projeto atualizado.');
      } else if (mode === 'team') {
        await api('/api/team', {
          method: 'POST',
          body: JSON.stringify({
            name: fields.querySelector('#etName').value,
            email: fields.querySelector('#etEmail').value,
            department: fields.querySelector('#etDept').value,
            jobTitle: fields.querySelector('#etJob').value,
            role: fields.querySelector('#etRole').value
          })
        });
        toast('Integrante adicionado ao time.');
      } else {
        return;
      }
      closeModal();
      await load();
    } catch (error) {
      toast(error.message);
    }
  }

  save.addEventListener('click', submit);
  cancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  function addSectionButtons() {
    const projectHead = document.querySelector('#projects .head');
    if (projectHead && !document.querySelector('#newProject')) {
      const button = document.createElement('button');
      button.className = 'btn primary';
      button.id = 'newProject';
      button.textContent = 'Novo projeto';
      button.addEventListener('click', () => openProject());
      projectHead.appendChild(button);
    }

    const teamHead = document.querySelector('#team .head');
    if (teamHead && !document.querySelector('#newTeamMember')) {
      const button = document.createElement('button');
      button.className = 'btn primary';
      button.id = 'newTeamMember';
      button.textContent = 'Novo integrante';
      button.addEventListener('click', openTeamMember);
      teamHead.appendChild(button);
    }
  }

  function activeView() {
    return document.querySelector('.view.active')?.id || 'dashboard';
  }

  function projectFromTableRow(row) {
    const rows = Array.from(document.querySelectorAll('#projectTable tr'));
    const index = rows.indexOf(row);
    return index >= 0 ? (S?.projects || [])[index] : null;
  }

  function projectFromSideRow(row) {
    const name = row.querySelector('b')?.textContent?.trim();
    return (S?.projects || []).find((project) => project.name === name) || null;
  }

  document.addEventListener('click', (event) => {
    const tableRow = event.target.closest('#projectTable tr');
    if (tableRow) {
      const project = projectFromTableRow(tableRow);
      if (project) openProject(project);
      return;
    }

    const sideRow = event.target.closest('#projectsSide .row');
    if (sideRow) {
      const project = projectFromSideRow(sideRow);
      if (project) openProject(project);
    }
  });

  const plus = document.querySelector('#add');
  if (plus) {
    plus.onclick = () => {
      const current = activeView();
      if (current === 'projects') return openProject();
      if (current === 'team') return openTeamMember();
      return openTask();
    };
  }

  addSectionButtons();
  window.CommandDeskEntities = { openProject, openTeamMember };

  if (!document.querySelector('script[data-commanddesk-search]')) {
    const script = document.createElement('script');
    script.src = '/pilot-search.js';
    script.dataset.commanddeskSearch = 'true';
    document.body.appendChild(script);
  }
})();
