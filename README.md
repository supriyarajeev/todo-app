# To-Do

### 👉 [Open the app](https://supriyarajeev.github.io/todo-app/)

**Live site:** https://supriyarajeev.github.io/todo-app/

A simple, fast, responsive personal task manager that runs entirely in the browser. No backend, no accounts, no build step — just three static files you can host on GitHub Pages.

> Stay organized. Get things done.

## Features

- **Create tasks** with a title (required), description, due date, priority (Low / Medium / High), and category
- **Edit** any task in a modal; changes save immediately
- **Complete / uncomplete** with a checkbox — completed tasks are dimmed and struck through
- **Delete** with a confirmation dialog so nothing disappears on a single click
- **Archive** to move a task out of the active list without losing it, and **Restore** to bring it back with all its data
- **Views**: All, Active, Completed, Archived — each with a live count badge
- **Filters** for priority, category, and due date (overdue / today / next 7 days / no due date), plus sorting by date created, due date, priority, or title
- **Search** across task titles and descriptions
- **Overdue highlighting** — an incomplete task past its due date gets a red edge and an "Overdue" chip
- **Empty states** that explain *why* the list is empty (no tasks yet vs. no matches vs. all caught up)
- **Dark mode** that follows your system theme, with a manual toggle that is remembered
- **Keyboard friendly**: `n` opens the add form, `Enter` submits, `Esc` closes, focus stays inside open dialogs, and every control has an ARIA label
- **Responsive** — cards stack and buttons become full-width tap targets on small screens

## Technology

- HTML5
- CSS3 (custom properties, flexbox; no framework)
- Vanilla JavaScript (ES2020, no dependencies, no build tools)

Everything runs client-side. There is no server, database, API, or login.

## How data is stored

All tasks live in your browser's **`localStorage`** under the key **`todoTasks`**, as a JSON array of task objects:

```js
{
  id: "8f2c…",              // unique identifier
  title: "Finish course",   // required
  description: "Modules 4–6",
  dueDate: "2026-09-15",    // yyyy-mm-dd, or "" when unset
  priority: "high",         // "low" | "medium" | "high"
  category: "Learning",
  completed: false,
  archived: false,
  createdAt: 1757200000000, // timestamp
  updatedAt: 1757200000000
}
```

The theme preference is stored separately under `todoTheme`.

**Important:** localStorage is specific to one browser on one device, per site origin. Your tasks will **not** sync between Chrome and Safari, between your laptop and your phone, or to another person's computer. Clearing site data or browsing in a private/incognito window will lose them. Tasks *do* survive refreshing the page, closing the tab, and quitting and reopening the browser.

Storage is read defensively: missing, empty, or corrupt data falls back to an empty list rather than breaking the app, and older records missing fields are filled in with sensible defaults.

## Run locally

Because the app is plain static files, you can simply open `index.html` in a browser.

To serve it over HTTP (closer to how GitHub Pages behaves):

```bash
cd todo-app
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works — `npx serve`, VS Code's Live Server, etc.

## Deploy to GitHub Pages

1. Create a repository on GitHub and push this project:

   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git branch -M main
   git push -u origin main
   ```

   Or, with the GitHub CLI (if `gh auth status` shows you're logged in):

   ```bash
   gh repo create <your-repo> --public --source=. --remote=origin --push
   ```

2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick branch **`main`** and folder **`/ (root)`**, then **Save**.
4. Wait about a minute, then load your site.

If `index.html` is not at the repository root (for example the repo contains this `todo-app/` folder), either push the *contents* of `todo-app/` to the repo root, or choose the `/docs` folder option after renaming the folder to `docs`.

### Expected URL format

```
https://<your-username>.github.io/<your-repo>/
```

This project is deployed at **https://supriyarajeev.github.io/todo-app/**. If you name the repo `<your-username>.github.io`, the site is served at `https://<your-username>.github.io/` instead.

## Project structure

```
todo-app/
├── index.html   # markup: header, toolbar, tabs, filters, list, modals
├── style.css    # design tokens, layout, task cards, dark mode, responsive rules
├── script.js    # storage, state, CRUD, filtering, rendering, modals, events
└── README.md
```

`script.js` is organized into commented sections — Storage, State, Task CRUD, Filtering, Rendering, Modals, Events — with small single-purpose functions rather than one large block.

## Known limitations

- **Single device / single browser.** Data lives in localStorage; there is no sync or backup. Clearing site data deletes your tasks.
- **No undo.** Deletion is permanent once confirmed (archiving is the reversible option).
- **No import/export** of tasks to a file yet.
- **No recurring tasks, subtasks, reminders, or notifications.**
- **No drag-and-drop reordering** — ordering is controlled by the sort dropdown.
- **No attachments or rich text** in descriptions.
- Storage capacity is roughly 5 MB, which is thousands of tasks, but the app will show a message if a save ever fails.

### Possible future enhancements

Export/import as JSON, an undo toast after deletion, drag-and-drop ordering, subtasks and tags, recurring tasks, and optional cloud sync.
