import axios, { AxiosInstance } from 'axios';
import { Logger } from './logger';

// Define interfaces for GitLab API responses
export interface MergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  source_branch: string;
  target_branch: string;
  web_url: string;
  author: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
  assignees?: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  }[];
  reviewers?: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  }[];
  userRole?: 'reviewer' | 'assignee' | 'both'; // Custom field we'll add
}

export interface ChangedFile {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

export interface MergeRequestChanges {
  changes: ChangedFile[];
}

export class GitLabService {
  private api: AxiosInstance;

  private logger = Logger.getInstance();

  constructor(baseURL: string, private token: string) {
    this.logger.info(`Initializing GitLab service with base URL: ${baseURL}`);
    this.api = axios.create({
      baseURL: `${baseURL}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get all merge requests where the current user is a reviewer
   */
  async getAssignedMergeRequests(): Promise<MergeRequest[]> {
    try {
      // First, get the current user ID
      const userResponse = await this.api.get('/user');
      
      if (!userResponse.data || !userResponse.data.id) {
        throw new Error('Failed to get user information. Please check your GitLab token.');
      }
      
      const userId = userResponse.data.id;

      // Get all merge requests where the user is a reviewer (paginated)
      let reviewerMRs: MergeRequest[] = [];
      let page = 1;
      const perPage = 100;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const response = await this.api.get('/merge_requests', {
          params: {
            reviewer_id: userId,
            state: 'opened',
            scope: 'all',
            order_by: 'updated_at',
            sort: 'desc',
            page,
            per_page: perPage
          }
        });
        
        const mergeRequests = response.data as MergeRequest[];
        
        // Add role to each merge request
        mergeRequests.forEach(mr => {
          mr.userRole = 'reviewer';
        });
        
        reviewerMRs = [...reviewerMRs, ...mergeRequests];
        
        // Check if we've reached the last page
        if (mergeRequests.length < perPage) {
          hasMorePages = false;
        } else {
          page++;
        }
      }
      
      // Also get merge requests where the user is assigned
      let assigneeMRs: MergeRequest[] = [];
      page = 1;
      hasMorePages = true;
      
      while (hasMorePages) {
        const response = await this.api.get('/merge_requests', {
          params: {
            assignee_id: userId,
            state: 'opened',
            scope: 'assigned_to_me',
            order_by: 'updated_at',
            sort: 'desc',
            page,
            per_page: perPage
          }
        });
        
        const mergeRequests = response.data as MergeRequest[];
        
        // Add role to each merge request
        mergeRequests.forEach(mr => {
          mr.userRole = 'assignee';
        });
        
        assigneeMRs = [...assigneeMRs, ...mergeRequests];
        
        // Check if we've reached the last page
        if (mergeRequests.length < perPage) {
          hasMorePages = false;
        } else {
          page++;
        }
      }
      
      // Combine lists and mark duplicate MRs as having both roles
      let allMergeRequests: MergeRequest[] = [];
      
      // First add all reviewer MRs
      allMergeRequests = [...reviewerMRs];
      
      // Then add assignee MRs, updating role to 'both' if already exists
      assigneeMRs.forEach(mr => {
        const existingIndex = allMergeRequests.findIndex(existing => existing.id === mr.id);
        if (existingIndex >= 0) {
          allMergeRequests[existingIndex].userRole = 'both';
        } else {
          allMergeRequests.push(mr);
        }
      });
      
      // Sort by updated_at (newest first)
      allMergeRequests.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      
      return allMergeRequests;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid or expired GitLab token. Please update your token in Settings.');
        }
        const errorMessage = error.response?.data?.message || error.message;
        throw new Error(`Failed to fetch merge requests: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * Get changes for a specific merge request
   */
  async getMergeRequestChanges(projectId: number, mergeRequestIid: number): Promise<{ changes: ChangedFile[], headSha: string, baseSha: string }> {
    try {
      // Get merge request changes
      const response = await this.api.get(`/projects/${projectId}/merge_requests/${mergeRequestIid}/changes`);
      
      // Get additional merge request details to get commit SHAs
      const mrResponse = await this.api.get(`/projects/${projectId}/merge_requests/${mergeRequestIid}`);
      
      return {
        changes: response.data.changes,
        headSha: mrResponse.data.sha, // Head commit SHA
        baseSha: mrResponse.data.diff_refs.base_sha // Base commit SHA
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.message || error.message;
        throw new Error(`Failed to fetch merge request changes: ${errorMessage}`);
      }
      throw error;
    }
  }
  
  /**
   * Post comments to a merge request
   */
  async postMergeRequestComments(
    projectId: number, 
    mergeRequestIid: number, 
    comments: Array<{
      filePath: string;
      comment: string;
      lineNumber: number;
      diffType: 'NUL' | 'ADD' | 'DEL';
    }>
  ): Promise<boolean> {
    try {
      // Get merge request details to fetch the required SHAs
      const mrResponse = await this.api.get(`/projects/${projectId}/merge_requests/${mergeRequestIid}`);
      const headSha = mrResponse.data.sha;
      const diffRefs = mrResponse.data.diff_refs;
      const baseSha = diffRefs.base_sha;
      const startSha = diffRefs.start_sha;
      
      // Post each comment individually
      for (const comment of comments) {
        let newLine = null;
        let oldLine = null;
        const newPath = comment.filePath;
        const oldPath = comment.filePath;
        
        // Set line numbers based on diffType
        switch (comment.diffType) {
          case 'NUL': // Unchanged line - set both new and old
            newLine = comment.lineNumber;
            oldLine = comment.lineNumber;
            break;
          case 'ADD': // Added/modified line - set only new_line
            newLine = comment.lineNumber;
            break;
          case 'DEL': // Deleted line - set only old_line
            oldLine = comment.lineNumber;
            break;
        }
        
        // Using format directly from GitLab docs with mapped line numbers
        const requestData = {
          body: comment.comment,
          position: {
            position_type: 'text',
            base_sha: baseSha,
            head_sha: headSha,
            start_sha: startSha,
            new_path: newPath,
            new_line: newLine,
            old_path: oldPath,
            old_line: oldLine
          }
        };
        
        this.logger.debug(`Posting comment to GitLab API: 
URL: /projects/${projectId}/merge_requests/${mergeRequestIid}/discussions
Data: ${JSON.stringify(requestData, null, 2)}`);
        
        await this.api.post(`/projects/${projectId}/merge_requests/${mergeRequestIid}/discussions`, requestData);
        this.logger.debug(`Successfully posted comment to merge request ${mergeRequestIid}`);
      }
      
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error('GitLab API Error', error);
        const errorMessage = error.response?.data?.message || error.message;
        throw new Error(`Failed to post comments: ${errorMessage}`);
      }
      throw error;
    }
  }
}
