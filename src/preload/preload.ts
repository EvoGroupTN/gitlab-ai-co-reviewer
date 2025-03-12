import { contextBridge, ipcRenderer, clipboard } from 'electron';
import { MergeRequest, ChangedFile } from '../main/gitlab-service';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Config related functions
  getConfig: (): Promise<{ gitlabUrl: string; gitlabToken: string }> => 
    ipcRenderer.invoke('get-config'),
    
  saveConfig: (config: { gitlabUrl: string; gitlabToken: string }): Promise<boolean> => 
    ipcRenderer.invoke('save-config', config),
  
  // GitLab API related functions
  getAssignedMergeRequests: (): Promise<MergeRequest[]> => 
    ipcRenderer.invoke('get-assigned-merge-requests'),
    
  getMergeRequestChanges: (mergeRequestId: number, projectId: number): Promise<ChangedFile[]> => 
    ipcRenderer.invoke('get-merge-request-changes', mergeRequestId, projectId),
    
  postMergeRequestComments: (
    projectId: number, 
    mergeRequestId: number, 
    comments: Array<{
      filePath: string;
      comment: string;
      lineNumber: number;
      diffType: 'NUL' | 'ADD' | 'DEL';
    }>
  ): Promise<{ success: boolean }> => 
    ipcRenderer.invoke('post-merge-request-comments', projectId, mergeRequestId, comments),
    
  // GitHub authorization functions
  githubCheckAuth: (): Promise<{ authorized: boolean; expiresAt?: Date }> =>
    ipcRenderer.invoke('github-check-auth'),
    
  githubStartAuth: (): Promise<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }> =>
    ipcRenderer.invoke('github-start-auth'),
    
  githubPollToken: (deviceCode: string, interval: number): Promise<{ success: boolean; token?: string }> =>
    ipcRenderer.invoke('github-poll-token', deviceCode, interval),
    
  githubClearToken: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('github-clear-token'),
    
  // Clipboard functions
  copyToClipboard: (text: string): void => {
    clipboard.writeText(text);
  },
  
  // Code review function
  reviewCode: (
    files: Array<{ 
      path: string; 
      diff: string; 
      isNew?: boolean;
      isDeleted?: boolean;
    }>, 
    reviewLevel: 'light' | 'medium' | 'expert'
  ) => ipcRenderer.invoke('review-code', files, reviewLevel)
});