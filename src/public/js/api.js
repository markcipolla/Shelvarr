/**
 * Komgarr API Client
 */

const API_BASE = '/api';

class ApiClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  }

  // Health
  health() {
    return this.request('/health');
  }

  // Settings
  getSettings() {
    return this.request('/settings');
  }

  updateSetting(key, value) {
    return this.request('/settings', {
      method: 'PUT',
      body: { key, value },
    });
  }

  // Libraries
  getLibraries() {
    return this.request('/libraries');
  }

  addLibrary(name, path) {
    return this.request('/libraries', {
      method: 'POST',
      body: { name, path },
    });
  }

  deleteLibrary(id) {
    return this.request(`/libraries/${id}`, {
      method: 'DELETE',
    });
  }

  scanLibrary(id) {
    return this.request(`/libraries/${id}/scan`, {
      method: 'POST',
    });
  }

  // Books
  getBooks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/books${query ? `?${query}` : ''}`);
  }

  getBook(id) {
    return this.request(`/books/${id}`);
  }

  updateBook(id, data) {
    return this.request(`/books/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  refreshBookMetadata(id) {
    return this.request(`/books/${id}/refresh`, {
      method: 'POST',
    });
  }

  // Series
  getSeries() {
    return this.request('/series');
  }

  organizeSeries(id) {
    return this.request(`/series/${id}/organize`, {
      method: 'POST',
    });
  }

  // Tasks
  getTasks() {
    return this.request('/tasks');
  }

  getTask(id) {
    return this.request(`/tasks/${id}`);
  }

  // Authors
  getAuthors() {
    return this.request('/authors');
  }

  addAuthor(name) {
    return this.request('/authors', {
      method: 'POST',
      body: { name },
    });
  }

  getAuthor(id) {
    return this.request(`/authors/${id}`);
  }

  syncAuthor(id) {
    return this.request(`/authors/${id}/sync`, {
      method: 'POST',
    });
  }

  // Downloads
  getDownloads() {
    return this.request('/downloads');
  }

  addDownload(data) {
    return this.request('/downloads', {
      method: 'POST',
      body: data,
    });
  }

  cancelDownload(id) {
    return this.request(`/downloads/${id}`, {
      method: 'DELETE',
    });
  }

  // Duplicates
  getDuplicates() {
    return this.request('/duplicates');
  }

  // Organization
  previewOrganize(options) {
    return this.request('/organize/preview', {
      method: 'POST',
      body: options,
    });
  }

  applyOrganize(options) {
    return this.request('/organize/apply', {
      method: 'POST',
      body: options,
    });
  }

  // Search (external sources)
  searchBooks(query) {
    return this.request(`/search/books?q=${encodeURIComponent(query)}`);
  }
}

export const api = new ApiClient();
export default api;
