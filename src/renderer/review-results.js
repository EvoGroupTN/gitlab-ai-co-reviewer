// DOM Elements
const backButton = document.getElementById('back-btn');
const totalCommentsElement = document.getElementById('total-comments');
const errorCountElement = document.getElementById('error-count');
const warningCountElement = document.getElementById('warning-count');
const infoCountElement = document.getElementById('info-count');
const filesContainer = document.getElementById('files-container');

// Get the review comments from localStorage
let reviewComments = [];
try {
  const commentsData = localStorage.getItem('reviewComments');
  if (commentsData) {
    reviewComments = JSON.parse(commentsData);
  }
} catch (error) {
  console.error('Error loading review comments:', error);
}

// Handle back button click
backButton.addEventListener('click', () => {
  window.location.href = 'review.html';
});

// Initialize the results page
window.addEventListener('DOMContentLoaded', () => {
  renderReviewResults(reviewComments);
});

// Render the review results
function renderReviewResults(comments) {
  if (!comments || comments.length === 0) {
    filesContainer.innerHTML = '<p class="empty-state">No review comments found.</p>';
    updateCounters(0, 0, 0, 0);
    return;
  }
  
  // Sort comments by file path
  comments.sort((a, b) => a.filePath.localeCompare(b.filePath));
  
  // Group comments by file
  const fileGroups = {};
  comments.forEach(comment => {
    if (!fileGroups[comment.filePath]) {
      fileGroups[comment.filePath] = [];
    }
    fileGroups[comment.filePath].push(comment);
  });
  
  // Count severity types
  const errorCount = comments.filter(c => c.severity === 'error').length;
  const warningCount = comments.filter(c => c.severity === 'warning').length;
  const infoCount = comments.filter(c => c.severity === 'info').length;
  
  // Update counters
  updateCounters(comments.length, errorCount, warningCount, infoCount);
  
  // Clear container
  filesContainer.innerHTML = '';
  
  // Render each file group
  Object.entries(fileGroups).forEach(([filePath, fileComments]) => {
    // Sort comments by line number
    fileComments.sort((a, b) => a.lineNumber - b.lineNumber);
    
    // Create file group element
    const fileGroup = document.createElement('div');
    fileGroup.className = 'file-group';
    
    // Create file header
    const fileHeader = document.createElement('div');
    fileHeader.className = 'file-header';
    
    const filePathElement = document.createElement('div');
    filePathElement.className = 'file-path';
    filePathElement.textContent = filePath;
    
    const commentCount = document.createElement('div');
    commentCount.className = 'comment-count';
    commentCount.textContent = `${fileComments.length} comment${fileComments.length !== 1 ? 's' : ''}`;
    
    fileHeader.appendChild(filePathElement);
    fileHeader.appendChild(commentCount);
    fileGroup.appendChild(fileHeader);
    
    // Create comment list
    const commentList = document.createElement('ul');
    commentList.className = 'comment-list';
    
    // Add each comment
    fileComments.forEach(comment => {
      const commentItem = document.createElement('li');
      commentItem.className = 'comment-item';
      commentItem.dataset.filePath = comment.filePath;
      commentItem.dataset.lineNumber = comment.lineNumber;
      
      const header = document.createElement('div');
      header.className = 'comment-header';
      
      const severityBadge = document.createElement('span');
      severityBadge.className = `comment-severity ${comment.severity}`;
      severityBadge.textContent = comment.severity;
      
      const lineNumber = document.createElement('span');
      lineNumber.className = 'comment-line';
      lineNumber.textContent = `Line ${comment.lineNumber}`;
      
      header.appendChild(severityBadge);
      header.appendChild(lineNumber);
      
      const commentText = document.createElement('div');
      commentText.className = 'comment-text';
      commentText.textContent = comment.comment;
      
      commentItem.appendChild(header);
      commentItem.appendChild(commentText);
      
      // Make comment selectable
      commentItem.addEventListener('click', () => {
        // Toggle selected state
        commentItem.classList.toggle('selected');
      });
      
      commentList.appendChild(commentItem);
    });
    
    fileGroup.appendChild(commentList);
    filesContainer.appendChild(fileGroup);
  });
}

// Update the counter elements
function updateCounters(total, errors, warnings, infos) {
  totalCommentsElement.textContent = total.toString();
  errorCountElement.textContent = errors.toString();
  warningCountElement.textContent = warnings.toString();
  infoCountElement.textContent = infos.toString();
}