let allJobs = [];
let currentFilter = 'all';

// DOM Elements
const addJobForm = document.getElementById('add-job-form');
const jobUrlInput = document.getElementById('job-url');
const addBtn = document.getElementById('add-btn');
const scrapeStatus = document.getElementById('scrape-status');
const companyInput = document.getElementById('company');
const titleInput = document.getElementById('title');
const locationInput = document.getElementById('location');
const jobsGrid = document.getElementById('jobs-grid');
const emptyState = document.getElementById('empty-state');
const modalOverlay = document.getElementById('modal-overlay');
const openModalBtn = document.getElementById('open-add-modal');
const closeModalBtn = document.getElementById('close-modal');
const cancelBtn = document.getElementById('cancel-btn');
const emptyAddBtn = document.getElementById('empty-add-btn');
const totalCount = document.getElementById('total-count');
const activeCount = document.getElementById('active-count');
const urlLoader = document.getElementById('url-loader');

// Navigation items
const navItems = document.querySelectorAll('.nav-item');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Add a small delay to ensure database is ready
  setTimeout(() => {
    loadJobs();
  }, 100);
  setupEventListeners();
  setupNavigation();
});

function setupEventListeners() {
  // Form submission
  addJobForm.addEventListener('submit', handleAddJob);

  // Modal controls
  openModalBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  emptyAddBtn.addEventListener('click', openModal);

  // Close modal on overlay click
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  // Close modal on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('show')) {
      closeModal();
    }
  });

  // URL input changes
  jobUrlInput.addEventListener('input', () => {
    scrapeStatus.textContent = '';
    scrapeStatus.className = 'scrape-status';
  });

  // Event delegation for job cards
  jobsGrid.addEventListener('click', handleGridClick);
  jobsGrid.addEventListener('change', handleGridChange);
  jobsGrid.addEventListener('dblclick', handleEditStart);
  jobsGrid.addEventListener('keydown', handleEditKeyboard);
}

function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();

      // Update active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // Get filter value
      const filter = item.dataset.filter || 'all';
      currentFilter = filter;
      renderJobs();
    });
  });
}

function openModal() {
  modalOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => jobUrlInput.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.remove('show');
  document.body.style.overflow = '';
  resetForm();
}

function resetForm() {
  addJobForm.reset();
  scrapeStatus.textContent = '';
  scrapeStatus.className = 'scrape-status';
  urlLoader.classList.remove('show');
}

function handleGridClick(e) {
  const menuBtn = e.target.closest('.menu-btn');
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');

  if (menuBtn) {
    e.stopPropagation();
    toggleDropdown(menuBtn);
    return;
  }

  if (editBtn) {
    e.stopPropagation();
    const id = parseInt(editBtn.dataset.id);
    const field = editBtn.dataset.field;
    closeAllDropdowns();
    openEditModal(id, field);
    return;
  }

  if (deleteBtn) {
    handleDelete(e);
    return;
  }
}

function toggleDropdown(menuBtn) {
  const jobActions = menuBtn.closest('.job-actions');
  const dropdown = jobActions.querySelector('.dropdown-menu');
  const isOpen = dropdown.classList.contains('show');

  closeAllDropdowns();

  if (!isOpen) {
    dropdown.classList.add('show');
    menuBtn.classList.add('active');
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
    menu.classList.remove('show');
  });
  document.querySelectorAll('.menu-btn.active').forEach(btn => {
    btn.classList.remove('active');
  });
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.job-actions')) {
    closeAllDropdowns();
  }
});

function handleGridChange(e) {
  if (e.target.classList.contains('status-select')) {
    handleStatusChange(e);
  }
}

function handleEditKeyboard(e) {
  if (e.target.classList.contains('editable') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    handleEditStart(e);
  }
}

