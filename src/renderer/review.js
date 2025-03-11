// DOM Elements
const backButton = document.getElementById('back-btn');
const fileCount = document.getElementById('file-count');
const selectedFilesList = document.getElementById('selected-files-list');
const reviewOptions = document.querySelectorAll('.review-option');
const selectButtons = document.querySelectorAll('.select-btn');

// State
let selectedFiles = [];
let mergeRequest = null;
let selectedLevel = null;

// Load data from localStorage when page loads
window.addEventListener('DOMContentLoaded', () => {
  // Load selected files
  const filesData = localStorage.getItem('selectedFiles');
  if (filesData) {
    selectedFiles = JSON.parse(filesData);
    
    // Update file count
    fileCount.textContent = selectedFiles.length;
    
    // Display selected files
    displaySelectedFiles();
  }
  
  // Load merge request data
  const mrData = localStorage.getItem('currentMergeRequest');
  if (mrData) {
    mergeRequest = JSON.parse(mrData);
  }
});

// Handle back button click
backButton.addEventListener('click', () => {
  window.location.href = 'index.html';
});

// Handle review option click
reviewOptions.forEach(option => {
  option.addEventListener('click', () => {
    // Remove selected class from all options
    reviewOptions.forEach(opt => opt.classList.remove('selected'));
    
    // Add selected class to clicked option
    option.classList.add('selected');
    
    // Store selected level
    selectedLevel = option.dataset.level;
  });
});

// Handle select button click
selectButtons.forEach(button => {
  button.addEventListener('click', () => {
    const option = button.closest('.review-option');
    selectedLevel = option.dataset.level;
    
    // Remove selected class from all options
    reviewOptions.forEach(opt => opt.classList.remove('selected'));
    
    // Add selected class to clicked option
    option.classList.add('selected');
    
    // Here we would normally proceed with the review process
    // For now, just log the selection
    console.log(`Selected review level: ${selectedLevel}`);
    console.log(`Selected files: ${selectedFiles.length}`);
    
    // Store the selected level in localStorage for future use
    localStorage.setItem('reviewLevel', selectedLevel);
    
    // Show confirmation
    alert(`Review level set to ${selectedLevel}. The review will be implemented in the future.`);
  });
});

// Display selected files in the list
function displaySelectedFiles() {
  selectedFilesList.innerHTML = '';
  
  if (selectedFiles.length === 0) {
    selectedFilesList.innerHTML = '<p class="no-files">No files selected</p>';
    return;
  }
  
  // Group files by type
  const newFiles = selectedFiles.filter(file => file.new_file);
  const modifiedFiles = selectedFiles.filter(file => !file.new_file && !file.deleted_file);
  const deletedFiles = selectedFiles.filter(file => file.deleted_file);
  
  // Function to add file items
  const addFileItems = (files, className, icon) => {
    if (files.length === 0) return;
    
    files.forEach(file => {
      const fileElement = document.createElement('div');
      fileElement.className = `review-file ${className}`;
      
      const fileIcon = document.createElement('span');
      fileIcon.className = 'file-icon small';
      fileIcon.textContent = icon;
      
      const fileName = document.createElement('span');
      fileName.className = 'file-name';
      fileName.textContent = file.new_path || file.old_path;
      
      fileElement.appendChild(fileIcon);
      fileElement.appendChild(fileName);
      
      selectedFilesList.appendChild(fileElement);
    });
  };
  
  // Add files by type
  addFileItems(newFiles, 'new', '+');
  addFileItems(modifiedFiles, 'modified', '~');
  addFileItems(deletedFiles, 'deleted', '-');
}