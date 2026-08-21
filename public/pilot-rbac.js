(() => {
  const style = document.createElement('style');
  style.textContent = `
    .rbac-readonly{opacity:.7;cursor:default!important}.rbac-note{font-size:8px;color:#8a8f96;margin-top:5px}.rbac-lock{font-size:8px;color:#a45d22;font-weight:800}
  `;
  document.head.appendChild(style);

  const has = (me, permission) => Array.isArray(me?.permissions) && me.permissions.includes(permission);
  let me = null;

  async function getMe() {
    const response = await fetch('/api/me', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function hide(selector, hidden = true) {
    document.querySelectorAll(selector).forEach((el) => { el.style.display = hidden ? 'none' : ''; });
  }

  function applyNavigation() {
    hide('.nav button[data-v="executive"]', !has(me, 'executive:view'));
    hide('#newProject', !has(me, 'projects:manage'));
    hide('#newTeamMember', !has(me, 'team:manage'));
  }

  function protectProjectRows() {
    if (has(me, 'projects:manage')) return;
    document.querySelectorAll('#projectTable tr,#projectsSide .row').forEach((row) => row.classList.add('rbac-readonly'));
  }

  function protectTaskModal() {
    const owner = document.querySelector('#fOwner');
    if (!owner || me?.user?.role !== 'member') return;
    owner.value = me.user.id;
    owner.disabled = true;
    if (!owner.parentElement?.querySelector('.rbac-note')) {
      const note = document.createElement('div');
      note.className = 'rbac-note';
      note.textContent = 'Membros criam e mantêm tarefas atribuídas a si próprios.';
      owner.insertAdjacentElement('afterend', note);
    }
  }

  function patchTaskOpeners() {
    const originalOpen = window.openTask;
    if (typeof originalOpen === 'function' && !originalOpen.__rbacWrapped) {
      const wrapped = function(...args) {
        const result = originalOpen.apply(this, args);
        setTimeout(protectTaskModal, 0);
        return result;
      };
      wrapped.__rbacWrapped = true;
      window.openTask = wrapped;
    }

    const originalEdit = window.editTask;
    if (typeof originalEdit === 'function' && !originalEdit.__rbacWrapped) {
      const wrapped = function(id, ...args) {
        const task = (window.S || S)?.tasks?.find((item) => item.id === id);
        const result = originalEdit.call(this, id, ...args);
        setTimeout(() => {
          protectTaskModal();
          if (me?.user?.role === 'member' && task && task.owner_id !== me.user.id) {
            document.querySelectorAll('#modal input,#modal select,#modal textarea').forEach((field) => field.disabled = true);
            const save = document.querySelector('#save');
            if (save) save.style.display = 'none';
            const title = document.querySelector('#modalTitle');
            if (title) title.textContent = 'Consultar tarefa';
          } else {
            const save = document.querySelector('#save');
            if (save) save.style.display = '';
          }
        }, 0);
        return result;
      };
      wrapped.__rbacWrapped = true;
      window.editTask = wrapped;
    }
  }

  function protectEntityActions() {
    if (!window.CommandDeskEntities || window.CommandDeskEntities.__rbacWrapped) return;
    const originalProject = window.CommandDeskEntities.openProject;
    const originalTeam = window.CommandDeskEntities.openTeamMember;
    window.CommandDeskEntities.openProject = (project = null) => {
      if (!has(me, 'projects:manage')) {
        if (project) toast('Seu perfil possui acesso de consulta a Projetos.');
        else toast('Seu perfil não pode criar projetos.');
        return;
      }
      return originalProject(project);
    };
    window.CommandDeskEntities.openTeamMember = () => {
      if (!has(me, 'team:manage')) return toast('Somente administradores podem gerenciar o Time.');
      return originalTeam();
    };
    window.CommandDeskEntities.__rbacWrapped = true;
  }

  function enhanceTenantBinding() {
    const host = document.querySelector('#integration');
    if (!host || !me || me.user?.role !== 'admin') return;
    const card = Array.from(host.querySelectorAll('.ops-card')).find((el) => el.textContent.includes('Microsoft 365 / Outlook'));
    if (!card || card.querySelector('#rbacBindTenant')) return;

    fetch('/api/integrations', { credentials: 'same-origin' })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data?.microsoft?.canBindTenant) return;
        const actions = card.querySelector('.ops-actions') || card;
        const button = document.createElement('button');
        button.className = 'ops-btn';
        button.id = 'rbacBindTenant';
        button.textContent = data.microsoft.tenantLinked ? 'Revalidar tenant Microsoft' : 'Vincular tenant Microsoft';
        button.onclick = () => { location.href = '/api/integrations/microsoft/bind'; };
        actions.appendChild(button);
        const note = document.createElement('div');
        note.className = 'rbac-note';
        note.textContent = data.microsoft.tenantLinked
          ? 'Tenant corporativo já vinculado à organização.'
          : 'Vincule o tenant antes de desativar o modo Demo.';
        card.appendChild(note);
      })
      .catch(() => {});
  }

  function observe() {
    const observer = new MutationObserver(() => {
      applyNavigation();
      protectProjectRows();
      protectEntityActions();
      enhanceTenantBinding();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function start() {
    try {
      me = await getMe();
      window.CommandDeskAccess = me;
      applyNavigation();
      protectProjectRows();
      patchTaskOpeners();
      protectEntityActions();
      enhanceTenantBinding();
      observe();
    } catch (error) {
      console.warn('RBAC UI indisponível:', error.message);
    }
  }

  start();
})();
