/* global window, document, localStorage, setTimeout, console */

// DOM Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const modalClose = document.querySelector('.close');
const fileFilter = document.getElementById('file-filter');
const settingsForm = document.getElementById('settings-form');
const gitlabUrlInput = document.getElementById('gitlab-url');
const gitlabTokenInput = document.getElementById('gitlab-token');
const refreshBtn = document.getElementById('refresh-btn');
const mergeRequestsContainer = document.getElementById('merge-requests');
const fileListContainer = document.getElementById('file-list');
const selectedFilesContainer = document.getElementById('selected-files');

// GitHub auth elements
const githubAuthBtn = document.getElementById('github-auth-btn');
const githubAuthStatus = document.getElementById('github-auth-status');
const githubDeviceFlow = document.getElementById('github-device-flow');
const verificationUrl = document.getElementById('verification-url');
const userCodeElement = document.getElementById('user-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const authProgress = document.getElementById('auth-progress');

// State
let currentMergeRequest = null;
let selectedFiles = [];
let allFiles = []; // Store all files for filtering

// Helper functions at root level
function filterFiles(files, filterText) {
  if (!filterText) return files;
  try {
    const regex = new RegExp(filterText, 'i');
    return files.filter(file => regex.test(file.new_path || file.old_path));
  } catch (e) {
    return files;
  }
}

function createFileSection(title, files, className) {
  if (files.length === 0) return;
  
  const sectionElement = document.createElement('div');
  sectionElement.className = 'file-section';
  
  const titleElement = document.createElement('div');
  titleElement.className = 'file-section-title';
  titleElement.textContent = `${title} (${files.length})`;
  sectionElement.appendChild(titleElement);
  
  const filteredFiles = filterFiles(files, fileFilter?.value || '');
  if (filteredFiles.length === 0) return;

  filteredFiles.forEach(file => {
    const fileElement = document.createElement('div');
    fileElement.className = `file-item ${className}`;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'file-checkbox';
    checkbox.id = `file-${file.new_path || file.old_path}`;
    checkbox.dataset.path = file.new_path || file.old_path;
    
    // Check if file is already selected
    if (selectedFiles.some(f => (f.new_path || f.old_path) === (file.new_path || file.old_path))) {
      checkbox.checked = true;
    }
    
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.className = 'file-path';
    label.textContent = file.new_path || file.old_path;
    
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedFiles.push(file);
      } else {
        selectedFiles = selectedFiles.filter(f => 
          (f.new_path || f.old_path) !== (file.new_path || file.old_path)
        );
      }
      
      updateSelectedFiles();
      updateSelectAllCheckbox();
    });
    
    fileElement.appendChild(checkbox);
    fileElement.appendChild(label);
    sectionElement.appendChild(fileElement);
  });
  
  fileListContainer.appendChild(sectionElement);
}

