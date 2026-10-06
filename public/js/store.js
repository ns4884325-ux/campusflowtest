/* CampusFlow data layer.
 * Everything the UI reads or writes goes through window.CF.
 * Data lives in localStorage (shared across tabs); the logged-in user lives in
 * sessionStorage, so one browser can run a student tab and an admin tab side by side.
 * To move to a real backend later, swap load/persist/the mutators in this file only.
 */
(function () {
  const KEY = 'campusflow:v1';
  const SESSION_KEY = 'campusflow:session';

  const USERS = [
    { email: 'student@gmail.com', password: 'password123', role: 'student', name: 'Aarav Mehta', meta: 'B.Tech CSE · Year 2' },
    { email: 'admin@gmail.com', password: 'password123', role: 'admin', name: 'Dr. Priya Rao', meta: 'Campus Services Desk' },
  ];

  const DEPARTMENTS = ['Admin Office', 'Lab Tech', 'Maintenance', 'HOD'];
  const STATUSES = ['Pending', 'Assigned', 'In Progress', 'Completed'];
  const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
  const TYPES = {
    certificate: { label: 'Certificate', dept: 'Admin Office', icon: '📜', hint: 'Bonafide, transcript, NOC…' },
    lab: { label: 'Lab Equipment', dept: 'Lab Tech', icon: '🔬', hint: 'Kits, instruments, components' },
    maintenance: { label: 'Maintenance', dept: 'Maintenance', icon: '🛠️', hint: 'Hostel, classroom, Wi-Fi' },
    leave: { label: 'Leave', dept: 'HOD', icon: '🗓️', hint: 'Medical, personal, event' },
  };
  const PALETTE = ['#7c9cff', '#34d3a5', '#b892ff', '#5ad1ff', '#e3a6ff', '#7fe0c9', '#a5b8ff'];
  const SLOT_TIMES = ['18:00', '19:15', '20:30', '16:30'];
  // Weekdays that receive "extra" blocks first when hours don't divide evenly (Mon, Wed, Fri, Sat, Tue, Thu, Sun)
  const DAY_ORDER = [1, 3, 5, 6, 2, 4, 0];

  /* ---------- date helpers (local time, YYYY-MM-DD strings) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const todayStr = () => ymd(today());
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const nowIso = () => new Date().toISOString();

  /* ---------- persistence ---------- */
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.version === 1) { autoMarkMissed(s); return s; }
    } catch (e) { /* corrupted → reseed */ }
    const s = seed();
    persist(s);
    return s;
  }
  function persist(s = state) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function save() { persist(); emit(); }
  function emit() { listeners.forEach((fn) => fn(state)); }
  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { state = load(); emit(); }
  });

  /* ---------- seed data ---------- */
  function mkTopics(prefix, names, doneFlags, hours) {
    return names.map((name, i) => ({
      id: `${prefix}-t${i + 1}`,
      name,
      hours: (hours && hours[i]) || 2,
      done: !!doneFlags[i],
      doneAt: doneFlags[i] ? addDays(new Date(), -(names.length - i)).toISOString() : null,
    }));
  }

  function seed() {
    const t = today();
    const year = t.getFullYear();
    const at = (days, h, m) => { const d = addDays(t, days); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const rid = (n) => `CF-${year}-${String(n).padStart(4, '0')}`;

    const subjects = [
      {
        id: 'sub-ds', name: 'Data Structures', code: 'CS201', color: PALETTE[0], examDate: ymd(addDays(t, 9)),
        topics: mkTopics('ds', ['Arrays & Linked Lists', 'Stacks & Queues', 'Trees & BST', 'Heaps & Priority Queues', 'Graphs: BFS / DFS', 'Hashing'], [1, 1, 0, 0, 0, 0], [2, 2, 3, 2, 3, 2]),
      },
      {
        id: 'sub-db', name: 'Database Systems', code: 'CS203', color: PALETTE[1], examDate: ymd(addDays(t, 16)),
        topics: mkTopics('db', ['ER Modeling', 'Relational Algebra', 'SQL Joins & Subqueries', 'Normalization (1NF–BCNF)', 'Transactions & ACID'], [1, 0, 0, 0, 0], [2, 2, 3, 2, 2]),
      },
      {
        id: 'sub-ma', name: 'Engineering Maths III', code: 'MA201', color: PALETTE[2], examDate: ymd(addDays(t, 23)),
        topics: mkTopics('ma', ['Laplace Transforms', 'Fourier Series', 'Complex Variables', 'Probability Distributions'], [1, 0, 0, 0], [3, 3, 3, 2]),
      },
    ];

    const deadlines = [
      { id: 'dl-1', subjectId: 'sub-ds', title: 'Assignment 3 — BST implementation', due: ymd(addDays(t, 4)), done: false },
      { id: 'dl-2', subjectId: 'sub-db', title: 'Mini-project: ER diagram submission', due: ymd(addDays(t, 7)), done: false },
      { id: 'dl-3', subjectId: 'sub-ma', title: 'Problem Set 5', due: ymd(addDays(t, 12)), done: false },
    ];

    const student = USERS[0];
    const requests = [
      {
        id: rid(1), type: 'certificate', title: 'Bonafide certificate for summer internship',
        details: 'Needed for an internship application. Please address it to "Whom it may concern". 2 copies.',
        priority: 'High', location: '', fromDate: '', toDate: '',
        status: 'Completed', department: 'Admin Office',
        studentEmail: student.email, studentName: student.name,
        createdAt: at(-6, 10, 15), updatedAt: at(-3, 15, 40), completedAt: at(-3, 15, 40),
        history: [
          { status: 'Pending', at: at(-6, 10, 15), by: student.name, note: 'Request submitted' },
          { status: 'Assigned', at: at(-5, 11, 0), by: 'Dr. Priya Rao', note: 'Assigned to Admin Office' },
          { status: 'In Progress', at: at(-4, 9, 30), by: 'Dr. Priya Rao', note: 'Certificate being prepared' },
          { status: 'Completed', at: at(-3, 15, 40), by: 'Dr. Priya Rao', note: 'Ready for pickup at the front desk' },
        ],
      },
      {
        id: rid(2), type: 'lab', title: 'Arduino Uno kit ×2 for IoT mini-project',
        details: 'Two Arduino Uno kits with breadboards and jumper wires, for the IoT lab project (team of 3).',
        priority: 'Normal', location: 'IoT Lab, Block C', fromDate: '', toDate: '',
        status: 'Assigned', department: 'Lab Tech',
        studentEmail: student.email, studentName: student.name,
        createdAt: at(-2, 14, 20), updatedAt: at(-1, 10, 0), completedAt: null,
        history: [
          { status: 'Pending', at: at(-2, 14, 20), by: student.name, note: 'Request submitted' },
          { status: 'Assigned', at: at(-1, 10, 0), by: 'Dr. Priya Rao', note: 'Assigned to Lab Tech' },
        ],
      },
      {
        id: rid(3), type: 'maintenance', title: 'Ceiling fan not working',
        details: 'The ceiling fan stopped working yesterday evening. Regulator seems fine.',
        priority: 'Urgent', location: 'Hostel B, Room 214', fromDate: '', toDate: '',
        status: 'Pending', department: null,
        studentEmail: student.email, studentName: student.name,
        createdAt: at(-1, 21, 10), updatedAt: at(-1, 21, 10), completedAt: null,
        history: [{ status: 'Pending', at: at(-1, 21, 10), by: student.name, note: 'Request submitted' }],
      },
    ];

    const s = {
      version: 1,
      counters: { [year]: 3 },
      requests,
      subjects,
      deadlines,
      settings: { weeklyHours: 12 },
      blocks: [
        // Done yesterday-ish, and one MISSED block yesterday (demo of the reschedule flow)
        { id: 'blk-seed-done', date: ymd(addDays(t, -2)), start: '18:00', minutes: 60, subjectId: 'sub-ds', topicId: 'ds-t2', status: 'done', source: 'rule' },
        { id: 'blk-seed-missed', date: ymd(addDays(t, -1)), start: '18:00', minutes: 60, subjectId: 'sub-ds', topicId: 'ds-t3', status: 'missed', source: 'rule' },
      ],
      notifications: [
        { id: 'n1', to: student.email, text: `${rid(1)} is Completed — ready for pickup at the front desk.`, at: at(-3, 15, 40), read: false, ref: rid(1) },
        { id: 'n2', to: student.email, text: `${rid(2)} was assigned to Lab Tech.`, at: at(-1, 10, 0), read: false, ref: rid(2) },
        { id: 'n3', to: student.email, text: 'You missed yesterday’s Data Structures block (Trees & BST). Reschedule it in one click.', at: at(0, 7, 0), read: false, ref: null },
        { id: 'n4', to: 'admin', text: `New Urgent request ${rid(3)}: Ceiling fan not working.`, at: at(-1, 21, 10), read: false, ref: rid(3) },
        { id: 'n5', to: 'admin', text: `New request ${rid(2)}: Arduino Uno kit ×2.`, at: at(-2, 14, 20), read: true, ref: rid(2) },
      ],
      lastSchedule: null,
    };
    regenerateIn(s, 'rule');
    return s;
  }

  /* ---------- auth (demo, hardcoded) ---------- */
  function login(email, password) {
    const u = USERS.find((x) => x.email === String(email).trim().toLowerCase() && x.password === password);
    if (!u) return null;
    sessionStorage.setItem(SESSION_KEY, u.email);
    return publicUser(u);
  }
  function logout() { sessionStorage.removeItem(SESSION_KEY); }
  function currentUser() {
    const email = sessionStorage.getItem(SESSION_KEY);
    const u = USERS.find((x) => x.email === email);
    return u ? publicUser(u) : null;
  }
  const publicUser = ({ password, ...rest }) => rest;

  /* ---------- notifications ---------- */
  function notify(s, to, text, ref) {
    s.notifications.unshift({ id: 'n-' + uid(), to, text, at: nowIso(), read: false, ref: ref || null });
  }
  function notificationsFor(user) {
    const key = user.role === 'admin' ? 'admin' : user.email;
    return state.notifications.filter((n) => n.to === key).sort((a, b) => b.at.localeCompare(a.at));
  }
  function markAllRead(user) {
    const key = user.role === 'admin' ? 'admin' : user.email;
    state.notifications.forEach((n) => { if (n.to === key) n.read = true; });
    save();
  }

  /* ---------- service requests ---------- */
  function nextRequestId(s) {
    const year = new Date().getFullYear();
    s.counters[year] = (s.counters[year] || 0) + 1;
    return `CF-${year}-${String(s.counters[year]).padStart(4, '0')}`;
  }

  function createRequest(input, user) {
    const id = nextRequestId(state);
    const ts = nowIso();
    const req = {
      id,
      type: input.type,
      title: input.title.trim(),
      details: (input.details || '').trim(),
      priority: input.priority || 'Normal',
      location: (input.location || '').trim(),
      fromDate: input.fromDate || '',
      toDate: input.toDate || '',
      status: 'Pending',
      department: null,
      studentEmail: user.email,
      studentName: user.name,
      createdAt: ts,
      updatedAt: ts,
      completedAt: null,
      history: [{ status: 'Pending', at: ts, by: user.name, note: 'Request submitted' }],
    };
    state.requests.unshift(req);
    notify(state, 'admin', `New ${req.priority === 'Urgent' ? 'Urgent ' : ''}request ${id}: ${req.title}.`, id);
    notify(state, user.email, `${id} submitted. We’ll notify you as it moves along.`, id);
    save();
    return req;
  }

  function updateRequest(id, changes, actor) {
    const req = state.requests.find((r) => r.id === id);
    if (!req) return null;
    const ts = nowIso();
    const notes = [];

    if (changes.department && changes.department !== req.department) {
      req.department = changes.department;
      notes.push(`Assigned to ${req.department}`);
      if (req.status === 'Pending' && !changes.status) changes.status = 'Assigned';
    }
    const statusChanged = !!changes.status && changes.status !== req.status;
    if (statusChanged) {
      if (changes.status !== 'Pending' && !req.department) {
        req.department = TYPES[req.type].dept;
        notes.push(`Assigned to ${req.department}`);
      }
      req.status = changes.status;
      req.completedAt = req.status === 'Completed' ? ts : null;
      if (req.status === 'Pending') req.department = null;
    }
    if (!notes.length && !statusChanged) return req;

    req.updatedAt = ts;
    const note = changes.note || notes.join(' · ') || `Status changed to ${req.status}`;
    req.history.push({ status: req.status, at: ts, by: actor.name, note });
    notify(state, req.studentEmail, `${req.id} is now ${req.status}${req.department ? ` (${req.department})` : ''}.`, req.id);
    save();
    return req;
  }

  function nextStatus(status) {
    const i = STATUSES.indexOf(status);
    return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
  }

  function requestsFor(user) {
    const list = user.role === 'admin' ? state.requests : state.requests.filter((r) => r.studentEmail === user.email);
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function stats() {
    const r = state.requests;
    const done = r.filter((x) => x.status === 'Completed' && x.completedAt);
    const avgMs = done.length ? done.reduce((acc, x) => acc + (new Date(x.completedAt) - new Date(x.createdAt)), 0) / done.length : 0;
    const byDept = Object.fromEntries(DEPARTMENTS.map((d) => [d, r.filter((x) => x.department === d && x.status !== 'Completed').length]));
    return {
      total: r.length,
      pending: r.filter((x) => x.status === 'Pending').length,
      active: r.filter((x) => x.status === 'Assigned' || x.status === 'In Progress').length,
      completed: done.length,
      avgResolutionMs: avgMs,
      byDept,
    };
  }

  /* ---------- study planner ---------- */
  function addSubject({ name, code, examDate }) {
    const used = new Set(state.subjects.map((s) => s.color));
    const color = PALETTE.find((c) => !used.has(c)) || PALETTE[state.subjects.length % PALETTE.length];
    state.subjects.push({ id: 'sub-' + uid(), name: name.trim(), code: (code || '').trim(), color, examDate, topics: [] });
    regenerateIn(state, 'rule');
    save();
  }
  function removeSubject(id) {
    state.subjects = state.subjects.filter((s) => s.id !== id);
    state.deadlines = state.deadlines.filter((d) => d.subjectId !== id);
    state.blocks = state.blocks.filter((b) => b.subjectId !== id);
    save();
  }
  function updateSubject(id, changes) {
    const s = state.subjects.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, changes);
    regenerateIn(state, 'rule');
    save();
  }
  function addTopic(subjectId, name, hours) {
    const s = state.subjects.find((x) => x.id === subjectId);
    if (!s) return;
    s.topics.push({ id: 't-' + uid(), name: name.trim(), hours: Math.max(1, Math.min(10, Number(hours) || 2)), done: false, doneAt: null });
    regenerateIn(state, 'rule');
    save();
  }
  function removeTopic(subjectId, topicId) {
    const s = state.subjects.find((x) => x.id === subjectId);
    if (!s) return;
    s.topics = s.topics.filter((t) => t.id !== topicId);
    state.blocks = state.blocks.filter((b) => b.topicId !== topicId);
    regenerateIn(state, 'rule');
    save();
  }
  /** Toggle a topic; the remaining schedule is rebuilt so freed slots go to other topics. */
  function toggleTopic(subjectId, topicId) {
    const s = state.subjects.find((x) => x.id === subjectId);
    const t = s && s.topics.find((x) => x.id === topicId);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? nowIso() : null;
    if (t.done) state.blocks.forEach((b) => { if (b.topicId === topicId && b.status === 'planned' && b.date === todayStr()) b.status = 'done'; });
    regenerateIn(state, 'rule');
    save();
  }
  function setBlockStatus(blockId, status) {
    const b = state.blocks.find((x) => x.id === blockId);
    if (!b) return;
    b.status = status;
    save();
  }
  function addDeadline({ subjectId, title, due }) {
    state.deadlines.push({ id: 'dl-' + uid(), subjectId, title: title.trim(), due, done: false });
    save();
  }
  function toggleDeadline(id) {
    const d = state.deadlines.find((x) => x.id === id);
    if (d) { d.done = !d.done; save(); }
  }
  function removeDeadline(id) {
    state.deadlines = state.deadlines.filter((x) => x.id !== id);
    save();
  }
  function setWeeklyHours(h) {
    state.settings.weeklyHours = Math.max(2, Math.min(40, Number(h) || 10));
    save();
  }

  function studyProgress() {
    const all = state.subjects.flatMap((s) => s.topics);
    const done = all.filter((t) => t.done).length;
    return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
  }
  function nextExam() {
    const t = todayStr();
    return state.subjects.filter((s) => s.examDate && s.examDate >= t).sort((a, b) => a.examDate.localeCompare(b.examDate))[0] || null;
  }

  /** Past planned blocks become "missed" so the dashboard can surface them. */
  function autoMarkMissed(s) {
    const t = todayStr();
    s.blocks.forEach((b) => { if (b.status === 'planned' && b.date < t) b.status = 'missed'; });
  }

  function blocksPerWeekday(weeklyHours) {
    const n = Math.max(1, Math.round(weeklyHours));
    const per = {};
    for (let w = 0; w < 7; w++) per[w] = Math.floor(n / 7);
    for (let i = 0; i < n % 7; i++) per[DAY_ORDER[i]]++;
    for (const w in per) per[w] = Math.min(per[w], SLOT_TIMES.length);
    return per;
  }

  /**
   * Rule-based planner.
   * Each day gets N one-hour slots (from weekly hours). Each slot goes to the subject with the highest
   * urgency = remaining topic-hours / days until its exam, with a penalty if that subject was already
   * studied that day. Topics are covered in order; no study is scheduled on or after an exam day.
   */
  function planBlocks(subjects, weeklyHours, fromDate) {
    const per = blocksPerWeekday(weeklyHours);
    const work = subjects
      .filter((s) => s.examDate)
      .map((s) => ({ id: s.id, exam: s.examDate, queue: s.topics.filter((t) => !t.done).map((t) => ({ topicId: t.id, left: t.hours || 2 })) }))
      .filter((w) => w.queue.length);
    const out = [];
    const now = new Date();
    const nowHm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const remaining = (w) => w.queue.reduce((a, q) => a + q.left, 0);

    let d = parseYmd(fromDate);
    for (let guard = 0; guard < 180; guard++, d = addDays(d, 1)) {
      const day = ymd(d);
      const open = work.filter((w) => w.queue.length);
      if (!open.length || open.every((w) => w.exam <= day)) break;
      let times = SLOT_TIMES.slice(0, per[d.getDay()]);
      if (day === fromDate && day === todayStr()) times = times.filter((t) => t > nowHm);
      const usedToday = {};
      for (const time of times) {
        const cand = work.filter((w) => w.queue.length && w.exam > day);
        if (!cand.length) break;
        const score = (w) => (remaining(w) / Math.max(1, daysBetween(day, w.exam))) * (usedToday[w.id] ? 0.45 : 1);
        cand.sort((a, b) => score(b) - score(a) || a.exam.localeCompare(b.exam));
        const pick = cand[0];
        const item = pick.queue[0];
        out.push({ id: 'blk-' + uid(), date: day, start: time, minutes: 60, subjectId: pick.id, topicId: item.topicId, status: 'planned', source: 'rule' });
        item.left -= 1;
        if (item.left <= 0) pick.queue.shift();
        usedToday[pick.id] = (usedToday[pick.id] || 0) + 1;
      }
    }
    return out;
  }

  /** Keep history (done/missed/past), replace every future planned block. */
  function regenerateIn(s, source, aiBlocks) {
    autoMarkMissed(s);
    const t = todayStr();
    s.blocks = s.blocks.filter((b) => !(b.status === 'planned' && b.date >= t));
    const fresh = aiBlocks && aiBlocks.length ? aiBlocks : planBlocks(s.subjects, s.settings.weeklyHours, t);
    s.blocks.push(...fresh);
    s.blocks.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    s.lastSchedule = { at: nowIso(), source: aiBlocks && aiBlocks.length ? source : 'rule', count: fresh.length };
  }

  function regenerate() {
    regenerateIn(state, 'rule');
    // Missed blocks are now covered by the new plan → mark them as rescheduled
    state.blocks.forEach((b) => { if (b.status === 'missed') b.status = 'rescheduled'; });
    save();
    return state.lastSchedule;
  }

  /** Accept a schedule produced by the optional Claude function, after validating every block. */
  function applyAiBlocks(blocks) {
    const t = todayStr();
    const topicIds = new Map();
    state.subjects.forEach((s) => s.topics.forEach((tp) => { if (!tp.done) topicIds.set(tp.id, s.id); }));
    const clean = (Array.isArray(blocks) ? blocks : [])
      .filter((b) => b && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.date >= t && /^\d{2}:\d{2}$/.test(b.start) && topicIds.has(b.topicId))
      .slice(0, 200)
      .map((b) => ({
        id: 'blk-' + uid(), date: b.date, start: b.start, minutes: Math.max(30, Math.min(120, Number(b.minutes) || 60)),
        subjectId: topicIds.get(b.topicId), topicId: b.topicId, status: 'planned', source: 'claude',
      }));
    if (!clean.length) return null;
    regenerateIn(state, 'claude', clean);
    state.blocks.forEach((b) => { if (b.status === 'missed') b.status = 'rescheduled'; });
    save();
    return state.lastSchedule;
  }

  function subjectById(id) { return state.subjects.find((s) => s.id === id); }
  function topicById(subjectId, topicId) { const s = subjectById(subjectId); return s && s.topics.find((t) => t.id === topicId); }

  function resetDemo() {
    state = seed();
    save();
  }

  window.CF = {
    // constants
    DEPARTMENTS, STATUSES, PRIORITIES, TYPES, USERS: USERS.map(publicUser),
    // helpers
    ymd, parseYmd, addDays, today, todayStr, daysBetween,
    // state
    get state() { return state; }, on, resetDemo,
    // auth
    login, logout, currentUser,
    // notifications
    notificationsFor, markAllRead,
    // requests
    createRequest, updateRequest, nextStatus, requestsFor, stats,
    // study
    addSubject, removeSubject, updateSubject, addTopic, removeTopic, toggleTopic, setBlockStatus,
    addDeadline, toggleDeadline, removeDeadline, setWeeklyHours, studyProgress, nextExam,
    regenerate, applyAiBlocks, subjectById, topicById,
  };
})();
