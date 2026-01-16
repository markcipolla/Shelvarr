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
  folder: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>',
  folderOpen: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path></svg>',
  chevronUp: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>',
  refresh: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>',
  trash: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>',
  spinner: '<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>',
  edit: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>',
  externalLink: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>',
  check: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
  x: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
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
  libraries: [],
  books: { books: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
  booksSearch: '',
  booksLibraryFilter: '',
  selectedBook: null,
  editingBook: null,
  metadataSearchResults: [],
  metadataSearchLoading: false,
  metadataSearchQuery: '',
  metadataSearchBookId: null,
  // Series state
  series: [],
  seriesLoading: false,
  // Duplicates state
  duplicates: { hashDuplicates: [], similarityDuplicates: [], total: 0 },
  duplicatesLoading: false,
  // Organization state
  organizePreview: null,
  organizeLibraryId: null,
  organizeTemplate: '{series}/Book {number} - {title} - {author} ({year}) [{isbn}]',
  organizeLoading: false,
  // Komga state
  komgaStatus: null,
  komgaTesting: false,
  komgaLibraries: [],
  // Tasks state
  tasks: { tasks: [], total: 0 },
  taskStats: { total: 0, pending: 0, running: 0, completed: 0, failed: 0 },
  tasksLoading: false,
  recentTasks: [],
};

// Router
function navigate(page) {
  state.currentPage = page;
  window.history.pushState({ page }, '', `/${page === 'dashboard' ? '' : page}`);
  render();
  loadPageData(page);
}

// Load data for specific pages
async function loadPageData(page) {
  try {
    if (page === 'libraries') {
      await loadLibraries();
    } else if (page === 'books') {
      await loadBooks();
    } else if (page === 'dashboard') {
      await loadDashboardStats();
    } else if (page === 'series') {
      await loadSeries();
    } else if (page === 'duplicates') {
      await loadDuplicates();
    } else if (page === 'settings') {
      await loadKomgaStatus();
    } else if (page === 'tasks') {
      await loadTasks();
    }
  } catch (error) {
    console.error('Error loading page data:', error);
  }
}

async function loadLibraries() {
  try {
    const result = await api.getLibraries();
    state.libraries = result.libraries || [];
    render();
  } catch (error) {
    console.error('Error loading libraries:', error);
  }
}

async function loadBooks() {
  try {
    const params = {
      page: state.books.page,
      pageSize: state.books.pageSize,
    };
    if (state.booksSearch) params.search = state.booksSearch;
    if (state.booksLibraryFilter) params.libraryId = state.booksLibraryFilter;

    const result = await api.getBooks(params);
    state.books = result;
    render();
  } catch (error) {
    console.error('Error loading books:', error);
  }
}