function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById('select-all-files');
  if (!selectAllCheckbox) return;

  const fileCheckboxes = document.querySelectorAll('.file-checkbox');
  const checkedCount = document.querySelectorAll('.file-checkbox:checked').length;
  
  if (checkedCount === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedCount === fileCheckboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

function renderFileList() {
  // Keep header but clear file sections
  const header = fileListContainer.querySelector('.file-list-header');
  fileListContainer.innerHTML = '';
  if (header) {
    fileListContainer.appendChild(header);
  }

  // Group files by type
  const newFiles = allFiles.filter(f => f.new_file);
  const modifiedFiles = allFiles.filter(f => !f.new_file && !f.deleted_file);
  const deletedFiles = allFiles.filter(f => f.deleted_file);

  // Create sections
  createFileSection('Added', newFiles, 'new');
  createFileSection('Modified', modifiedFiles, 'modified');
  createFileSection('Deleted', deletedFiles, 'deleted');

  // Update select all checkbox
  updateSelectAllCheckbox();
}

// Add filter change handler
fileFilter?.addEventListener('input', () => {
  renderFileList();
});

// Update the selected files display
function updateSelectedFiles() {
  selectedFilesContainer.innerHTML = '';
  
  if (selectedFiles.length === 0) {
    selectedFilesContainer.innerHTML = '<p class="no-selection">No files selected</p>';
    return;
  }
  
  const headerElement = document.createElement('div');
  headerElement.className = 'selected-files-header';
  
  const heading = document.createElement('h3');
  heading.textContent = 'Selected Files';
  
  const countElement = document.createElement('span');
  countElement.className = 'selected-count';
  countElement.textContent = `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`;
  
  const clearButton = document.createElement('button');
  clearButton.className = 'clear-selected';
  clearButton.textContent = 'Clear Selection';
  clearButton.addEventListener('click', () => {
    selectedFiles = [];
    renderFileList();
    updateSelectedFiles();
  });
  
  headerElement.appendChild(heading);
  headerElement.appendChild(countElement);
  headerElement.appendChild(clearButton);
  selectedFilesContainer.appendChild(headerElement);
  
  // Create selected files list
  const fileListElement = document.createElement('div');
  fileListElement.className = 'selected-files-list';
  
  selectedFiles.forEach(file => {
    const className = file.new_file ? 'new' : file.deleted_file ? 'deleted' : 'modified';
    const icon = file.new_file ? '+' : file.deleted_file ? '-' : '~';
    
    const fileElement = document.createElement('div');
    fileElement.className = `selected-file ${className}`;
    
    const iconElement = document.createElement('span');
    iconElement.className = 'file-icon';
    iconElement.textContent = icon;
    
    const pathElement = document.createElement('span');
    pathElement.className = 'file-path';
    pathElement.textContent = file.new_path || file.old_path;
    
    const removeButton = document.createElement('button');
    removeButton.className = 'remove-file';
    removeButton.innerHTML = '&times;';
    removeButton.title = 'Remove from selection';
    removeButton.addEventListener('click', () => {
      selectedFiles = selectedFiles.filter(f => 
        (f.new_path || f.old_path) !== (file.new_path || file.old_path)
      );
      renderFileList();
      updateSelectedFiles();
    });
    
    fileElement.appendChild(iconElement);
    fileElement.appendChild(pathElement);
    fileElement.appendChild(removeButton);
    fileListElement.appendChild(fileElement);
  });
  
  selectedFilesContainer.appendChild(fileListElement);
  
  // Add Review button
  const reviewButtonContainer = document.createElement('div');
  reviewButtonContainer.className = 'review-button-container';
  
  const reviewButton = document.createElement('button');
  reviewButton.className = 'review-btn';
  reviewButton.textContent = 'Review Selected Files';
  reviewButton.addEventListener('click', () => {
    localStorage.setItem('selectedFiles', JSON.stringify(selectedFiles));
    if (currentMergeRequest) {
      localStorage.setItem('currentMergeRequest', JSON.stringify(currentMergeRequest));
    }
    window.location.href = 'review.html';
  });
  
  reviewButton.disabled = selectedFiles.length === 0;
  
  reviewButtonContainer.appendChild(reviewButton);
  selectedFilesContainer.appendChild(reviewButtonContainer);
}

// Load merge request files
async function loadMergeRequestFiles(mergeRequestId, projectId) {
  try {
    fileListContainer.innerHTML = '<div class="loading">Loading files...</div>';
    selectedFilesContainer.innerHTML = '';
    selectedFiles = [];
    
    const files = await window.api.getMergeRequestChanges(mergeRequestId, projectId);
    
    if (files.length === 0) {
      fileListContainer.innerHTML = '<div class="empty-state">No files changed in this merge request</div>';
      return;
    }
    
    // Store all files for filtering
    allFiles = files;
    
    // Clear the container
    fileListContainer.innerHTML = '';
    
    // Add header with count and select all option
    const headerElement = document.createElement('div');
    headerElement.className = 'file-list-header';
    
    const countElement = document.createElement('span');
    countElement.textContent = `${files.length} changed file${files.length > 1 ? 's' : ''}`;
    
    const selectAllContainer = document.createElement('div');
    selectAllContainer.className = 'select-all-container';
    
    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.id = 'select-all-files';
    
    const selectAllLabel = document.createElement('label');
    selectAllLabel.htmlFor = 'select-all-files';
    selectAllLabel.textContent = 'Select All';
    
    selectAllContainer.appendChild(selectAllCheckbox);
    selectAllContainer.appendChild(selectAllLabel);
    
    headerElement.appendChild(countElement);
    headerElement.appendChild(selectAllContainer);
    fileListContainer.appendChild(headerElement);
    
    // Handle select all functionality
    selectAllCheckbox.addEventListener('change', () => {
      const visibleFiles = filterFiles(allFiles, fileFilter?.value || '');
      const fileCheckboxes = document.querySelectorAll('.file-checkbox');
      
      fileCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
        
        // Find matching file
        const file = visibleFiles.find(f => (f.new_path || f.old_path) === checkbox.dataset.path);
        if (file) {
          if (selectAllCheckbox.checked) {
            // Add to selected files if not already there
            if (!selectedFiles.some(f => (f.new_path || f.old_path) === checkbox.dataset.path)) {
              selectedFiles.push(file);
            }
          } else {
            // Remove from selected files
            selectedFiles = selectedFiles.filter(f => 
              (f.new_path || f.old_path) !== checkbox.dataset.path
            );
          }
        }
      });
      
      updateSelectedFiles();
    });
    
    // Reset filter
    if (fileFilter) {
      fileFilter.value = '';
    }
    
    // Render the file list
    renderFileList();
    
  } catch (error) {
    fileListContainer.innerHTML = '<div class="error">Failed to load files</div>';
    console.error(error);
  }
}

