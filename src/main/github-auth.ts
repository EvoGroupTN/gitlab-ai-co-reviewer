import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

// GitHub Device Flow response interfaces
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface StoredToken {
  token: string;
  issuedAt: Date;
  expiresAt: Date;
}

// Path for storing GitHub token
const getTokenPath = () => {
  return path.join(app.getPath('userData'), 'github-token.json');
};

// Get a device code from GitHub
export async function getDeviceCode(): Promise<DeviceCodeResponse> {
  try {
    const response = await axios.post('https://github.com/login/device/code', {
      client_id: '01ab8ac9400c4e429b23',
      scope: 'read:user'
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (response.status !== 200) {
      throw new Error(`Failed to get device code: ${response.statusText}`);
    }

    return response.data as DeviceCodeResponse;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to get device code: ${error.message}`);
    }
    throw error;
  }
}

// Poll for access token
export async function pollForToken(deviceCode: string, interval: number): Promise<string> {
  const pollInterval = interval * 1000; // Convert to milliseconds
  
  while (true) {
    // Wait for the specified interval before polling
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    try {
      const response = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: '01ab8ac9400c4e429b23',
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.status !== 200) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = response.data;
      
      // Check for error responses
      if (data.error) {
        if (data.error === 'authorization_pending') {
          // Still waiting for user to authorize - continue polling
          continue;
        } else if (data.error === 'slow_down') {
          // GitHub is asking us to slow down polling - increase interval and continue
          await new Promise(resolve => setTimeout(resolve, 5000)); // Additional delay
          continue;
        } else if (data.error === 'expired_token') {
          throw new Error('Device code has expired. Please restart the authorization process.');
        } else {
          throw new Error(`Authorization error: ${data.error_description || data.error}`);
        }
      }

      // If we got an access token, save it and return it
      if (data.access_token) {
        saveToken(data.access_token);
        return data.access_token;
      }
      
      // Unexpected response without error or token - wait and try again
      continue;
    } catch (error) {
      if (axios.isAxiosError(error) && error.message.includes('Device code has expired')) {
        throw error; // Propagate expiration error
      }
      // For other errors, wait and retry
      console.error('Error during token polling:', 
        error instanceof Error ? error.message : 'Unknown error');
      // Continue polling on error
    }
  }
}

// Save access token to file
export function saveToken(token: string): void {
  try {
    // We don't have explicit expiration for GitHub tokens
    // Assume a reasonable expiration time (7 days)
    const issuedAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(issuedAt.getDate() + 7);
    
    const tokenData: StoredToken = {
      token,
      issuedAt,
      expiresAt
    };
    
    fs.writeFileSync(getTokenPath(), JSON.stringify(tokenData, null, 2));
  } catch (error) {
    console.error('Error saving GitHub token:', 
      error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// Get access token from file if it exists
export function getToken(): { token: string; expiresAt: Date } | null {
  try {
    const tokenPath = getTokenPath();
    if (fs.existsSync(tokenPath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8')) as StoredToken;
      return {
        token: tokenData.token,
        expiresAt: new Date(tokenData.expiresAt)
      };
    }
    return null;
  } catch (error) {
    console.error('Error loading GitHub token:', 
      error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// Clear stored token
export function clearToken(): void {
  try {
    const tokenPath = getTokenPath();
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  } catch (error) {
    console.error('Error clearing GitHub token:', 
      error instanceof Error ? error.message : 'Unknown error');
  }
}