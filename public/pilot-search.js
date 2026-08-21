(() => {
  const input = document.querySelector('#q');
  const searchBox = document.querySelector('.search');
  if (!input || !searchBox) return;

  input.placeholder = 'Localizar tarefas, projetos, pessoas...';
  input.autocomplete = 'off';

  const style = document.createElement('style');
  style.textContent = `
    .search{position:relative}
    #globalSearchResults{position:absolute;top:48px;left:0;right:0;background:#fff;border:1px solid #e3e5e7;border-radius:12px;box-shadow:0 18px 50px #0002;z-index:30;max-height:420px;overflow:auto;display:none;padding:6px}
    #globalSearchResults.open{display:block}
    .search-result{display:grid;grid-template-columns:72px 1fr;gap:9px;padding:10px;border-radius:9px;cursor:pointer;border:0;background:#fff;width:100%;text-align:left}
    .search-result:hover,.search-result:focus{background:#fff5ed;outline:none}
    .search-result .kind{font-size:8px;font-weight:900;color:#ff6b19;text-transform:uppercase;letter-spacing:.4px;padding-top:2px}
    .search-result b{font-size:10px;display:block}.search-result small{font-size:8.5px;color:#7f858d;display:block;margin-top:3px;line-height:1.35}
    .search-empty{padding:14px;color:#8b9096;font-size:9px;text-align:center}
    .search-count{padding:7px 9px 5px;font-size:8px;color:#92979d;border-bottom:1px solid #f1f2f3;margin-bottom:3px}
    .search-highlight{animation:searchPulse 1.2s ease}
    @keyframes searchPulse{0%,100%{background:transparent}35%{background:#fff0e5}}
  `;
  document.head.appendChild(style);

  const results = document.createElement('div');
  results.id = 'globalSearchResults';
  searchBox.appendChild(results);

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const norm = (value) => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();

  function ownerName(project) {
    return (S?.team || []).find((user) => user.id === project.owner_id)?.name || 'Sem responsável';
  }

  function buildIndex() {
    const items = [];

    (S?.tasks || []).forEach((task) => items.push({
      type: 'Tarefa',
      title: task.title,
      meta: `${task.status} · ${task.project_name || 'Sem projeto'} · ${task.owner_name || 'Sem responsável'}`,
      haystack: [task.title, task.description, task.status, task.priority, task.department, task.project_name, task.owner_name].join(' '),
      open: () => {
        view('tasks');
        editTask(task.id);
        window.CommandDeskDossier?.load?.(task.id);
      }
    }));

    (S?.projects || []).forEach((project) => items.push({
      type: 'Projeto',
      title: project.name,
      meta: `${project.status} · ${project.progress}% · ${ownerName(project)}`,
      haystack: [project.name, project.status, project.progress, ownerName(project)].join(' '),
      open: () => {
        view('projects');
        window.CommandDeskEntities?.openProject?.(project);
      }
    }));

    (S?.team || []).forEach((user) => items.push({
      type: 'Pessoa',
      title: user.name,
      meta: `${user.department || 'Geral'} · ${user.job_title || 'Sem cargo'} · ${user.email || 'Sem e-mail'}`,
      haystack: [user.name, user.email, user.department, user.job_title, user.role].join(' '),
      open: () => {
        view('team');
        const rows = Array.from(document.querySelectorAll('#teamTable tr'));
        const index = (S?.team || []).findIndex((item) => item.id === user.id);
        const row = rows[index];
        if (row) {
          row.classList.remove('search-highlight');
          void row.offsetWidth;
          row.classList.add('search-highlight');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }));

    (S?.emails || []).forEach((email) => items.push({
      type: 'Comunicação',
      title: email.subject || 'Sem assunto',
      meta: `${email.from_name || email.from_email || 'Remetente'} · score ${email.score || 0}`,
      haystack: [email.subject, email.from_name, email.from_email, email.preview, email.body_excerpt].join(' '),
      open: () => {
        view('communications');
        const rows = Array.from(document.querySelectorAll('#mailTable tr'));
        const index = (S?.emails || []).findIndex((item) => item.id === email.id);
        const row = rows[index];
        if (row) {
          row.classList.remove('search-highlight');
          void row.offsetWidth;
          row.classList.add('search-highlight');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }));

    return items;
  }

  let visible = [];
  let activeIndex = -1;

  function closeResults() {
    results.classList.remove('open');
    activeIndex = -1;
  }

  function render(query) {
    const q = norm(query);
    if (!q) {
      results.innerHTML = '';
      closeResults();
      return;
    }

    visible = buildIndex()
      .map((item) => ({ item, text: norm(`${item.title} ${item.meta} ${item.haystack}`) }))
      .filter(({ text }) => text.includes(q))
      .sort((a, b) => {
        const aTitle = norm(a.item.title);
        const bTitle = norm(b.item.title);
        const aStarts = aTitle.startsWith(q) ? 0 : 1;
        const bStarts = bTitle.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || aTitle.localeCompare(bTitle, 'pt-BR');
      })
      .slice(0, 15)
      .map(({ item }) => item);

    activeIndex = -1;
    results.innerHTML = visible.length
      ? `<div class="search-count">${visible.length} resultado(s)</div>${visible.map((item, index) => `
          <button class="search-result" type="button" data-search-index="${index}">
            <span class="kind">${esc(item.type)}</span>
            <span><b>${esc(item.title)}</b><small>${esc(item.meta)}</small></span>
          </button>`).join('')}`
      : '<div class="search-empty">Nenhum resultado encontrado.</div>';
    results.classList.add('open');
  }

  function activate(index) {
    const buttons = Array.from(results.querySelectorAll('.search-result'));
    buttons.forEach((button, i) => button.style.background = i === index ? '#fff5ed' : '');
    buttons[index]?.scrollIntoView({ block: 'nearest' });
  }

  input.oninput = () => render(input.value);
  input.addEventListener('focus', () => {
    if (input.value.trim()) render(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (!results.classList.contains('open')) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(visible.length - 1, activeIndex + 1);
      activate(activeIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      activate(activeIndex);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      visible[activeIndex]?.open();
      closeResults();
    } else if (event.key === 'Escape') {
      closeResults();
    }
  });

  results.addEventListener('click', (event) => {
    const button = event.target.closest('[data-search-index]');
    if (!button) return;
    const item = visible[Number(button.dataset.searchIndex)];
    item?.open();
    closeResults();
  });

  document.addEventListener('click', (event) => {
    if (!searchBox.contains(event.target)) closeResults();
  });

  window.CommandDeskSearch = { search: (query) => { input.value = query; render(query); } };
})();