// Load config when app starts
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const languageSelect = document.getElementById('review-language');
    const config = await window.api.getConfig();
    
    // Initialize form values
    gitlabUrlInput.value = config.gitlabUrl || '';
    gitlabTokenInput.value = config.gitlabToken || '';
    if (languageSelect) {
      languageSelect.value = config.reviewLanguage || 'english';
    }
    
    await checkGitHubAuthStatus();
    
    if (config.gitlabToken) {
      mergeRequestsContainer.innerHTML = '<div class="info">Click Refresh to load your merge requests</div>';
    } else {
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
    const languageSelect = document.getElementById('review-language');
    await window.api.saveConfig({
      gitlabUrl: gitlabUrlInput.value,
      gitlabToken: gitlabTokenInput.value,
      reviewLanguage: languageSelect ? languageSelect.value : 'english'
    });
    
    settingsModal.style.display = 'none';
    await loadMergeRequests();
  } catch (error) {
    showError('Failed to save configuration');
    console.error(error);
  }
});

// Refresh button functionality
refreshBtn.addEventListener('click', async () => {
  try {
    await loadMergeRequests();
  } catch (error) {
    if (error.message && error.message.includes('token')) {
      showError('Authentication failed. Please update your GitLab token.');
      settingsModal.style.display = 'block';
    } else {
      showError('Failed to load merge requests: ' + error.message);
    }
  }
});

// Helper functions
function showError(message) {
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.textContent = message;
  
  document.body.appendChild(errorElement);
  setTimeout(() => errorElement.remove(), 3000);
}

function showMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.className = 'info-message';
  messageElement.textContent = message;
  
  document.body.appendChild(messageElement);
  setTimeout(() => messageElement.remove(), 3000);
}