async function handleAddJob(e) {
  e.preventDefault();

  const url = jobUrlInput.value.trim();
  if (!url) return;

  if (!isValidHttpUrl(url)) {
    scrapeStatus.textContent = 'Please enter a valid HTTP or HTTPS URL';
    scrapeStatus.className = 'scrape-status error';
    return;
  }

  addBtn.disabled = true;
  urlLoader.classList.add('show');
  scrapeStatus.textContent = 'Scraping job details...';
  scrapeStatus.className = 'scrape-status loading';

  try {
    // Scrape the job page
    const result = await window.api.scrapeJob(url);

    let company = companyInput.value.trim();
    let title = titleInput.value.trim();
    let location = locationInput.value.trim();

    if (result.success && result.data) {
      const scraped = result.data;
      company = company || scraped.company || '';
      title = title || scraped.title || '';
      location = location || scraped.location || '';

      if (scraped.company || scraped.title || scraped.location) {
        scrapeStatus.textContent = 'Found job details!';
        scrapeStatus.className = 'scrape-status success';
      }
    }

    // Add the job to database
    const jobData = {
      url: url,
      company: company || null,
      title: title || null,
      location: location || null,
      applied_date: getLocalDateString(),
      status: 'waiting'
    };

    const addResult = await window.api.addJob(jobData);
    if (addResult.success) {
      showNotification('Application added successfully', 'success');
      closeModal();
      loadJobs();
    } else {
      scrapeStatus.textContent = 'Error adding job: ' + addResult.error;
      scrapeStatus.className = 'scrape-status error';
    }
  } catch (error) {
    scrapeStatus.textContent = 'Error: ' + error.message;
    scrapeStatus.className = 'scrape-status error';
  }

  addBtn.disabled = false;
  urlLoader.classList.remove('show');
}

async function loadJobs() {
  try {
    console.log('loadJobs() called');
    const result = await window.api.getAllJobs();
    console.log('getAllJobs result:', result);
    if (result.success) {
      allJobs = result.data;
      console.log('Jobs loaded:', allJobs);
      updateStats();
      renderJobs();
    } else {
      console.error('Failed to load jobs:', result.error);
      showNotification('Failed to load jobs: ' + (result.error || 'Unknown error'), 'error');
      // Retry after a brief delay
      setTimeout(() => loadJobs(), 500);
    }
  } catch (error) {
    console.error('Error loading jobs:', error);
    showNotification('Error loading jobs: ' + error.message, 'error');
    // Retry after a brief delay
    setTimeout(() => loadJobs(), 500);
  }
}

function updateStats() {
  const total = allJobs.length;
  const active = allJobs.filter(j => j.status !== 'rejected').length;

  totalCount.textContent = total;
  activeCount.textContent = active;
}

function renderJobs() {
  const filteredJobs = currentFilter === 'all'
    ? allJobs
    : allJobs.filter(job => job.status === currentFilter);

  jobsGrid.innerHTML = '';

  if (filteredJobs.length === 0) {
    jobsGrid.classList.add('hidden');
    emptyState.classList.add('show');
  } else {
    jobsGrid.classList.remove('hidden');
    emptyState.classList.remove('show');

    // Add header row
    const header = document.createElement('div');
    header.className = 'jobs-list-header';
    header.innerHTML = `
      <span></span>
      <span>Company</span>
      <span>Position</span>
      <span>Location</span>
      <span>Date</span>
      <span>Status</span>
      <span></span>
    `;
    jobsGrid.appendChild(header);

    filteredJobs.forEach((job, index) => {
      const card = createJobCard(job, index);
      jobsGrid.appendChild(card);
    });
  }
}

