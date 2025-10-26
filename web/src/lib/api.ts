import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000
});

// Add response interceptor for rate limiting
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 1;
      console.warn(`Rate limited! Retry after ${retryAfter}s`);
    }
    return Promise.reject(error);
  }
);

export interface Customer {
  id: string;
  name: string;
  email: string;
}

export interface Transaction {
  id: string;
  merchant: string;
  amount_cents: number;
  ts: string;
  mcc: string;
  card: { last4: string; network: string };
}

// API methods
export const getCustomerProfile = (id: string) =>
  api.get<Customer>(`/api/customer/${id}/profile`);

export const getTransactions = (id: string, cursor?: string, limit = 20) =>
  api.get<{ items: Transaction[]; nextCursor: string | null; hasMore: boolean }>(
    `/api/customer/${id}/transactions`,
    { params: { cursor, limit } }
  );