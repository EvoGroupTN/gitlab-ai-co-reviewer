import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron';
import * as path from 'path';
import * as url from 'url';
import Store from 'electron-store';
import { GitLabService } from './gitlab-service';
import * as GitHubAuth from './github-auth';
import * as CopilotService from './copilot-service';
import { Logger } from './logger';

// Define the store schema
interface StoreSchema {
  gitlabUrl: string;
  gitlabToken: string;
  reviewLanguage: string;
  copilotModel: string;
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
    },
    reviewLanguage: {
      type: 'string',
      default: 'english'
    },
    copilotModel: {
      type: 'string',
      default: 'claude-3.5-sonnet'
    }
  }
});

let mainWindow: BrowserWindow | null = null;
let gitlabService: GitLabService | null = null;

// Initialize logger
const logger = Logger.getInstance();

function createWindow() {
  logger.info('Creating main application window');
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
    logger.info('Initializing GitLab service');
    gitlabService = new GitLabService(gitlabUrl, token);
  } else {
    logger.info('No GitLab token found, skipping service initialization');
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.on('ready', () => {
  logger.info('Application ready, creating window');
  createWindow();
});

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

ipcMain.handle('copyToClipboard', async (event, text) => {
  try {
    clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Clipboard error:', error);
    return false;
  }
});

// IPC handlers
ipcMain.handle('get-config', () => {
  return {
    gitlabUrl: store.get('gitlabUrl'),
    gitlabToken: store.get('gitlabToken'),
    reviewLanguage: store.get('reviewLanguage'),
    copilotModel: store.get('copilotModel')
  };
});

ipcMain.handle('save-config', (_, config: { gitlabUrl: string; gitlabToken: string, reviewLanguage: string, copilotModel: string }) => {
  store.set('gitlabUrl', config.gitlabUrl);
  store.set('gitlabToken', config.gitlabToken);
  store.set('reviewLanguage', config.reviewLanguage);
  store.set('copilotModel', config.copilotModel);
  
  // Re-initialize GitLab service with new credentials
  gitlabService = new GitLabService(config.gitlabUrl, config.gitlabToken);
  
  return true;
});

ipcMain.handle('get-assigned-merge-requests', async () => {
  if (!gitlabService) {
    const error = new Error('GitLab service not initialized. Please set your GitLab token.');
    logger.error('Failed to get merge requests - service not initialized', error);
    throw error;
  }
  
  try {
    logger.info('Fetching assigned merge requests');
    const requests = await gitlabService.getAssignedMergeRequests();
    logger.info(`Successfully fetched ${requests.length} merge requests`);
    return requests;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch merge requests', error instanceof Error ? error : new Error(errorMessage));
    dialog.showErrorBox('Error Fetching Merge Requests', errorMessage);
    throw error;
  }
});

ipcMain.handle('get-merge-request-changes', async (_, mergeRequestId: number, projectId: number) => {
  if (!gitlabService) {
    const error = new Error('GitLab service not initialized. Please set your GitLab token.');
    logger.error('Failed to get merge request changes - service not initialized', error);
    throw error;
  }
  
  try {
    logger.info(`Fetching changes for merge request ${mergeRequestId} in project ${projectId}`);
    const result = await gitlabService.getMergeRequestChanges(projectId, mergeRequestId);
    logger.info(`Successfully fetched changes for merge request ${mergeRequestId}`);
    return result.changes;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to fetch changes for merge request ${mergeRequestId}`, error instanceof Error ? error : new Error(errorMessage));
    dialog.showErrorBox('Error Fetching Changes', errorMessage);
    throw error;
  }
});

ipcMain.handle('post-merge-request-comments', async (_, projectId: number, mergeRequestId: number, comments: Array<{
  filePath: string;
  comment: string;
  lineNumber: number;
  diffType: 'NUL' | 'ADD' | 'DEL';
}>) => {
  if (!gitlabService) {
    const error = new Error('GitLab service not initialized. Please set your GitLab token.');
    logger.error('Failed to post merge request comments - service not initialized', error);
    throw error;
  }
  
  try {
    logger.info(`Posting ${comments.length} comments to merge request ${mergeRequestId}`);
    await gitlabService.postMergeRequestComments(projectId, mergeRequestId, comments);
    logger.info(`Successfully posted comments to merge request ${mergeRequestId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to post comments to merge request ${mergeRequestId}`, error instanceof Error ? error : new Error(errorMessage));
    dialog.showErrorBox('Error Posting Comments', errorMessage);
    throw error;
  }
});

// Copilot models handler
ipcMain.handle('get-copilot-models', async () => {
  try {
    logger.info('Fetching available Copilot models');
    const models = await CopilotService.getAvailableModels();
    logger.info(`Successfully fetched ${models.length} Copilot models`);
    return models;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch Copilot models', error instanceof Error ? error : new Error(errorMessage));
    throw error;
  }
});

// GitHub authorization handlers
ipcMain.handle('github-check-auth', () => {
  const token = GitHubAuth.getToken();
  return {
    authorized: !!token,
    expiresAt: token?.expiresAt
  };
});

ipcMain.handle('github-start-auth', async () => {
  try {
    const deviceCode = await GitHubAuth.getDeviceCode();
    
    // Open the verification URL in the default browser
    shell.openExternal(deviceCode.verification_uri);
    
    return deviceCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    dialog.showErrorBox('GitHub Authorization Error', errorMessage);
    throw error;
  }
});

ipcMain.handle('github-poll-token', async (_, deviceCode: string, interval: number) => {
  try {
    const token = await GitHubAuth.pollForToken(deviceCode, interval);
    return { success: true, token };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    dialog.showErrorBox('GitHub Authorization Error', errorMessage);
    throw error;
  }
});

ipcMain.handle('github-clear-token', () => {
  GitHubAuth.clearToken();
  return { success: true };
});

// Copilot code review handler
ipcMain.handle('review-code', async (_, files, reviewLevel) => {
  try {
    logger.info(`Starting code review with level: ${reviewLevel}`);
    const comments = await CopilotService.reviewCode(files, reviewLevel);
    logger.info(`Successfully completed code review with ${comments.length} comments`);
    return { success: true, comments };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Special handling for auth errors
    if (errorMessage.includes('token expired') || 
        errorMessage.includes('invalid') ||
        errorMessage.includes('authorize')) {
      logger.error('GitHub/Copilot authentication error', error instanceof Error ? error : new Error(errorMessage));
      dialog.showErrorBox('Authorization Error', 
        'GitHub or Copilot token is invalid or expired. Please reauthorize with GitHub.');
    } else {
      logger.error('Code review error', error instanceof Error ? error : new Error(errorMessage));
      dialog.showErrorBox('Code Review Error', errorMessage);
    }
    
    throw error;
  }
});
