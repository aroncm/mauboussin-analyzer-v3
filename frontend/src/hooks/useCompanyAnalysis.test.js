import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCompanyAnalysis } from './useCompanyAnalysis';

// Mock fetch
global.fetch = vi.fn();

describe('useCompanyAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useCompanyAnalysis());

    expect(result.current.companyInput).toBe('');
    expect(result.current.backendConnected).toBe(false);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.loadingStep).toBe('');
    expect(result.current.analysis).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('checks backend connection on mount', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useCompanyAnalysis());

    await waitFor(() => {
      expect(result.current.backendConnected).toBe(true);
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/health'));
  });

  it('handles backend connection failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Connection failed'));

    const { result } = renderHook(() => useCompanyAnalysis());

    await waitFor(() => {
      expect(result.current.backendConnected).toBe(false);
    });
  });

  it('sets error when company input is empty', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true }); // health check

    const { result } = renderHook(() => useCompanyAnalysis());

    await waitFor(() => {
      expect(result.current.backendConnected).toBe(true);
    });

    act(() => {
      result.current.analyzeCompany();
    });

    expect(result.current.error).toBe('Please enter a company name or ticker symbol');
  });

  it('sets error when backend not connected', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Connection failed')); // health check fails

    const { result } = renderHook(() => useCompanyAnalysis());

    await waitFor(() => {
      expect(result.current.backendConnected).toBe(false);
    });

    act(() => {
      result.current.setCompanyInput('AAPL');
      result.current.analyzeCompany();
    });

    expect(result.current.error).toBe('Backend server not connected. Please check your connection.');
  });

  it('successfully analyzes a company with ticker symbol', async () => {
    // Mock health check
    global.fetch.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useCompanyAnalysis());

    await waitFor(() => {
      expect(result.current.backendConnected).toBe(true);
    });

    // Mock API responses
    const mockProfile = [{ Name: 'Apple Inc.', Industry: 'Technology', Currency: 'USD' }];
    const mockIncome = [{ fiscalDateEnding: '2024-09-30', totalRevenue: 385706000000, ebit: 123456000000, grossProfit: 200000000000, operatingIncome: 120000000000, netIncome: 100000000000, incomeTaxExpense: 15000000000, incomeBeforeTax: 115000000000 }];
    const mockBalance = [{ totalAssets: 365725000000, totalShareholderEquity: 90488000000, totalCurrentAssets: 135405000000, totalCurrentLiabilities: 145308000000, propertyPlantEquipment: 40000000000, goodwill: 0, intangibleAssets: 0 }];
    const mockCashFlow = [{ operatingCashflow: 118254000000, capitalExpenditures: -10959000000 }];
    const mockYahoo = { marketCap: 3500000000000, beta: 1.25, trailingPE: 35.2 };
    const mockEarnings = { quarterlyEarnings: [], annualEarnings: [] };
    const mockAnalysis = { analysis: JSON.stringify({ companyName: 'Apple Inc.', ticker: 'AAPL', roicAnalysis: {} }) };

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockProfile })     // profile
      .mockResolvedValueOnce({ ok: true, json: async () => mockIncome })      // income
      .mockResolvedValueOnce({ ok: true, json: async () => mockBalance })     // balance
      .mockResolvedValueOnce({ ok: true, json: async () => mockCashFlow })    // cashflow
      .mockResolvedValueOnce({ ok: true, json: async () => mockYahoo })       // yahoo
      .mockResolvedValueOnce({ ok: true, json: async () => mockEarnings })    // earnings
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalysis });   // analyze

    act(() => {
      result.current.setCompanyInput('AAPL');
    });

    let analyzePromise;
    act(() => {
      analyzePromise = result.current.analyzeCompany();
    });

    // Fast-forward timers for retries
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.isAnalyzing).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.analysis).toBeTruthy();
    expect(result.current.analysis.companyName).toBe('Apple Inc.');
    expect(result.current.error).toBe(null);
  });

  it('searches for company name and converts to ticker', async () => {
    // Mock health check
    global.fetch.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useCompanyAnalysis());

    await waitFor(() => {
      expect(result.current.backendConnected).toBe(true);
    });

    // Mock search response
    const mockSearchResults = [{ symbol: 'AAPL', name: 'Apple Inc.' }];
    const mockProfile = [{ Name: 'Apple Inc.', Industry: 'Technology', Currency: 'USD' }];
    const mockIncome = [{ fiscalDateEnding: '2024-09-30', totalRevenue: 385706000000, ebit: 123456000000, grossProfit: 200000000000, operatingIncome: 120000000000, netIncome: 100000000000, incomeTaxExpense: 15000000000, incomeBeforeTax: 115000000000 }];
    const mockBalance = [{ totalAssets: 365725000000, totalShareholderEquity: 90488000000, totalCurrentAssets: 135405000000, totalCurrentLiabilities: 145308000000, propertyPlantEquipment: 40000000000, goodwill: 0, intangibleAssets: 0 }];
    const mockCashFlow = [{ operatingCashflow: 118254000000, capitalExpenditures: -10959000000 }];
    const mockYahoo = { marketCap: 3500000000000 };
    const mockEarnings = { quarterlyEarnings: [] };
    const mockAnalysis = { analysis: JSON.stringify({ companyName: 'Apple Inc.', ticker: 'AAPL' }) };

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockSearchResults }) // search
      .mockResolvedValueOnce({ ok: true, json: async () => mockProfile })
      .mockResolvedValueOnce({ ok: true, json: async () => mockIncome })
      .mockResolvedValueOnce({ ok: true, json: async () => mockBalance })
      .mockResolvedValueOnce({ ok: true, json: async () => mockCashFlow })
      .mockResolvedValueOnce({ ok: true, json: async () => mockYahoo })
      .mockResolvedValueOnce({ ok: true, json: async () => mockEarnings })
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalysis });

    act(() => {
      result.current.setCompanyInput('Apple');
    });

    act(() => {
      result.current.analyzeCompany();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.isAnalyzing).toBe(false);
    }, { timeout: 5000 });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/av/search?query=Apple'),
      expect.any(Object)
    );
  });

  it('handles API errors gracefully', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true }); // health check

    const { result } = renderHook(() => useCompanyAnalysis());

    await waitFor(() => {
      expect(result.current.backendConnected).toBe(true);
    });

    // Mock failed profile fetch
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500 }); // profile fails

    act(() => {
      result.current.setCompanyInput('INVALID');
    });

    act(() => {
      result.current.analyzeCompany();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.isAnalyzing).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.analysis).toBe(null);
  });

  it('handles JSON parsing errors in analysis', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true }); // health check

    const { result } = renderHook(() => useCompanyAnalysis());

    await waitFor(() => {
      expect(result.current.backendConnected).toBe(true);
    });

    const mockProfile = [{ Name: 'Test Company' }];
    const mockIncome = [{ fiscalDateEnding: '2024-09-30', totalRevenue: 1000000 }];
    const mockBalance = [{ totalAssets: 1000000 }];
    const mockCashFlow = [{ operatingCashflow: 100000 }];
    const mockYahoo = { marketCap: 1000000 };
    const mockEarnings = { quarterlyEarnings: [] };
    const mockAnalysis = { analysis: 'Invalid JSON{' }; // Malformed JSON

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockProfile })
      .mockResolvedValueOnce({ ok: true, json: async () => mockIncome })
      .mockResolvedValueOnce({ ok: true, json: async () => mockBalance })
      .mockResolvedValueOnce({ ok: true, json: async () => mockCashFlow })
      .mockResolvedValueOnce({ ok: true, json: async () => mockYahoo })
      .mockResolvedValueOnce({ ok: true, json: async () => mockEarnings })
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalysis });

    act(() => {
      result.current.setCompanyInput('TEST');
    });

    act(() => {
      result.current.analyzeCompany();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.isAnalyzing).toBe(false);
    });

    expect(result.current.error).toBe('Could not parse analysis results. Please try again.');
  });
});