function createJobCard(job, index) {
  const card = document.createElement('article');
  card.className = `job-card status-${job.status}`;
  card.dataset.id = job.id;

  const companyName = escapeHtml(job.company) || 'Unknown';
  const jobTitle = escapeHtml(job.title) || 'View Listing';
  const jobLocation = escapeHtml(job.location) || 'Not specified';
  const appliedDate = formatDate(job.applied_date);

  card.innerHTML = `
    <div class="job-status-bar"></div>
    <span class="job-company" data-field="company" data-id="${job.id}" title="${companyName}">
      ${companyName}
    </span>
    <h3 class="job-title">
      <a href="${sanitizeUrl(job.url)}" target="_blank" rel="noopener noreferrer" title="Open job listing: ${jobTitle}">
        ${jobTitle}
      </a>
    </h3>
    <span class="job-location" data-field="location" data-id="${job.id}" title="${jobLocation}">
      ${jobLocation}
    </span>
    <span class="job-date">${appliedDate}</span>
    <select class="status-select ${job.status}" data-id="${job.id}" aria-label="Update status">
      <option value="waiting" ${job.status === 'waiting' ? 'selected' : ''}>Waiting</option>
      <option value="interviewing" ${job.status === 'interviewing' ? 'selected' : ''}>Interviewing</option>
      <option value="rejected" ${job.status === 'rejected' ? 'selected' : ''}>Rejected</option>
    </select>
    <div class="job-actions">
      <button class="menu-btn" data-id="${job.id}" aria-label="More options" title="More options">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2"/>
          <circle cx="12" cy="12" r="2"/>
          <circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
      <div class="dropdown-menu" data-id="${job.id}">
        <button class="dropdown-item edit-btn" data-id="${job.id}" data-field="company">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit Company
        </button>
        <button class="dropdown-item edit-btn" data-id="${job.id}" data-field="title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit Position
        </button>
        <button class="dropdown-item edit-btn" data-id="${job.id}" data-field="location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit Location
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item delete-btn danger" data-id="${job.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </button>
      </div>
    </div>
  `;

  return card;
}