async function loadDashboardStats() {
  try {
    const [libResult, booksResult, seriesResult, recentTasksResult, taskStatsResult] = await Promise.all([
      api.getLibraries(),
      api.getBooks({ pageSize: 1 }),
      api.getSeries(),
      api.getRecentTasks(5),
      api.getTaskStats(),
    ]);
    state.libraries = libResult.libraries || [];
    state.dashboardStats = {
      libraries: state.libraries.length,
      books: booksResult.total || 0,
      series: seriesResult.series?.length || 0,
    };
    state.recentTasks = recentTasksResult.tasks || [];
    state.taskStats = taskStatsResult;
    render();
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

async function loadSeries() {
  try {
    state.seriesLoading = true;
    render();
    const result = await api.getSeries();
    state.series = result.series || [];
    state.seriesLoading = false;
    render();
  } catch (error) {
    console.error('Error loading series:', error);
    state.seriesLoading = false;
    render();
  }
}

async function loadDuplicates() {
  try {
    state.duplicatesLoading = true;
    render();
    const result = await api.getDuplicates();
    state.duplicates = result;
    state.duplicatesLoading = false;
    render();
  } catch (error) {
    console.error('Error loading duplicates:', error);
    state.duplicatesLoading = false;
    render();
  }
}

async function loadKomgaStatus() {
  if (!state.settings?._config?.komgaConfigured) {
    return;
  }

  try {
    state.komgaTesting = true;
    render();

    const status = await api.getKomgaStatus();
    state.komgaStatus = status;

    if (status.connected) {
      const libResult = await api.getKomgaLibraries();
      state.komgaLibraries = libResult.libraries || [];
    }

    state.komgaTesting = false;
    render();
  } catch (error) {
    console.error('Error loading Komga status:', error);
    state.komgaStatus = { connected: false, error: error.message };
    state.komgaTesting = false;
    render();
  }
}

async function testKomgaConnection() {
  try {
    state.komgaTesting = true;
    state.komgaStatus = null;
    render();

    const status = await api.getKomgaStatus();
    state.komgaStatus = status;

    if (status.connected) {
      const libResult = await api.getKomgaLibraries();
      state.komgaLibraries = libResult.libraries || [];
    }

    state.komgaTesting = false;
    render();
  } catch (error) {
    console.error('Error testing Komga connection:', error);
    state.komgaStatus = { connected: false, error: error.message };
    state.komgaTesting = false;
    render();
  }
}

async function loadTasks() {
  try {
    state.tasksLoading = true;
    render();

    const [tasksResult, statsResult] = await Promise.all([
      api.getTasks({ limit: 50 }),
      api.getTaskStats(),
    ]);

    state.tasks = tasksResult;
    state.taskStats = statsResult;
    state.tasksLoading = false;
    render();
  } catch (error) {
    console.error('Error loading tasks:', error);
    state.tasksLoading = false;
    render();
  }
}

async function cancelTask(taskId) {
  try {
    await api.cancelTask(taskId);
    await loadTasks();
  } catch (error) {
    alert(`Error cancelling task: ${error.message}`);
  }
}

async function scanAllKomgaLibraries() {
  try {
    await api.scanAllKomgaLibraries();
    alert('Scan triggered for all Komga libraries!');
  } catch (error) {
    alert(`Error triggering Komga scan: ${error.message}`);
  }
}

async function previewOrganize(libraryId, template) {
  try {
    state.organizeLoading = true;
    state.organizeLibraryId = libraryId;
    state.organizeTemplate = template;
    render();
    const result = await api.previewOrganize({ libraryId, template });
    state.organizePreview = result;
    state.organizeLoading = false;
    render();
  } catch (error) {
    console.error('Error previewing organization:', error);
    state.organizeLoading = false;
    alert(`Error: ${error.message}`);
    render();
  }
}

async function applyOrganize() {
  if (!state.organizeLibraryId || !state.organizePreview) return;

  if (!confirm(`This will move ${state.organizePreview.willMove} files. Continue?`)) {
    return;
  }

  try {
    state.organizeLoading = true;
    render();
    const result = await api.applyOrganize({
      libraryId: state.organizeLibraryId,
      template: state.organizeTemplate,
    });
    state.organizeLoading = false;
    state.organizePreview = null;
    alert(`Organization complete: ${result.moved} files moved`);
    // Reload library data
    await loadLibraries();
    render();
  } catch (error) {
    console.error('Error applying organization:', error);
    state.organizeLoading = false;
    alert(`Error: ${error.message}`);
    render();
  }
}

// Handle browser back/forward
window.addEventListener('popstate', (event) => {
  state.currentPage = event.state?.page || 'dashboard';
  render();
  loadPageData(state.currentPage);
});

// Render sidebar
function renderSidebar() {
  return `
    <aside class="w-64 bg-shelvarr-surface border-r border-shelvarr-border flex flex-col">
      <div class="p-4 border-b border-shelvarr-border">
        <h1 class="text-xl font-bold text-shelvarr-primary">Shelvarr</h1>
        <p class="text-sm text-shelvarr-text-muted">Book Library Manager</p>
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
      <div class="p-4 border-t border-shelvarr-border text-sm text-shelvarr-text-muted">
        <div>v0.0.1</div>
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

// Modal helper
function modal(id, title, content) {
  return `
    <div id="${id}" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden">
      <div class="bg-shelvarr-surface rounded-lg shadow-xl w-full max-w-md mx-4">
        <div class="flex justify-between items-center p-4 border-b border-shelvarr-border">
          <h3 class="text-lg font-semibold">${title}</h3>
          <button class="text-shelvarr-text-muted hover:text-white" data-close-modal="${id}">&times;</button>
        </div>
        <div class="p-4">
          ${content}
        </div>
      </div>
    </div>
  `;
}

// Format file size
function formatSize(bytes) {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

// Parse authors JSON
function formatAuthors(authorsJson) {
  if (!authorsJson) return 'Unknown';
  try {
    const authors = JSON.parse(authorsJson);
    return authors.length > 0 ? authors.join(', ') : 'Unknown';
  } catch {
    return authorsJson;
  }
}

// Render organize modal
function renderOrganizeModal() {
  const preview = state.organizePreview;
  if (!preview) return '';

  const previewItems = preview.preview.filter(p => p.willMove).slice(0, 20);
  const hasMore = preview.willMove > 20;

  return `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-shelvarr-surface rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div class="flex justify-between items-center p-4 border-b border-shelvarr-border">
          <h3 class="text-lg font-semibold">Organize Library</h3>
          <button class="text-shelvarr-text-muted hover:text-white" data-action="close-organize">&times;</button>
        </div>
        <div class="p-4 flex-1 overflow-y-auto">
          <div class="mb-4">
            <label class="block text-sm text-shelvarr-text-muted mb-1">Naming Template</label>
            <input type="text" class="input w-full" id="organize-template" value="${state.organizeTemplate}">
            <p class="text-xs text-shelvarr-text-muted mt-1">
              Variables: {author}, {title}, {series}, {number} (zero-padded), {year}, {isbn}<br>
              Empty variables and their brackets/parentheses are automatically removed.
            </p>
          </div>

          <div class="mb-4 p-3 bg-shelvarr-bg rounded-lg border border-shelvarr-border">
            <div class="flex justify-between text-sm">
              <span>Files to move:</span>
              <span class="font-semibold">${preview.willMove}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span>No changes needed:</span>
              <span class="text-shelvarr-text-muted">${preview.noChange}</span>
            </div>
          </div>

          ${preview.willMove > 0 ? `
            <h4 class="font-semibold mb-2">Preview Changes:</h4>
            <div class="space-y-2 max-h-60 overflow-y-auto">
              ${previewItems.map(item => `
                <div class="text-xs p-2 bg-shelvarr-bg rounded border border-shelvarr-border">
                  <div class="text-shelvarr-text-muted truncate">${item.currentPath}</div>
                  <div class="text-shelvarr-primary truncate">→ ${item.newPath}</div>
                </div>
              `).join('')}
              ${hasMore ? `<div class="text-center text-shelvarr-text-muted text-sm">... and ${preview.willMove - 20} more</div>` : ''}
            </div>
          ` : '<p class="text-shelvarr-text-muted">All files are already organized according to this template.</p>'}
        </div>
        <div class="flex justify-between items-center p-4 border-t border-shelvarr-border">
          <button class="btn-secondary" data-action="preview-organize">Refresh Preview</button>
          <div class="flex gap-2">
            <button class="btn-secondary" data-action="close-organize">Cancel</button>
            <button class="btn-primary" data-action="apply-organize" ${preview.willMove === 0 ? 'disabled' : ''}>
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Page renderers
const pages = {
  dashboard: () => {
    const stats = state.dashboardStats || { libraries: 0, books: 0, series: 0 };
    const taskStats = state.taskStats || { running: 0 };
    const recentTasks = state.recentTasks || [];

    const formatTaskType = (type) => {
      const types = {
        scan: 'Library Scan',
        metadata: 'Metadata Fetch',
        organize: 'File Organization',
        download: 'Download',
        author_sync: 'Author Sync',
      };
      return types[type] || type;
    };

    const formatTime = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    };

    const statusIcon = (status) => {
      if (status === 'running') return `<span class="text-blue-400">${icons.spinner}</span>`;
      if (status === 'completed') return `<span class="text-green-400">${icons.check}</span>`;
      if (status === 'failed') return `<span class="text-red-400">${icons.x}</span>`;
      if (status === 'pending') return `<span class="text-yellow-400">○</span>`;
      return `<span class="text-gray-400">○</span>`;
    };

    const recentActivityHtml = recentTasks.length === 0
      ? '<p class="text-shelvarr-text-muted">No recent activity.</p>'
      : `
        <div class="space-y-2">
          ${recentTasks.map(task => `
            <div class="flex items-center justify-between py-2 border-b border-shelvarr-border/50 last:border-0">
              <div class="flex items-center gap-3">
                ${statusIcon(task.status)}
                <div>
                  <div class="text-sm font-medium">${formatTaskType(task.type)}</div>
                  ${task.error ? `<div class="text-xs text-red-400">${task.error}</div>` : ''}
                </div>
              </div>
              <div class="text-xs text-shelvarr-text-muted">${formatTime(task.createdAt)}</div>
            </div>
          `).join('')}
        </div>
      `;

    return `
      <div class="space-y-6">
        ${pageHeader('Dashboard', taskStats.running > 0 ? `
          <div class="flex items-center gap-2 text-blue-400">
            ${icons.spinner}
            <span class="text-sm">${taskStats.running} task${taskStats.running > 1 ? 's' : ''} running</span>
          </div>
        ` : '')}

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="card cursor-pointer hover:border-shelvarr-primary" data-nav="libraries">
            <div class="text-shelvarr-text-muted text-sm">Libraries</div>
            <div class="text-3xl font-bold mt-1">${stats.libraries}</div>
          </div>
          <div class="card cursor-pointer hover:border-shelvarr-primary" data-nav="books">
            <div class="text-shelvarr-text-muted text-sm">Books</div>
            <div class="text-3xl font-bold mt-1">${stats.books}</div>
          </div>
          <div class="card cursor-pointer hover:border-shelvarr-primary" data-nav="series">
            <div class="text-shelvarr-text-muted text-sm">Series</div>
            <div class="text-3xl font-bold mt-1">${stats.series}</div>
          </div>
          <div class="card cursor-pointer hover:border-shelvarr-primary" data-nav="duplicates">
            <div class="text-shelvarr-text-muted text-sm">Find Duplicates</div>
            <div class="text-3xl font-bold mt-1">${icons.duplicate}</div>
          </div>
        </div>

        <div class="card">
          <h3 class="text-lg font-semibold mb-4">Quick Actions</h3>
          <div class="flex flex-wrap gap-3">
            <button class="btn-primary" data-action="add-library">Add Library</button>
            <button class="btn-secondary" data-action="scan-all">Scan All Libraries</button>
          </div>
        </div>

        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Recent Activity</h3>
            <a href="/tasks" class="text-sm text-shelvarr-primary hover:underline" data-nav="tasks">View All</a>
          </div>
          ${recentActivityHtml}
        </div>
      </div>
    `;
  },

  libraries: () => {
    const librariesHtml = state.libraries.length === 0
      ? '<p class="text-shelvarr-text-muted">No libraries configured. Add a library to get started.</p>'
      : `
        <div class="space-y-3">
          ${state.libraries.map(lib => `
            <div class="flex items-center justify-between p-4 bg-shelvarr-bg rounded-lg border border-shelvarr-border">
              <div class="flex items-center gap-4">
                <div class="text-shelvarr-primary">${icons.folder}</div>
                <div>
                  <div class="font-semibold">${lib.name}</div>
                  <div class="text-sm text-shelvarr-text-muted">${lib.path}</div>
                </div>
              </div>
              <div class="flex items-center gap-4">
                <div class="text-sm text-shelvarr-text-muted">${lib.bookCount || 0} books</div>
                <div class="flex gap-2">
                  <button class="btn-secondary text-sm py-1 px-3" data-scan-library="${lib.id}" title="Scan Library">
                    ${icons.refresh} Scan
                  </button>
                  <button class="btn-secondary text-sm py-1 px-3" data-organize-library="${lib.id}" title="Organize Files">
                    ${icons.folder} Organize
                  </button>
                  <button class="btn-secondary text-sm py-1 px-3" data-fetch-metadata="${lib.id}" title="Fetch Missing Metadata">
                    ${icons.search} Metadata
                  </button>
                  <button class="btn-secondary text-sm py-1 px-3 text-red-400 hover:text-red-300" data-delete-library="${lib.id}" title="Delete Library">
                    ${icons.trash}
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

    return `
      <div class="space-y-6">
        ${pageHeader('Libraries', '<button class="btn-primary" data-action="add-library">Add Library</button>')}
        <div class="card">${librariesHtml}</div>
      </div>
      ${state.organizePreview ? renderOrganizeModal() : ''}
    `;
  },

  books: () => {
    const { books, total, page, pageSize, totalPages } = state.books;

    const libraryOptions = state.libraries.map(lib =>
      `<option value="${lib.id}" ${state.booksLibraryFilter == lib.id ? 'selected' : ''}>${lib.name}</option>`
    ).join('');

    const booksHtml = books.length === 0
      ? '<p class="text-shelvarr-text-muted">No books found. Add a library and scan to import books.</p>'
      : `
        <table class="w-full">
          <thead>
            <tr class="text-left text-shelvarr-text-muted text-sm border-b border-shelvarr-border">
              <th class="pb-3">Title</th>
              <th class="pb-3">Author</th>
              <th class="pb-3">Series</th>
              <th class="pb-3">Size</th>
            </tr>
          </thead>
          <tbody>
            ${books.map(book => `
              <tr class="border-b border-shelvarr-border/50 hover:bg-shelvarr-bg/50 cursor-pointer" data-book-id="${book.id}">
                <td class="py-3">
                  <div class="flex items-center gap-3">
                    ${book.coverUrl
                      ? `<img src="${book.coverUrl}" alt="" class="w-10 h-14 object-cover rounded">`
                      : `<div class="w-10 h-14 bg-shelvarr-border rounded flex items-center justify-center text-shelvarr-text-muted">${icons.book}</div>`
                    }
                    <div>
                      <div class="font-medium">${book.title || 'Untitled'}</div>
                      <div class="text-xs text-shelvarr-text-muted truncate max-w-xs">${book.filePath.split('/').pop()}</div>
                    </div>
                  </div>
                </td>
                <td class="py-3 text-shelvarr-text-muted">${formatAuthors(book.authors)}</td>
                <td class="py-3 text-shelvarr-text-muted">${book.seriesName || '-'}</td>
                <td class="py-3 text-shelvarr-text-muted">${formatSize(book.fileSize)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${totalPages > 1 ? `
          <div class="flex items-center justify-between mt-4 pt-4 border-t border-shelvarr-border">
            <div class="text-sm text-shelvarr-text-muted">
              Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total} books
            </div>
            <div class="flex gap-2">
              <button class="btn-secondary text-sm" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">Previous</button>
              <button class="btn-secondary text-sm" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">Next</button>
            </div>
          </div>
        ` : ''}
      `;

    // Book detail modal content
    const bookDetailModal = state.selectedBook ? `
      <div id="book-detail-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-shelvarr-surface rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex justify-between items-center p-4 border-b border-shelvarr-border">
            <h3 class="text-lg font-semibold">Book Details</h3>
            <button class="text-shelvarr-text-muted hover:text-white" data-close-modal="book-detail-modal">&times;</button>
          </div>
          <div class="p-4 overflow-y-auto flex-1">
            <div class="flex gap-4 mb-4">
              ${state.selectedBook.coverUrl
                ? `<img src="${state.selectedBook.coverUrl}" alt="" class="w-32 h-48 object-cover rounded flex-shrink-0">`
                : `<div class="w-32 h-48 bg-shelvarr-border rounded flex items-center justify-center text-shelvarr-text-muted flex-shrink-0">${icons.book}</div>`
              }
              <div class="flex-1 min-w-0">
                <h4 class="text-xl font-semibold mb-1">${state.selectedBook.title || 'Untitled'}</h4>
                <p class="text-shelvarr-text-muted mb-2">${formatAuthors(state.selectedBook.authors)}</p>
                ${state.selectedBook.seriesName ? `<p class="text-sm text-shelvarr-text-muted mb-2">Series: ${state.selectedBook.seriesName}${state.selectedBook.seriesNumber ? ` #${state.selectedBook.seriesNumber}` : ''}</p>` : ''}
                ${state.selectedBook.isbn ? `<p class="text-sm text-shelvarr-text-muted mb-2">ISBN: ${state.selectedBook.isbn}</p>` : ''}
                ${state.selectedBook.publisher ? `<p class="text-sm text-shelvarr-text-muted mb-2">Publisher: ${state.selectedBook.publisher}</p>` : ''}
                ${state.selectedBook.publishDate ? `<p class="text-sm text-shelvarr-text-muted mb-2">Published: ${state.selectedBook.publishDate}</p>` : ''}
              </div>
            </div>
            ${state.selectedBook.description ? `<p class="text-sm text-shelvarr-text-muted mb-4 line-clamp-4">${state.selectedBook.description}</p>` : ''}
            <div class="text-xs text-shelvarr-text-muted mb-4 truncate">
              <span class="font-medium">File:</span> ${state.selectedBook.filePath}
            </div>
            <div class="flex gap-2 flex-wrap">
              <button class="btn-primary text-sm" data-action="edit-book" data-book-id="${state.selectedBook.id}">${icons.edit} Edit Metadata</button>
              <button class="btn-secondary text-sm" data-action="search-metadata" data-book-id="${state.selectedBook.id}">${icons.search} Search Metadata</button>
              <button class="btn-secondary text-sm" data-action="refresh-metadata" data-book-id="${state.selectedBook.id}">${icons.refresh} Auto-Match</button>
            </div>
            <details class="mt-4">
              <summary class="text-sm text-shelvarr-text-muted cursor-pointer hover:text-white">Raw Metadata (JSON)</summary>
              <pre class="mt-2 p-3 bg-shelvarr-bg rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">${JSON.stringify(state.selectedBook, null, 2)}</pre>
            </details>
          </div>
        </div>
      </div>
    ` : '';

    // Metadata search modal content
    const metadataSearchModal = state.metadataSearchQuery ? `
      <div id="metadata-search-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-shelvarr-surface rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex justify-between items-center p-4 border-b border-shelvarr-border">
            <h3 class="text-lg font-semibold">Search Metadata</h3>
            <button class="text-shelvarr-text-muted hover:text-white" data-close-modal="metadata-search-modal">&times;</button>
          </div>
          <div class="p-4 overflow-y-auto flex-1">
            <div class="flex gap-2 mb-4">
              <input type="text" class="input flex-1" id="metadata-search-input" placeholder="Search by title, author, or ISBN..." value="${state.metadataSearchQuery}">
              <button class="btn-primary" id="metadata-search-btn">${state.metadataSearchLoading ? icons.spinner : 'Search'}</button>
            </div>
            <div id="metadata-search-results">
              ${state.metadataSearchLoading ? '<p class="text-center text-shelvarr-text-muted">Searching...</p>' :
                state.metadataSearchResults.length === 0 ? '<p class="text-center text-shelvarr-text-muted">No results found. Try a different search.</p>' :
                `<div class="space-y-2">
                  ${state.metadataSearchResults.map(result => `
                    <div class="flex gap-3 p-3 rounded border border-shelvarr-border hover:border-shelvarr-primary cursor-pointer" data-apply-metadata data-source="${result.source}" data-source-id="${result.sourceId}">
                      ${result.coverUrl
                        ? `<img src="${result.coverUrl}" alt="" class="w-12 h-18 object-cover rounded flex-shrink-0">`
                        : `<div class="w-12 h-18 bg-shelvarr-border rounded flex items-center justify-center text-shelvarr-text-muted flex-shrink-0">${icons.book}</div>`
                      }
                      <div class="flex-1 min-w-0">
                        <div class="font-medium truncate">${result.title}</div>
                        <div class="text-sm text-shelvarr-text-muted">${result.authors}</div>
                        <div class="text-xs text-shelvarr-text-muted mt-1">
                          ${result.isbn ? `ISBN: ${result.isbn} · ` : ''}${result.publisher || ''}${result.publishDate ? ` (${result.publishDate})` : ''}
                        </div>
                        <div class="text-xs text-shelvarr-primary mt-1">Source: ${result.source === 'googlebooks' ? 'Google Books' : 'OpenLibrary'}</div>
                      </div>
                      <button class="btn-primary text-sm self-center">${icons.check} Apply</button>
                    </div>
                  `).join('')}
                </div>`
              }
            </div>
          </div>
        </div>
      </div>
    ` : '';

    // Edit book modal content
    const editBookModal = state.editingBook ? `
      <div id="edit-book-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-shelvarr-surface rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex justify-between items-center p-4 border-b border-shelvarr-border">
            <h3 class="text-lg font-semibold">Edit Book Metadata</h3>
            <button class="text-shelvarr-text-muted hover:text-white" data-close-modal="edit-book-modal">&times;</button>
          </div>
          <form id="edit-book-form" class="p-4 overflow-y-auto flex-1 space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Title</label>
              <input type="text" class="input w-full" name="title" value="${state.editingBook.title || ''}">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Authors</label>
              <input type="text" class="input w-full" name="authors" value="${formatAuthors(state.editingBook.authors)}" placeholder="Author 1, Author 2">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Series Name</label>
                <input type="text" class="input w-full" name="seriesName" value="${state.editingBook.seriesName || ''}">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Series #</label>
                <input type="number" class="input w-full" name="seriesNumber" value="${state.editingBook.seriesNumber || ''}" step="0.1">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">ISBN</label>
              <input type="text" class="input w-full" name="isbn" value="${state.editingBook.isbn || ''}">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Publisher</label>
                <input type="text" class="input w-full" name="publisher" value="${state.editingBook.publisher || ''}">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Publish Date</label>
                <input type="text" class="input w-full" name="publishDate" value="${state.editingBook.publishDate || ''}" placeholder="YYYY-MM-DD">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Description</label>
              <textarea class="input w-full h-24" name="description">${state.editingBook.description || ''}</textarea>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Cover URL</label>
              <input type="url" class="input w-full" name="coverUrl" value="${state.editingBook.coverUrl || ''}">
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" class="btn-secondary" data-close-modal="edit-book-modal">Cancel</button>
              <button type="submit" class="btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    ` : '';

    return `
      <div class="space-y-6">
        ${pageHeader('Books', `
          <input type="text" class="input w-64 h-9" placeholder="Search books..." id="books-search" value="${state.booksSearch}">
          <select class="input h-9" id="books-library-filter">
            <option value="">All Libraries</option>
            ${libraryOptions}
          </select>
        `)}

        <div class="card">${booksHtml}</div>
      </div>
      ${bookDetailModal}
      ${metadataSearchModal}
      ${editBookModal}
    `;
  },

  series: () => {
    if (state.seriesLoading) {
      return `
        <div class="space-y-6">
          ${pageHeader('Series')}
          <div class="card">
            <p class="text-shelvarr-text-muted">${icons.spinner} Loading series...</p>
          </div>
        </div>
      `;
    }

    const seriesHtml = state.series.length === 0
      ? '<p class="text-shelvarr-text-muted">No series detected. Series are automatically detected from book metadata when scanning libraries.</p>'
      : `
        <div class="space-y-4">
          ${state.series.map(s => `
            <div class="p-4 bg-shelvarr-bg rounded-lg border border-shelvarr-border">
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-semibold text-lg">${s.name}</h3>
                <span class="text-sm text-shelvarr-text-muted">${s.books.length} books</span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                ${s.books.slice(0, 6).map(book => `
                  <div class="text-sm p-2 bg-shelvarr-surface rounded" title="${book.title}">
                    <div class="truncate">${book.seriesNumber ? `#${book.seriesNumber} - ` : ''}${book.title || 'Untitled'}</div>
                  </div>
                `).join('')}
                ${s.books.length > 6 ? `<div class="text-sm p-2 text-shelvarr-text-muted">+${s.books.length - 6} more</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

    return `
      <div class="space-y-6">
        ${pageHeader('Series', `<span class="text-shelvarr-text-muted">${state.series.length} series found</span>`)}
        <div class="card">${seriesHtml}</div>
      </div>
    `;
  },

  duplicates: () => {
    if (state.duplicatesLoading) {
      return `
        <div class="space-y-6">
          ${pageHeader('Duplicates')}
          <div class="card">
            <p class="text-shelvarr-text-muted">${icons.spinner} Scanning for duplicates...</p>
          </div>
        </div>
      `;
    }

    const { hashDuplicates, similarityDuplicates, total } = state.duplicates;

    const renderDuplicateGroup = (group, type) => `
      <div class="p-4 bg-shelvarr-bg rounded-lg border border-shelvarr-border mb-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium ${type === 'hash' ? 'text-red-400' : 'text-yellow-400'}">
            ${type === 'hash' ? 'Exact Match' : `${Math.round(group.similarity * 100)}% Similar`}
          </span>
          <span class="text-sm text-shelvarr-text-muted">${group.books.length} copies</span>
        </div>
        <div class="space-y-2">
          ${group.books.map(book => `
            <div class="flex items-center justify-between text-sm p-2 bg-shelvarr-surface rounded">
              <div class="truncate flex-1 mr-4">
                <div class="font-medium">${book.title || 'Untitled'}</div>
                <div class="text-shelvarr-text-muted text-xs truncate">${book.filePath}</div>
              </div>
              <div class="text-shelvarr-text-muted">${formatSize(book.fileSize)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const duplicatesHtml = total === 0
      ? '<p class="text-shelvarr-text-muted">No duplicate books detected. Duplicates are found by comparing file hashes and metadata similarity.</p>'
      : `
        ${hashDuplicates.length > 0 ? `
          <h3 class="text-lg font-semibold mb-3">Exact Duplicates (${hashDuplicates.length} groups)</h3>
          ${hashDuplicates.map(g => renderDuplicateGroup(g, 'hash')).join('')}
        ` : ''}
        ${similarityDuplicates.length > 0 ? `
          <h3 class="text-lg font-semibold mb-3 mt-6">Similar Books (${similarityDuplicates.length} groups)</h3>
          ${similarityDuplicates.map(g => renderDuplicateGroup(g, 'similar')).join('')}
        ` : ''}
      `;

    return `
      <div class="space-y-6">
        ${pageHeader('Duplicates', `<span class="text-shelvarr-text-muted">${total} duplicate groups</span>`)}
        <div class="card">${duplicatesHtml}</div>
      </div>
    `;
  },

  authors: () => `
    <div class="space-y-6">
      ${pageHeader('Authors', '<button class="btn-primary" data-action="add-author">Track Author</button>')}

      <div class="card">
        <p class="text-shelvarr-text-muted">No authors tracked. Track authors to see their full bibliography and find missing books.</p>
      </div>
    </div>
  `,

  wanted: () => `
    <div class="space-y-6">
      ${pageHeader('Wanted Books')}
      <div class="card">
        <p class="text-shelvarr-text-muted">No books on your wanted list. Track authors and mark books as wanted to see them here.</p>
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
        <p class="text-shelvarr-text-muted text-sm">Search across Z-Library, Anna's Archive, and Library Genesis.</p>
      </div>
    </div>
  `,

  downloads: () => `
    <div class="space-y-6">
      ${pageHeader('Downloads')}
      <div class="card">
        <p class="text-shelvarr-text-muted">No active downloads.</p>
      </div>
    </div>
  `,

  tasks: () => {
    if (state.tasksLoading) {
      return `
        <div class="space-y-6">
          ${pageHeader('Background Tasks')}
          <div class="card">
            <p class="text-shelvarr-text-muted">${icons.spinner} Loading tasks...</p>
          </div>
        </div>
      `;
    }

    const { tasks, total } = state.tasks;
    const stats = state.taskStats;

    const statusColors = {
      pending: 'text-yellow-400',
      running: 'text-blue-400',
      completed: 'text-green-400',
      failed: 'text-red-400',
      cancelled: 'text-gray-400',
    };

    const statusBadge = (status) => `
      <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || ''} bg-shelvarr-bg">
        ${status === 'running' ? icons.spinner : ''}
        ${status}
      </span>
    `;

    const formatTaskType = (type) => {
      const types = {
        scan: 'Library Scan',
        metadata: 'Metadata Fetch',
        organize: 'File Organization',
        download: 'Download',
        author_sync: 'Author Sync',
      };
      return types[type] || type;
    };

    const formatTime = (timestamp) => {
      if (!timestamp) return '-';
      const date = new Date(timestamp);
      return date.toLocaleString();
    };

    const tasksHtml = tasks.length === 0
      ? '<p class="text-shelvarr-text-muted">No tasks found. Tasks are created when you scan libraries, fetch metadata, or organize files.</p>'
      : `
        <table class="w-full">
          <thead>
            <tr class="text-left text-shelvarr-text-muted text-sm border-b border-shelvarr-border">
              <th class="pb-3">Type</th>
              <th class="pb-3">Status</th>
              <th class="pb-3">Progress</th>
              <th class="pb-3">Created</th>
              <th class="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map(task => `
              <tr class="border-b border-shelvarr-border/50">
                <td class="py-3">
                  <div class="font-medium">${formatTaskType(task.type)}</div>
                  <div class="text-xs text-shelvarr-text-muted">ID: ${task.id}</div>
                </td>
                <td class="py-3">${statusBadge(task.status)}</td>
                <td class="py-3">
                  ${task.total ? `
                    <div class="flex items-center gap-2">
                      <div class="flex-1 h-2 bg-shelvarr-bg rounded-full overflow-hidden">
                        <div class="h-full bg-shelvarr-primary rounded-full" style="width: ${Math.round((task.progress / task.total) * 100)}%"></div>
                      </div>
                      <span class="text-xs text-shelvarr-text-muted">${task.progress}/${task.total}</span>
                    </div>
                  ` : '-'}
                </td>
                <td class="py-3 text-sm text-shelvarr-text-muted">${formatTime(task.createdAt)}</td>
                <td class="py-3">
                  ${task.status === 'running' || task.status === 'pending' ? `
                    <button class="btn-secondary text-xs py-1 px-2 text-red-400 hover:text-red-300" data-cancel-task="${task.id}">
                      ${icons.x} Cancel
                    </button>
                  ` : ''}
                  ${task.error ? `
                    <span class="text-xs text-red-400" title="${task.error}">Error</span>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

    return `
      <div class="space-y-6">
        ${pageHeader('Background Tasks', `
          <button class="btn-secondary" id="refresh-tasks-btn">${icons.refresh} Refresh</button>
        `)}

        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div class="card text-center">
            <div class="text-2xl font-bold">${stats.total}</div>
            <div class="text-sm text-shelvarr-text-muted">Total</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl font-bold text-yellow-400">${stats.pending}</div>
            <div class="text-sm text-shelvarr-text-muted">Pending</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl font-bold text-blue-400">${stats.running}</div>
            <div class="text-sm text-shelvarr-text-muted">Running</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl font-bold text-green-400">${stats.completed}</div>
            <div class="text-sm text-shelvarr-text-muted">Completed</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl font-bold text-red-400">${stats.failed}</div>
            <div class="text-sm text-shelvarr-text-muted">Failed</div>
          </div>
        </div>

        <div class="card">${tasksHtml}</div>
      </div>
    `;
  },

  settings: () => {
    const komgaConfigured = state.settings?._config?.komgaConfigured || false;
    const komgaStatus = state.komgaStatus;

    return `
    <div class="space-y-6">
      ${pageHeader('Settings')}

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Komga Integration</h3>
        <div class="space-y-4">
          <div class="p-3 rounded-lg border ${komgaConfigured ? 'border-green-500/30 bg-green-500/10' : 'border-yellow-500/30 bg-yellow-500/10'}">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium ${komgaConfigured ? 'text-green-400' : 'text-yellow-400'}">
                  ${komgaConfigured ? 'Komga Configured' : 'Komga Not Configured'}
                </div>
                <p class="text-sm text-shelvarr-text-muted mt-1">
                  ${komgaConfigured
                    ? 'Komga integration is configured via environment variables.'
                    : 'Set KOMGA_URL, KOMGA_USERNAME, and KOMGA_PASSWORD environment variables.'}
                </p>
              </div>
              ${komgaConfigured ? `
                <button class="btn-secondary text-sm" id="test-komga-btn">
                  ${state.komgaTesting ? icons.spinner + ' Testing...' : 'Test Connection'}
                </button>
              ` : ''}
            </div>
            ${komgaStatus ? `
              <div class="mt-3 pt-3 border-t border-shelvarr-border">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full ${komgaStatus.connected ? 'bg-green-500' : 'bg-red-500'}"></div>
                  <span class="text-sm ${komgaStatus.connected ? 'text-green-400' : 'text-red-400'}">
                    ${komgaStatus.connected ? 'Connected to Komga' : 'Connection Failed'}
                  </span>
                </div>
                ${komgaStatus.error ? `<p class="text-sm text-red-400 mt-1">${komgaStatus.error}</p>` : ''}
                ${komgaStatus.connected && state.komgaLibraries?.length ? `
                  <div class="mt-2">
                    <span class="text-xs text-shelvarr-text-muted">Libraries: ${state.komgaLibraries.map(l => l.name).join(', ')}</span>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>

          ${komgaConfigured && komgaStatus?.connected ? `
            <div class="flex gap-2">
              <button class="btn-primary" id="scan-all-komga-btn">
                ${icons.refresh} Scan All Komga Libraries
              </button>
            </div>
          ` : ''}

          <div class="text-sm text-shelvarr-text-muted">
            <p class="font-medium mb-2">Environment Variables:</p>
            <code class="block bg-shelvarr-bg p-2 rounded text-xs">
              KOMGA_URL=http://your-komga-server:25600<br>
              KOMGA_USERNAME=your-username<br>
              KOMGA_PASSWORD=your-password
            </code>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">File Organization</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-shelvarr-text-muted mb-1">Default Naming Template</label>
            <input type="text" class="input w-full" value="${state.organizeTemplate}" id="naming-template">
            <p class="text-xs text-shelvarr-text-muted mt-1">Variables: {author}, {title}, {series}, {series_number}, {year}, {isbn}</p>
          </div>
          <button class="btn-primary" id="save-template-btn">Save Template</button>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">About</h3>
        <div class="text-sm text-shelvarr-text-muted space-y-2">
          <p><strong>Shelvarr</strong> v0.0.1</p>
          <p>Self-hosted book/comic metadata management and file organization.</p>
          <p>
            <a href="https://github.com/markcipolla/shelvarr" target="_blank" class="text-shelvarr-primary hover:underline">
              ${icons.externalLink} GitHub Repository
            </a>
          </p>
        </div>
      </div>
    </div>
  `;
  },
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
    ${renderGlobalModals()}
  `;

  // Attach event listeners
  attachEventListeners();
}

function renderGlobalModals() {
  return `
    ${modal('add-library-modal', 'Add Library', `
      <form id="add-library-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Name</label>
          <input type="text" name="name" class="input w-full" placeholder="My Books" required>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Path</label>
          <div class="flex gap-2">
            <input type="text" name="path" id="library-path-input" class="input flex-1" placeholder="/libraries/ebooks" required>
            <button type="button" class="btn-secondary" id="browse-folders-btn">${icons.folder} Browse</button>
          </div>
          <div id="folder-browser" class="hidden mt-2 max-h-64 overflow-auto border border-shelvarr-border rounded bg-shelvarr-bg">
            <div id="folder-browser-content" class="p-2"></div>
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-4">
          <button type="button" class="btn-secondary" data-close-modal="add-library-modal">Cancel</button>
          <button type="submit" class="btn-primary">Add Library</button>
        </div>
      </form>
    `)}
  `;
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

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.currentTarget.dataset.closeModal;
      // For state-driven modals, use closeModal helper
      if (['book-detail-modal', 'metadata-search-modal', 'edit-book-modal'].includes(modalId)) {
        closeModal(modalId);
      } else {
        document.getElementById(modalId)?.classList.add('hidden');
      }
    });
  });

  // Add library form
  const addLibraryForm = document.getElementById('add-library-form');
  if (addLibraryForm) {
    addLibraryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const name = formData.get('name');
      const path = formData.get('path');

      try {
        await api.addLibrary(name, path);
        document.getElementById('add-library-modal')?.classList.add('hidden');
        await loadLibraries();
      } catch (error) {
        alert(`Error adding library: ${error.message}`);
      }
    });
  }

  // Browse folders button
  const browseFoldersBtn = document.getElementById('browse-folders-btn');
  if (browseFoldersBtn) {
    browseFoldersBtn.addEventListener('click', () => {
      const folderBrowser = document.getElementById('folder-browser');
      if (folderBrowser?.classList.contains('hidden')) {
        folderBrowser.classList.remove('hidden');
        loadFolderBrowser();
      } else {
        folderBrowser?.classList.add('hidden');
      }
    });
  }

  // Scan library buttons
  document.querySelectorAll('[data-scan-library]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const libraryId = e.currentTarget.dataset.scanLibrary;
      const originalHtml = e.currentTarget.innerHTML;
      e.currentTarget.innerHTML = `${icons.spinner} Scanning...`;
      e.currentTarget.disabled = true;

      try {
        const result = await api.scanLibrary(libraryId);
        alert(`Scan complete: ${result.added} added, ${result.updated} updated, ${result.removed} removed`);
        await loadLibraries();
      } catch (error) {
        alert(`Error scanning library: ${error.message}`);
      } finally {
        e.currentTarget.innerHTML = originalHtml;
        e.currentTarget.disabled = false;
      }
    });
  });

  // Delete library buttons
  document.querySelectorAll('[data-delete-library]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const libraryId = e.currentTarget.dataset.deleteLibrary;
      if (!confirm('Are you sure you want to delete this library? All associated books will be removed from the database.')) {
        return;
      }

      try {
        await api.deleteLibrary(libraryId);
        await loadLibraries();
      } catch (error) {
        alert(`Error deleting library: ${error.message}`);
      }
    });
  });

  // Organize library buttons
  document.querySelectorAll('[data-organize-library]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const libraryId = parseInt(e.currentTarget.dataset.organizeLibrary);
      await previewOrganize(libraryId, state.organizeTemplate);
    });
  });

  // Fetch metadata buttons
  document.querySelectorAll('[data-fetch-metadata]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const libraryId = e.currentTarget.dataset.fetchMetadata;
      const originalHtml = e.currentTarget.innerHTML;
      e.currentTarget.innerHTML = `${icons.spinner} Starting...`;
      e.currentTarget.disabled = true;

      try {
        const result = await api.fetchLibraryMetadata(libraryId, true);
        alert(`Metadata fetch task started (Task #${result.taskId}). Check the Tasks page for progress.`);
        // Navigate to tasks page to show progress
        navigate('tasks');
      } catch (error) {
        alert(`Error starting metadata fetch: ${error.message}`);
      } finally {
        e.currentTarget.innerHTML = originalHtml;
        e.currentTarget.disabled = false;
      }
    });
  });

  // Organize modal actions
  document.querySelectorAll('[data-action="close-organize"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.organizePreview = null;
      render();
    });
  });

  document.querySelectorAll('[data-action="preview-organize"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const templateInput = document.getElementById('organize-template');
      const template = templateInput?.value || state.organizeTemplate;
      state.organizeTemplate = template;
      await previewOrganize(state.organizeLibraryId, template);
    });
  });

  document.querySelectorAll('[data-action="apply-organize"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await applyOrganize();
    });
  });

  // Dashboard stat card navigation
  document.querySelectorAll('[data-nav]').forEach(card => {
    card.addEventListener('click', (e) => {
      const page = e.currentTarget.dataset.nav;
      navigate(page);
    });
  });

  // Books search
  const booksSearch = document.getElementById('books-search');
  if (booksSearch) {
    let searchTimeout;
    booksSearch.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.booksSearch = e.target.value;
        state.books.page = 1;
        loadBooks();
      }, 300);
    });
  }

  // Books library filter
  const libraryFilter = document.getElementById('books-library-filter');
  if (libraryFilter) {
    libraryFilter.addEventListener('change', (e) => {
      state.booksLibraryFilter = e.target.value;
      state.books.page = 1;
      loadBooks();
    });
  }

  // Pagination buttons
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const page = parseInt(e.currentTarget.dataset.page);
      if (page > 0 && page <= state.books.totalPages) {
        state.books.page = page;
        loadBooks();
      }
    });
  });

  // Book row clicks - open detail modal
  document.querySelectorAll('[data-book-id]').forEach(row => {
    if (row.tagName === 'TR') {
      row.addEventListener('click', async (e) => {
        const bookId = parseInt(e.currentTarget.dataset.bookId);
        try {
          const book = await api.getBook(bookId);
          state.selectedBook = book;
          render();
        } catch (error) {
          alert(`Error loading book: ${error.message}`);
        }
      });
    }
  });

  // Edit book button
  document.querySelectorAll('[data-action="edit-book"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedBook) {
        state.editingBook = { ...state.selectedBook };
        state.selectedBook = null;
        render();
      }
    });
  });

  // Search metadata button
  document.querySelectorAll('[data-action="search-metadata"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedBook) {
        state.metadataSearchBookId = state.selectedBook.id;
        // Build search query from title and author
        let query = state.selectedBook.title || '';
        const authors = formatAuthors(state.selectedBook.authors);
        if (authors && authors !== 'Unknown') {
          query = query ? `${query} ${authors}` : authors;
        }
        state.metadataSearchQuery = query;
        state.metadataSearchResults = [];
        state.selectedBook = null;
        render();
        // Auto-search
        performMetadataSearch();
      }
    });
  });

  // Refresh/auto-match metadata button
  document.querySelectorAll('[data-action="refresh-metadata"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const bookId = state.selectedBook?.id;
      if (!bookId) return;

      const originalHtml = e.currentTarget.innerHTML;
      e.currentTarget.innerHTML = `${icons.spinner} Matching...`;
      e.currentTarget.disabled = true;

      try {
        const result = await api.refreshBookMetadata(bookId);
        state.selectedBook = result.book;
        alert(`Metadata updated from ${result.source === 'googlebooks' ? 'Google Books' : 'OpenLibrary'}`);
        await loadBooks();
        render();
      } catch (error) {
        alert(`Error: ${error.message}`);
        e.currentTarget.innerHTML = originalHtml;
        e.currentTarget.disabled = false;
      }
    });
  });

  // Metadata search input
  const metadataSearchInput = document.getElementById('metadata-search-input');
  if (metadataSearchInput) {
    metadataSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        state.metadataSearchQuery = e.target.value;
        performMetadataSearch();
      }
    });
  }

  // Metadata search button
  const metadataSearchBtn = document.getElementById('metadata-search-btn');
  if (metadataSearchBtn) {
    metadataSearchBtn.addEventListener('click', () => {
      const input = document.getElementById('metadata-search-input');
      if (input) {
        state.metadataSearchQuery = input.value;
        performMetadataSearch();
      }
    });
  }

  // Apply metadata buttons
  document.querySelectorAll('[data-apply-metadata]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const source = e.currentTarget.dataset.source;
      const sourceId = e.currentTarget.dataset.sourceId;

      if (!state.metadataSearchBookId || !source || !sourceId) return;

      try {
        const result = await api.applyMetadata(state.metadataSearchBookId, source, sourceId);
        alert('Metadata applied successfully!');
        state.metadataSearchQuery = '';
        state.metadataSearchResults = [];
        state.metadataSearchBookId = null;
        await loadBooks();
        render();
      } catch (error) {
        alert(`Error applying metadata: ${error.message}`);
      }
    });
  });

  // Edit book form
  const editBookForm = document.getElementById('edit-book-form');
  if (editBookForm) {
    editBookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.editingBook) return;

      const formData = new FormData(e.target);
      const updates = {
        title: formData.get('title'),
        authors: formData.get('authors'),
        seriesName: formData.get('seriesName') || null,
        seriesNumber: formData.get('seriesNumber') ? parseFloat(formData.get('seriesNumber')) : null,
        isbn: formData.get('isbn') || null,
        publisher: formData.get('publisher') || null,
        publishDate: formData.get('publishDate') || null,
        description: formData.get('description') || null,
        coverUrl: formData.get('coverUrl') || null,
      };

      try {
        await api.updateBook(state.editingBook.id, updates);
        state.editingBook = null;
        await loadBooks();
        render();
      } catch (error) {
        alert(`Error updating book: ${error.message}`);
      }
    });
  }

  // Close modals when clicking backdrop
  ['book-detail-modal', 'metadata-search-modal', 'edit-book-modal'].forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(modalId);
        }
      });
    }
  });

  // Settings page - Komga test connection
  const testKomgaBtn = document.getElementById('test-komga-btn');
  if (testKomgaBtn) {
    testKomgaBtn.addEventListener('click', testKomgaConnection);
  }

  // Settings page - Scan all Komga libraries
  const scanAllKomgaBtn = document.getElementById('scan-all-komga-btn');
  if (scanAllKomgaBtn) {
    scanAllKomgaBtn.addEventListener('click', scanAllKomgaLibraries);
  }

  // Settings page - Save template
  const saveTemplateBtn = document.getElementById('save-template-btn');
  if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', () => {
      const templateInput = document.getElementById('naming-template');
      if (templateInput) {
        state.organizeTemplate = templateInput.value;
        alert('Template saved for this session.');
      }
    });
  }

  // Tasks page - Refresh button
  const refreshTasksBtn = document.getElementById('refresh-tasks-btn');
  if (refreshTasksBtn) {
    refreshTasksBtn.addEventListener('click', loadTasks);
  }

  // Tasks page - Cancel task buttons
  document.querySelectorAll('[data-cancel-task]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const taskId = parseInt(e.currentTarget.dataset.cancelTask);
      if (confirm('Cancel this task?')) {
        await cancelTask(taskId);
      }
    });
  });
}

