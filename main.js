const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./src/db');
const { scrapeJobPage } = require('./scraper/scraper');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('src/index.html');

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  db.closeDb();
});

// IPC Handlers

ipcMain.handle('scrape-job', async (event, url) => {
  try {
    const jobInfo = await scrapeJobPage(url);
    return { success: true, data: jobInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-job', async (event, jobData) => {
  try {
    const id = db.addJob(jobData);
    return { success: true, id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-all-jobs', async () => {
  try {
    const jobs = db.getAllJobs();
    return { success: true, data: jobs };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function validateId(id) {
  const parsed = parseInt(id);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error('Invalid job ID');
  }
  return parsed;
}

ipcMain.handle('update-status', async (event, id, status) => {
  try {
    const validId = validateId(id);
    db.updateStatus(validId, status);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-job', async (event, id, updates) => {
  try {
    const validId = validateId(id);
    db.updateJob(validId, updates);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-job', async (event, id) => {
  try {
    const validId = validateId(id);
    db.deleteJob(validId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
