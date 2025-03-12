import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import * as GitHubAuth from './github-auth';
import { Logger } from './logger';

const logger = Logger.getInstance();

// Interfaces for Copilot API
interface ModelsList {
  data: Model[];
  object: string;
}

interface Model {
  capabilities: ModelCapabilities;
  id: string;
  model_picker_enabled: boolean;
  name: string;
  object: string;
  preview: boolean;
  vendor: string;
  version: string;
  policy?: ModelPolicy;
}

interface ModelCapabilities {
  family: string;
  limits: ModelLimits;
  object: string;
  supports: ModelSupports;
  tokenizer: string;
  type: string;
}

interface ModelLimits {
  max_context_window_tokens?: number;
  max_output_tokens?: number;
  max_prompt_tokens?: number;
  max_inputs?: number;
  vision?: VisionLimits;
}

interface VisionLimits {
  max_prompt_image_size: number;
  max_prompt_images: number;
  supported_media_types: string[];
}

interface ModelSupports {
  streaming?: boolean;
  tool_calls?: boolean;
  parallel_tool_calls?: boolean;
  vision?: boolean;
  dimensions?: boolean;
  structured_outputs?: boolean;
}

interface ModelPolicy {
  state: string;
  terms: string;
}

interface Message {
  role: 'system' | 'user';
  content: string;
}

interface CopilotRequest {
  intent: boolean;
  model: string;
  temperature: number;
  top_p: number;
  n: number;
  stream: boolean;
  messages: Message[];
}

interface CopilotResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface TokenResponse {
  token: string;
  expires_at: string;
}

interface StoredCopilotToken {
  token: string;
  issuedAt: Date;
  expiresAt: Date;
}

interface ReviewComment {
  filePath: string;
  lineNumber: number;
  comment: string;
  severity: 'info' | 'warning' | 'error';
  diffType: 'NUL' | 'ADD' | 'DEL';
}

// Path for storing Copilot token
const getCopilotTokenPath = () => {
  return path.join(app.getPath('userData'), 'copilot-token.json');
};

// Get stored Copilot token if it exists
function getCopilotToken(): { token: string; expiresAt: Date } | null {
  try {
    const tokenPath = getCopilotTokenPath();
    if (fs.existsSync(tokenPath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      return {
        token: tokenData.token,
        expiresAt: new Date(tokenData.expiresAt)
      };
    }
    return null;
  } catch (error) {
    logger.error('Error loading Copilot token:', error instanceof Error ? error : new Error('Unknown error'));
    return null;
  }
}

// Save Copilot token
function saveCopilotToken(token: string, expiresAt: string): void {
  try {
    const tokenData: StoredCopilotToken = {
      token,
      issuedAt: new Date(),
      expiresAt: new Date(expiresAt)
    };
    
    fs.writeFileSync(getCopilotTokenPath(), JSON.stringify(tokenData, null, 2));
  } catch (error) {
    logger.error('Error saving Copilot token:', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

// Clear stored Copilot token
export function clearCopilotToken(): void {
  try {
    const tokenPath = getCopilotTokenPath();
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  } catch (error) {
    logger.error('Error clearing Copilot token:', error instanceof Error ? error : new Error('Unknown error'));
  }
}

// Get Copilot token, refreshing if needed
async function getOrRefreshCopilotToken(githubToken?: string): Promise<string> {
  // Check if we have a stored token that's still valid
  const storedToken = getCopilotToken();
  if (storedToken && storedToken.expiresAt > new Date()) {
    return storedToken.token;
  }
  
  // No valid token in storage, need to fetch a new one
  // First, get GitHub token if not provided
  if (!githubToken) {
    const githubAuth = GitHubAuth.getToken();
    if (!githubAuth) {
      throw new Error('GitHub token not found. Please authorize with GitHub first.');
    }
    githubToken = githubAuth.token;
  }
  
  try {
    // Get a new Copilot token using the GitHub token
    const response = await axios.get('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'GithubCopilot/1.155.0',
        'Editor-Version': 'vscode/1.80.1',
        'Editor-Plugin-Version': 'copilot.vim/1.16.0'
      }
    });
    
    if (!response || response.status !== 200) {
      throw new Error(`Failed to get Copilot token: ${response?.statusText || 'Unknown error'}`);
    }
    
    const data = response.data as TokenResponse;
    
    // Store the token with expiration
    saveCopilotToken(data.token, data.expires_at);
    
    return data.token;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      // Check for auth-related errors (401, 403)
      if (status === 401 || status === 403) {
        // Clear token from storage on auth failure
        clearCopilotToken();
        throw new Error('GitHub access token expired or invalid');
      } else if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (status >= 500) {
        throw new Error('GitHub service is currently unavailable. Please try again later.');
      } else {
        throw new Error('Unable to authenticate with GitHub Copilot.');
      }
    }
    throw error;
  }
}

export async function getAvailableModels(
  githubToken?: string
): Promise<string[]> {
  try {
    // Get Copilot token
    const copilotToken = await getOrRefreshCopilotToken(githubToken);

    // Call Copilot API to get available models
    const response = await axios.get('https://api.githubcopilot.com/models', {
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Editor-Version': 'vscode/1.80.1',
        'Content-Type': 'application/json'
      }
    });

    if (!response || response.status !== 200) {
      throw new Error(`Copilot API error: ${response?.statusText || 'Unknown error'}`);
    }

    const data = response.data as ModelsList;
    return data.data.filter(model => model.model_picker_enabled === true).map(model => model.id);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        clearCopilotToken();
        throw new Error('Copilot token expired or invalid');
      }
    }
    throw error;
  }
}


