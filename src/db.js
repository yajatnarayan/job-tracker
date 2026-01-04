const Database = require('better-sqlite3');
const path = require('path');

const VALID_STATUSES = ['waiting', 'rejected', 'interviewing'];
const ALLOWED_UPDATE_FIELDS = ['company', 'title', 'location', 'status'];

let db = null;
let dbInitialized = false;

function getDb() {
  if (!db) {
    const dbPath = path.join(__dirname, '..', 'jobs.db');
    db = new Database(dbPath);
  }
  if (!dbInitialized) {
    dbInitialized = true;
    initializeDb();
  }
  return db;
}

function initializeDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      company TEXT,
      title TEXT,
      location TEXT,
      applied_date TEXT NOT NULL,
      status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting', 'rejected', 'interviewing'))
    )
  `);
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function addJob(jobData) {
  if (!jobData.url || typeof jobData.url !== 'string' || !jobData.url.trim()) {
    throw new Error('URL is required');
  }

  if (!isValidUrl(jobData.url.trim())) {
    throw new Error('Invalid URL format - must be HTTP or HTTPS');
  }

  const status = jobData.status || 'waiting';
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO jobs (url, company, title, location, applied_date, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    jobData.url.trim(),
    jobData.company || null,
    jobData.title || null,
    jobData.location || null,
    jobData.applied_date,
    status
  );
  return result.lastInsertRowid;
}

function getAllJobs() {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM jobs ORDER BY applied_date DESC');
  return stmt.all();
}

function updateStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid job ID');
  }

  const db = getDb();
  const stmt = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
  const result = stmt.run(status, id);

  if (result.changes === 0) {
    throw new Error(`Job with id ${id} not found`);
  }

  return result;
}

function updateJob(id, updates) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid job ID');
  }

  if (!updates || typeof updates !== 'object') {
    throw new Error('Updates must be an object');
  }

  const db = getDb();
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_UPDATE_FIELDS.includes(key)) {
      throw new Error(`Invalid field: ${key}`);
    }

    if (key === 'status' && value !== undefined && !VALID_STATUSES.includes(value)) {
      throw new Error(`Invalid status: ${value}`);
    }

    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return null;

  values.push(id);
  const stmt = db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);

  if (result.changes === 0) {
    throw new Error(`Job with id ${id} not found`);
  }

  return result;
}

function deleteJob(id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid job ID');
  }

  const db = getDb();
  const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new Error(`Job with id ${id} not found`);
  }

  return result;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
    dbInitialized = false;
  }
}

module.exports = {
  getDb,
  addJob,
  getAllJobs,
  updateStatus,
  updateJob,
  deleteJob,
  closeDb
};
