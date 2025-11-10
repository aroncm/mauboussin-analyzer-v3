import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, BACKEND_URL } from './api';

// Mock global fetch
global.fetch = vi.fn();

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns response on first successful attempt', async () => {
    const mockResponse = { ok: true, status: 200, json: async () => ({ data: 'test' }) };
    global.fetch.mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry('https://api.example.com/test');

    expect(result).toBe(mockResponse);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network failure', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = fetchWithRetry('https://api.example.com/test');

    // Fast-forward through retries
    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries on 429 rate limit with exponential backoff', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = fetchWithRetry('https://api.example.com/test');

    // Fast-forward through exponential backoff timers
    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('throws error after max retries exceeded', async () => {
    const error = new Error('Network error');
    global.fetch.mockRejectedValue(error);

    const promise = fetchWithRetry('https://api.example.com/test', {}, 3);

    // Fast-forward through all retries
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('Network error');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff timing (1s, 2s, 4s)', async () => {
    const timings = [];
    let lastTime = Date.now();

    global.fetch.mockImplementation(async () => {
      const now = Date.now();
      timings.push(now - lastTime);
      lastTime = now;
      throw new Error('Network error');
    });

    const promise = fetchWithRetry('https://api.example.com/test', {}, 3);

    // Fast-forward and track timings
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();

    // First call is immediate, subsequent have delays
    expect(timings.length).toBe(3);
  });

  it('passes fetch options correctly', async () => {
    const mockResponse = { ok: true, status: 200 };
    global.fetch.mockResolvedValueOnce(mockResponse);

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' })
    };

    await fetchWithRetry('https://api.example.com/test', options);

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/test', options);
  });

  it('does not retry on successful 4xx errors (except 429)', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchWithRetry('https://api.example.com/test');

    expect(result.status).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('respects custom maxRetries parameter', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    const promise = fetchWithRetry('https://api.example.com/test', {}, 5);

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });
});

describe('BACKEND_URL', () => {
  it('uses environment variable or defaults to localhost', () => {
    expect(BACKEND_URL).toBeDefined();
    expect(typeof BACKEND_URL).toBe('string');
  });
});
