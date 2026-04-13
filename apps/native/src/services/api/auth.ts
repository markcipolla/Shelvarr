import axios from 'axios';
import { encode as btoa } from 'base-64';
import { AuthCredentials } from '../../types/komga';

export async function validateCredentials(creds: AuthCredentials): Promise<boolean> {
  const url = creds.serverUrl.replace(/\/+$/, '');

  try {
    const headers: Record<string, string> = {};

    if (creds.authType === 'basic' && creds.username && creds.password) {
      headers['Authorization'] = `Basic ${btoa(`${creds.username}:${creds.password}`)}`;
    } else if (creds.authType === 'apikey' && creds.apiKey) {
      headers['X-API-Key'] = creds.apiKey;
    }

    const fullUrl = `${url}/api/v1/libraries`;
    console.log('Validating credentials:', fullUrl);
    await axios.get(fullUrl, { headers, timeout: 10000 });
    return true;
  } catch (err: any) {
    console.error('Auth validation failed:', err.message, err.response?.status, err.config?.url);
    return false;
  }
}
