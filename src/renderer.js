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
});

// Event Listeners
addJobForm.addEventListener('submit', handleAddJob);
statusFilter.addEventListener('change', renderJobs);
jobUrlInput.addEventListener('input', () => {
  manualFields.classList.remove('show');
  scrapeStatus.textContent = '';
  scrapeStatus.className = 'scrape-status';
});

async function handleAddJob(e) {
  e.preventDefault();

  const url = jobUrlInput.value.trim();
  if (!url) return;

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
  const result = await window.api.getAllJobs();
  if (result.success) {
    allJobs = result.data;
    renderJobs();
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
      row.innerHTML = `
        <td>
          <span class="editable" data-field="company" data-id="${job.id}">
            ${escapeHtml(job.company) || '<em>Unknown</em>'}
          </span>
        </td>
        <td>
          <a href="${escapeHtml(job.url)}" target="_blank" title="Open job listing">
            ${escapeHtml(job.title) || '<em>View Listing</em>'}
          </a>
        </td>
        <td>
          <span class="editable" data-field="location" data-id="${job.id}">
            ${escapeHtml(job.location) || '<em>Unknown</em>'}
          </span>
        </td>
        <td>${formatDate(job.applied_date)}</td>
        <td>
          <select class="status-select ${job.status}" data-id="${job.id}">
            <option value="waiting" ${job.status === 'waiting' ? 'selected' : ''}>Waiting</option>
            <option value="interviewing" ${job.status === 'interviewing' ? 'selected' : ''}>Interviewing</option>
            <option value="rejected" ${job.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </td>
        <td>
          <button class="delete-btn" data-id="${job.id}">Delete</button>
        </td>
      `;
      jobsTbody.appendChild(row);
    });

    // Add event listeners
    document.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', handleStatusChange);
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', handleDelete);
    });

    document.querySelectorAll('.editable').forEach(span => {
      span.addEventListener('dblclick', handleEditStart);
    });
  }
}

async function handleStatusChange(e) {
  const id = parseInt(e.target.dataset.id);
  const status = e.target.value;

  e.target.className = 'status-select ' + status;

  await window.api.updateStatus(id, status);

  // Update local data
  const job = allJobs.find(j => j.id === id);
  if (job) job.status = status;
}

async function handleDelete(e) {
  const id = parseInt(e.target.dataset.id);

  if (confirm('Are you sure you want to delete this application?')) {
    await window.api.deleteJob(id);
    loadJobs();
  }
}

function handleEditStart(e) {
  const span = e.target;
  const field = span.dataset.field;
  const id = parseInt(span.dataset.id);
  const job = allJobs.find(j => j.id === id);

  if (!job) return;

  const currentValue = job[field] || '';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = currentValue;

  span.innerHTML = '';
  span.appendChild(input);
  input.focus();
  input.select();

  const finishEdit = async () => {
    const newValue = input.value.trim();
    span.innerHTML = escapeHtml(newValue) || '<em>Unknown</em>';

    if (newValue !== currentValue) {
      await window.api.updateJob(id, { [field]: newValue || null });
      job[field] = newValue || null;
    }
  };

  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      span.innerHTML = escapeHtml(currentValue) || '<em>Unknown</em>';
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
