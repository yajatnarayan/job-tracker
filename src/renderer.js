let allJobs = [];

// DOM Elements
const addJobForm = document.getElementById('add-job-form');
const jobUrlInput = document.getElementById('job-url');
const addBtn = document.getElementById('add-btn');
const scrapeStatus = document.getElementById('scrape-status');
const manualFields = document.getElementById('manual-fields');
const companyInput = document.getElementById('company');
const titleInput = document.getElementById('title');
const locationInput = document.getElementById('location');
const jobsTbody = document.getElementById('jobs-tbody');
const jobsTable = document.getElementById('jobs-table');
const noJobsMsg = document.getElementById('no-jobs');
const statusFilter = document.getElementById('status-filter');
const jobCount = document.getElementById('job-count');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadJobs();
  setupEventDelegation();
});

// Event Listeners
addJobForm.addEventListener('submit', handleAddJob);
statusFilter.addEventListener('change', renderJobs);
jobUrlInput.addEventListener('input', () => {
  manualFields.classList.remove('show');
  scrapeStatus.textContent = '';
  scrapeStatus.className = 'scrape-status';
});

// Event delegation for dynamic elements (performance optimization)
function setupEventDelegation() {
  jobsTbody.addEventListener('change', (e) => {
    if (e.target.classList.contains('status-select')) {
      handleStatusChange(e);
    }
  });

  jobsTbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
      handleDelete(e);
    }
  });

  jobsTbody.addEventListener('dblclick', (e) => {
    if (e.target.classList.contains('editable')) {
      handleEditStart(e);
    }
  });

  // Keyboard support for editable fields (accessibility)
  jobsTbody.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('editable') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleEditStart(e);
    }
  });
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
  scrapeStatus.textContent = 'Scraping job details...';
  scrapeStatus.className = 'scrape-status loading';

  try {
    // Scrape the job page
    const result = await window.api.scrapeJob(url);

    if (result.success && result.data) {
      const scraped = result.data;

      // Show what we found
      if (scraped.company || scraped.title || scraped.location) {
        scrapeStatus.textContent = 'Found job details!';
        scrapeStatus.className = 'scrape-status success';
      } else {
        scrapeStatus.textContent = 'Could not extract details. Please fill in manually.';
        scrapeStatus.className = 'scrape-status error';
      }

      // Populate manual fields for review/editing
      companyInput.value = scraped.company || '';
      titleInput.value = scraped.title || '';
      locationInput.value = scraped.location || '';
      manualFields.classList.add('show');

      // Add the job to database
      const jobData = {
        url: url,
        company: scraped.company,
        title: scraped.title,
        location: scraped.location,
        applied_date: new Date().toISOString().split('T')[0],
        status: 'waiting'
      };

      const addResult = await window.api.addJob(jobData);
      if (addResult.success) {
        // Clear form and reload
        jobUrlInput.value = '';
        companyInput.value = '';
        titleInput.value = '';
        locationInput.value = '';
        manualFields.classList.remove('show');
        scrapeStatus.textContent = 'Job added successfully!';
        scrapeStatus.className = 'scrape-status success';
        loadJobs();
      } else {
        scrapeStatus.textContent = 'Error adding job: ' + addResult.error;
        scrapeStatus.className = 'scrape-status error';
      }
    } else {
      scrapeStatus.textContent = 'Error scraping page. Please fill in details manually.';
      scrapeStatus.className = 'scrape-status error';
      manualFields.classList.add('show');
    }
  } catch (error) {
    scrapeStatus.textContent = 'Error: ' + error.message;
    scrapeStatus.className = 'scrape-status error';
    manualFields.classList.add('show');
  }

  addBtn.disabled = false;
}

async function loadJobs() {
  try {
    const result = await window.api.getAllJobs();
    if (result.success) {
      allJobs = result.data;
      renderJobs();
    } else {
      showNotification('Failed to load jobs: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showNotification('Error loading jobs: ' + error.message, 'error');
  }
}

function renderJobs() {
  const filter = statusFilter.value;
  const filteredJobs = filter === 'all'
    ? allJobs
    : allJobs.filter(job => job.status === filter);

  jobsTbody.innerHTML = '';

  if (filteredJobs.length === 0) {
    jobsTable.classList.add('hidden');
    noJobsMsg.classList.add('show');
    jobCount.textContent = '';
  } else {
    jobsTable.classList.remove('hidden');
    noJobsMsg.classList.remove('show');
    jobCount.textContent = `${filteredJobs.length} application${filteredJobs.length !== 1 ? 's' : ''}`;

    filteredJobs.forEach(job => {
      const row = document.createElement('tr');
      const companyName = escapeHtml(job.company) || 'Unknown';
      const jobTitle = escapeHtml(job.title) || 'View Listing';

      row.innerHTML = `
        <td>
          <span class="editable" data-field="company" data-id="${job.id}" tabindex="0" role="button" aria-label="Edit company name">
            ${escapeHtml(job.company) || '<em>Unknown</em>'}
          </span>
        </td>
        <td>
          <a href="${sanitizeUrl(job.url)}" target="_blank" rel="noopener noreferrer" title="Open job listing">
            ${escapeHtml(job.title) || '<em>View Listing</em>'}
          </a>
        </td>
        <td>
          <span class="editable" data-field="location" data-id="${job.id}" tabindex="0" role="button" aria-label="Edit location">
            ${escapeHtml(job.location) || '<em>Unknown</em>'}
          </span>
        </td>
        <td>${formatDate(job.applied_date)}</td>
        <td>
          <select class="status-select ${job.status}" data-id="${job.id}" aria-label="Update status for ${jobTitle} at ${companyName}">
            <option value="waiting" ${job.status === 'waiting' ? 'selected' : ''}>Waiting</option>
            <option value="interviewing" ${job.status === 'interviewing' ? 'selected' : ''}>Interviewing</option>
            <option value="rejected" ${job.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </td>
        <td>
          <button class="delete-btn" data-id="${job.id}" aria-label="Delete application for ${jobTitle} at ${companyName}">Delete</button>
        </td>
      `;
      jobsTbody.appendChild(row);
    });
  }
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

  e.target.className = 'status-select ' + status;

  try {
    const result = await window.api.updateStatus(id, status);
    if (result.success) {
      if (job) job.status = status;
      showNotification('Status updated', 'success');
    } else {
      e.target.value = previousStatus;
      e.target.className = 'status-select ' + previousStatus;
      showNotification('Failed to update status: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    e.target.value = previousStatus;
    e.target.className = 'status-select ' + previousStatus;
    showNotification('Error updating status: ' + error.message, 'error');
  }
}

async function handleDelete(e) {
  const id = parseInt(e.target.dataset.id);
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
    span.innerHTML = escapeHtml(newValue) || '<em>Unknown</em>';

    if (newValue !== currentValue) {
      try {
        const result = await window.api.updateJob(id, { [field]: newValue || null });
        if (result.success) {
          job[field] = newValue || null;
          showNotification('Updated successfully', 'success');
        } else {
          span.innerHTML = escapeHtml(currentValue) || '<em>Unknown</em>';
          showNotification('Failed to update: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        span.innerHTML = escapeHtml(currentValue) || '<em>Unknown</em>';
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
      span.innerHTML = escapeHtml(currentValue) || '<em>Unknown</em>';
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
