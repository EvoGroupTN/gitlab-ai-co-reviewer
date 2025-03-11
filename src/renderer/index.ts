import { MergeRequest, ChangedFile } from '../main/gitlab-service';

// TypeScript interface for the exposed API
interface ElectronAPI {
  getConfig: () => Promise<{ gitlabUrl: string; gitlabToken: string }>;
  saveConfig: (config: { gitlabUrl: string; gitlabToken: string }) => Promise<boolean>;
  getAssignedMergeRequests: () => Promise<MergeRequest[]>;
  getMergeRequestChanges: (mergeRequestId: number, projectId: number) => Promise<ChangedFile[]>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

// DOM Elements
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
const modalClose = document.querySelector('.close') as HTMLSpanElement;
const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
const gitlabUrlInput = document.getElementById('gitlab-url') as HTMLInputElement;
const gitlabTokenInput = document.getElementById('gitlab-token') as HTMLInputElement;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
const mergeRequestsContainer = document.getElementById('merge-requests') as HTMLDivElement;
const fileListContainer = document.getElementById('file-list') as HTMLDivElement;
const selectedFilesContainer = document.getElementById('selected-files') as HTMLDivElement;

// State
let currentMergeRequest: MergeRequest | null = null;
let selectedFiles: ChangedFile[] = [];

// Load config when app starts
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load configuration
    const config = await window.api.getConfig();
    gitlabUrlInput.value = config.gitlabUrl;
    gitlabTokenInput.value = config.gitlabToken;
    
    // If we have a token, load MRs
    if (config.gitlabToken) {
      await loadMergeRequests();
    } else {
      // Show settings modal if no token is set
      settingsModal.style.display = 'block';
    }
  } catch (error) {
    showError('Failed to load configuration');
    console.error(error);
  }
});

// Settings modal functionality
settingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'block';
});

modalClose.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    settingsModal.style.display = 'none';
  }
});

// Handle settings form submission
settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  
  try {
    await window.api.saveConfig({
      gitlabUrl: gitlabUrlInput.value,
      gitlabToken: gitlabTokenInput.value
    });
    
    settingsModal.style.display = 'none';
    
    // Reload MRs with new settings
    await loadMergeRequests();
  } catch (error) {
    showError('Failed to save configuration');
    console.error(error);
  }
});

// Refresh button functionality
refreshBtn.addEventListener('click', async () => {
  await loadMergeRequests();
});

// Load merge requests
async function loadMergeRequests() {
  try {
    mergeRequestsContainer.innerHTML = '<div class="loading">Loading merge requests...</div>';
    
    const mergeRequests = await window.api.getAssignedMergeRequests();
    
    if (mergeRequests.length === 0) {
      mergeRequestsContainer.innerHTML = '<div class="empty-state">No merge requests assigned to you</div>';
      return;
    }
    
    // Clear the container
    mergeRequestsContainer.innerHTML = '';
    
    // Render each merge request
    mergeRequests.forEach(mr => {
      const mrElement = document.createElement('div');
      mrElement.className = 'mr-card';
      mrElement.dataset.mrId = mr.iid.toString();
      mrElement.dataset.projectId = mr.project_id.toString();
      
      mrElement.innerHTML = `
        <h3>${mr.title}</h3>
        <p>Project ID: ${mr.project_id}</p>
        <p>Created: ${new Date(mr.created_at).toLocaleString()}</p>
        <div class="branches">
          <span>${mr.source_branch} → ${mr.target_branch}</span>
        </div>
      `;
      
      // Add click handler to load files
      mrElement.addEventListener('click', async () => {
        // Remove selected class from all MRs
        document.querySelectorAll('.mr-card').forEach(el => {
          el.classList.remove('selected');
        });
        
        // Add selected class to clicked MR
        mrElement.classList.add('selected');
        
        // Load files for this MR
        currentMergeRequest = mr;
        await loadMergeRequestFiles(mr.iid, mr.project_id);
      });
      
      mergeRequestsContainer.appendChild(mrElement);
    });
  } catch (error) {
    mergeRequestsContainer.innerHTML = '<div class="error">Failed to load merge requests</div>';
    console.error(error);
  }
}

// Load files for a merge request
async function loadMergeRequestFiles(mergeRequestId: number, projectId: number) {
  try {
    fileListContainer.innerHTML = '<div class="loading">Loading files...</div>';
    selectedFilesContainer.innerHTML = '';
    selectedFiles = [];
    
    const files = await window.api.getMergeRequestChanges(mergeRequestId, projectId);
    
    if (files.length === 0) {
      fileListContainer.innerHTML = '<div class="empty-state">No files changed in this merge request</div>';
      return;
    }
    
    // Clear the container
    fileListContainer.innerHTML = '';
    
    // Render each file
    files.forEach(file => {
      const fileElement = document.createElement('div');
      
      let fileClass = 'file-item';
      if (file.new_file) {
        fileClass += ' new';
      } else if (file.deleted_file) {
        fileClass += ' deleted';
      } else {
        fileClass += ' modified';
      }
      
      fileElement.className = fileClass;
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `file-${file.new_path}`;
      checkbox.dataset.path = file.new_path;
      
      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.className = 'file-path';
      label.textContent = file.new_path || file.old_path;
      
      // Handle checkbox change
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedFiles.push(file);
        } else {
          selectedFiles = selectedFiles.filter(f => 
            (f.new_path || f.old_path) !== (file.new_path || file.old_path)
          );
        }
        
        updateSelectedFiles();
      });
      
      fileElement.appendChild(checkbox);
      fileElement.appendChild(label);
      fileListContainer.appendChild(fileElement);
    });
  } catch (error) {
    fileListContainer.innerHTML = '<div class="error">Failed to load files</div>';
    console.error(error);
  }
}

// Update the selected files display
function updateSelectedFiles() {
  selectedFilesContainer.innerHTML = '';
  
  if (selectedFiles.length === 0) {
    selectedFilesContainer.innerHTML = '<p>No files selected</p>';
    return;
  }
  
  const heading = document.createElement('h3');
  heading.textContent = 'Selected Files';
  selectedFilesContainer.appendChild(heading);
  
  selectedFiles.forEach(file => {
    const fileElement = document.createElement('div');
    fileElement.className = 'selected-file';
    fileElement.textContent = file.new_path || file.old_path;
    selectedFilesContainer.appendChild(fileElement);
  });
}

// Helper function to show errors
function showError(message: string) {
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.textContent = message;
  
  document.body.appendChild(errorElement);
  
  setTimeout(() => {
    errorElement.remove();
  }, 3000);
}