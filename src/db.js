const VALID_STATUSES = ['waiting', 'rejected', 'interviewing'];
const ALLOWED_UPDATE_FIELDS = ['company', 'title', 'location', 'status'];

let Database = null;
let db = null;
let dbInitialized = false;
let dbPath = null;

class NativeModuleError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'NativeModuleError';
    this.originalError = originalError;
  }
}

function isNativeModuleVersionError(error) {
  return error && error.message &&
    error.message.includes('NODE_MODULE_VERSION') &&
    error.message.includes('was compiled against a different Node.js version');
}

function loadDatabase() {
  if (Database) return Database;

  try {
    console.log('Loading better-sqlite3...');
    Database = require('better-sqlite3');
    console.log('better-sqlite3 loaded successfully');
    return Database;
  } catch (error) {
    console.error('ERROR loading better-sqlite3:', error.message);
    console.error('Full error stack:', error.stack);
    if (isNativeModuleVersionError(error)) {
      throw new NativeModuleError(
        'Native module version mismatch: better-sqlite3 was compiled for a different Node.js version. ' +
        'Please run "npm rebuild better-sqlite3" in the project directory to fix this.',
        error
      );
    }
    throw error;
  }
}

function initDb(path) {
  dbPath = path;
}

function getDb() {
  console.log('getDb() called, dbPath:', dbPath);
  if (!dbPath) {
    throw new Error('Database path not set. Call initDb() first.');
  }
  if (!db) {
    try {
      console.log('Creating new database connection...');
      const Db = loadDatabase();
      console.log('Creating database instance at:', dbPath);
      db = new Db(dbPath);
      console.log('Database instance created successfully');
    } catch (error) {
      console.error('ERROR creating database:', error.message);
      console.error('Full error stack:', error.stack);
      if (isNativeModuleVersionError(error)) {
        throw new NativeModuleError(
          'Native module version mismatch: better-sqlite3 was compiled for a different Node.js version. ' +
          'Please run "npm rebuild better-sqlite3" in the project directory to fix this.',
          error
        );
      }
      throw error;
    }
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
  initDb,
  getDb,
  addJob,
  getAllJobs,
  updateStatus,
  updateJob,
  deleteJob,
  closeDb,
  NativeModuleError
};