// Generate review comments for code using Copilot
export async function reviewCode(
  files: Array<{ 
    path: string;
    diff: string;
    isNew?: boolean;
    isDeleted?: boolean;
  }>, 
  reviewLevel: 'light' | 'medium' | 'expert',
  githubToken?: string
): Promise<ReviewComment[]> {
  try {
    // Get Copilot token
    const copilotToken = await getOrRefreshCopilotToken(githubToken);
    
    // Create messages based on review level
    const messages: Message[] = [];
    
    // Get config for language preference
    const config = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
    const language = config.reviewLanguage || 'english';
    const copilotModel = config.copilotModel || 'claude-3.5-sonnet';

    // Add system message with language preference
    messages.push({
      role: 'system',
      content: getSystemPrompt(reviewLevel, language)
    });
    
    // Add files content message
    messages.push({
      role: 'user',
      content: getFilesContent(files)
    });
    
    // Prepare Copilot API request
    const request: CopilotRequest = {
      intent: false,
      model: copilotModel,
      temperature: 0.1,
      top_p: 1,
      n: 1,
      stream: false,
      messages
    };
    
    // Call Copilot API
    const response = await axios.post('https://api.githubcopilot.com/chat/completions', request, {
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Editor-Version': 'vscode/1.80.1',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response || response.status !== 200) {
      throw new Error(`Copilot API error: ${response?.statusText || 'Unknown error'}`);
    }
    
    const data = response.data as CopilotResponse;
    const content = data.choices[0]?.message.content;
    
    if (!content) {
      throw new Error('Copilot returned an empty response');
    }
    
    // Log the full response
    logger.debug('Copilot API response:\n' + JSON.stringify(data, null, 2));
    
    // Parse comments from the response
    const comments = parseReviewComments(content, files);
    
    return comments;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        clearCopilotToken();
        throw new Error('Copilot token expired or invalid');
      }
    }
    throw error;
  }
}

// Helper function to create system prompt based on review level
function getSystemPrompt(reviewLevel: 'light' | 'medium' | 'expert', language: string): string {
  let basePrompt = `You are an expert code reviewer specializing in identifying issues in code changes. Review the following diffs and provide specific, actionable feedback.

Your task:
1. Analyze the diff of each file
2. Identify issues, bugs, and improvements
3. For each issue, specify the exact file path and line number where the issue occurs
4. Categorize each issue as "error" (bugs, security issues), "warning" (code smells, maintainability issues), or "info" (style, best practices)

Format your response as a JSON array of objects, providing review comments in ${language === 'french' ? 'French' : 'English'} language, with the following structure:
[
  {
    "filePath": "path/to/file.ext",
    "comment": "Detailed explanation of the issue and how to fix it",
    "severity": "error|warning|info",
    "lineNumber": 42,    // The real line number in the file
    "diffType": "ADD"    // Use "ADD" for added/modified lines, "DEL" for deleted lines, "NUL" for unchanged lines
  },
  ...
]

For each comment:
- If it's on a newly added or modified line (line that starts with '+' in the diff), set diffType to "ADD"
- If it's on an unmodified/existing line (line without '+' or '-' prefix in the diff), set diffType to "NUL"
- If it's on a deleted line (line that starts with '-' in the diff), set diffType to "DEL"

IMPORTANT: Always include the actual line number from the real file in the lineNumber field, not the diff line number.`;

  // Add level-specific instructions
  switch (reviewLevel) {
    case 'light':
      basePrompt += `\n\nThis is a LIGHT review. Focus only on:
- Syntax errors and basic bugs
- Variable naming issues
- Obvious performance issues
- Simple style issues`;
      break;
    case 'medium':
      basePrompt += `\n\nThis is a MEDIUM review. Focus on:
- Bugs and logic errors
- Error handling
- Edge cases
- Code organization
- Performance issues
- API usage problems
- Style and consistency issues`;
      break;
    case 'expert':
      basePrompt += `\n\nThis is an EXPERT review. Perform a comprehensive analysis including:
- All bugs and logic errors
- Security vulnerabilities
- Performance optimizations
- Concurrency issues
- Memory leaks
- Error handling and edge cases
- Architecture and design issues
- Code maintainability
- Testing gaps
- Documentation needs`;
      break;
  }
  
  return basePrompt;
}

// Helper function to format file content for Copilot
function getFilesContent(files: Array<{ path: string; diff: string; isNew?: boolean; isDeleted?: boolean; }>): string {
  let content = 'Please review the following file diffs:\n\n';
  
  files.forEach((file, index) => {
    content += `FILE ${index + 1}: ${file.path}\n`;
    
    if (file.isNew) {
      content += '(New file)\n';
    } else if (file.isDeleted) {
      content += '(Deleted file)\n';
    }
    
    content += '```diff\n';
    content += file.diff;
    content += '\n```\n\n';
  });
  
  return content;
}

// Helper function to parse review comments from Copilot's response
function parseReviewComments(
  content: string, 
  files: Array<{ path: string; diff: string }>
): ReviewComment[] {
  try {
    // Try to extract JSON array from the response
    const jsonMatch = content.match(/\[\s*\{.*\}\s*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ReviewComment[];
    }
    
    // If no JSON array found, return an empty array
    logger.warn('Could not parse Copilot response as JSON array. Raw response: ' + content);
    return [];
  } catch (error) {
    logger.error('Error parsing Copilot review comments:', error instanceof Error ? error : new Error('Unknown error'));
    return [];
  }
}
