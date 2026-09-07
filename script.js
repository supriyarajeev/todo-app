/* =========================================================
   To-Do List — vanilla JS, localStorage persistence.
   Structure:
     1. Storage        — load/save tasks
     2. State          — tasks + current view/filters
     3. Task CRUD      — create/update/delete/toggle/archive
     4. Filtering      — view, search, filters, sorting
     5. Rendering      — task cards, counts, empty states
     6. Modals         — add/edit form + delete confirmation
     7. Events         — wiring it all up
   ========================================================= */

'use strict';

const STORAGE_KEY = 'todoTasks';
const THEME_KEY = 'todoTheme';

/* ---------------------------------------------------------
   1. Storage
   --------------------------------------------------------- */

/** Read tasks from localStorage. Returns [] for empty/corrupt storage. */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Normalize so older/partial records never break rendering.
    return parsed.filter(t => t && typeof t === 'object').map(normalizeTask);
  } catch (err) {
    console.error('Could not read saved tasks:', err);
    return [];
  }
}

/** Fill in any missing fields with safe defaults. */
function normalizeTask(t) {
  return {
    id: t.id || makeId(),
    title: String(t.title || 'Untitled task'),
    description: String(t.description || ''),
    dueDate: t.dueDate || '',
    priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
    category: String(t.category || ''),
    completed: Boolean(t.completed),
    archived: Boolean(t.archived),
    createdAt: t.createdAt || Date.now(),
    updatedAt: t.updatedAt || t.createdAt || Date.now()
  };
}

/** Persist the current task array. */
function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (err) {
    console.error('Could not save tasks:', err);
    showToast('Could not save — browser storage may be full or blocked.');
  }
}

/** Reasonably unique id without any dependency. */
function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ---------------------------------------------------------
   2. State
   --------------------------------------------------------- */

const state = {
  tasks: loadTasks(),
  view: 'all',            // all | active | completed | archived
  search: '',
  priority: 'all',
  category: 'all',
  due: 'all',
  sort: 'created-desc',
  editingId: null,        // task being edited, or null when adding
  pendingDeleteId: null,
  isSubmitting: false     // guards against duplicate submissions
};

