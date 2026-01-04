const Database = require('better-sqlite3');
const path = require('path');

let db = null;

function getDb() {
  if (!db) {
    const dbPath = path.join(__dirname, '..', 'jobs.db');
    db = new Database(dbPath);
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

function addJob(jobData) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO jobs (url, company, title, location, applied_date, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    jobData.url,
    jobData.company || null,
    jobData.title || null,
    jobData.location || null,
    jobData.applied_date,
    jobData.status || 'waiting'
  );
  return result.lastInsertRowid;
}

function getAllJobs() {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM jobs ORDER BY applied_date DESC');
  return stmt.all();
}

function updateStatus(id, status) {
  const db = getDb();
  const stmt = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
  return stmt.run(status, id);
}

function updateJob(id, updates) {
  const db = getDb();
  const fields = [];
  const values = [];

  if (updates.company !== undefined) {
    fields.push('company = ?');
    values.push(updates.company);
  }
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.location !== undefined) {
    fields.push('location = ?');
    values.push(updates.location);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return null;

  values.push(id);
  const stmt = db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`);
  return stmt.run(...values);
}

function deleteJob(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
  return stmt.run(id);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
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
