// DOM Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const modalClose = document.querySelector('.close');
const settingsForm = document.getElementById('settings-form');
const gitlabUrlInput = document.getElementById('gitlab-url');
const gitlabTokenInput = document.getElementById('gitlab-token');
const refreshBtn = document.getElementById('refresh-btn');
const mergeRequestsContainer = document.getElementById('merge-requests');
const fileListContainer = document.getElementById('file-list');
const selectedFilesContainer = document.getElementById('selected-files');

// State
let currentMergeRequest = null;
let selectedFiles = [];

// Load config when app starts
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load configuration
    const config = await window.api.getConfig();
    gitlabUrlInput.value = config.gitlabUrl;
    gitlabTokenInput.value = config.gitlabToken;
    
    // If we have a token, load MRs
    if (config.gitlabToken) {
      // Don't automatically load MRs on startup to avoid 401 errors
      // await loadMergeRequests();
      mergeRequestsContainer.innerHTML = '<div class="info">Click Refresh to load your merge requests</div>';
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
  try {
    await loadMergeRequests();
  } catch (error) {
    // If we get an auth error, show the settings modal
    if (error.message && error.message.includes('token')) {
      showError('Authentication failed. Please update your GitLab token.');
      settingsModal.style.display = 'block';
    } else {
      showError('Failed to load merge requests: ' + error.message);
    }
  }
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
        // Don't trigger if clicking on the GitLab link
        if (event.target.classList.contains('external-link')) {
          return;
        }
        
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
    
    // Group files by status (new, modified, deleted)
    const newFiles = [];
    const modifiedFiles = [];
    const deletedFiles = [];
    
    files.forEach(file => {
      if (file.new_file) {
        newFiles.push(file);
      } else if (file.deleted_file) {
        deletedFiles.push(file);
      } else {
        modifiedFiles.push(file);
      }
    });
    
    // Function to create a file section
    const createFileSection = (title, files, className) => {
      if (files.length === 0) return;
      
      const sectionElement = document.createElement('div');
      sectionElement.className = 'file-section';
      
      const titleElement = document.createElement('div');
      titleElement.className = 'file-section-title';
      titleElement.textContent = `${title} (${files.length})`;
      sectionElement.appendChild(titleElement);
      
      files.forEach(file => {
        const fileElement = document.createElement('div');
        fileElement.className = `file-item ${className}`;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        checkbox.id = `file-${file.new_path || file.old_path}`;
        checkbox.dataset.path = file.new_path || file.old_path;
        
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
          updateSelectAllCheckbox();
        });
        
        fileElement.appendChild(checkbox);
        fileElement.appendChild(label);
        sectionElement.appendChild(fileElement);
      });
      
      fileListContainer.appendChild(sectionElement);
    };
    
    // Create sections for each file type
    createFileSection('Added', newFiles, 'new');
    createFileSection('Modified', modifiedFiles, 'modified');
    createFileSection('Deleted', deletedFiles, 'deleted');
    
    // Handle select all functionality
    selectAllCheckbox.addEventListener('change', () => {
      const fileCheckboxes = document.querySelectorAll('.file-checkbox');
      
      fileCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
        
        // Get the file path
        const filePath = checkbox.dataset.path;
        
        // Find the corresponding file
        const file = files.find(f => (f.new_path || f.old_path) === filePath);
        
        if (file) {
          if (selectAllCheckbox.checked) {
            // Add to selected files if not already there
            if (!selectedFiles.some(f => (f.new_path || f.old_path) === filePath)) {
              selectedFiles.push(file);
            }
          } else {
            // Remove from selected files
            selectedFiles = selectedFiles.filter(f => 
              (f.new_path || f.old_path) !== filePath
            );
          }
        }
      });
      
      updateSelectedFiles();
    });
    
    // Function to update the select all checkbox state
    function updateSelectAllCheckbox() {
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
    
  } catch (error) {
    fileListContainer.innerHTML = '<div class="error">Failed to load files</div>';
    console.error(error);
  }
}

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
    // Uncheck all checkboxes
    document.querySelectorAll('.file-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });
    
    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('select-all-files');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    
    // Clear selected files
    selectedFiles = [];
    updateSelectedFiles();
  });
  
  headerElement.appendChild(heading);
  headerElement.appendChild(countElement);
  headerElement.appendChild(clearButton);
  selectedFilesContainer.appendChild(headerElement);
  
  // Group files by type
  const newFiles = selectedFiles.filter(file => file.new_file);
  const modifiedFiles = selectedFiles.filter(file => !file.new_file && !file.deleted_file);
  const deletedFiles = selectedFiles.filter(file => file.deleted_file);
  
  // Create a file list element
  const fileListElement = document.createElement('div');
  fileListElement.className = 'selected-files-list';
  
  // Helper function to create file type sections
  const createTypeSection = (files, className, icon) => {
    if (files.length === 0) return;
    
    files.forEach(file => {
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
        // Remove from selected files
        selectedFiles = selectedFiles.filter(f => 
          (f.new_path || f.old_path) !== (file.new_path || file.old_path)
        );
        
        // Uncheck the corresponding checkbox
        const checkbox = document.querySelector(`#file-${file.new_path || file.old_path}`);
        if (checkbox) {
          checkbox.checked = false;
        }
        
        // Update select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-files');
        if (selectAllCheckbox) {
          const fileCheckboxes = document.querySelectorAll('.file-checkbox');
          const checkedCount = document.querySelectorAll('.file-checkbox:checked').length;
          
          selectAllCheckbox.checked = checkedCount === fileCheckboxes.length;
          selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < fileCheckboxes.length;
        }
        
        updateSelectedFiles();
      });
      
      fileElement.appendChild(iconElement);
      fileElement.appendChild(pathElement);
      fileElement.appendChild(removeButton);
      fileListElement.appendChild(fileElement);
    });
  };
  
  // Create sections for each file type
  createTypeSection(newFiles, 'new', '+');
  createTypeSection(modifiedFiles, 'modified', '~');
  createTypeSection(deletedFiles, 'deleted', '-');
  
  selectedFilesContainer.appendChild(fileListElement);
  
  // Add Review button
  const reviewButtonContainer = document.createElement('div');
  reviewButtonContainer.className = 'review-button-container';
  
  const reviewButton = document.createElement('button');
  reviewButton.className = 'review-btn';
  reviewButton.textContent = 'Review Selected Files';
  reviewButton.addEventListener('click', () => {
    // Save selected files data to localStorage
    localStorage.setItem('selectedFiles', JSON.stringify(selectedFiles));
    
    // Save current merge request info if available
    if (currentMergeRequest) {
      localStorage.setItem('currentMergeRequest', JSON.stringify(currentMergeRequest));
    }
    
    // Navigate to review page
    window.location.href = 'review.html';
  });
  
  // Disable button if no files selected
  if (selectedFiles.length === 0) {
    reviewButton.disabled = true;
  }
  
  reviewButtonContainer.appendChild(reviewButton);
  selectedFilesContainer.appendChild(reviewButtonContainer);
}

// Helper function to show errors
function showError(message) {
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.textContent = message;
  
  document.body.appendChild(errorElement);
  
  setTimeout(() => {
    errorElement.remove();
  }, 3000);
}