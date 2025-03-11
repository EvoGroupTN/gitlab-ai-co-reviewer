import { contextBridge, ipcRenderer } from 'electron';
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
    ipcRenderer.invoke('get-merge-request-changes', mergeRequestId, projectId)
});