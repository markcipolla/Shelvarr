import api from './api.js';

// Icons (simple SVG strings)
const icons = {
  home: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>',
  library: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"></path></svg>',
  book: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>',
  collection: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>',
  duplicate: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>',
  user: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>',
  search: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>',
  download: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>',
  task: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>',
  settings: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>',
  star: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>',
};

// Navigation items
const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'libraries', label: 'Libraries', icon: 'library' },
  { id: 'books', label: 'Books', icon: 'book' },
  { id: 'series', label: 'Series', icon: 'collection' },
  { id: 'duplicates', label: 'Duplicates', icon: 'duplicate' },
  { id: 'authors', label: 'Authors', icon: 'user' },
  { id: 'wanted', label: 'Wanted', icon: 'star' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'downloads', label: 'Downloads', icon: 'download' },
  { id: 'tasks', label: 'Tasks', icon: 'task' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

// App state
const state = {
  currentPage: 'dashboard',
  settings: {},
  loading: true,
};

// Router
function navigate(page) {
  state.currentPage = page;
  window.history.pushState({ page }, '', `/${page === 'dashboard' ? '' : page}`);
  render();
}

// Handle browser back/forward
window.addEventListener('popstate', (event) => {
  state.currentPage = event.state?.page || 'dashboard';
  render();
});

// Render sidebar
function renderSidebar() {
  return `
    <aside class="w-64 bg-komgarr-surface border-r border-komgarr-border flex flex-col">
      <div class="p-4 border-b border-komgarr-border">
        <h1 class="text-xl font-bold text-komgarr-primary">Komgarr</h1>
        <p class="text-sm text-komgarr-text-muted">Book Library Manager</p>
      </div>
      <nav class="flex-1 p-4 space-y-1">
        ${navItems.map(item => `
          <a href="/${item.id === 'dashboard' ? '' : item.id}"
             class="sidebar-link ${state.currentPage === item.id ? 'active' : ''}"
             data-nav="${item.id}">
            ${icons[item.icon]}
            <span>${item.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="p-4 border-t border-komgarr-border text-sm text-komgarr-text-muted">
        <div>v0.1.0</div>
      </div>
    </aside>
  `;
}

// Page header helper - keeps headers consistent
function pageHeader(title, actions = '') {
  return `
    <div class="flex justify-between items-center min-h-[42px]">
      <h2 class="text-2xl font-bold leading-none">${title}</h2>
      <div class="flex gap-2 items-center">${actions}</div>
    </div>
  `;
}

// Page renderers
const pages = {
  dashboard: () => `
    <div class="space-y-6">
      ${pageHeader('Dashboard')}

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card">
          <div class="text-komgarr-text-muted text-sm">Libraries</div>
          <div class="text-3xl font-bold mt-1">0</div>
        </div>
        <div class="card">
          <div class="text-komgarr-text-muted text-sm">Books</div>
          <div class="text-3xl font-bold mt-1">0</div>
        </div>
        <div class="card">
          <div class="text-komgarr-text-muted text-sm">Series</div>
          <div class="text-3xl font-bold mt-1">0</div>
        </div>
        <div class="card">
          <div class="text-komgarr-text-muted text-sm">Authors Tracked</div>
          <div class="text-3xl font-bold mt-1">0</div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Quick Actions</h3>
        <div class="flex flex-wrap gap-3">
          <button class="btn-primary" data-action="add-library">Add Library</button>
          <button class="btn-secondary" data-action="scan-all">Scan All Libraries</button>
          <button class="btn-secondary" data-action="refresh-metadata">Refresh Metadata</button>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Recent Activity</h3>
        <p class="text-komgarr-text-muted">No recent activity.</p>
      </div>
    </div>
  `,

  libraries: () => `
    <div class="space-y-6">
      ${pageHeader('Libraries', '<button class="btn-primary" data-action="add-library">Add Library</button>')}

      <div class="card">
        <p class="text-komgarr-text-muted">No libraries configured. Add a library to get started.</p>
      </div>
    </div>
  `,

  books: () => `
    <div class="space-y-6">
      ${pageHeader('Books', `
        <input type="text" class="input w-64 h-9" placeholder="Search books...">
        <button class="btn-secondary h-9">Filter</button>
      `)}

      <div class="card">
        <p class="text-komgarr-text-muted">No books found. Add a library and scan to import books.</p>
      </div>
    </div>
  `,

  series: () => `
    <div class="space-y-6">
      ${pageHeader('Series')}
      <div class="card">
        <p class="text-komgarr-text-muted">No series detected. Series are automatically detected when scanning libraries.</p>
      </div>
    </div>
  `,

  duplicates: () => `
    <div class="space-y-6">
      ${pageHeader('Duplicates')}
      <div class="card">
        <p class="text-komgarr-text-muted">No duplicate books detected.</p>
      </div>
    </div>
  `,

  authors: () => `
    <div class="space-y-6">
      ${pageHeader('Authors', '<button class="btn-primary" data-action="add-author">Track Author</button>')}

      <div class="card">
        <p class="text-komgarr-text-muted">No authors tracked. Track authors to see their full bibliography and find missing books.</p>
      </div>
    </div>
  `,

  wanted: () => `
    <div class="space-y-6">
      ${pageHeader('Wanted Books')}
      <div class="card">
        <p class="text-komgarr-text-muted">No books on your wanted list. Track authors and mark books as wanted to see them here.</p>
      </div>
    </div>
  `,

  search: () => `
    <div class="space-y-6">
      ${pageHeader('Search External Sources')}

      <div class="card">
        <div class="flex gap-2 mb-4">
          <input type="text" class="input flex-1" placeholder="Search by title, author, or ISBN...">
          <button class="btn-primary">Search</button>
        </div>
        <p class="text-komgarr-text-muted text-sm">Search across Z-Library, Anna's Archive, and Library Genesis.</p>
      </div>
    </div>
  `,

  downloads: () => `
    <div class="space-y-6">
      ${pageHeader('Downloads')}
      <div class="card">
        <p class="text-komgarr-text-muted">No active downloads.</p>
      </div>
    </div>
  `,

  tasks: () => `
    <div class="space-y-6">
      ${pageHeader('Background Tasks')}
      <div class="card">
        <p class="text-komgarr-text-muted">No tasks running.</p>
      </div>
    </div>
  `,

  settings: () => `
    <div class="space-y-6">
      ${pageHeader('Settings')}

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Komga Integration</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-komgarr-text-muted mb-1">Komga URL</label>
            <input type="text" class="input" placeholder="http://localhost:25600" id="komga-url">
          </div>
          <div>
            <label class="block text-sm text-komgarr-text-muted mb-1">Username</label>
            <input type="text" class="input" id="komga-username">
          </div>
          <div>
            <label class="block text-sm text-komgarr-text-muted mb-1">Password</label>
            <input type="password" class="input" id="komga-password">
          </div>
          <div class="flex gap-2">
            <button class="btn-primary">Save</button>
            <button class="btn-secondary">Test Connection</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">File Organization</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-komgarr-text-muted mb-1">Naming Template</label>
            <input type="text" class="input" value="{author}/{series}/{title} ({year})" id="naming-template">
            <p class="text-xs text-komgarr-text-muted mt-1">Variables: {author}, {title}, {series}, {series_number}, {year}, {isbn}</p>
          </div>
          <button class="btn-primary">Save</button>
        </div>
      </div>
    </div>
  `,
};

// Main render function
function render() {
  const app = document.getElementById('app');
  const pageContent = pages[state.currentPage] ? pages[state.currentPage]() : '<p>Page not found</p>';

  app.innerHTML = `
    <div class="flex h-screen">
      ${renderSidebar()}
      <main class="flex-1 overflow-auto p-6">
        ${pageContent}
      </main>
    </div>
  `;

  // Attach event listeners
  attachEventListeners();
}

// Event listeners
function attachEventListeners() {
  // Navigation links
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(e.currentTarget.dataset.nav);
    });
  });

  // Action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      handleAction(action);
    });
  });
}

// Action handlers
function handleAction(action) {
  switch (action) {
    case 'add-library':
      alert('Add Library dialog - coming soon!');
      break;
    case 'scan-all':
      alert('Scan All - coming soon!');
      break;
    case 'refresh-metadata':
      alert('Refresh Metadata - coming soon!');
      break;
    case 'add-author':
      alert('Add Author dialog - coming soon!');
      break;
    default:
      console.log('Unknown action:', action);
  }
}

// Initialize app
async function init() {
  try {
    // Check API health
    const health = await api.health();
    console.log('API Health:', health);

    // Load settings
    state.settings = await api.getSettings();

    // Determine initial page from URL
    const path = window.location.pathname.slice(1) || 'dashboard';
    state.currentPage = navItems.find(item => item.id === path) ? path : 'dashboard';

    state.loading = false;
    render();
  } catch (error) {
    console.error('Failed to initialize:', error);
    document.getElementById('app').innerHTML = `
      <div class="flex items-center justify-center h-screen">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-red-500 mb-2">Failed to connect</h1>
          <p class="text-gray-400">${error.message}</p>
          <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-blue-600 rounded">Retry</button>
        </div>
      </div>
    `;
  }
}

// Start the app
init();
