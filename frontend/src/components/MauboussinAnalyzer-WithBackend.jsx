import React, { useState, useEffect } from 'react';
import { Building2, TrendingUp, Shield, Users, Brain, Target, Search, Loader, AlertCircle, ChevronDown, ChevronUp, Copy, X, Calculator, Server, Lock, Check, Zap, BarChart3, FileText, PieChart } from 'lucide-react';
import { parseFinancialNumber } from '../utils/formatters';
import { loadStripe } from '@stripe/stripe-js';

const MauboussinAIAnalyzer = () => {
  const [companyInput, setCompanyInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps] = useState(7);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    roic: true,
    moat: true,
    capitalAllocation: true,
    earnings: true,
    expectations: true,
    probabilistic: true,
    management: true,
    conclusion: true
  });

  // Paywall state
  const [showPaywall, setShowPaywall] = useState(false);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [isPaid, setIsPaid] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

  // Check backend connection on mount
  useEffect(() => {
    checkBackendConnection();
    initializePaymentStatus();
  }, []);

  // Initialize payment status from localStorage
  const initializePaymentStatus = () => {
    const paid = localStorage.getItem('mauboussin_paid') === 'true';
    const count = parseInt(localStorage.getItem('mauboussin_analysis_count') || '0', 10);

    setIsPaid(paid);
    setAnalysisCount(count);

    // Check if returning from successful payment
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      localStorage.setItem('mauboussin_paid', 'true');
      setIsPaid(true);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const checkBackendConnection = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      setBackendConnected(response.ok);
    } catch (err) {
      setBackendConnected(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Autocomplete search for company names
  const searchCompanies = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setShowAutocomplete(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/av/search?query=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.slice(0, 5)); // Show top 5 results
        setShowAutocomplete(data.length > 0);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  // Handle input change with debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (companyInput) {
        searchCompanies(companyInput);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [companyInput]);

  // Select company from autocomplete
  const selectCompany = (symbol, name) => {
    setCompanyInput(`${symbol} - ${name}`);
    setShowAutocomplete(false);
    setSearchResults([]);
  };

  // Retry helper function for API calls
  const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);

        // If rate limited, wait and retry
        if (response.status === 429) {
          const waitTime = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`Rate limited, retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        console.log(`Attempt ${i + 1} failed:`, error.message);

        if (i < maxRetries - 1) {
          const waitTime = Math.pow(2, i) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
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

    // Check paywall: allow 1 free analysis, then require payment
    if (!isPaid && analysisCount >= 1) {
      setShowPaywall(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setCurrentStep(0);
    setLoadingStep('');

    try {
      // Step 1: Get company ticker if name was provided
      setCurrentStep(1);
      setLoadingStep('Looking up company ticker');
      let ticker = companyInput.trim().toUpperCase();

      // Extract ticker if format is "AAPL - Apple Inc."
      if (ticker.includes(' - ')) {
        ticker = ticker.split(' - ')[0].trim();
      }

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
            ticker = searchData[0]['1. symbol'];
          } else {
            throw new Error('Company not found. Try using the ticker symbol directly (e.g., AAPL)');
          }
        } catch (searchErr) {
          console.error('Search error:', searchErr);
        }
      }

      // Step 2: Fetch all financial data in parallel for better performance
      setCurrentStep(2);
      setLoadingStep(`Fetching financial data for ${ticker}`);

      const [profileResponse, incomeResponse, balanceResponse, cashFlowResponse, yahooResponse, earningsResponse] = await Promise.all([
        fetchWithRetry(`${BACKEND_URL}/api/av/overview/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/av/income-statement/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/av/balance-sheet/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/av/cash-flow/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/yf/quote/${ticker}`),
        fetchWithRetry(`${BACKEND_URL}/api/earnings-transcript/${ticker}`)
      ]);

      // Validate all responses
      if (!profileResponse.ok) {
        throw new Error('Failed to fetch company profile. Check ticker symbol.');
      }
      if (!incomeResponse.ok) {
        throw new Error('Failed to fetch income statement');
      }
      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balance sheet');
      }
      if (!cashFlowResponse.ok) {
        throw new Error('Failed to fetch cash flow statement');
      }
      // Yahoo Finance and earnings are optional - don't fail if they error
      const yahooOk = yahooResponse.ok;
      const earningsOk = earningsResponse.ok;

      // Parse all data in parallel
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

      // Get current year (most recent) and historical data (up to 5 years)
      const profile = profileData[0];
      const income = incomeData[0];
      const balance = balanceData[0];
      const cashFlow = cashFlowData[0];

      // Get up to 5 years of historical data for trend analysis
      const historicalIncome = incomeData.slice(0, Math.min(5, incomeData.length));
      const historicalBalance = balanceData.slice(0, Math.min(5, balanceData.length));
      const historicalCashFlow = cashFlowData.slice(0, Math.min(5, cashFlowData.length));

      // Step 3: Parse and validate financial data
      setCurrentStep(3);
      setLoadingStep('Parsing financial data');

      // Helper function to convert Alpha Vantage's "None" strings to 0
      const parseNumber = (value) => {
        if (value === "None" || value === null || value === undefined || value === "") {
          return 0;
        }
        return parseFloat(value) || 0;
      };

      // Step 4: Prepare financial data for analysis
      setCurrentStep(4);
      setLoadingStep('Preparing financial data');

      const financialData = {
        companyName: profile.Name,
        ticker: ticker,
        industry: profile.Industry || profile.Sector,
        description: profile.Description,
        fiscalPeriod: income.fiscalDateEnding,
        currency: profile.Currency || 'USD',

        // Market data from Alpha Vantage
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

        // Recent earnings data for qualitative analysis
        earningsData: earningsData ? {
          quarterlyEarnings: earningsData.quarterlyEarnings?.slice(0, 4) || [], // Last 4 quarters
          annualEarnings: earningsData.annualEarnings?.slice(0, 3) || [] // Last 3 years
        } : null,

        incomeStatement: {
          revenue: parseNumber(income.totalRevenue),
          costOfRevenue: parseNumber(income.costOfRevenue),
          grossProfit: parseNumber(income.grossProfit),
          operatingExpenses: parseNumber(income.operatingExpenses),
          operatingIncome: parseNumber(income.operatingIncome),
          ebitda: parseNumber(income.ebitda),
          ebit: parseNumber(income.ebit),
          interestExpense: parseNumber(income.interestExpense),
          taxExpense: parseNumber(income.incomeTaxExpense),
          netIncome: parseNumber(income.netIncome),
          taxRate: parseNumber(income.incomeBeforeTax) !== 0
            ? parseNumber(income.incomeTaxExpense) / parseNumber(income.incomeBeforeTax)
            : 0.21
        },

        balanceSheet: {
          totalAssets: parseNumber(balance.totalAssets),
          currentAssets: parseNumber(balance.totalCurrentAssets),
          cash: parseNumber(balance.cashAndCashEquivalentsAtCarryingValue),
          accountsReceivable: parseNumber(balance.currentNetReceivables),
          inventory: parseNumber(balance.inventory),
          ppe: parseNumber(balance.propertyPlantEquipment),
          goodwill: parseNumber(balance.goodwill),
          intangibleAssets: parseNumber(balance.intangibleAssets),

          totalLiabilities: parseNumber(balance.totalLiabilities),
          currentLiabilities: parseNumber(balance.totalCurrentLiabilities),
          accountsPayable: parseNumber(balance.currentAccountsPayable),
          shortTermDebt: parseNumber(balance.shortTermDebt),
          longTermDebt: parseNumber(balance.shortLongTermDebtTotal) - parseNumber(balance.shortTermDebt),

          totalEquity: parseNumber(balance.totalShareholderEquity)
        },

        cashFlow: {
          operatingCashFlow: parseNumber(cashFlow.operatingCashflow),
          capitalExpenditures: Math.abs(parseNumber(cashFlow.capitalExpenditures)),
          freeCashFlow: parseNumber(cashFlow.operatingCashflow) - Math.abs(parseNumber(cashFlow.capitalExpenditures))
        },

        // Capital Allocation Metrics (New)
        capitalAllocationData: {
          operatingCashFlow: parseNumber(cashFlow.operatingCashflow),
          capitalExpenditures: Math.abs(parseNumber(cashFlow.capitalExpenditures)),
          // Try multiple common keys for dividends and buybacks
          dividends: Math.abs(parseNumber(cashFlow.dividendPayout || cashFlow.paymentOfDividends || 0)),
          repurchases: Math.abs(parseNumber(cashFlow.paymentsForRepurchaseOfCommonStock || cashFlow.paymentsForRepurchaseOfEquity || cashFlow.stockSaleAndPurchase || 0)),
          acquisitions: Math.abs(parseNumber(cashFlow.paymentsForAcquisitionOfBusinesses || cashFlow.acquisitionOfBusiness || 0)),
          debtRepayment: Math.abs(parseNumber(cashFlow.paymentsForRepurchaseOfLongTermDebt || cashFlow.repaymentOfLongTermDebt || 0))
        },

        // Historical data for trend analysis (up to 5 years)
        historicalData: {
          yearsAvailable: historicalIncome.length,
          incomeStatements: historicalIncome.map(yr => ({
            fiscalYear: yr.fiscalDateEnding,
            revenue: parseNumber(yr.totalRevenue),
            operatingIncome: parseNumber(yr.operatingIncome),
            ebit: parseNumber(yr.ebit),
            netIncome: parseNumber(yr.netIncome),
            grossMargin: parseNumber(yr.grossProfit) / parseNumber(yr.totalRevenue)
          })),
          balanceSheets: historicalBalance.map(yr => ({
            fiscalYear: yr.fiscalDateEnding,
            totalAssets: parseNumber(yr.totalAssets),
            totalEquity: parseNumber(yr.totalShareholderEquity),
            totalDebt: parseNumber(yr.shortLongTermDebtTotal),
            ppe: parseNumber(yr.propertyPlantEquipment)
          })),
          cashFlows: historicalCashFlow.map(yr => ({
            fiscalYear: yr.fiscalDateEnding,
            operatingCashFlow: parseNumber(yr.operatingCashflow),
            capex: Math.abs(parseNumber(yr.capitalExpenditures)),
            freeCashFlow: parseNumber(yr.operatingCashflow) - Math.abs(parseNumber(yr.capitalExpenditures))
          }))
        }
      };

      // Step 5: Calculate ROIC metrics
      setCurrentStep(5);
      setLoadingStep('Calculating ROIC metrics');

      // Step 6: Perform AI analysis
      setCurrentStep(6);
      setLoadingStep('Performing AI analysis with Mauboussin framework');

      const analysisResponse = await fetchWithRetry(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyData: financialData
        })
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

      // Increment analysis count and save to localStorage
      const newCount = analysisCount + 1;
      setAnalysisCount(newCount);
      localStorage.setItem('mauboussin_analysis_count', newCount.toString());

      // Step 7: Complete
      setCurrentStep(7);
      setLoadingStep('');

    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message || 'An error occurred during analysis. Please try again.');
      setLoadingStep('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle payment via Stripe
  const handlePayment = async () => {
    try {
      setIsProcessingPayment(true);

      const currentUrl = window.location.origin + window.location.pathname;
      const successUrl = `${currentUrl}?payment=success`;
      const cancelUrl = currentUrl;

      const response = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          successUrl,
          cancelUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error('Payment error:', error);
      setError('Failed to initiate payment. Please try again.');
      setIsProcessingPayment(false);
    }
  };

  const generateReport = () => {
    if (!analysis) return '';

    return `
╔════════════════════════════════════════════════════════════════════╗
║   MAUBOUSSIN COMPETITIVE ANALYSIS - CALCULATED ROIC               ║
║   ${analysis.companyName} (${analysis.ticker})                    ║
║   Fiscal Year: ${analysis.fiscalYear}                             ║
║   Data Source: SEC Filings via Alpha Vantage API                 ║
╚════════════════════════════════════════════════════════════════════╝

📊 BUSINESS OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Industry: ${analysis.industry}
Business Model: ${analysis.businessModel}

═══════════════════════════════════════════════════════════════════════
1️⃣  ROIC ANALYSIS - Return on Invested Capital
═══════════════════════════════════════════════════════════════════════

📈 NOPAT (Net Operating Profit After Tax)
─────────────────────────────────────────────────────────────────────
EBIT: ${analysis.roicAnalysis.nopat.ebit}
Tax Rate: ${analysis.roicAnalysis.nopat.taxRate}

${analysis.roicAnalysis.nopat.calculationShown}

NOPAT = ${analysis.roicAnalysis.nopat.nopatCalculated}

💰 INVESTED CAPITAL
─────────────────────────────────────────────────────────────────────
Method: ${analysis.roicAnalysis.investedCapital.method}

Current Assets: ${analysis.roicAnalysis.investedCapital.currentAssets}
Current Liabilities: ${analysis.roicAnalysis.investedCapital.currentLiabilities}
Net Working Capital: ${analysis.roicAnalysis.investedCapital.netWorkingCapital}

PP&E: ${analysis.roicAnalysis.investedCapital.ppe}
Goodwill: ${analysis.roicAnalysis.investedCapital.goodwill}
Intangibles: ${analysis.roicAnalysis.investedCapital.intangibles}

${analysis.roicAnalysis.investedCapital.calculationShown}

Total Invested Capital = ${analysis.roicAnalysis.investedCapital.totalIC}

Alternative: ${analysis.roicAnalysis.investedCapital.alternativeMethod}

🎯 ROIC CALCULATION
─────────────────────────────────────────────────────────────────────
${analysis.roicAnalysis.roicCalculated.calculation}

**ROIC = ${analysis.roicAnalysis.roicCalculated.percentage}**

Interpretation: ${analysis.roicAnalysis.roicCalculated.interpretation}

📊 DUPONT DECOMPOSITION
─────────────────────────────────────────────────────────────────────
Profit Margin = ${analysis.roicAnalysis.dupontDecomposition.profitMargin}
Capital Turnover = ${analysis.roicAnalysis.dupontDecomposition.capitalTurnover}

Validation: ${analysis.roicAnalysis.dupontDecomposition.validation}
Strategy: ${analysis.roicAnalysis.dupontDecomposition.strategyInsight}

💎 VALUE CREATION TEST
─────────────────────────────────────────────────────────────────────
Estimated WACC: ${analysis.roicAnalysis.valueCreation.estimatedWACC}
Economic Spread (ROIC - WACC): ${analysis.roicAnalysis.valueCreation.spread}

**Verdict: ${analysis.roicAnalysis.valueCreation.verdict}**

Context: ${analysis.roicAnalysis.valueCreation.context}

📈 Trend: ${analysis.roicAnalysis.historicalTrend}
📋 Data Quality: ${analysis.roicAnalysis.dataQuality}

═══════════════════════════════════════════════════════════════════════
2️⃣  MOAT ANALYSIS
═══════════════════════════════════════════════════════════════════════

Type: ${analysis.moatAnalysis.moatType}
Strength: ${analysis.moatAnalysis.moatStrength}
${analysis.moatAnalysis.moatStrengthRating ? `Rating: ${analysis.moatAnalysis.moatStrengthRating}/10` : ''}
${analysis.moatAnalysis.supplyOrDemandAdvantage ? `Supply/Demand Advantage: ${analysis.moatAnalysis.supplyOrDemandAdvantage}` : ''}

Evidence: ${analysis.moatAnalysis.evidenceForMoat}

Durability: ${analysis.moatAnalysis.moatDurability}
${analysis.moatAnalysis.threatsToMoat ? `\nThreats: ${analysis.moatAnalysis.threatsToMoat}` : ''}

Link to ROIC: ${analysis.moatAnalysis.linkToROIC}
${analysis.moatAnalysis.comparativeMoat ? `\nComparative Moat: ${analysis.moatAnalysis.comparativeMoat}` : ''}
${analysis.moatAnalysis.measurability ? `\nMeasurability: ${analysis.moatAnalysis.measurability}` : ''}

${analysis.earningsCallSentiment ? `
═══════════════════════════════════════════════════════════════════════
3️⃣  EARNINGS CALL SENTIMENT
═══════════════════════════════════════════════════════════════════════

Overall Sentiment: ${analysis.earningsCallSentiment.overallSentiment}
Beat/Miss Pattern: ${analysis.earningsCallSentiment.beatMissPattern}
Management Credibility: ${analysis.earningsCallSentiment.managementCredibility}
Earnings Quality: ${analysis.earningsCallSentiment.earningsQuality}
Forward Guidance: ${analysis.earningsCallSentiment.forwardGuidance}
Red Flags: ${analysis.earningsCallSentiment.redFlags}
Positive Signals: ${analysis.earningsCallSentiment.positiveSignals}
Sentiment Score: ${analysis.earningsCallSentiment.sentimentScore}/10
` : ''}

═══════════════════════════════════════════════════════════════════════
4️⃣  EXPECTATIONS INVESTING
═══════════════════════════════════════════════════════════════════════

Implied Expectations: ${analysis.expectationsAnalysis.impliedExpectations}
Valuation: ${analysis.expectationsAnalysis.currentValuation}

Scenarios:
${typeof analysis.expectationsAnalysis.scenarioAnalysis === 'object' && analysis.expectationsAnalysis.scenarioAnalysis !== null
        ? `  Bull: ${analysis.expectationsAnalysis.scenarioAnalysis.bull || 'N/A'}
  Base: ${analysis.expectationsAnalysis.scenarioAnalysis.base || 'N/A'}
  Bear: ${analysis.expectationsAnalysis.scenarioAnalysis.bear || 'N/A'}`
        : analysis.expectationsAnalysis.scenarioAnalysis}

Probability Weighted: ${analysis.expectationsAnalysis.probabilityWeighted}

═══════════════════════════════════════════════════════════════════════
5️⃣  PROBABILISTIC THINKING
═══════════════════════════════════════════════════════════════════════

Base Rates: ${analysis.probabilistic.baseRates}

Skill vs Luck: ${analysis.probabilistic.skillVsLuck}

Key Uncertainties: ${analysis.probabilistic.keyUncertainties}

═══════════════════════════════════════════════════════════════════════
6️⃣  MANAGEMENT QUALITY
═══════════════════════════════════════════════════════════════════════

Capital Allocation: ${analysis.management.capitalAllocation}

Strategic Thinking: ${analysis.management.strategicThinking}

Assessment: ${analysis.management.overallAssessment}

═══════════════════════════════════════════════════════════════════════
7️⃣  INVESTMENT CONCLUSION
═══════════════════════════════════════════════════════════════════════

💡 Thesis: ${analysis.conclusion.investmentThesis}

⚠️  Risks: ${analysis.conclusion.keyRisks}

🔄 What Would Change: ${analysis.conclusion.whatWouldChange}

📊 Recommendation: ${analysis.conclusion.recommendation}

═══════════════════════════════════════════════════════════════════════
Data: SEC Filings via Alpha Vantage API
Analysis: Mauboussin Competitive Framework
Generated: ${new Date().toLocaleString()}
`;
  };

  const exportAnalysis = () => {
    setShowExportModal(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateReport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Brain size={48} className="text-purple-600" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Mauboussin AI Analyzer
            </h1>
          </div>
          <p className="text-xl text-gray-600 mb-2">Automated SEC Financial Analysis with Real ROIC</p>
          <p className="text-sm text-gray-500">Powered by Alpha Vantage API + Claude Analysis</p>
        </div>

        {/* Error notification only when backend is down */}
        {!backendConnected && (
          <div className="bg-red-50 rounded-2xl shadow-lg p-6 mb-8 border-2 border-red-200">
            <div className="flex items-center gap-3">
              <Server size={24} className="text-red-600" />
              <div>
                <span className="font-medium text-red-700">
                  Unable to connect to analysis server
                </span>
                <p className="text-sm text-gray-600 mt-1">
                  Please try again later or contact support if the issue persists
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search Box */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8 border-2 border-purple-200">
          <div className="relative">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isAnalyzing && analyzeCompany()}
                  onFocus={() => searchResults.length > 0 && setShowAutocomplete(true)}
                  placeholder="Enter company name or ticker (e.g., Apple or AAPL)"
                  disabled={isAnalyzing}
                  className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:border-purple-500 disabled:bg-gray-100"
                />

                {/* Autocomplete dropdown */}
                {showAutocomplete && searchResults.length > 0 && !isAnalyzing && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-purple-200 rounded-xl shadow-xl z-10 max-h-64 overflow-y-auto">
                    {searchResults.map((result, index) => (
                      <button
                        key={index}
                        onClick={() => selectCompany(result['1. symbol'], result['2. name'])}
                        className="w-full px-6 py-3 text-left hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-semibold text-gray-800">{result['1. symbol']}</div>
                        <div className="text-sm text-gray-600">{result['2. name']}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={analyzeCompany}
                disabled={isAnalyzing || !companyInput.trim() || !backendConnected}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-3 shadow-lg"
              >
                {isAnalyzing ? (
                  <>
                    <Loader className="animate-spin" size={24} />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search size={24} />
                    Analyze
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress indicator - only show during analysis */}
          {isAnalyzing && (
            <div className="mt-6">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Step {currentStep} of {totalSteps}
                  </span>
                  <span className="text-sm text-gray-600">
                    {Math.round((currentStep / totalSteps) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-600 to-pink-600 h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                  />
                </div>
              </div>

              {/* Current step description */}
              {loadingStep && (
                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Loader className="animate-spin text-blue-600" size={20} />
                    <span className="text-blue-800 font-medium">{loadingStep}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 mb-8 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-1" size={24} />
              <div>
                <h3 className="text-lg font-bold text-red-800 mb-2">Analysis Error</h3>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <div className="space-y-8">
            {/* Company Overview */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-purple-200">
              <div className="flex items-center gap-3 mb-6">
                <Building2 size={32} className="text-purple-600" />
                <div>
                  <h2 className="text-3xl font-bold text-gray-800">{analysis.companyName}</h2>
                  <p className="text-gray-600">{analysis.ticker} | {analysis.industry}</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-4">Fiscal Year: {analysis.fiscalYear} | Data: SEC via Alpha Vantage API</p>
              <p className="text-gray-700 text-lg leading-relaxed">{analysis.businessModel}</p>
            </div>

            {/* ROIC Analysis */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-200 overflow-hidden">
              <button
                onClick={() => toggleSection('roic')}
                className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Calculator size={28} className="text-purple-600" />
                  <h3 className="text-2xl font-bold text-gray-800">ROIC Analysis</h3>
                </div>
                {expandedSections.roic ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.roic && (
                <div className="p-8 space-y-6">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg">
                    <h4 className="font-bold text-lg text-blue-900 mb-3">NOPAT Calculation</h4>
                    <p className="text-gray-700 mb-2"><strong>EBIT:</strong> {analysis.roicAnalysis.nopat.ebit}</p>
                    <p className="text-gray-700 mb-2"><strong>Tax Rate:</strong> {analysis.roicAnalysis.nopat.taxRate}</p>
                    <p className="text-gray-700 mb-3">{analysis.roicAnalysis.nopat.calculationShown}</p>
                    <p className="text-xl font-bold text-blue-900">NOPAT = {analysis.roicAnalysis.nopat.nopatCalculated}</p>
                  </div>

                  <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg">
                    <h4 className="font-bold text-lg text-green-900 mb-3">Invested Capital</h4>
                    <p className="text-gray-700 mb-3"><strong>Method:</strong> {analysis.roicAnalysis.investedCapital.method}</p>
                    <p className="text-gray-700 mb-2">{analysis.roicAnalysis.investedCapital.calculationShown}</p>
                    <p className="text-xl font-bold text-green-900 mt-4">Total IC = {analysis.roicAnalysis.investedCapital.totalIC}</p>
                    <p className="text-sm text-gray-600 mt-3"><strong>Alternative:</strong> {analysis.roicAnalysis.investedCapital.alternativeMethod}</p>
                  </div>

                  <div className="bg-purple-50 border-l-4 border-purple-500 p-6 rounded-r-lg">
                    <h4 className="font-bold text-lg text-purple-900 mb-3">ROIC Result</h4>
                    <p className="text-gray-700 mb-2">{analysis.roicAnalysis.roicCalculated.calculation}</p>
                    <p className="text-3xl font-bold text-purple-900 my-4">ROIC = {analysis.roicAnalysis.roicCalculated.percentage}</p>
                    <p className="text-gray-700">{analysis.roicAnalysis.roicCalculated.interpretation}</p>
                  </div>

                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-r-lg">
                    <h4 className="font-bold text-lg text-yellow-900 mb-3">Value Creation Test</h4>
                    <p className="text-gray-700 mb-2"><strong>Estimated WACC:</strong> {analysis.roicAnalysis.valueCreation.estimatedWACC}</p>
                    <p className="text-gray-700 mb-2"><strong>Economic Spread:</strong> {analysis.roicAnalysis.valueCreation.spread}</p>
                    <p className="text-xl font-bold text-yellow-900 my-3">{analysis.roicAnalysis.valueCreation.verdict}</p>
                    <p className="text-gray-700">{analysis.roicAnalysis.valueCreation.context}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Moat Analysis */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-200 overflow-hidden">
              <button
                onClick={() => toggleSection('moat')}
                className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Shield size={28} className="text-purple-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Competitive Moat Analysis</h3>
                </div>
                {expandedSections.moat ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.moat && (
                <div className="p-8 space-y-4">
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Moat Type:</p>
                    <p className="text-gray-800 text-lg">{analysis.moatAnalysis.moatType}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Moat Strength:</p>
                    <p className="text-gray-800 text-lg font-bold">{analysis.moatAnalysis.moatStrength}</p>
                  </div>
                  {analysis.moatAnalysis.moatStrengthRating && (
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Moat Strength Rating:</p>
                      <p className="text-gray-800 text-lg font-bold">{analysis.moatAnalysis.moatStrengthRating}/10</p>
                    </div>
                  )}
                  {analysis.moatAnalysis.supplyOrDemandAdvantage && (
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Supply/Demand Advantage:</p>
                      <p className="text-gray-800">{analysis.moatAnalysis.supplyOrDemandAdvantage}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Evidence:</p>
                    <p className="text-gray-800">{analysis.moatAnalysis.evidenceForMoat}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Durability:</p>
                    <p className="text-gray-800">{analysis.moatAnalysis.moatDurability}</p>
                  </div>
                  {analysis.moatAnalysis.threatsToMoat && (
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Threats to Moat:</p>
                      <p className="text-gray-800">{analysis.moatAnalysis.threatsToMoat}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Link to ROIC:</p>
                    <p className="text-gray-800">{analysis.moatAnalysis.linkToROIC}</p>
                  </div>
                  {analysis.moatAnalysis.comparativeMoat && (
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Comparative Moat:</p>
                      <p className="text-gray-800">{analysis.moatAnalysis.comparativeMoat}</p>
                    </div>
                  )}
                  {analysis.moatAnalysis.measurability && (
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Measurability:</p>
                      <p className="text-gray-800">{analysis.moatAnalysis.measurability}</p>
                    </div>
                  )}
                </div>
              )}
              {/* Capital Allocation & Base Rates */}
              {analysis.capitalAllocation && (
                <div className="bg-white rounded-2xl shadow-xl border-2 border-orange-200 overflow-hidden">
                  <button
                    onClick={() => toggleSection('capitalAllocation')}
                    className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <PieChart size={28} className="text-orange-600" />
                      <h3 className="text-2xl font-bold text-gray-800">Capital Allocation & Base Rates</h3>
                    </div>
                    {expandedSections.capitalAllocation ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </button>

                  {expandedSections.capitalAllocation && (
                    <div className="p-8 space-y-6">
                      {/* Capital Allocation Breakdown */}
                      <div className="bg-orange-50 p-6 rounded-xl border border-orange-200">
                        <h4 className="font-bold text-lg text-orange-900 mb-4">Uses of Cash Analysis</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <p className="text-gray-600 mb-1">Total Operating Cash Flow:</p>
                            <p className="text-xl font-bold text-gray-900">{analysis.capitalAllocation.operatingCashFlow}</p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">CapEx (Reinvestment):</span>
                              <span className="font-medium">{analysis.capitalAllocation.capex}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Acquisitions (Inorganic):</span>
                              <span className="font-medium">{analysis.capitalAllocation.acquisitions}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Stock Buybacks:</span>
                              <span className="font-medium">{analysis.capitalAllocation.buybacks}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Dividends:</span>
                              <span className="font-medium">{analysis.capitalAllocation.dividends}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-orange-200">
                          <p className="font-bold text-gray-800 mb-1">Assessment:</p>
                          <p className="text-gray-700">{analysis.capitalAllocation.assessment}</p>
                        </div>
                      </div>

                      {/* Base Rate Context */}
                      <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
                        <h4 className="font-bold text-lg text-blue-900 mb-3">Base Rate (Outside View)</h4>
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <p className="text-gray-700 mb-2">{analysis.capitalAllocation.baseRateComparison}</p>
                            <p className="text-sm text-gray-500 italic">Comparing {analysis.ticker}'s ROIC of {analysis.roicAnalysis.roicCalculated.percentage} to the {analysis.industry} industry average.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Capital Allocation & Base Rates */}
            {analysis.capitalAllocation && (
              <div className="bg-white rounded-2xl shadow-xl border-2 border-orange-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('capitalAllocation')}
                  className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PieChart size={28} className="text-orange-600" />
                    <h3 className="text-2xl font-bold text-gray-800">Capital Allocation & Base Rates</h3>
                  </div>
                  {expandedSections.capitalAllocation ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                </button>

                {expandedSections.capitalAllocation && (
                  <div className="p-8 space-y-6">
                    {/* Capital Allocation Breakdown */}
                    <div className="bg-orange-50 p-6 rounded-xl border border-orange-200">
                      <h4 className="font-bold text-lg text-orange-900 mb-4">Uses of Cash Analysis</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <p className="text-gray-600 mb-1">Total Operating Cash Flow:</p>
                          <p className="text-xl font-bold text-gray-900">{analysis.capitalAllocation.operatingCashFlow}</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">CapEx (Reinvestment):</span>
                            <span className="font-medium">{analysis.capitalAllocation.capex}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Acquisitions (Inorganic):</span>
                            <span className="font-medium">{analysis.capitalAllocation.acquisitions}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Stock Buybacks:</span>
                            <span className="font-medium">{analysis.capitalAllocation.buybacks}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Dividends:</span>
                            <span className="font-medium">{analysis.capitalAllocation.dividends}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-orange-200">
                        <p className="font-bold text-gray-800 mb-1">Assessment:</p>
                        <p className="text-gray-700">{analysis.capitalAllocation.assessment}</p>
                      </div>
                    </div>

                    {/* Base Rate Context */}
                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
                      <h4 className="font-bold text-lg text-blue-900 mb-3">Base Rate (Outside View)</h4>
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <p className="text-gray-700 mb-2">{analysis.capitalAllocation.baseRateComparison}</p>
                          <p className="text-sm text-gray-500 italic">Comparing {analysis.ticker}'s ROIC of {analysis.roicAnalysis.roicCalculated.percentage} to the {analysis.industry} industry average.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Earnings Call Sentiment */}
            {analysis.earningsCallSentiment && (
              <div className="bg-white rounded-2xl shadow-xl border-2 border-green-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('earnings')}
                  className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp size={28} className="text-green-600" />
                    <h3 className="text-2xl font-bold text-gray-800">Earnings Call Sentiment</h3>
                  </div>
                  {expandedSections.earnings ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                </button>

                {expandedSections.earnings && (
                  <div className="p-8 space-y-4">
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Overall Sentiment:</p>
                      <p className="text-gray-800">{analysis.earningsCallSentiment.overallSentiment}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Beat/Miss Pattern:</p>
                      <p className="text-gray-800">{analysis.earningsCallSentiment.beatMissPattern}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Management Credibility:</p>
                      <p className="text-gray-800">{analysis.earningsCallSentiment.managementCredibility}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Earnings Quality:</p>
                      <p className="text-gray-800">{analysis.earningsCallSentiment.earningsQuality}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Forward Guidance:</p>
                      <p className="text-gray-800">{analysis.earningsCallSentiment.forwardGuidance}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Red Flags:</p>
                      <p className="text-gray-800">{analysis.earningsCallSentiment.redFlags}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Positive Signals:</p>
                      <p className="text-gray-800">{analysis.earningsCallSentiment.positiveSignals}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium mb-1">Sentiment Score:</p>
                      <p className="text-gray-800">{analysis.earningsCallSentiment.sentimentScore}/10</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Expectations Investing */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-200 overflow-hidden">
              <button
                onClick={() => toggleSection('expectations')}
                className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <TrendingUp size={28} className="text-purple-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Expectations Investing</h3>
                </div>
                {expandedSections.expectations ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.expectations && (
                <div className="p-8 space-y-4">
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Implied Expectations:</p>
                    <p className="text-gray-800">{analysis.expectationsAnalysis.impliedExpectations}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Current Valuation:</p>
                    <p className="text-gray-800">{analysis.expectationsAnalysis.currentValuation}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Scenario Analysis:</p>
                    <div className="text-gray-800">
                      {typeof analysis.expectationsAnalysis.scenarioAnalysis === 'object' && analysis.expectationsAnalysis.scenarioAnalysis !== null ? (
                        <div className="space-y-1">
                          <p>Bull: {analysis.expectationsAnalysis.scenarioAnalysis.bull || 'N/A'}</p>
                          <p>Base: {analysis.expectationsAnalysis.scenarioAnalysis.base || 'N/A'}</p>
                          <p>Bear: {analysis.expectationsAnalysis.scenarioAnalysis.bear || 'N/A'}</p>
                        </div>
                      ) : (
                        <p>{analysis.expectationsAnalysis.scenarioAnalysis}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Probability Weighted:</p>
                    <p className="text-gray-800">{analysis.expectationsAnalysis.probabilityWeighted}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Probabilistic Thinking */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-200 overflow-hidden">
              <button
                onClick={() => toggleSection('probabilistic')}
                className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Target size={28} className="text-purple-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Probabilistic Thinking</h3>
                </div>
                {expandedSections.probabilistic ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.probabilistic && (
                <div className="p-8 space-y-4">
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Base Rates:</p>
                    <p className="text-gray-800">{analysis.probabilistic.baseRates}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Skill vs Luck:</p>
                    <p className="text-gray-800">{analysis.probabilistic.skillVsLuck}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Key Uncertainties:</p>
                    <p className="text-gray-800">{analysis.probabilistic.keyUncertainties}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Management Quality */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-200 overflow-hidden">
              <button
                onClick={() => toggleSection('management')}
                className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users size={28} className="text-purple-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Management Quality</h3>
                </div>
                {expandedSections.management ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.management && (
                <div className="p-8 space-y-4">
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Capital Allocation:</p>
                    <p className="text-gray-800">{analysis.management.capitalAllocation}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Strategic Thinking:</p>
                    <p className="text-gray-800">{analysis.management.strategicThinking}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Overall Assessment:</p>
                    <p className="text-gray-800 font-bold">{analysis.management.overallAssessment}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Investment Conclusion */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-200 overflow-hidden">
              <button
                onClick={() => toggleSection('conclusion')}
                className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Brain size={28} className="text-purple-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Investment Conclusion</h3>
                </div>
                {expandedSections.conclusion ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.conclusion && (
                <div className="p-8 space-y-6">
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl">
                    <p className="text-gray-600 font-medium mb-2">Investment Thesis:</p>
                    <p className="text-gray-800 text-lg leading-relaxed">{analysis.conclusion.investmentThesis}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-2">Key Risks:</p>
                    <p className="text-gray-800">{analysis.conclusion.keyRisks}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-2">What Would Change Our View:</p>
                    <p className="text-gray-800">{analysis.conclusion.whatWouldChange}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-2">Recommendation:</p>
                    <p className="text-gray-800 font-bold text-lg">{analysis.conclusion.recommendation}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Export Button */}
            <div className="flex justify-center pt-4">
              <button
                onClick={exportAnalysis}
                className="flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-2xl"
              >
                <Copy size={24} />
                Copy Complete Report
              </button>
            </div>
          </div>
        )}

        {/* Hero Section - Features Highlight */}
        {!analysis && (
          <div className="mt-12 bg-gradient-to-br from-purple-600 via-pink-600 to-purple-700 rounded-3xl shadow-2xl p-12 text-white">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">Professional Investment Analysis at Your Fingertips</h2>
              <p className="text-xl text-purple-100">Powered by AI + Mauboussin's proven frameworks</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Feature 1 */}
              <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-6">
                <div className="bg-white bg-opacity-20 w-16 h-16 rounded-xl flex items-center justify-center mb-4">
                  <Calculator size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Precise ROIC Calculations</h3>
                <p className="text-purple-100">
                  Get detailed Return on Invested Capital analysis with full DuPont decomposition and value creation metrics
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-6">
                <div className="bg-white bg-opacity-20 w-16 h-16 rounded-xl flex items-center justify-center mb-4">
                  <Shield size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Competitive Moat Analysis</h3>
                <p className="text-purple-100">
                  Identify and measure sustainable competitive advantages using Mauboussin's "Measuring the Moat" framework
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-6">
                <div className="bg-white bg-opacity-20 w-16 h-16 rounded-xl flex items-center justify-center mb-4">
                  <TrendingUp size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Earnings Sentiment</h3>
                <p className="text-purple-100">
                  Track record analysis of earnings beats/misses and management credibility assessment
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-6">
                <div className="bg-white bg-opacity-20 w-16 h-16 rounded-xl flex items-center justify-center mb-4">
                  <BarChart3 size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Expectations Investing</h3>
                <p className="text-purple-100">
                  Reverse engineer market expectations and run bull/base/bear scenario analysis
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-6">
                <div className="bg-white bg-opacity-20 w-16 h-16 rounded-xl flex items-center justify-center mb-4">
                  <Brain size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Probabilistic Thinking</h3>
                <p className="text-purple-100">
                  Apply base rates and skill vs. luck analysis for better investment decisions
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-6">
                <div className="bg-white bg-opacity-20 w-16 h-16 rounded-xl flex items-center justify-center mb-4">
                  <FileText size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Exportable Reports</h3>
                <p className="text-purple-100">
                  Generate comprehensive analysis reports you can save, share, or reference later
                </p>
              </div>
            </div>

            <div className="text-center mt-12">
              <div className="inline-flex items-center gap-3 bg-white bg-opacity-20 backdrop-blur-sm rounded-full px-6 py-3">
                <Zap size={20} />
                <span className="font-semibold">Instant Analysis</span>
                <span className="text-purple-200">•</span>
                <span className="font-semibold">SEC Data</span>
                <span className="text-purple-200">•</span>
                <span className="font-semibold">AI-Powered</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {/* Placeholder removed - cleaner UI */}
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
              <h3 className="text-2xl font-bold text-gray-800">Complete Analysis Report</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <textarea
                readOnly
                value={generateReport()}
                className="w-full h-full min-h-[500px] p-4 border-2 border-gray-300 rounded-lg font-mono text-sm"
              />
            </div>

            <div className="p-6 border-t-2 border-gray-200 flex gap-4">
              <button
                onClick={copyToClipboard}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:from-purple-700 hover:to-pink-700 transition-all"
              >
                <Copy size={20} />
                {copied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paywall Modal */}
      {showPaywall && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8">
            <div className="text-center">
              <div className="mb-6">
                <Lock size={64} className="mx-auto text-purple-600" />
              </div>
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Unlock Unlimited Analyses
              </h2>
              <p className="text-xl text-gray-600 mb-2">
                You've used your <span className="font-bold text-purple-600">1 free analysis</span>
              </p>
              <p className="text-gray-600 mb-8">
                Get unlimited access with a one-time payment
              </p>

              {/* Pricing */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 mb-8">
                <div className="flex items-baseline justify-center gap-2 mb-4">
                  <span className="text-5xl font-bold text-gray-900">$9.99</span>
                  <span className="text-gray-600">one-time</span>
                </div>
                <p className="text-gray-700 font-medium mb-6">Lifetime Unlimited Access</p>

                <div className="space-y-3 text-left max-w-md mx-auto">
                  <div className="flex items-center gap-3">
                    <Check size={20} className="text-green-600 flex-shrink-0" />
                    <span className="text-gray-700">Unlimited company analyses</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check size={20} className="text-green-600 flex-shrink-0" />
                    <span className="text-gray-700">Complete ROIC calculations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check size={20} className="text-green-600 flex-shrink-0" />
                    <span className="text-gray-700">Moat analysis framework</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check size={20} className="text-green-600 flex-shrink-0" />
                    <span className="text-gray-700">Export detailed reports</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check size={20} className="text-green-600 flex-shrink-0" />
                    <span className="text-gray-700">Access forever</span>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-4">
                <button
                  onClick={handlePayment}
                  disabled={isProcessingPayment}
                  className="w-full px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {isProcessingPayment ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader className="animate-spin" size={20} />
                      Processing...
                    </div>
                  ) : (
                    'Get Unlimited Access - $9.99'
                  )}
                </button>
                <button
                  onClick={() => setShowPaywall(false)}
                  className="text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Maybe later
                </button>
              </div>

              <p className="text-sm text-gray-500 mt-6">
                Secure payment powered by Stripe
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MauboussinAIAnalyzer;
