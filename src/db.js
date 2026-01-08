const VALID_STATUSES = ['applied', 'interview', 'interviewing', 'waiting', 'offer', 'accepted', 'rejected', 'withdrawn'];
const ALLOWED_UPDATE_FIELDS = ['company', 'title', 'location', 'status'];

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  // Check if table exists
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'").get();

  if (tableExists) {
    // Check if we need to migrate (old constraint doesn't have 'applied')
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'").get();
    const needsStatusMigration = tableInfo && tableInfo.sql && !tableInfo.sql.includes("'applied'");
    const needsStatusUpdatedAtMigration = tableInfo && tableInfo.sql && !tableInfo.sql.includes('status_updated_at');

    if (needsStatusMigration) {
      console.log('Migrating database to new status schema...');

      // Create new table with updated constraint
      db.exec(`
        CREATE TABLE jobs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          company TEXT,
          title TEXT,
          location TEXT,
          applied_date TEXT NOT NULL,
          status TEXT DEFAULT 'applied' CHECK(status IN ('applied', 'interview', 'interviewing', 'waiting', 'offer', 'accepted', 'rejected', 'withdrawn')),
          status_updated_at TEXT
        )
      `);

      // Copy data, mapping old 'waiting' to 'applied' for initial state jobs
      // Set status_updated_at to applied_date for existing records
      db.exec(`
        INSERT INTO jobs_new (id, url, company, title, location, applied_date, status, status_updated_at)
        SELECT id, url, company, title, location, applied_date,
          CASE
            WHEN status = 'waiting' THEN 'applied'
            ELSE status
          END,
          applied_date
        FROM jobs
      `);

      // Drop old table and rename new one
      db.exec('DROP TABLE jobs');
      db.exec('ALTER TABLE jobs_new RENAME TO jobs');

      console.log('Database migration completed.');
    } else if (needsStatusUpdatedAtMigration) {
      // Add status_updated_at column to existing table
      console.log('Adding status_updated_at column...');
      db.exec('ALTER TABLE jobs ADD COLUMN status_updated_at TEXT');
      // Set status_updated_at to applied_date for existing records
      db.exec('UPDATE jobs SET status_updated_at = applied_date WHERE status_updated_at IS NULL');
      console.log('status_updated_at column added.');
    }
  } else {
    // Create fresh table
    db.exec(`
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        company TEXT,
        title TEXT,
        location TEXT,
        applied_date TEXT NOT NULL,
        status TEXT DEFAULT 'applied' CHECK(status IN ('applied', 'interview', 'interviewing', 'waiting', 'offer', 'accepted', 'rejected', 'withdrawn')),
        status_updated_at TEXT
      )
    `);
  }
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

  const status = jobData.status || 'applied';
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const db = getDb();
  const today = getLocalDateString();
  const stmt = db.prepare(`
    INSERT INTO jobs (url, company, title, location, applied_date, status, status_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    jobData.url.trim(),
    jobData.company || null,
    jobData.title || null,
    jobData.location || null,
    jobData.applied_date,
    status,
    today
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
  const today = getLocalDateString();
  const stmt = db.prepare('UPDATE jobs SET status = ?, status_updated_at = ? WHERE id = ?');
  const result = stmt.run(status, today, id);

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
  let statusChanged = false;

  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_UPDATE_FIELDS.includes(key)) {
      throw new Error(`Invalid field: ${key}`);
    }

    if (key === 'status' && value !== undefined && !VALID_STATUSES.includes(value)) {
      throw new Error(`Invalid status: ${value}`);
    }

    if (key === 'status' && value !== undefined) {
      statusChanged = true;
    }

    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return null;

  // Update status_updated_at if status changed
  if (statusChanged) {
    fields.push('status_updated_at = ?');
    values.push(getLocalDateString());
  }

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
