import axios, { AxiosInstance } from 'axios';
import Constants from 'expo-constants';

const AVERO_API_URL =
  (Constants.expoConfig?.extra?.averoApiUrl as string | undefined) ??
  process.env.AVERO_API_URL ??
  'https://api.averoai.com';

export const client: AxiosInstance = axios.create({
  baseURL: AVERO_API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function setAuthToken(token: string | null): void {
  if (token) {
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete client.defaults.headers.common['Authorization'];
  }
}

export { AVERO_API_URL };
