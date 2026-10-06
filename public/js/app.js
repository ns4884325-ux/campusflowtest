/* CampusFlow UI — hash-routed single-page app. Reads/writes data only through window.CF (store.js). */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');
  const modalRoot = $('#modal-root');

  const ui = {
    newType: 'certificate', reqTab: 'all', notifOpen: false,
    calMonth: null, calSel: CF.todayStr(),
    q: '', fStatus: '', fDept: '', fType: '', sort: 'newest',
    aiBusy: false, focus: null, lastRoute: null,
  };

  /* ---------- formatting ---------- */
  const STATUS_COLOR = { Pending: 'var(--amber)', Assigned: 'var(--violet)', 'In Progress': 'var(--sky)', Completed: 'var(--mint)' };
  const stClass = (s) => 'st-' + s.toLowerCase().replace(/\s+/g, '-');
  const fmtDT = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtD = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const fmtYmd = (s, opts) => CF.parseYmd(s).toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short' });
  const relDays = (s) => {
    const n = CF.daysBetween(CF.todayStr(), s);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`;
  };
  const timeAgo = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return `${Math.round(h / 24)} d ago`;
  };
  const fmtDuration = (ms) => {
    if (!ms) return '—';
    const h = ms / 36e5;
    return h < 24 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`;
  };
  const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  /* ---------- icons ---------- */
  const svg = (inner, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const I = {
    dash: svg('<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'),
    inbox: svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
    book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    cal: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    queue: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    bell: svg('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
    out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
    copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 14),
    refresh: svg('<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>', 16),
    spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>', 16),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
    check: svg('<path d="M20 6 9 17l-5-5"/>', 15),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>', 14),
    reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', 16),
  };
  const logoMark = `<span class="logo-mark"><svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 42c9 0 12-20 24-20s15 20 24 20" stroke="#c6f36b" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="32" cy="22" r="7" fill="#7c9cff"/></svg></span>`;
  const copyBtn = (id) => `<span class="rid">${esc(id)}<button class="copy" type="button" data-action="copy" data-id="${esc(id)}" title="Copy ${esc(id)}" aria-label="Copy request ID ${esc(id)}">${I.copy}</button></span>`;
  const statusPill = (s) => `<span class="pill ${stClass(s)}">${esc(s)}</span>`;

  /* ---------- toasts, modal, clipboard ---------- */
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3600);
    setTimeout(() => el.remove(), 4000);
  }
  function openModal(html) {
    modalRoot.innerHTML = `<div class="modal-bg" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  }
  function closeModal() { modalRoot.innerHTML = ''; }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(`Copied <span class="mono">${esc(t)}</span> to clipboard`);
  }

  /* ---------- routing ---------- */
  const NAV = {
    student: [['dashboard', 'Dashboard', I.dash], ['requests', 'Requests', I.inbox], ['study', 'Study Planner', I.book], ['calendar', 'Calendar', I.cal]],
    admin: [['admin', 'Request Queue', I.queue], ['calendar', 'Calendar', I.cal]],
  };
  const TITLES = {
    dashboard: ['Dashboard', 'Your studies and campus requests at a glance'],
    requests: ['Service Requests', 'Certificates, lab equipment, maintenance and leave'],
    study: ['Study Planner', 'Subjects, topics, exams and your generated schedule'],
    calendar: ['Calendar', 'Study blocks, exams, deadlines and requests together'],
    admin: ['Request Queue', 'Assign, track and resolve every campus request'],
  };
  const currentRoute = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '');

  function render() {
    const user = CF.currentUser();
    if (!user) { app.innerHTML = viewLogin(); return; }
    let r = currentRoute();
    const allowed = NAV[user.role].map((n) => n[0]);
    if (!allowed.includes(r)) { r = allowed[0]; history.replaceState(null, '', '#/' + r); }
    const sameRoute = ui.lastRoute === r;
    const y = window.scrollY;
    const views = { dashboard: viewDashboard, requests: viewRequests, study: viewStudy, calendar: viewCalendar, admin: viewAdmin };
    app.innerHTML = shell(user, r, views[r](user));
    if (r === 'admin') renderQueue(user);
    if (r === 'requests') applyTypeToForm();
    if (sameRoute) window.scrollTo(0, y); else window.scrollTo(0, 0);
    ui.lastRoute = r;
    if (ui.focus) { const el = $(ui.focus); if (el) el.focus(); ui.focus = null; }
  }

  /* ---------- login ---------- */
  function viewLogin() {
    ui.lastRoute = null;
    return `
    <div class="login fade-in">
      <section class="login-brand">
        <div class="logo">${logoMark} CampusFlow</div>
        <div>
          <h1>One campus.<br/>One login.<br/><em>Everything flows.</em></h1>
          <p class="lead">Request certificates, lab kits, repairs and leave — and plan every exam — from a single dashboard and a single calendar.</p>
          <div class="flow-strip">
            <span><b>Pending</b> → Assigned → In Progress → <b>Completed</b></span>
            <span>Auto study schedule</span>
            <span>IDs like <b class="mono">CF-${new Date().getFullYear()}-0001</b></span>
          </div>
        </div>
        <div class="ticker"><span class="dot"></span> Live across tabs — open a student tab and an admin tab side by side.</div>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <h2>Sign in</h2>
          <p class="muted">Use your campus account, or pick a demo account below.</p>
          <form data-form="login" novalidate>
            <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="username" placeholder="student@gmail.com" required /></div>
            <div class="field"><label for="password">Password</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required /></div>
            <div class="form-error" id="login-error"></div>
            <button class="btn btn-primary" type="submit">Sign in →</button>
          </form>
        </div>
      </section>
    </div>`;
  }

  /* ---------- shell ---------- */
  function shell(user, r, content) {
    const notifs = CF.notificationsFor(user);
    const unread = notifs.filter((n) => !n.read).length;
    const [title, sub] = TITLES[r];
    const navLinks = NAV[user.role].map(([k, label, ico]) => `<a href="#/${k}" class="${k === r ? 'active' : ''}"><span class="ico">${ico}</span>${label}</a>`).join('');
    const initials = user.name.split(' ').map((p) => p[0]).filter((c) => /[A-Z]/i.test(c)).slice(-2).join('');
    return `
    <div class="shell">
      <aside class="sidebar">
        <div class="logo">${logoMark} CampusFlow</div>
        <nav class="nav">
          <div class="nav-section">${user.role === 'admin' ? 'Services desk' : 'Student'}</div>
          ${navLinks}
        </nav>
        <div class="stack" style="gap:.5rem;margin-top:auto">
          <button class="btn btn-ghost btn-sm" data-action="reset-demo" style="justify-content:flex-start">${I.reset} Reset demo data</button>
          <div class="user-card">
            <div class="avatar">${esc(initials)}</div>
            <div class="who"><b>${esc(user.name)}</b><small>${esc(user.meta)}</small></div>
            <button class="btn btn-ghost icon-btn" data-action="logout" title="Sign out" aria-label="Sign out">${I.out}</button>
          </div>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div><h1>${title}</h1><div class="sub">${sub}</div></div>
          <div class="spacer"></div>
          <div class="notif-wrap">
            <button class="btn icon-btn" data-action="toggle-notif" aria-label="Notifications">${I.bell}${unread ? `<span class="badge-dot">${unread}</span>` : ''}</button>
            ${ui.notifOpen ? notifPanel(notifs) : ''}
          </div>
          <button class="btn icon-btn mobile-only" data-action="logout" aria-label="Sign out">${I.out}</button>
        </div>
        <div class="fade-in">${content}</div>
      </main>
      <nav class="tabbar">${NAV[user.role].map(([k, label, ico]) => `<a href="#/${k}" class="${k === r ? 'active' : ''}"><span class="ico">${ico}</span>${label.split(' ')[0]}</a>`).join('')}</nav>
    </div>`;
  }

  function notifPanel(notifs) {
    return `
    <div class="notif-panel">
      <header><b>Notifications</b><button class="btn btn-ghost btn-sm" data-action="read-all">Mark all read</button></header>
      ${notifs.length ? notifs.slice(0, 25).map((n) => `
        <div class="notif-item ${n.read ? '' : 'unread'}" ${n.ref ? `data-action="open-ref" data-id="${esc(n.ref)}" style="cursor:pointer"` : ''}>
          <div>${esc(n.text)}<time>${timeAgo(n.at)}</time></div>
        </div>`).join('') : '<div class="empty" style="margin:1rem">No notifications yet</div>'}
    </div>`;
  }

  /* ---------- shared pieces ---------- */
  function stepper(status) {
    const idx = CF.STATUSES.indexOf(status);
    const c = STATUS_COLOR[status];
    return `
      <div class="stepper" style="--c:${c}">${CF.STATUSES.map((_, i) => `<span class="s ${i <= idx ? 'on' : ''}"></span>`).join('')}</div>
      <div class="stepper-labels">${CF.STATUSES.map((s, i) => `<span class="${i <= idx ? 'on' : ''}">${s}</span>`).join('')}</div>`;
  }

  function requestCard(r, { compact = false } = {}) {
    const t = CF.TYPES[r.type];
    return `
    <article class="req">
      <div class="req-top">
        <div class="req-ico">${t.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="row between" style="align-items:flex-start">
            <div style="min-width:0"><div class="req-title">${esc(r.title)}</div>
              <div class="req-meta">${copyBtn(r.id)}<span>${t.label}</span><span>· ${fmtD(r.createdAt)}</span>${r.department ? `<span>· ${esc(r.department)}</span>` : ''}</div>
            </div>
            ${statusPill(r.status)}
          </div>
          ${stepper(r.status)}
          ${compact ? '' : `
          <details>
            <summary>Details & timeline</summary>
            ${r.details ? `<p style="margin:.6rem 0 0;font-size:.88rem">${esc(r.details)}</p>` : ''}
            <div class="req-meta" style="margin-top:.4rem">
              <span class="pr-${r.priority.toLowerCase()}">● ${esc(r.priority)} priority</span>
              ${r.location ? `<span>· 📍 ${esc(r.location)}</span>` : ''}
              ${r.fromDate ? `<span>· ${fmtYmd(r.fromDate)} → ${fmtYmd(r.toDate || r.fromDate)}</span>` : ''}
            </div>
            ${timeline(r)}
          </details>`}
        </div>
      </div>
    </article>`;
  }

  function timeline(r) {
    return `<ul class="timeline">${[...r.history].reverse().map((h) => `<li style="--c:${STATUS_COLOR[h.status]}"><b>${esc(h.status)}</b> — ${esc(h.note)}<br/><time>${fmtDT(h.at)} · ${esc(h.by)}</time></li>`).join('')}</ul>`;
  }

  const missedBlocks = () => CF.state.blocks.filter((b) => b.status === 'missed' && !(CF.topicById(b.subjectId, b.topicId) || {}).done);

  function blockRow(b, { actions = true } = {}) {
    const s = CF.subjectById(b.subjectId);
    const t = CF.topicById(b.subjectId, b.topicId);
    if (!s) return '';
    const btn = !actions ? ''
      : b.status === 'planned' ? `<button class="btn btn-sm" data-action="block-done" data-id="${b.id}" title="Mark block done">${I.check} Done</button>`
      : b.status === 'done' ? `<button class="btn btn-ghost btn-sm" data-action="block-undo" data-id="${b.id}">Undo</button>`
      : b.status === 'missed' ? `<span class="pill" style="color:var(--rose)">Missed</span>` : '';
    return `
    <div class="block ${b.status}" style="--c:${s.color}">
      <span class="t">${b.start}</span>
      <div class="what"><b>${esc(t ? t.name : 'Topic')}</b><small>${esc(s.name)} · ${b.minutes} min ${b.source === 'claude' ? '<span class="ai-badge">Claude</span>' : ''}</small></div>
      ${btn}
    </div>`;
  }

  /* ---------- student dashboard ---------- */
  function viewDashboard(user) {
    const prog = CF.studyProgress();
    const exam = CF.nextExam();
    const reqs = CF.requestsFor(user);
    const open = reqs.filter((r) => r.status !== 'Completed');
    const notifs = CF.notificationsFor(user);
    const unread = notifs.filter((n) => !n.read).length;
    const missed = missedBlocks();
    const t = CF.todayStr();
    let todayBlocks = CF.state.blocks.filter((b) => b.date === t && b.status !== 'rescheduled');
    let planLabel = 'Today’s study plan';
    if (!todayBlocks.length) {
      const next = CF.state.blocks.find((b) => b.date > t && b.status === 'planned');
      if (next) { todayBlocks = CF.state.blocks.filter((b) => b.date === next.date); planLabel = `Next study day · ${fmtYmd(next.date)}`; }
    }
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const plannedToday = CF.state.blocks.filter((b) => b.date === t && b.status === 'planned').length;
    const examDays = exam ? CF.daysBetween(t, exam.examDate) : null;
    const deadlines = CF.state.deadlines.filter((d) => !d.done && d.due >= t).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);

    return `
    <section class="hero">
      <h2>${greet}, ${esc(user.name.split(' ')[0])}.</h2>
      <p>${plannedToday ? `${plannedToday} study block${plannedToday > 1 ? 's' : ''} left today` : 'No more study blocks today'} · ${open.length} open request${open.length === 1 ? '' : 's'}${exam ? ` · ${esc(exam.name)} exam ${relDays(exam.examDate)}` : ''}</p>
      <div class="row">
        <a class="btn btn-primary" href="#/requests">${I.plus} New service request</a>
        <a class="btn" href="#/study">${I.book} Study planner</a>
        <a class="btn btn-ghost" href="#/calendar">${I.cal} Calendar</a>
      </div>
    </section>

    ${missed.length ? `
    <div class="alert">
      <span style="font-size:1.4rem">⚠️</span>
      <div class="grow"><b>You missed ${missed.length} study block${missed.length > 1 ? 's' : ''}.</b>
        <div class="muted" style="font-size:.86rem">${missed.map((b) => `${esc((CF.topicById(b.subjectId, b.topicId) || {}).name || '')} (${esc((CF.subjectById(b.subjectId) || {}).name || '')}, ${relDays(b.date)})`).join(', ')}</div></div>
      <button class="btn btn-brand btn-sm" data-action="regen">${I.refresh} Reschedule</button>
    </div>` : ''}

    <div class="grid grid-4">
      <div class="card kpi">
        <span class="label">Study progress</span>
        <div class="kpi-ring"><div class="ring" style="--p:${prog.pct}" data-label="${prog.pct}%"></div>
          <div><div class="value" style="font-size:1.4rem">${prog.done}/${prog.total}</div><div class="hint">topics complete</div></div></div>
      </div>
      <div class="card kpi">
        <i class="accent" style="background:var(--rose)"></i>
        <span class="label">Next exam</span>
        ${exam ? `<div class="value">${examDays === 0 ? 'Today' : `${examDays}<span style="font-size:1rem;color:var(--muted)"> days</span>`}</div><div class="hint">${esc(exam.name)} · ${fmtYmd(exam.examDate)}</div>` : '<div class="value">—</div><div class="hint">No upcoming exams</div>'}
      </div>
      <a class="card kpi" href="#/requests" style="color:inherit">
        <i class="accent" style="background:var(--amber)"></i>
        <span class="label">Open requests</span>
        <div class="value">${open.length}</div>
        <div class="hint">${open.filter((r) => r.status === 'In Progress').length} in progress · ${reqs.length - open.length} completed</div>
      </a>
      <div class="card kpi">
        <i class="accent" style="background:var(--lime)"></i>
        <span class="label">Notifications</span>
        <div class="value">${unread}</div>
        <div class="hint">unread of ${notifs.length}</div>
      </div>
    </div>

    <div class="grid grid-main" style="margin-top:1rem">
      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>${planLabel}</h3><a class="btn btn-ghost btn-sm" href="#/study">Full schedule →</a></div>
          ${todayBlocks.length ? todayBlocks.map((b) => blockRow(b)).join('') : '<div class="empty">Nothing scheduled. Add topics and generate a schedule in the Study Planner.</div>'}
        </section>
        <section class="card">
          <div class="card-head"><h3>Recent requests</h3><a class="btn btn-ghost btn-sm" href="#/requests">All requests →</a></div>
          ${reqs.length ? reqs.slice(0, 3).map((r) => requestCard(r, { compact: true })).join('') : '<div class="empty">No requests yet.</div>'}
        </section>
      </div>
      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>Subject progress</h3></div>
          ${CF.state.subjects.length ? CF.state.subjects.map((s) => {
            const done = s.topics.filter((x) => x.done).length;
            const pct = s.topics.length ? Math.round((done / s.topics.length) * 100) : 0;
            return `<div class="subj-line"><span class="row" style="gap:.5rem"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</span><span class="muted mono" style="font-size:.8rem">${done}/${s.topics.length}</span><div class="bar" style="--c:${s.color}"><i style="width:${pct}%"></i></div></div>`;
          }).join('') : '<div class="empty">No subjects yet.</div>'}
        </section>
        <section class="card">
          <div class="card-head"><h3>Upcoming deadlines</h3></div>
          ${deadlines.length ? deadlines.map((d) => {
            const s = CF.subjectById(d.subjectId);
            return `<div class="event" style="--c:var(--amber)"><div class="grow"><b style="font-size:.9rem">${esc(d.title)}</b><br/><small>${esc(s ? s.name : '')} · ${fmtYmd(d.due)}</small></div><span class="days-left ${CF.daysBetween(t, d.due) <= 3 ? 'soon' : ''}">${relDays(d.due)}</span></div>`;
          }).join('') : '<div class="empty">No upcoming deadlines 🎉</div>'}
        </section>
        <section class="card">
          <div class="card-head"><h3>Notifications</h3>${unread ? '<button class="btn btn-ghost btn-sm" data-action="read-all">Mark all read</button>' : ''}</div>
          ${notifs.slice(0, 4).map((n) => `<div class="notif-item ${n.read ? '' : 'unread'}" style="padding:.55rem 0"><div>${esc(n.text)}<time>${timeAgo(n.at)}</time></div></div>`).join('') || '<div class="empty">All caught up.</div>'}
        </section>
      </div>
    </div>`;
  }

  /* ---------- requests (student) ---------- */
  const TYPE_PLACEHOLDER = {
    certificate: 'e.g. Bonafide certificate for bank account',
    lab: 'e.g. Oscilloscope for ECE lab session',
    maintenance: 'e.g. Wi-Fi not working in Library 2nd floor',
    leave: 'e.g. Medical leave — viral fever',
  };

  function viewRequests(user) {
    const all = CF.requestsFor(user);
    const list = all.filter((r) => ui.reqTab === 'all' || (ui.reqTab === 'open' ? r.status !== 'Completed' : r.status === 'Completed'));
    const tab = (k, label, n) => `<button class="${ui.reqTab === k ? 'on' : ''}" data-action="req-tab" data-tab="${k}">${label} <span class="faint">${n}</span></button>`;
    return `
    <div class="grid grid-main">
      <section class="card">
        <div class="card-head"><h3>New request</h3><span class="tag">Gets a unique ID instantly</span></div>
        <form data-form="new-request" class="stack" autocomplete="off">
          <div class="type-grid">
            ${Object.entries(CF.TYPES).map(([k, t]) => `<button type="button" class="type-tile ${ui.newType === k ? 'on' : ''}" data-action="new-type" data-type="${k}"><span class="e">${t.icon}</span><b>${t.label}</b><small>${t.hint}</small></button>`).join('')}
          </div>
          <input type="hidden" name="type" value="${ui.newType}" />
          <div class="form-grid">
            <div class="field full"><label for="rq-title">Title</label><input class="input" id="rq-title" name="title" required maxlength="120" placeholder="${esc(TYPE_PLACEHOLDER[ui.newType])}" /></div>
            <div class="field"><label for="rq-priority">Priority</label>
              <select class="input" id="rq-priority" name="priority">${CF.PRIORITIES.map((p) => `<option ${p === 'Normal' ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
            <div class="field" data-show="certificate lab maintenance"><label for="rq-loc" data-loc-label>Location</label><input class="input" id="rq-loc" name="location" maxlength="80" placeholder="Block / room / lab" /></div>
            <div class="field" data-show="leave"><label for="rq-from">From</label><input class="input" id="rq-from" type="date" name="fromDate" /></div>
            <div class="field" data-show="leave"><label for="rq-to">To</label><input class="input" id="rq-to" type="date" name="toDate" /></div>
            <div class="field full"><label for="rq-details">Details</label><textarea class="input" id="rq-details" name="details" maxlength="1000" placeholder="Anything the department should know"></textarea></div>
          </div>
          <div class="form-error" id="rq-error"></div>
          <div class="row between">
            <small class="muted">Routed to <b data-dept>${CF.TYPES[ui.newType].dept}</b> by default</small>
            <button class="btn btn-primary" type="submit">Submit request →</button>
          </div>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h3>Request history</h3>
          <div class="seg">${tab('all', 'All', all.length)}${tab('open', 'Open', all.filter((r) => r.status !== 'Completed').length)}${tab('done', 'Done', all.filter((r) => r.status === 'Completed').length)}</div>
        </div>
        ${list.length ? list.map((r) => requestCard(r)).join('') : '<div class="empty">No requests in this view.</div>'}
      </section>
    </div>`;
  }

  /** Switch request type without re-rendering, so typed text is kept. */
  function applyTypeToForm() {
    const form = $('form[data-form="new-request"]');
    if (!form) return;
    const k = ui.newType;
    form.elements.type.value = k;
    $$('.type-tile', form).forEach((el) => el.classList.toggle('on', el.dataset.type === k));
    $$('[data-show]', form).forEach((el) => el.classList.toggle('hidden', !el.dataset.show.split(' ').includes(k)));
    form.elements.title.placeholder = TYPE_PLACEHOLDER[k];
    $('[data-dept]', form).textContent = CF.TYPES[k].dept;
    $('[data-loc-label]', form).textContent = k === 'lab' ? 'Lab / pickup point' : k === 'certificate' ? 'Purpose / addressed to' : 'Location';
  }

  function showRequestCreated(req) {
    openModal(`
      <div class="success-mark">✓</div>
      <h3>Request submitted</h3>
      <p class="muted">Keep this ID to track your request. The ${esc(CF.TYPES[req.type].dept)} team gets notified.</p>
      <div class="row" style="margin:1rem 0 1.25rem"><span class="big-id">${esc(req.id)}</span>
        <button class="btn btn-sm" data-action="copy" data-id="${esc(req.id)}">${I.copy} Copy ID</button></div>
      ${stepper(req.status)}
      <div class="row" style="justify-content:flex-end;margin-top:1.5rem">
        <button class="btn btn-ghost" data-action="close-modal">Close</button>
        <a class="btn btn-brand" href="#/calendar" data-action="close-modal">See it on the calendar</a>
      </div>`);
  }

  /* ---------- study planner ---------- */
  function viewStudy() {
    const st = CF.state;
    const t = CF.todayStr();
    const missed = missedBlocks();
    const upcoming = st.blocks.filter((b) => b.date >= t && (b.status === 'planned' || b.status === 'done') && CF.daysBetween(t, b.date) < 14);
    const byDay = upcoming.reduce((m, b) => ((m[b.date] = m[b.date] || []).push(b), m), {});
    const nextBlockForTopic = (tid) => st.blocks.find((b) => b.topicId === tid && b.status === 'planned' && b.date >= t);
    const ls = st.lastSchedule;

    return `
    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>Subjects & topics</h3><span class="tag">${CF.studyProgress().pct}% complete</span></div>
          ${st.subjects.map((s) => {
            const done = s.topics.filter((x) => x.done).length;
            const pct = s.topics.length ? Math.round((done / s.topics.length) * 100) : 0;
            const dl = s.examDate ? CF.daysBetween(t, s.examDate) : null;
            return `
            <div class="subject" style="--c:${s.color}">
              <div class="subject-head">
                <span class="swatch" style="background:${s.color};width:12px;height:12px"></span>
                <div style="flex:1;min-width:0">
                  <h4>${esc(s.name)} <span class="faint mono" style="font-size:.75rem">${esc(s.code)}</span></h4>
                  <div class="exam-chip">Exam <input type="date" value="${s.examDate || ''}" data-change="exam-date" data-sid="${s.id}" aria-label="Exam date for ${esc(s.name)}" />
                    ${dl !== null ? `<span class="days-left ${dl >= 0 && dl <= 7 ? 'soon' : ''}">${dl < 0 ? 'done' : dl === 0 ? 'today' : `${dl}d`}</span>` : ''}</div>
                </div>
                <div class="ring" style="--p:${pct};--c:${s.color};width:46px;height:46px" data-label="${pct}%"></div>
                <button class="btn btn-ghost icon-btn btn-danger" data-action="subj-del" data-sid="${s.id}" title="Remove subject" aria-label="Remove ${esc(s.name)}">${I.x}</button>
              </div>
              <div class="subject-body">
                ${s.topics.map((tp) => {
                  const nb = !tp.done && nextBlockForTopic(tp.id);
                  return `<div class="topic ${tp.done ? 'done' : ''}">
                    <input type="checkbox" ${tp.done ? 'checked' : ''} data-change="topic-toggle" data-sid="${s.id}" data-tid="${tp.id}" aria-label="Mark ${esc(tp.name)} complete" />
                    <span class="name">${esc(tp.name)}</span>
                    ${nb ? `<span class="faint" style="font-size:.74rem">next ${fmtYmd(nb.date, { weekday: 'short' })} ${nb.start}</span>` : ''}
                    <span class="tag">${tp.hours}h</span>
                    <button class="btn btn-ghost btn-sm del" data-action="topic-del" data-sid="${s.id}" data-tid="${tp.id}" aria-label="Delete topic">${I.x}</button>
                  </div>`;
                }).join('') || '<div class="faint" style="font-size:.85rem;padding:.4rem 0">No topics yet — add the first one.</div>'}
                <form class="inline-form" data-form="add-topic" data-sid="${s.id}">
                  <input class="input" name="name" placeholder="Add topic…" required maxlength="80" data-topic-input="${s.id}" />
                  <input class="input" name="hours" type="number" min="1" max="10" value="2" style="width:72px" aria-label="Estimated hours" title="Estimated hours" />
                  <button class="btn btn-sm" type="submit">${I.plus}</button>
                </form>
              </div>
            </div>`;
          }).join('') || '<div class="empty">No subjects yet.</div>'}
          <form data-form="add-subject" class="form-grid" style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line)">
            <div class="field"><label>New subject</label><input class="input" name="name" required maxlength="60" placeholder="e.g. Operating Systems" /></div>
            <div class="field"><label>Code</label><input class="input" name="code" maxlength="12" placeholder="CS205" /></div>
            <div class="field"><label>Exam date</label><input class="input" type="date" name="examDate" required min="${t}" /></div>
            <div class="field" style="justify-content:flex-end"><button class="btn btn-brand" type="submit">${I.plus} Add subject</button></div>
          </form>
        </section>

        <section class="card">
          <div class="card-head"><h3>Assignment deadlines</h3></div>
          ${[...st.deadlines].sort((a, b) => a.due.localeCompare(b.due)).map((d) => {
            const s = CF.subjectById(d.subjectId);
            return `<div class="topic ${d.done ? 'done' : ''}">
              <input type="checkbox" ${d.done ? 'checked' : ''} data-change="dl-toggle" data-id="${d.id}" aria-label="Mark deadline done" />
              <span class="swatch" style="background:${s ? s.color : 'var(--amber)'}"></span>
              <span class="name">${esc(d.title)} <span class="faint" style="font-size:.78rem">· ${esc(s ? s.name : '')}</span></span>
              <span class="days-left ${!d.done && CF.daysBetween(t, d.due) <= 3 && d.due >= t ? 'soon' : ''}">${fmtYmd(d.due, { day: 'numeric', month: 'short' })}</span>
              <button class="btn btn-ghost btn-sm del" data-action="dl-del" data-id="${d.id}" aria-label="Delete deadline">${I.x}</button>
            </div>`;
          }).join('') || '<div class="empty">No deadlines.</div>'}
          <form data-form="add-deadline" class="form-grid" style="margin-top:1rem">
            <div class="field full"><label>Deadline</label><input class="input" name="title" required maxlength="80" placeholder="e.g. Lab record submission" /></div>
            <div class="field"><label>Subject</label><select class="input" name="subjectId" required>${st.subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Due</label><input class="input" type="date" name="due" required /></div>
            <div class="field full" style="align-items:flex-end"><button class="btn" type="submit" ${st.subjects.length ? '' : 'disabled'}>${I.plus} Add deadline</button></div>
          </form>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>Schedule generator</h3>${ls ? `<span class="tag">${ls.source === 'claude' ? 'Claude' : 'Rule-based'} · ${timeAgo(ls.at)}</span>` : ''}</div>
          <div class="field">
            <label for="hours">Weekly study hours: <b style="color:var(--lime)" id="hours-label">${st.settings.weeklyHours}h</b></label>
            <input type="range" id="hours" min="2" max="28" step="1" value="${st.settings.weeklyHours}" data-change="weekly-hours" data-input="weekly-hours" />
          </div>
          <p class="muted" style="font-size:.84rem">1-hour blocks, evenings first. Subjects with closer exams and more remaining topics get more slots. Missed blocks and completed topics update the remaining plan.</p>
          <div class="row">
            <button class="btn btn-primary" data-action="regen">${I.refresh} Generate schedule</button>
            <button class="btn" data-action="ai-regen" ${ui.aiBusy ? 'disabled' : ''}>${I.spark} ${ui.aiBusy ? 'Asking Claude…' : 'Plan with Claude'}</button>
          </div>
          <p class="faint" style="font-size:.76rem;margin:.6rem 0 0">Claude is optional — when it isn’t configured, the rule-based planner is used automatically.</p>
        </section>

        ${missed.length ? `
        <section class="card" style="border-color:rgba(255,107,129,.4)">
          <div class="card-head"><h3>Missed blocks</h3><button class="btn btn-sm btn-brand" data-action="regen">${I.refresh} Reschedule</button></div>
          ${missed.map((b) => `<div class="day-group"><h5>${fmtYmd(b.date)}</h5>${blockRow(b)}</div>`).join('')}
        </section>` : ''}

        <section class="card">
          <div class="card-head"><h3>Next 14 days</h3><span class="tag">${upcoming.filter((b) => b.status === 'planned').length} blocks</span></div>
          ${Object.keys(byDay).length ? Object.entries(byDay).map(([d, bs]) => `
            <div class="day-group"><h5>${d === t ? 'Today' : fmtYmd(d)}</h5>${bs.map((b) => blockRow(b)).join('')}</div>`).join('')
            : '<div class="empty">No upcoming blocks. Add topics with exam dates, then generate.</div>'}
        </section>
      </div>
    </div>`;
  }

  async function aiRegenerate() {
    ui.aiBusy = true; render();
    const st = CF.state;
    try {
      const payload = {
        today: CF.todayStr(), now: nowHm(), weeklyHours: st.settings.weeklyHours,
        slotTimes: ['16:30', '18:00', '19:15', '20:30'],
        subjects: st.subjects.map((s) => ({ id: s.id, name: s.name, examDate: s.examDate, topics: s.topics.filter((x) => !x.done).map((x) => ({ id: x.id, name: x.name, hours: x.hours })) })),
        deadlines: st.deadlines.filter((d) => !d.done).map((d) => ({ title: d.title, subjectId: d.subjectId, due: d.due })),
      };
      const res = await fetch('/api/schedule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const r = CF.applyAiBlocks(data.blocks);
      if (!r) throw new Error('no usable blocks');
      toast(`✨ Claude planned ${r.count} study blocks.`);
    } catch (e) {
      const r = CF.regenerate();
      toast(`Claude isn’t available on this deploy, so the rule-based planner made ${r.count} blocks instead.`, 'warn');
    } finally {
      ui.aiBusy = false; render();
    }
  }

  /* ---------- calendar ---------- */
  function eventsByDate(user) {
    const map = {};
    const add = (d, e) => (map[d] = map[d] || []).push(e);
    const order = { exam: 0, deadline: 1, study: 2, request: 3 };
    if (user.role === 'student') {
      CF.state.blocks.forEach((b) => {
        if (b.status === 'rescheduled') return;
        const s = CF.subjectById(b.subjectId); const tp = CF.topicById(b.subjectId, b.topicId);
        if (!s) return;
        add(b.date, { kind: 'study', c: s.color, time: b.start, label: `${b.start} ${s.name}`, sub: `${tp ? tp.name : ''} · ${b.status}`, missed: b.status === 'missed' });
      });
      CF.state.subjects.forEach((s) => s.examDate && add(s.examDate, { kind: 'exam', c: 'var(--rose)', time: '09:00', label: `Exam · ${s.name}`, sub: s.code }));
      CF.state.deadlines.forEach((d) => add(d.due, { kind: 'deadline', c: 'var(--amber)', time: '23:59', label: `Due · ${d.title}`, sub: d.done ? 'submitted' : 'deadline' }));
    }
    CF.requestsFor(user).forEach((r) => {
      add(CF.ymd(new Date(r.createdAt)), { kind: 'request', c: 'var(--lime)', time: '', label: `${r.id} · ${r.title}`, sub: `${CF.TYPES[r.type].label} · ${r.status}`, id: r.id });
      if (r.completedAt) add(CF.ymd(new Date(r.completedAt)), { kind: 'request', c: 'var(--mint)', time: '', label: `✓ ${r.id} completed`, sub: r.title, id: r.id });
    });
    Object.values(map).forEach((list) => list.sort((a, b) => order[a.kind] - order[b.kind] || a.time.localeCompare(b.time)));
    return map;
  }

  function viewCalendar(user) {
    const t = CF.today();
    if (!ui.calMonth) ui.calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
    const m = ui.calMonth;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const start = CF.addDays(first, -((first.getDay() + 6) % 7)); // Monday-first
    const ev = eventsByDate(user);
    const todayStr = CF.todayStr();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = CF.addDays(start, i);
      const key = CF.ymd(d);
      const list = ev[key] || [];
      cells.push(`
        <button class="cal-cell ${d.getMonth() !== m.getMonth() ? 'out' : ''} ${key === todayStr ? 'today' : ''} ${key === ui.calSel ? 'sel' : ''}" data-action="cal-sel" data-date="${key}" aria-label="${fmtYmd(key)}: ${list.length} events">
          <span class="d"><span>${d.getDate()}</span>${list.length ? `<span class="faint">${list.length}</span>` : ''}</span>
          ${list.slice(0, 3).map((e) => `<span class="chip ${e.missed ? 'missed' : ''}" style="--c:${e.c}">${esc(e.label)}</span>`).join('')}
          ${list.length > 3 ? `<span class="chip more">+${list.length - 3} more</span>` : ''}
          <span class="dots">${list.slice(0, 6).map((e) => `<i style="--c:${e.c}"></i>`).join('')}</span>
        </button>`);
    }
    const sel = ev[ui.calSel] || [];
    const monthLabel = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const legend = user.role === 'student'
      ? `<span><i class="swatch" style="background:var(--brand)"></i>Study block</span><span><i class="swatch" style="background:var(--rose)"></i>Exam</span><span><i class="swatch" style="background:var(--amber)"></i>Deadline</span><span><i class="swatch" style="background:var(--lime)"></i>Request</span><span><i class="swatch" style="background:var(--mint)"></i>Resolved</span>`
      : `<span><i class="swatch" style="background:var(--lime)"></i>Request submitted</span><span><i class="swatch" style="background:var(--mint)"></i>Resolved</span>`;
    return `
    <div class="grid grid-main">
      <section class="card">
        <div class="cal-head">
          <h2>${monthLabel}</h2>
          <div class="row" style="gap:.35rem">
            <button class="btn btn-sm" data-action="cal-prev" aria-label="Previous month">←</button>
            <button class="btn btn-sm" data-action="cal-today">Today</button>
            <button class="btn btn-sm" data-action="cal-next" aria-label="Next month">→</button>
          </div>
          <div class="legend">${legend}</div>
        </div>
        <div class="cal">
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow">${d}</div>`).join('')}
          ${cells.join('')}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>${ui.calSel === todayStr ? 'Today' : fmtYmd(ui.calSel, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><span class="tag">${sel.length} item${sel.length === 1 ? '' : 's'}</span></div>
        ${sel.length ? sel.map((e) => `
          <div class="event" style="--c:${e.c};${e.id ? 'cursor:pointer' : ''}" ${e.id ? `data-action="open-ref" data-id="${esc(e.id)}" role="button" tabindex="0"` : ''}>
            <div class="grow"><b style="font-size:.9rem;${e.missed ? 'text-decoration:line-through' : ''}">${esc(e.label)}</b><br/><small>${esc(e.sub)}</small></div>
            <span class="tag">${e.kind}</span>
          </div>`).join('') : '<div class="empty">Nothing on this day.</div>'}
      </section>
    </div>`;
  }

  /* ---------- admin ---------- */
  function viewAdmin(user) {
    const s = CF.stats();
    const notifs = CF.notificationsFor(user).slice(0, 5);
    const maxDept = Math.max(1, ...Object.values(s.byDept));
    const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
    return `
    <div class="grid grid-4">
      <div class="card kpi"><i class="accent" style="background:var(--amber)"></i><span class="label">Pending</span><div class="value">${s.pending}</div><div class="hint">waiting for assignment</div></div>
      <div class="card kpi"><i class="accent" style="background:var(--sky)"></i><span class="label">In progress</span><div class="value">${s.active}</div><div class="hint">assigned or being worked on</div></div>
      <div class="card kpi"><i class="accent" style="background:var(--mint)"></i><span class="label">Completed</span><div class="value">${s.completed}</div><div class="hint">of ${s.total} total requests</div></div>
      <div class="card kpi"><i class="accent" style="background:var(--lime)"></i><span class="label">Avg resolution</span><div class="value">${fmtDuration(s.avgResolutionMs)}</div><div class="hint">submitted → completed</div></div>
    </div>

    <section class="card" style="margin-top:1rem">
      <div class="card-head"><h3>All requests</h3><span class="muted" id="queue-count" style="font-size:.85rem"></span></div>
      <div class="toolbar">
        <div class="search"><input class="input" type="search" placeholder="Search ID, title, student, location…" value="${esc(ui.q)}" data-input="q" aria-label="Search requests" /></div>
        <select class="input" data-change="filter" data-key="fStatus" aria-label="Filter by status">${opt('', 'All statuses', ui.fStatus)}${CF.STATUSES.map((x) => opt(x, x, ui.fStatus)).join('')}</select>
        <select class="input" data-change="filter" data-key="fDept" aria-label="Filter by department">${opt('', 'All departments', ui.fDept)}${opt('__none', 'Unassigned', ui.fDept)}${CF.DEPARTMENTS.map((x) => opt(x, x, ui.fDept)).join('')}</select>
        <select class="input" data-change="filter" data-key="fType" aria-label="Filter by type">${opt('', 'All types', ui.fType)}${Object.entries(CF.TYPES).map(([k, t]) => opt(k, t.label, ui.fType)).join('')}</select>
        <select class="input" data-change="filter" data-key="sort" aria-label="Sort">${[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['priority', 'Priority'], ['status', 'Status'], ['updated', 'Recently updated']].map(([k, l]) => opt(k, `Sort: ${l}`, ui.sort)).join('')}</select>
      </div>
      <div class="table-wrap">
        <table class="queue">
          <thead><tr><th>ID</th><th>Request</th><th><button data-action="sort-col" data-sort="priority">Priority ↕</button></th><th><button data-action="sort-col" data-sort="newest">Created ↕</button></th><th>Department</th><th><button data-action="sort-col" data-sort="status">Status ↕</button></th><th></th></tr></thead>
          <tbody id="queue-body"></tbody>
        </table>
      </div>
      <div class="qcards" id="queue-cards"></div>
    </section>

    <div class="grid grid-2" style="margin-top:1rem">
      <section class="card">
        <div class="card-head"><h3>Open workload by department</h3></div>
        <div class="dept-bars">${CF.DEPARTMENTS.map((d) => `<div class="line"><span>${d}</span><div class="bar" style="--c:var(--brand)"><i style="width:${(s.byDept[d] / maxDept) * 100}%"></i></div><span>${s.byDept[d]}</span></div>`).join('')}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Recent activity</h3></div>
        ${notifs.map((n) => `<div class="notif-item ${n.read ? '' : 'unread'}" style="padding:.5rem 0"><div>${esc(n.text)}<time>${timeAgo(n.at)}</time></div></div>`).join('') || '<div class="empty">No activity yet.</div>'}
      </section>
    </div>`;
  }

  function filteredRequests(user) {
    const q = ui.q.trim().toLowerCase();
    const list = CF.requestsFor(user).filter((r) =>
      (!ui.fStatus || r.status === ui.fStatus) &&
      (!ui.fDept || (ui.fDept === '__none' ? !r.department : r.department === ui.fDept)) &&
      (!ui.fType || r.type === ui.fType) &&
      (!q || [r.id, r.title, r.details, r.studentName, r.studentEmail, r.location, r.department || '', CF.TYPES[r.type].label].join(' ').toLowerCase().includes(q)));
    const sorters = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      priority: (a, b) => CF.PRIORITIES.indexOf(b.priority) - CF.PRIORITIES.indexOf(a.priority) || a.createdAt.localeCompare(b.createdAt),
      status: (a, b) => CF.STATUSES.indexOf(a.status) - CF.STATUSES.indexOf(b.status) || a.createdAt.localeCompare(b.createdAt),
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    };
    return list.sort(sorters[ui.sort] || sorters.newest);
  }

  function deptSelect(r) {
    return `<select class="input" data-change="assign" data-id="${esc(r.id)}" aria-label="Assign department for ${esc(r.id)}">
      ${r.department ? '' : '<option value="" selected disabled>Unassigned…</option>'}
      ${CF.DEPARTMENTS.map((d) => `<option ${d === r.department ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
  }
  function statusSelect(r) {
    return `<select class="input ${stClass(r.status)}" style="border-color:${STATUS_COLOR[r.status]}" data-change="status" data-id="${esc(r.id)}" aria-label="Status for ${esc(r.id)}">
      ${CF.STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  }
  function advanceBtn(r) {
    const n = CF.nextStatus(r.status);
    return n ? `<button class="btn btn-sm" data-action="advance" data-id="${esc(r.id)}" title="Move to ${n}">→ ${n}</button>` : `<span class="faint" style="font-size:.8rem">Resolved in ${fmtDuration(new Date(r.completedAt) - new Date(r.createdAt))}</span>`;
  }

  function renderQueue(user) {
    const body = $('#queue-body');
    if (!body) return;
    const list = filteredRequests(user);
    const total = CF.state.requests.length;
    $('#queue-count').innerHTML = `${list.length} of ${total} shown${list.length !== total ? ` · <a href="#" data-action="clear-filters">clear filters</a>` : ''}`;
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty">No requests match these filters.</div></td></tr>';
      $('#queue-cards').innerHTML = '<div class="empty">No requests match these filters.</div>';
      return;
    }
    body.innerHTML = list.map((r) => `
      <tr>
        <td>${copyBtn(r.id)}</td>
        <td><div class="title">${CF.TYPES[r.type].icon} <a href="#" data-action="open-ref" data-id="${esc(r.id)}" style="color:inherit">${esc(r.title)}</a></div><div class="who">${esc(r.studentName)} · ${CF.TYPES[r.type].label}${r.location ? ` · ${esc(r.location)}` : ''}</div></td>
        <td><span class="pr-${r.priority.toLowerCase()}" style="font-weight:600;font-size:.82rem">● ${r.priority}</span></td>
        <td class="muted" style="white-space:nowrap;font-size:.82rem">${fmtDT(r.createdAt)}<br/><span class="faint">${timeAgo(r.createdAt)}</span></td>
        <td>${deptSelect(r)}</td>
        <td>${statusSelect(r)}</td>
        <td style="text-align:right">${advanceBtn(r)}</td>
      </tr>`).join('');
    $('#queue-cards').innerHTML = list.map((r) => `
      <article class="req">
        <div class="row between">${copyBtn(r.id)}${statusPill(r.status)}</div>
        <div class="req-title" style="margin-top:.5rem" data-action="open-ref" data-id="${esc(r.id)}">${CF.TYPES[r.type].icon} ${esc(r.title)}</div>
        <div class="req-meta"><span>${esc(r.studentName)}</span><span class="pr-${r.priority.toLowerCase()}">● ${r.priority}</span><span>${timeAgo(r.createdAt)}</span></div>
        <div class="grid grid-2" style="margin-top:.75rem;gap:.5rem;grid-template-columns:1fr 1fr">${deptSelect(r)}${statusSelect(r)}</div>
        <div style="margin-top:.6rem;text-align:right">${advanceBtn(r)}</div>
      </article>`).join('');
  }

  function showRequestDetails(id, user) {
    const r = CF.state.requests.find((x) => x.id === id);
    if (!r) return;
    const isAdmin = user.role === 'admin';
    openModal(`
      <div class="row between" style="align-items:flex-start"><div><span class="tag">${CF.TYPES[r.type].icon} ${CF.TYPES[r.type].label}</span><h3 style="margin-top:.6rem">${esc(r.title)}</h3></div>
        <button class="btn btn-ghost icon-btn" data-action="close-modal" aria-label="Close">${I.x}</button></div>
      <div class="row" style="margin:.25rem 0 .75rem">${copyBtn(r.id)}${statusPill(r.status)}<span class="pr-${r.priority.toLowerCase()}" style="font-size:.82rem;font-weight:600">● ${r.priority}</span></div>
      ${r.details ? `<p style="margin:0 0 .5rem">${esc(r.details)}</p>` : ''}
      <div class="req-meta">
        <span>👤 ${esc(r.studentName)} (${esc(r.studentEmail)})</span>
        ${r.location ? `<span>· 📍 ${esc(r.location)}</span>` : ''}
        ${r.fromDate ? `<span>· 🗓️ ${fmtYmd(r.fromDate)} → ${fmtYmd(r.toDate || r.fromDate)}</span>` : ''}
        <span>· 🏢 ${esc(r.department || 'Unassigned')}</span>
      </div>
      ${stepper(r.status)}
      ${timeline(r)}
      ${isAdmin ? `<div class="grid grid-2" style="gap:.5rem;margin-top:.5rem">${deptSelect(r)}${statusSelect(r)}</div><div style="text-align:right;margin-top:.75rem">${advanceBtn(r)}</div>` : ''}`);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const user = CF.currentUser();
    if (ui.notifOpen && !e.target.closest('.notif-wrap')) { ui.notifOpen = false; render(); }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'close-modal') {
      if (el.classList.contains('modal-bg') && e.target !== el) return; // click inside dialog
      closeModal();
      return;
    }
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();

    switch (a) {
      case 'demo-login': {
        const f = $('form[data-form="login"]');
        f.email.value = el.dataset.email; f.password.value = 'password123';
        f.requestSubmit();
        break;
      }
      case 'logout': CF.logout(); ui.notifOpen = false; location.hash = ''; render(); break;
      case 'reset-demo':
        if (confirm('Reset all CampusFlow demo data on this browser?')) { CF.resetDemo(); ui.calMonth = null; toast('Demo data restored.'); }
        break;
      case 'toggle-notif': ui.notifOpen = !ui.notifOpen; render(); break;
      case 'read-all': CF.markAllRead(user); break;
      case 'open-ref': {
        ui.notifOpen = false;
        if (user.role === 'admin' || location.hash !== '#/requests') {
          showRequestDetails(el.dataset.id, user);
          render();
        }
        break;
      }
      case 'copy': e.stopPropagation(); copyText(el.dataset.id); break;
      case 'new-type': ui.newType = el.dataset.type; applyTypeToForm(); break;
      case 'req-tab': ui.reqTab = el.dataset.tab; render(); break;
      case 'block-done': CF.setBlockStatus(el.dataset.id, 'done'); toast('Nice — block marked done.'); break;
      case 'block-undo': CF.setBlockStatus(el.dataset.id, 'planned'); break;
      case 'topic-del': CF.removeTopic(el.dataset.sid, el.dataset.tid); break;
      case 'subj-del':
        if (confirm('Remove this subject, its topics, deadlines and study blocks?')) CF.removeSubject(el.dataset.sid);
        break;
      case 'dl-del': CF.removeDeadline(el.dataset.id); break;
      case 'regen': {
        const r = CF.regenerate();
        toast(`Schedule regenerated — ${r.count} upcoming blocks.`);
        break;
      }
      case 'ai-regen': aiRegenerate(); break;
      case 'cal-prev': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() - 1, 1); render(); break;
      case 'cal-next': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + 1, 1); render(); break;
      case 'cal-today': ui.calMonth = null; ui.calSel = CF.todayStr(); render(); break;
      case 'cal-sel': ui.calSel = el.dataset.date; render(); break;
      case 'advance': {
        const r = CF.state.requests.find((x) => x.id === el.dataset.id);
        const n = r && CF.nextStatus(r.status);
        if (n) { CF.updateRequest(r.id, { status: n }, user); toast(`<span class="mono">${esc(r.id)}</span> → ${n}`); refreshModal(r.id, user); }
        break;
      }
      case 'sort-col': ui.sort = el.dataset.sort; render(); break;
      case 'clear-filters': Object.assign(ui, { q: '', fStatus: '', fDept: '', fType: '', sort: 'newest' }); render(); break;
    }
  });

  function refreshModal(id, user) {
    if (modalRoot.innerHTML && $('.modal .timeline', modalRoot)) showRequestDetails(id, user);
  }

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const user = CF.currentUser();
    switch (el.dataset.change) {
      case 'topic-toggle': {
        const tp = CF.topicById(el.dataset.sid, el.dataset.tid);
        CF.toggleTopic(el.dataset.sid, el.dataset.tid);
        if (tp && tp.done) toast(`✓ ${esc(tp.name)} complete — remaining schedule updated.`);
        break;
      }
      case 'exam-date': if (el.value) { CF.updateSubject(el.dataset.sid, { examDate: el.value }); toast('Exam date saved — schedule updated.'); } break;
      case 'dl-toggle': CF.toggleDeadline(el.dataset.id); break;
      case 'weekly-hours': CF.setWeeklyHours(el.value); toast(`Weekly hours set to ${el.value}. Hit “Generate schedule” to apply.`); break;
      case 'filter': ui[el.dataset.key] = el.value; renderQueue(user); break;
      case 'assign':
        CF.updateRequest(el.dataset.id, { department: el.value }, user);
        toast(`<span class="mono">${esc(el.dataset.id)}</span> assigned to ${esc(el.value)}`);
        refreshModal(el.dataset.id, user);
        break;
      case 'status':
        CF.updateRequest(el.dataset.id, { status: el.value }, user);
        toast(`<span class="mono">${esc(el.dataset.id)}</span> → ${esc(el.value)}`);
        refreshModal(el.dataset.id, user);
        break;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    if (el.dataset.input === 'q') { ui.q = el.value; renderQueue(CF.currentUser()); }
    if (el.dataset.input === 'weekly-hours') { const l = $('#hours-label'); if (l) l.textContent = `${el.value}h`; }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    const user = CF.currentUser();
    switch (form.dataset.form) {
      case 'login': {
        const u = CF.login(fd.email, fd.password);
        if (!u) { $('#login-error').textContent = 'Wrong email or password. Try a demo account below.'; return; }
        location.hash = u.role === 'admin' ? '#/admin' : '#/dashboard';
        render();
        toast(`Welcome, ${esc(u.name)}`);
        break;
      }
      case 'new-request': {
        const err = $('#rq-error');
        if (!fd.title || !fd.title.trim()) { err.textContent = 'Please add a short title.'; form.elements.title.focus(); return; }
        if (fd.type === 'leave') {
          if (!fd.fromDate) { err.textContent = 'Pick the first day of leave.'; return; }
          if (fd.toDate && fd.toDate < fd.fromDate) { err.textContent = '“To” date can’t be before “From”.'; return; }
        }
        if (fd.type !== 'leave') { fd.fromDate = ''; fd.toDate = ''; }
        const req = CF.createRequest(fd, user);
        ui.reqTab = 'all';
        showRequestCreated(req);
        break;
      }
      case 'add-subject':
        if (!fd.name.trim() || !fd.examDate) return;
        CF.addSubject(fd);
        toast(`Added ${esc(fd.name)} — now add its topics.`);
        break;
      case 'add-topic':
        if (!fd.name.trim()) return;
        ui.focus = `[data-topic-input="${form.dataset.sid}"]`;
        CF.addTopic(form.dataset.sid, fd.name, fd.hours);
        break;
      case 'add-deadline':
        if (!fd.title.trim() || !fd.due) return;
        CF.addDeadline(fd);
        toast('Deadline added to your calendar.');
        break;
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); if (ui.notifOpen) { ui.notifOpen = false; render(); } } });
  window.addEventListener('hashchange', () => { ui.notifOpen = false; render(); });
  CF.on(() => render());
  render();
})();