// Load merge requests function
async function loadMergeRequests() {
  try {
    mergeRequestsContainer.innerHTML = '<div class="loading">Loading merge requests...</div>';
    
    const mergeRequests = await window.api.getAssignedMergeRequests();
    
    if (mergeRequests.length === 0) {
      mergeRequestsContainer.innerHTML = '<div class="empty-state">No merge requests assigned to you</div>';
      return;
    }
    
    mergeRequestsContainer.innerHTML = '';
    
    // Count by role
    const reviewerMRs = mergeRequests.filter(mr => mr.userRole === 'reviewer' || mr.userRole === 'both').length;
    const assigneeMRs = mergeRequests.filter(mr => mr.userRole === 'assignee' || mr.userRole === 'both').length;
    
    // Add count badge
    const countElement = document.createElement('div');
    countElement.className = 'mr-count';
    countElement.textContent = `Found ${mergeRequests.length} merge request${mergeRequests.length > 1 ? 's' : ''} (${reviewerMRs} to review, ${assigneeMRs} assigned)`;
    mergeRequestsContainer.appendChild(countElement);
    
    // Render each merge request
    mergeRequests.forEach(mr => {
      const mrElement = document.createElement('div');
      mrElement.className = 'mr-card';
      mrElement.dataset.mrId = mr.iid.toString();
      mrElement.dataset.projectId = mr.project_id.toString();
      
      // Format date for better readability
      const createdDate = new Date(mr.created_at);
      const updatedDate = new Date(mr.updated_at);
      const dateFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      
      // Determine role badge text and class
      let roleBadge = '';
      if (mr.userRole === 'reviewer') {
        roleBadge = '<span class="role-badge reviewer">Reviewer</span>';
      } else if (mr.userRole === 'assignee') {
        roleBadge = '<span class="role-badge assignee">Assignee</span>';
      } else if (mr.userRole === 'both') {
        roleBadge = '<span class="role-badge both">Reviewer & Assignee</span>';
      }
      
      mrElement.innerHTML = `
        <div class="mr-header">
          <h3>${mr.title}</h3>
          ${roleBadge}
        </div>
        <div class="mr-meta">
          <p class="project-id">Project: ${mr.project_id}</p>
          <p class="author">Author: ${mr.author.name}</p>
        </div>
        <div class="mr-details">
          <p class="created">Created: ${createdDate.toLocaleString(undefined, dateFormatOptions)}</p>
          <p class="updated">Updated: ${updatedDate.toLocaleString(undefined, dateFormatOptions)}</p>
        </div>
        <div class="branches">
          <span>${mr.source_branch} → ${mr.target_branch}</span>
        </div>
        <div class="mr-url">
          <a href="${mr.web_url}" class="external-link">View in GitLab</a>
        </div>
      `;
      
      // Add click handler to load files
      mrElement.addEventListener('click', async (event) => {
        if (event.target.classList.contains('external-link')) {
          return;
        }
        
        document.querySelectorAll('.mr-card').forEach(el => {
          el.classList.remove('selected');
        });
        
        mrElement.classList.add('selected');
        
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

// GitHub authorization functions
async function checkGitHubAuthStatus() {
  try {
    const authStatus = await window.api.githubCheckAuth();
    
    if (authStatus.authorized) {
      githubAuthStatus.textContent = 'Authorized';
      githubAuthStatus.classList.add('authorized');
      githubAuthBtn.textContent = 'Reauthorize GitHub';
      
      if (authStatus.expiresAt) {
        const expiresDate = new Date(authStatus.expiresAt);
        const formatter = new Intl.DateTimeFormat(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        githubAuthStatus.textContent += ` (expires: ${formatter.format(expiresDate)})`;
      }
    } else {
      githubAuthStatus.textContent = 'Not authorized';
      githubAuthStatus.classList.remove('authorized');
      githubAuthBtn.textContent = 'Authorize GitHub';
    }
  } catch (error) {
    console.error('Error checking GitHub auth status:', error);
    githubAuthStatus.textContent = 'Error checking authorization status';
  }
}

githubAuthBtn.addEventListener('click', async () => {
  try {
    githubDeviceFlow.classList.remove('hidden');
    authProgress.classList.add('hidden');
    
    const deviceCode = await window.api.githubStartAuth();
    
    verificationUrl.href = deviceCode.verification_uri;
    userCodeElement.textContent = deviceCode.user_code;
    
    authProgress.classList.remove('hidden');
    
    const result = await window.api.githubPollToken(deviceCode.device_code, deviceCode.interval);
    
    if (result.success) {
      await checkGitHubAuthStatus();
      githubDeviceFlow.classList.add('hidden');
      showMessage('GitHub authorization successful!');
    }
  } catch (error) {
    githubDeviceFlow.classList.add('hidden');
    showError('GitHub authorization failed: ' + (error.message || 'Unknown error'));
    console.error('GitHub auth error:', error);
  }
});

copyCodeBtn.addEventListener('click', () => {
  const code = userCodeElement.textContent;
  if (code) {
    window.api.copyToClipboard(code);
    showMessage('Code copied to clipboard!');
  }
});
