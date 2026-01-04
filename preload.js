const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scrapeJob: (url) => ipcRenderer.invoke('scrape-job', url),
  addJob: (jobData) => ipcRenderer.invoke('add-job', jobData),
  getAllJobs: () => ipcRenderer.invoke('get-all-jobs'),
  updateStatus: (id, status) => ipcRenderer.invoke('update-status', id, status),
  updateJob: (id, updates) => ipcRenderer.invoke('update-job', id, updates),
  deleteJob: (id) => ipcRenderer.invoke('delete-job', id)
});
