import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as url from 'url';
import Store from 'electron-store';
import { GitLabService } from './gitlab-service';

// Define the store schema
interface StoreSchema {
  gitlabUrl: string;
  gitlabToken: string;
}

// Initialize the store
const store = new Store<StoreSchema>({
  schema: {
    gitlabUrl: {
      type: 'string',
      default: 'https://gitlab.com'
    },
    gitlabToken: {
      type: 'string',
      default: ''
    }
  }
});

let mainWindow: BrowserWindow | null = null;
let gitlabService: GitLabService | null = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  // Load the index.html
  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, '../renderer/index.html'),
      protocol: 'file:',
      slashes: true
    })
  );

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Initialize GitLab service if token exists
  const token = store.get('gitlabToken');
  const gitlabUrl = store.get('gitlabUrl');
  if (token) {
    gitlabService = new GitLabService(gitlabUrl, token);
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.on('ready', createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-config', () => {
  return {
    gitlabUrl: store.get('gitlabUrl'),
    gitlabToken: store.get('gitlabToken')
  };
});

ipcMain.handle('save-config', (_, config: { gitlabUrl: string; gitlabToken: string }) => {
  store.set('gitlabUrl', config.gitlabUrl);
  store.set('gitlabToken', config.gitlabToken);
  
  // Re-initialize GitLab service with new credentials
  gitlabService = new GitLabService(config.gitlabUrl, config.gitlabToken);
  
  return true;
});

ipcMain.handle('get-assigned-merge-requests', async () => {
  if (!gitlabService) {
    throw new Error('GitLab service not initialized. Please set your GitLab token.');
  }
  
  try {
    return await gitlabService.getAssignedMergeRequests();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    dialog.showErrorBox('Error Fetching Merge Requests', errorMessage);
    throw error;
  }
});

ipcMain.handle('get-merge-request-changes', async (_, mergeRequestId: number, projectId: number) => {
  if (!gitlabService) {
    throw new Error('GitLab service not initialized. Please set your GitLab token.');
  }
  
  try {
    return await gitlabService.getMergeRequestChanges(projectId, mergeRequestId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    dialog.showErrorBox('Error Fetching Changes', errorMessage);
    throw error;
  }
});