async function handleStatusChange(e) {
  const id = parseInt(e.target.dataset.id);
  if (isNaN(id) || id <= 0) {
    showNotification('Invalid job ID', 'error');
    return;
  }

  const status = e.target.value;
  const job = allJobs.find(j => j.id === id);
  const previousStatus = job ? job.status : 'waiting';
  const card = e.target.closest('.job-card');

  // Update UI immediately
  e.target.className = 'status-select ' + status;
  if (card) {
    card.classList.remove('status-waiting', 'status-interviewing', 'status-rejected');
    card.classList.add('status-' + status);
  }

  try {
    const result = await window.api.updateStatus(id, status);
    if (result.success) {
      if (job) job.status = status;
      updateStats();
      showNotification('Status updated', 'success');
    } else {
      // Revert on failure
      e.target.value = previousStatus;
      e.target.className = 'status-select ' + previousStatus;
      if (card) {
        card.classList.remove('status-waiting', 'status-interviewing', 'status-rejected');
        card.classList.add('status-' + previousStatus);
      }
      showNotification('Failed to update status: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    e.target.value = previousStatus;
    e.target.className = 'status-select ' + previousStatus;
    if (card) {
      card.classList.remove('status-waiting', 'status-interviewing', 'status-rejected');
      card.classList.add('status-' + previousStatus);
    }
    showNotification('Error updating status: ' + error.message, 'error');
  }
}

async function handleDelete(e) {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;

  const id = parseInt(btn.dataset.id);
  if (isNaN(id) || id <= 0) {
    showNotification('Invalid job ID', 'error');
    return;
  }

  if (confirm('Are you sure you want to delete this application?')) {
    try {
      const result = await window.api.deleteJob(id);
      if (result.success) {
        showNotification('Application deleted', 'success');
        loadJobs();
      } else {
        showNotification('Failed to delete: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('Error deleting application: ' + error.message, 'error');
    }
  }
}

function handleEditStart(e) {
  const span = e.target;
  if (!span.classList.contains('editable')) return;

  const field = span.dataset.field;
  const id = parseInt(span.dataset.id);

  if (isNaN(id) || id <= 0) {
    showNotification('Invalid job ID', 'error');
    return;
  }

  const job = allJobs.find(j => j.id === id);
  if (!job) return;

  const currentValue = job[field] || '';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = currentValue;
  input.setAttribute('aria-label', `Edit ${field}`);

  span.innerHTML = '';
  span.appendChild(input);
  input.focus();
  input.select();

  const finishEdit = async () => {
    const newValue = input.value.trim();
    const displayValue = newValue || (field === 'company' ? 'Unknown' : 'Not specified');
    span.innerHTML = escapeHtml(displayValue);
    span.title = displayValue;

    if (newValue !== currentValue) {
      try {
        const result = await window.api.updateJob(id, { [field]: newValue || null });
        if (result.success) {
          job[field] = newValue || null;
          showNotification('Updated successfully', 'success');
        } else {
          span.innerHTML = escapeHtml(currentValue || displayValue);
          span.title = currentValue || displayValue;
          showNotification('Failed to update: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        span.innerHTML = escapeHtml(currentValue || displayValue);
        span.title = currentValue || displayValue;
        showNotification('Error updating: ' + error.message, 'error');
      }
    }

    requestAnimationFrame(() => span.focus());
  };

  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      const displayValue = currentValue || (field === 'company' ? 'Unknown' : 'Not specified');
      span.innerHTML = escapeHtml(displayValue);
      span.title = displayValue;
      requestAnimationFrame(() => span.focus());
    }
  });
}

function openEditModal(id, field) {
  const job = allJobs.find(j => j.id === id);
  if (!job) {
    showNotification('Job not found', 'error');
    return;
  }

  const fieldLabels = {
    company: 'Company',
    title: 'Position',
    location: 'Location'
  };

  const currentValue = job[field] || '';
  const label = fieldLabels[field] || field;

  // Create edit modal
  const editOverlay = document.createElement('div');
  editOverlay.className = 'modal-overlay show';
  editOverlay.id = 'edit-modal-overlay';

  editOverlay.innerHTML = `
    <div class="modal edit-modal">
      <div class="modal-header">
        <h2 class="modal-title">Edit ${label}</h2>
        <button class="modal-close" id="close-edit-modal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <form id="edit-field-form" class="modal-form">
        <div class="form-group">
          <label for="edit-field-input">${label}</label>
          <input type="text" id="edit-field-input" value="${escapeHtml(currentValue)}" placeholder="Enter ${label.toLowerCase()}">
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" id="cancel-edit-btn">Cancel</button>
          <button type="submit" class="btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(editOverlay);
  document.body.style.overflow = 'hidden';

  const input = editOverlay.querySelector('#edit-field-input');
  const form = editOverlay.querySelector('#edit-field-form');
  const closeBtn = editOverlay.querySelector('#close-edit-modal');
  const cancelBtn = editOverlay.querySelector('#cancel-edit-btn');

  setTimeout(() => input.focus(), 100);

  const closeEditModal = () => {
    editOverlay.remove();
    document.body.style.overflow = '';
  };

  closeBtn.addEventListener('click', closeEditModal);
  cancelBtn.addEventListener('click', closeEditModal);
  editOverlay.addEventListener('click', (e) => {
    if (e.target === editOverlay) closeEditModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newValue = input.value.trim();

    if (newValue !== currentValue) {
      try {
        const result = await window.api.updateJob(id, { [field]: newValue || null });
        if (result.success) {
          job[field] = newValue || null;
          showNotification(`${label} updated successfully`, 'success');
          renderJobs();
        } else {
          showNotification('Failed to update: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        showNotification('Error updating: ' + error.message, 'error');
      }
    }

    closeEditModal();
  });

  // Handle Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Parse YYYY-MM-DD format manually to avoid timezone issues
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // months are 0-indexed
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
  // Fallback for other formats
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeUrl(url) {
  if (!url) return '#';
  try {
    const parsed = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '#';
    }
    return escapeHtml(url);
  } catch {
    return '#';
  }
}

function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function showNotification(message, type = 'info') {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');

  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