// Cached DOM references.
const el = {
  list: document.getElementById('task-list'),
  empty: document.getElementById('empty-state'),
  emptyTitle: document.getElementById('empty-title'),
  emptyText: document.getElementById('empty-text'),
  search: document.getElementById('search'),
  tabs: document.querySelectorAll('.view'),
  filterPriority: document.getElementById('filter-priority'),
  filterCategory: document.getElementById('filter-category'),
  filterDue: document.getElementById('filter-due'),
  sortBy: document.getElementById('sort-by'),
  clearFilters: document.getElementById('clear-filters'),
  addBtn: document.getElementById('add-task-btn'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalTitle: document.getElementById('modal-title'),
  form: document.getElementById('task-form'),
  fTitle: document.getElementById('f-title'),
  fDescription: document.getElementById('f-description'),
  fDueDate: document.getElementById('f-dueDate'),
  fPriority: document.getElementById('f-priority'),
  fCategory: document.getElementById('f-category'),
  titleError: document.getElementById('title-error'),
  modalCancel: document.getElementById('modal-cancel'),
  modalSave: document.getElementById('modal-save'),
  categoryList: document.getElementById('category-list'),
  confirmOverlay: document.getElementById('confirm-overlay'),
  confirmCancel: document.getElementById('confirm-cancel'),
  confirmOk: document.getElementById('confirm-ok'),
  toast: document.getElementById('toast'),
  themeToggle: document.getElementById('theme-toggle')
};

/* ---------------------------------------------------------
   3. Task CRUD
   --------------------------------------------------------- */

function createTask(data) {
  const now = Date.now();
  state.tasks.unshift({
    id: makeId(),
    title: data.title,
    description: data.description,
    dueDate: data.dueDate,
    priority: data.priority,
    category: data.category,
    completed: false,
    archived: false,
    createdAt: now,
    updatedAt: now
  });
  saveTasks();
  render();
}

function updateTask(id, data) {
  const task = findTask(id);
  if (!task) return;
  Object.assign(task, data, { updatedAt: Date.now() });
  saveTasks();
  render();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveTasks();
  render();
}

function toggleComplete(id) {
  const task = findTask(id);
  if (!task) return;
  task.completed = !task.completed;
  task.updatedAt = Date.now();
  saveTasks();
  render();
}

function setArchived(id, archived) {
  const task = findTask(id);
  if (!task) return;
  task.archived = archived;
  task.updatedAt = Date.now();
  saveTasks();
  render();
  showToast(archived ? 'Task archived' : 'Task restored');
}

function findTask(id) {
  return state.tasks.find(t => t.id === id);
}

/* ---------------------------------------------------------
   4. Filtering, searching, sorting
   --------------------------------------------------------- */

/** Midnight today, used for all due-date comparisons. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse a yyyy-mm-dd string as a LOCAL date (avoids UTC off-by-one). */
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** A task is overdue when it has a past due date and isn't completed. */
function isOverdue(task) {
  if (task.completed || !task.dueDate) return false;
  const due = parseDate(task.dueDate);
  return due !== null && due < startOfToday();
}

/** Tasks matching the current view tab (before other filters). */
function tasksForView(view) {
  switch (view) {
    case 'active': return state.tasks.filter(t => !t.archived && !t.completed);
    case 'completed': return state.tasks.filter(t => !t.archived && t.completed);
    case 'archived': return state.tasks.filter(t => t.archived);
    default: return state.tasks.filter(t => !t.archived); // "All" = all non-archived
  }
}

/** Apply search + priority/category/due filters, then sort. */
function getVisibleTasks() {
  const term = state.search.trim().toLowerCase();
  const today = startOfToday();
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);

  const filtered = tasksForView(state.view).filter(task => {
    if (term) {
      const haystack = (task.title + ' ' + task.description).toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    if (state.priority !== 'all' && task.priority !== state.priority) return false;
    if (state.category !== 'all' && (task.category || '') !== state.category) return false;

    if (state.due !== 'all') {
      const due = parseDate(task.dueDate);
      if (state.due === 'none') return !due;
      if (!due) return false;
      if (state.due === 'overdue' && !isOverdue(task)) return false;
      if (state.due === 'today' && due.getTime() !== today.getTime()) return false;
      if (state.due === 'week' && (due < today || due > weekAhead)) return false;
    }
    return true;
  });

  return sortTasks(filtered);
}

function sortTasks(tasks) {
  const rank = { high: 3, medium: 2, low: 1 };
  const copy = tasks.slice();
  switch (state.sort) {
    case 'created-asc':
      return copy.sort((a, b) => a.createdAt - b.createdAt);
    case 'due-asc':
      // Tasks without a due date sort to the end.
      return copy.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return b.createdAt - a.createdAt;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    case 'priority-desc':
      return copy.sort((a, b) => rank[b.priority] - rank[a.priority] || b.createdAt - a.createdAt);
    case 'title-asc':
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    default:
      return copy.sort((a, b) => b.createdAt - a.createdAt);
  }
}

/** Unique, sorted list of categories currently in use. */
function allCategories() {
  const set = new Set();
  state.tasks.forEach(t => { if (t.category) set.add(t.category); });
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ---------------------------------------------------------
   5. Rendering
   --------------------------------------------------------- */

function render() {
  renderCounts();
  renderCategoryOptions();
  renderList();
}

function renderCounts() {
  const counts = {
    all: state.tasks.filter(t => !t.archived).length,
    active: state.tasks.filter(t => !t.archived && !t.completed).length,
    completed: state.tasks.filter(t => !t.archived && t.completed).length,
    archived: state.tasks.filter(t => t.archived).length
  };
  document.querySelectorAll('[data-count]').forEach(node => {
    node.textContent = counts[node.dataset.count];
  });
}

/** Keep the category filter dropdown and the form datalist in sync. */
function renderCategoryOptions() {
  const cats = allCategories();

  const previous = state.category;
  el.filterCategory.innerHTML = '<option value="all">Any</option>';
  cats.forEach(c => el.filterCategory.appendChild(new Option(c, c)));
  // If the selected category no longer exists, fall back to "Any".
  if (previous !== 'all' && !cats.includes(previous)) state.category = 'all';
  el.filterCategory.value = state.category;

  el.categoryList.innerHTML = '';
  cats.forEach(c => el.categoryList.appendChild(new Option(c)));
}

function renderList() {
  const tasks = getVisibleTasks();
  el.list.innerHTML = '';

  if (tasks.length === 0) {
    el.empty.hidden = false;
    setEmptyMessage();
    return;
  }
  el.empty.hidden = true;

  const frag = document.createDocumentFragment();
  tasks.forEach(task => frag.appendChild(buildTaskCard(task)));
  el.list.appendChild(frag);
}

/** Choose an empty-state message that reflects why the list is empty. */
function setEmptyMessage() {
  const hasAnyTasks = state.tasks.length > 0;
  const filtersActive = state.search.trim() !== '' || state.priority !== 'all'
    || state.category !== 'all' || state.due !== 'all';

  if (!hasAnyTasks) {
    el.emptyTitle.textContent = 'No tasks yet';
    el.emptyText.textContent = 'Click "+ Add Task" to create your first one.';
  } else if (filtersActive) {
    el.emptyTitle.textContent = 'No matching tasks';
    el.emptyText.textContent = 'Try a different search term or reset the filters.';
  } else if (state.view === 'archived') {
    el.emptyTitle.textContent = 'Nothing archived';
    el.emptyText.textContent = 'Archived tasks are kept here instead of being deleted.';
  } else if (state.view === 'completed') {
    el.emptyTitle.textContent = 'Nothing completed yet';
    el.emptyText.textContent = 'Check off a task and it will show up here.';
  } else if (state.view === 'active') {
    el.emptyTitle.textContent = 'All caught up 🎉';
    el.emptyText.textContent = 'You have no active tasks right now.';
  } else {
    el.emptyTitle.textContent = 'Nothing here yet';
    el.emptyText.textContent = 'Add a task to get started.';
  }
}

/** Build one ledger row. Uses DOM APIs so user text is never HTML. */
function buildTaskCard(task) {
  const overdue = isOverdue(task);

  const li = document.createElement('li');
  li.className = 'task';
  li.dataset.id = task.id;
  if (task.completed) li.classList.add('is-completed');
  if (overdue) li.classList.add('is-overdue');

  /* --- column 1: checkbox + title + notes + chips --- */
  const main = document.createElement('div');
  main.className = 'task-main';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-check';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label',
    (task.completed ? 'Mark as not completed: ' : 'Mark as completed: ') + task.title);
  checkbox.addEventListener('change', () => toggleComplete(task.id));

  const body = document.createElement('div');
  body.className = 'task-body';

  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;
  body.appendChild(title);

  if (task.description) {
    const desc = document.createElement('div');
    desc.className = 'task-desc';
    desc.textContent = task.description;
    body.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.appendChild(chip(capitalize(task.priority), 'chip-' + task.priority));
  if (task.category) meta.appendChild(chip(task.category, 'chip-plain'));
  if (task.archived) meta.appendChild(chip('Archived', 'chip-plain'));
  body.appendChild(meta);

  main.append(checkbox, body);

  /* --- column 2: due date, absolute above relative --- */
  const due = document.createElement('div');
  due.className = 'task-due';
  if (task.dueDate) {
    due.textContent = formatDate(task.dueDate);
    const rel = document.createElement('span');
    rel.className = 'rel';
    rel.textContent = relativeDue(task.dueDate);
    due.appendChild(rel);
    if (overdue) due.classList.add('is-overdue');
  } else {
    due.classList.add('is-none');
    due.textContent = '—';
  }

  /* --- column 3: actions --- */
  const actions = document.createElement('div');
  actions.className = 'task-actions';
  actions.appendChild(actionButton('Edit', 'Edit task: ' + task.title, () => openTaskModal(task.id)));

  if (task.archived) {
    actions.appendChild(actionButton('Restore', 'Restore task: ' + task.title, () => setArchived(task.id, false)));
  } else {
    actions.appendChild(actionButton('Archive', 'Archive task: ' + task.title, () => setArchived(task.id, true)));
  }

  const del = actionButton('Delete', 'Delete task: ' + task.title, () => askDelete(task.id));
  del.classList.add('btn-danger');
  actions.appendChild(del);

  li.append(main, due, actions);
  return li;
}

function chip(text, extraClass) {
  const span = document.createElement('span');
  span.className = 'chip' + (extraClass ? ' ' + extraClass : '');
  span.textContent = text;
  return span;
}

function actionButton(label, ariaLabel, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = label;
  btn.setAttribute('aria-label', ariaLabel);
  btn.addEventListener('click', onClick);
  return btn;
}

function formatDate(str) {
  const d = parseDate(str);
  if (!d) return str;
  const opts = { month: 'short', day: 'numeric' };
  // Include the year when it isn't the current year.
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

/** Human phrasing for how far off a due date is — how people actually
 *  think about deadlines ("in 9 days" reads faster than "Sep 15"). */
function relativeDue(str) {
  const due = parseDate(str);
  if (!due) return '';
  const days = Math.round((due - startOfToday()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return '1 day ago';
  if (days < 0) return Math.abs(days) + ' days ago';
  if (days < 30) return 'in ' + days + ' days';
  const months = Math.round(days / 30);
  return 'in ' + months + (months === 1 ? ' month' : ' months');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------------------------------------------------
   6. Modals
   --------------------------------------------------------- */

let lastFocused = null;

/** Open the add/edit modal. Pass a task id to edit, or nothing to add. */
function openTaskModal(id) {
  state.editingId = id || null;
  state.isSubmitting = false;
  lastFocused = document.activeElement;

  el.titleError.hidden = true;
  el.modalSave.disabled = false;

  if (id) {
    const task = findTask(id);
    if (!task) return;
    el.modalTitle.textContent = 'Edit Task';
    el.modalSave.textContent = 'Save Changes';
    el.fTitle.value = task.title;
    el.fDescription.value = task.description;
    el.fDueDate.value = task.dueDate;
    el.fPriority.value = task.priority;
    el.fCategory.value = task.category;
  } else {
    el.modalTitle.textContent = 'Add Task';
    el.modalSave.textContent = 'Save Task';
    el.form.reset();
    el.fPriority.value = 'medium';
  }

  el.modalOverlay.hidden = false;
  el.fTitle.focus();
}

function closeTaskModal() {
  el.modalOverlay.hidden = true;
  state.editingId = null;
  state.isSubmitting = false;
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

/** Validate and save the add/edit form. */
function submitTaskForm(event) {
  event.preventDefault();
  // Guard against duplicate submissions: ignore a repeat submit while one is in
  // flight, or any submit that arrives after the modal has already closed.
  if (state.isSubmitting || el.modalOverlay.hidden) return;

  const title = el.fTitle.value.trim();
  if (!title) {
    el.titleError.hidden = false;
    el.fTitle.focus();
    return;
  }
  el.titleError.hidden = true;

  state.isSubmitting = true;
  el.modalSave.disabled = true;

  const data = {
    title,
    description: el.fDescription.value.trim(),
    dueDate: el.fDueDate.value,
    priority: el.fPriority.value,
    category: el.fCategory.value.trim()
  };

  if (state.editingId) {
    updateTask(state.editingId, data);
    showToast('Task updated');
  } else {
    createTask(data);
    showToast('Task added');
  }
  closeTaskModal();
}

function askDelete(id) {
  state.pendingDeleteId = id;
  lastFocused = document.activeElement;
  el.confirmOverlay.hidden = false;
  el.confirmCancel.focus();
}

function closeConfirm() {
  el.confirmOverlay.hidden = true;
  state.pendingDeleteId = null;
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function confirmDelete() {
  if (state.pendingDeleteId) {
    deleteTask(state.pendingDeleteId);
    showToast('Task deleted');
  }
  closeConfirm();
}

let toastTimer = null;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200);
}

/* ---------------------------------------------------------
   7. Events
   --------------------------------------------------------- */

function setView(view) {
  state.view = view;
  el.tabs.forEach(tab => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  });
  renderList();
}

function wireEvents() {
  el.addBtn.addEventListener('click', () => openTaskModal());
  el.tabs.forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

  el.search.addEventListener('input', () => { state.search = el.search.value; renderList(); });
  el.filterPriority.addEventListener('change', () => { state.priority = el.filterPriority.value; renderList(); });
  el.filterCategory.addEventListener('change', () => { state.category = el.filterCategory.value; renderList(); });
  el.filterDue.addEventListener('change', () => { state.due = el.filterDue.value; renderList(); });
  el.sortBy.addEventListener('change', () => { state.sort = el.sortBy.value; renderList(); });

  el.clearFilters.addEventListener('click', () => {
    state.search = ''; state.priority = 'all'; state.category = 'all';
    state.due = 'all'; state.sort = 'created-desc';
    el.search.value = '';
    el.filterPriority.value = 'all';
    el.filterCategory.value = 'all';
    el.filterDue.value = 'all';
    el.sortBy.value = 'created-desc';
    renderList();
  });

  el.form.addEventListener('submit', submitTaskForm);
  el.modalCancel.addEventListener('click', closeTaskModal);
  el.confirmCancel.addEventListener('click', closeConfirm);
  el.confirmOk.addEventListener('click', confirmDelete);

  // Click on the dark backdrop closes the dialog.
  el.modalOverlay.addEventListener('mousedown', e => { if (e.target === el.modalOverlay) closeTaskModal(); });
  el.confirmOverlay.addEventListener('mousedown', e => { if (e.target === el.confirmOverlay) closeConfirm(); });

  // Enter submits from the title / category / date inputs (not the textarea).
  el.form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      el.form.requestSubmit ? el.form.requestSubmit() : submitTaskForm(e);
    }
  });

  // Global keyboard shortcuts.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!el.confirmOverlay.hidden) closeConfirm();
      else if (!el.modalOverlay.hidden) closeTaskModal();
    }
    // "n" opens the add form when not typing in a field.
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === 'n' && !typing && el.modalOverlay.hidden && el.confirmOverlay.hidden) {
      e.preventDefault();
      openTaskModal();
    }
  });

  // Keep focus inside an open modal (simple focus trap).
  [el.modalOverlay, el.confirmOverlay].forEach(overlay => {
    overlay.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusable = overlay.querySelectorAll('button, input, textarea, select, [href]');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  });

  // Theme toggle, remembered across sessions.
  el.themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (!document.documentElement.hasAttribute('data-theme')
          && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* storage blocked; ignore */ }
  });

  // Reflect changes made in another tab of the same app.
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY) { state.tasks = loadTasks(); render(); }
  });
}

function applySavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  } catch (err) { /* storage blocked; use system theme */ }
}

// Boot
applySavedTheme();
wireEvents();
render();
