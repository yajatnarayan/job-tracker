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
  if (e.target.classList.contains('delete-btn') || e.target.closest('.delete-btn')) {
    handleDelete(e);
  }
}

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
      applied_date: new Date().toISOString().split('T')[0],
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
    <span class="job-company editable" data-field="company" data-id="${job.id}" tabindex="0" role="button" aria-label="Edit company name" title="${companyName}">
      ${companyName}
    </span>
    <h3 class="job-title">
      <a href="${sanitizeUrl(job.url)}" target="_blank" rel="noopener noreferrer" title="Open job listing: ${jobTitle}">
        ${jobTitle}
      </a>
    </h3>
    <span class="job-location editable" data-field="location" data-id="${job.id}" tabindex="0" role="button" aria-label="Edit location" title="${jobLocation}">
      ${jobLocation}
    </span>
    <span class="job-date">${appliedDate}</span>
    <select class="status-select ${job.status}" data-id="${job.id}" aria-label="Update status">
      <option value="waiting" ${job.status === 'waiting' ? 'selected' : ''}>Waiting</option>
      <option value="interviewing" ${job.status === 'interviewing' ? 'selected' : ''}>Interviewing</option>
      <option value="rejected" ${job.status === 'rejected' ? 'selected' : ''}>Rejected</option>
    </select>
    <button class="delete-btn" data-id="${job.id}" aria-label="Delete application" title="Delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
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

function formatDate(dateStr) {
  if (!dateStr) return '';
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