// Close modal helper
function closeModal(modalId) {
  if (modalId === 'book-detail-modal') {
    state.selectedBook = null;
  } else if (modalId === 'metadata-search-modal') {
    state.metadataSearchQuery = '';
    state.metadataSearchResults = [];
    state.metadataSearchBookId = null;
  } else if (modalId === 'edit-book-modal') {
    state.editingBook = null;
  }
  render();
}

// Perform metadata search
async function performMetadataSearch() {
  if (!state.metadataSearchQuery.trim()) return;

  state.metadataSearchLoading = true;
  render();

  try {
    const result = await api.searchBooks(state.metadataSearchQuery);
    state.metadataSearchResults = result.results || [];
  } catch (error) {
    alert(`Search error: ${error.message}`);
    state.metadataSearchResults = [];
  } finally {
    state.metadataSearchLoading = false;
    render();
  }
}

// Action handlers
function handleAction(action) {
  switch (action) {
    case 'add-library':
      document.getElementById('add-library-modal')?.classList.remove('hidden');
      break;
    case 'scan-all':
      scanAllLibraries();
      break;
    case 'add-author':
      alert('Add Author dialog - coming soon!');
      break;
    default:
      console.log('Unknown action:', action);
  }
}

async function loadFolderBrowser(path = '') {
  const content = document.getElementById('folder-browser-content');
  if (!content) return;

  content.innerHTML = `<div class="text-shelvarr-text-muted text-sm p-2">${icons.spinner} Loading...</div>`;

  try {
    const result = await api.browse(path);

    let html = '';

    // Current path display with select button
    html += `
      <div class="flex items-center justify-between gap-2 p-2 bg-shelvarr-surface rounded mb-2">
        <div class="text-sm text-shelvarr-text-muted truncate flex-1" title="${result.current}">${result.current}</div>
        <button type="button" class="btn-primary text-xs py-1 px-2" data-select-path="${result.current}">Select</button>
      </div>
    `;

    // Parent directory
    if (result.parent) {
      html += `
        <div class="flex items-center gap-2 p-2 hover:bg-shelvarr-surface rounded cursor-pointer" data-browse-path="${result.parent}">
          <span class="text-shelvarr-text-muted">${icons.chevronUp}</span>
          <span class="text-sm">..</span>
        </div>
      `;
    }

    // Subdirectories
    if (result.directories.length === 0) {
      html += `<div class="text-shelvarr-text-muted text-sm p-2">No subdirectories</div>`;
    } else {
      for (const dir of result.directories) {
        html += `
          <div class="flex items-center gap-2 p-2 hover:bg-shelvarr-surface rounded cursor-pointer" data-browse-path="${dir.path}">
            <span class="text-shelvarr-primary">${icons.folder}</span>
            <span class="text-sm">${dir.name}</span>
          </div>
        `;
      }
    }

    content.innerHTML = html;

    // Attach click handlers for browsing
    content.querySelectorAll('[data-browse-path]').forEach(el => {
      el.addEventListener('click', () => {
        loadFolderBrowser(el.dataset.browsePath);
      });
    });

    // Attach click handler for selection
    content.querySelectorAll('[data-select-path]').forEach(el => {
      el.addEventListener('click', () => {
        const pathInput = document.getElementById('library-path-input');
        if (pathInput) {
          pathInput.value = el.dataset.selectPath;
        }
        document.getElementById('folder-browser')?.classList.add('hidden');
      });
    });

  } catch (error) {
    content.innerHTML = `<div class="text-red-400 text-sm p-2">Error: ${error.message}</div>`;
  }
}

async function scanAllLibraries() {
  if (state.libraries.length === 0) {
    alert('No libraries to scan. Add a library first.');
    return;
  }

  try {
    for (const lib of state.libraries) {
      await api.scanLibrary(lib.id);
    }
    alert('All libraries scanned successfully!');
    await loadLibraries();
    await loadDashboardStats();
  } catch (error) {
    alert(`Error scanning libraries: ${error.message}`);
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

    // Load initial data
    const libResult = await api.getLibraries();
    state.libraries = libResult.libraries || [];

    // Determine initial page from URL
    const path = window.location.pathname.slice(1) || 'dashboard';
    state.currentPage = navItems.find(item => item.id === path) ? path : 'dashboard';

    state.loading = false;
    render();
    loadPageData(state.currentPage);
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
