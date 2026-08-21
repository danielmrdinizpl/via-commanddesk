(() => {
  const style = document.createElement('style');
  style.textContent = `
    #entityModal .dialog{width:min(560px,94vw)}
    #entityModal .entity-note{font-size:9px;color:#858a91;margin:-4px 0 10px}
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
    fields.innerHTML = '';
  }

  function teamOptions() {
    return (S?.team || []).map((user) =>
      `<option value="${esc(user.id)}">${esc(user.name)} · ${esc(user.department || 'Geral')}</option>`
    ).join('');
  }

  function openProject() {
    mode = 'project';
    title.textContent = 'Novo projeto';
    note.textContent = 'Cria um projeto real na organização atual.';
    fields.innerHTML = `
      <div class="full"><input id="epName" placeholder="Nome do projeto"></div>
      <select id="epStatus">
        <option>Planejado</option>
        <option selected>Em andamento</option>
        <option>Pausado</option>
        <option>Concluído</option>
      </select>
      <input id="epProgress" type="number" min="0" max="100" value="0" placeholder="Progresso %">
      <select class="full" id="epOwner"><option value="">Sem responsável</option>${teamOptions()}</select>`;
    save.textContent = 'Criar projeto';
    openModal();
  }

  function openTeamMember() {
    mode = 'team';
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

  async function submit() {
    try {
      if (mode === 'project') {
        await api('/api/projects', {
          method: 'POST',
          body: JSON.stringify({
            name: fields.querySelector('#epName').value,
            status: fields.querySelector('#epStatus').value,
            progress: Number(fields.querySelector('#epProgress').value || 0),
            ownerId: fields.querySelector('#epOwner').value || null
          })
        });
        toast('Projeto criado.');
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
      button.addEventListener('click', openProject);
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
})();
