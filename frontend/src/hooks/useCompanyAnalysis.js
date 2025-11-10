import { useState, useEffect } from 'react';
import { fetchWithRetry, BACKEND_URL } from '../utils/api';
import { parseFinancialNumber } from '../utils/formatters';

export const useCompanyAnalysis = () => {
  const [companyInput, setCompanyInput] = useState('');
  const [backendConnected, setBackendConnected] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  // Check backend connection on mount
  useEffect(() => {
    checkBackendConnection();
  }, []);

  const checkBackendConnection = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      setBackendConnected(response.ok);
    } catch (err) {
      setBackendConnected(false);
    }
  };

  const analyzeCompany = async () => {
    if (!companyInput.trim()) {
      setError('Please enter a company name or ticker symbol');
      return;
    }

    if (!backendConnected) {
      setError('Backend server not connected. Please check your connection.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      // Step 1: Get company ticker
      setLoadingStep('🔍 Looking up company ticker...');
      let ticker = companyInput.trim().toUpperCase();

      if (companyInput.includes(' ') || companyInput !== companyInput.toUpperCase()) {
        try {
          const searchResponse = await fetchWithRetry(
            `${BACKEND_URL}/api/av/search?query=${encodeURIComponent(companyInput)}`
          );

          if (!searchResponse.ok) {
            throw new Error('Failed to search for company. Please try again.');
          }

          const searchData = await searchResponse.json();

          if (searchData && searchData.length > 0) {
            ticker = searchData[0].symbol;
            setLoadingStep(`✓ Found ticker: ${ticker}`);
          } else {
            throw new Error('Company not found. Try using the ticker symbol directly (e.g., AAPL)');
          }
        } catch (searchErr) {
          console.error('Search error:', searchErr);
        }
      }

      // Step 2-6: Fetch all financial data in parallel
      setLoadingStep(`📊 Fetching financial data for ${ticker}...`);

      const [profileResponse, incomeResponse, balanceResponse, cashFlowResponse, yahooResponse, earningsResponse] = await Promise.all([
        fetchWithRetry(`${BACKEND_URL}/api/av/overview/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/av/income-statement/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/av/balance-sheet/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/av/cash-flow/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/yf/quote/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/earnings-transcript/${ticker}`)
      ]);

      // Validate required responses
      if (!profileResponse.ok) throw new Error('Failed to fetch company profile.');
      if (!incomeResponse.ok) throw new Error('Failed to fetch income statement');
      if (!balanceResponse.ok) throw new Error('Failed to fetch balance sheet');
      if (!cashFlowResponse.ok) throw new Error('Failed to fetch cash flow statement');

      // Yahoo and earnings are optional
      const yahooOk = yahooResponse.ok;
      const earningsOk = earningsResponse.ok;

      // Parse all data
      const [profileData, incomeData, balanceData, cashFlowData, yahooData, earningsData] = await Promise.all([
        profileResponse.json(),
        incomeResponse.json(),
        balanceResponse.json(),
        cashFlowResponse.json(),
        yahooOk ? yahooResponse.json() : Promise.resolve(null),
        earningsOk ? earningsResponse.json() : Promise.resolve(null)
      ]);

      // Validate data
      if (!profileData || profileData.length === 0) {
        throw new Error(`No data found for ticker: ${ticker}`);
      }
      if (!incomeData || incomeData.length === 0) {
        throw new Error('No income statement data available');
      }
      if (!balanceData || balanceData.length === 0) {
        throw new Error('No balance sheet data available');
      }
      if (!cashFlowData || cashFlowData.length === 0) {
        throw new Error('No cash flow data available');
      }

      // Get current year and historical data
      const profile = profileData[0];
      const income = incomeData[0];
      const balance = balanceData[0];
      const cashFlow = cashFlowData[0];

      const historicalIncome = incomeData.slice(0, Math.min(5, incomeData.length));
      const historicalBalance = balanceData.slice(0, Math.min(5, balanceData.length));
      const historicalCashFlow = cashFlowData.slice(0, Math.min(5, cashFlowData.length));

      setLoadingStep('✓ Financial data fetched successfully');

      // Prepare financial data for analysis
      const financialData = {
        companyName: profile.Name,
        ticker: ticker,
        industry: profile.Industry || profile.Sector,
        description: profile.Description,
        fiscalPeriod: income.fiscalDateEnding,
        currency: profile.Currency || 'USD',

        marketData: {
          marketCap: parseFinancialNumber(profile.MarketCapitalization),
          beta: parseFloat(profile.Beta) || null,
          trailingPE: parseFloat(profile.PERatio) || null,
          forwardPE: parseFloat(profile.ForwardPE) || null,
          priceToBook: parseFloat(profile.PriceToBookRatio) || null,
          fiftyTwoWeekHigh: parseFloat(profile['52WeekHigh']) || null,
          fiftyTwoWeekLow: parseFloat(profile['52WeekLow']) || null,
          sharesOutstanding: parseFinancialNumber(profile.SharesOutstanding),
          // Note: enterpriseValue and currentPrice not available from Alpha Vantage
          enterpriseValue: null,
          currentPrice: null
        },

        earningsData: earningsData ? {
          quarterlyEarnings: earningsData.quarterlyEarnings?.slice(0, 4) || [],
          annualEarnings: earningsData.annualEarnings?.slice(0, 3) || []
        } : null,

        incomeStatement: {
          revenue: parseFinancialNumber(income.totalRevenue),
          costOfRevenue: parseFinancialNumber(income.costOfRevenue),
          grossProfit: parseFinancialNumber(income.grossProfit),
          operatingExpenses: parseFinancialNumber(income.operatingExpenses),
          operatingIncome: parseFinancialNumber(income.operatingIncome),
          ebitda: parseFinancialNumber(income.ebitda),
          ebit: parseFinancialNumber(income.ebit),
          interestExpense: parseFinancialNumber(income.interestExpense),
          taxExpense: parseFinancialNumber(income.incomeTaxExpense),
          netIncome: parseFinancialNumber(income.netIncome),
          taxRate: parseFinancialNumber(income.incomeBeforeTax) !== 0
            ? parseFinancialNumber(income.incomeTaxExpense) / parseFinancialNumber(income.incomeBeforeTax)
            : 0.21
        },

        balanceSheet: {
          totalAssets: parseFinancialNumber(balance.totalAssets),
          currentAssets: parseFinancialNumber(balance.totalCurrentAssets),
          cash: parseFinancialNumber(balance.cashAndCashEquivalentsAtCarryingValue),
          accountsReceivable: parseFinancialNumber(balance.currentNetReceivables),
          inventory: parseFinancialNumber(balance.inventory),
          ppe: parseFinancialNumber(balance.propertyPlantEquipment),
          goodwill: parseFinancialNumber(balance.goodwill),
          intangibleAssets: parseFinancialNumber(balance.intangibleAssets),

          totalLiabilities: parseFinancialNumber(balance.totalLiabilities),
          currentLiabilities: parseFinancialNumber(balance.totalCurrentLiabilities),
          accountsPayable: parseFinancialNumber(balance.currentAccountsPayable),
          shortTermDebt: parseFinancialNumber(balance.shortTermDebt),
          longTermDebt: parseFinancialNumber(balance.shortLongTermDebtTotal) - parseFinancialNumber(balance.shortTermDebt),

          totalEquity: parseFinancialNumber(balance.totalShareholderEquity)
        },

        cashFlow: {
          operatingCashFlow: parseFinancialNumber(cashFlow.operatingCashflow),
          capitalExpenditures: Math.abs(parseFinancialNumber(cashFlow.capitalExpenditures)),
          freeCashFlow: parseFinancialNumber(cashFlow.operatingCashflow) - Math.abs(parseFinancialNumber(cashFlow.capitalExpenditures))
        },

        historicalData: {
          yearsAvailable: historicalIncome.length,
          incomeStatements: historicalIncome.map(yr => ({
            fiscalYear: yr.fiscalDateEnding,
            revenue: parseFinancialNumber(yr.totalRevenue),
            operatingIncome: parseFinancialNumber(yr.operatingIncome),
            ebit: parseFinancialNumber(yr.ebit),
            netIncome: parseFinancialNumber(yr.netIncome),
            grossMargin: parseFinancialNumber(yr.grossProfit) / parseFinancialNumber(yr.totalRevenue)
          })),
          balanceSheets: historicalBalance.map(yr => ({
            fiscalYear: yr.fiscalDateEnding,
            totalAssets: parseFinancialNumber(yr.totalAssets),
            totalEquity: parseFinancialNumber(yr.totalShareholderEquity),
            totalDebt: parseFinancialNumber(yr.shortLongTermDebtTotal),
            ppe: parseFinancialNumber(yr.propertyPlantEquipment)
          })),
          cashFlows: historicalCashFlow.map(yr => ({
            fiscalYear: yr.fiscalDateEnding,
            operatingCashFlow: parseFinancialNumber(yr.operatingCashflow),
            capex: Math.abs(parseFinancialNumber(yr.capitalExpenditures)),
            freeCashFlow: parseFinancialNumber(yr.operatingCashflow) - Math.abs(parseFinancialNumber(yr.capitalExpenditures))
          }))
        }
      };

      // Perform analysis
      setLoadingStep('🧮 Calculating ROIC and applying Mauboussin framework...');

      const analysisResponse = await fetchWithRetry(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyData: financialData })
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json();
        throw new Error(errorData.error || `Analysis failed: ${analysisResponse.status}`);
      }

      const analysisData = await analysisResponse.json();
      let analysisText = analysisData.analysis;

      // Strip markdown if present
      analysisText = analysisText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      let parsedAnalysis;
      try {
        parsedAnalysis = JSON.parse(analysisText);
      } catch (parseError) {
        console.error("Failed to parse analysis:", parseError);
        console.log("Raw response:", analysisText);
        throw new Error("Could not parse analysis results. Please try again.");
      }

      setAnalysis(parsedAnalysis);
      setLoadingStep('✓ Analysis complete!');

    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message || 'An error occurred during analysis. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    companyInput,
    setCompanyInput,
    backendConnected,
    isAnalyzing,
    loadingStep,
    analysis,
    error,
    analyzeCompany
  };
};
