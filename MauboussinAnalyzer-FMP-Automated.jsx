import React, { useState, useEffect } from 'react';
import { Building2, TrendingUp, Shield, Users, Brain, Target, Search, Loader, AlertCircle, ChevronDown, ChevronUp, Copy, X, Calculator, Key, CheckCircle, Settings } from 'lucide-react';

const MauboussinAIAnalyzer = () => {
  const [companyInput, setCompanyInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyStored, setApiKeyStored] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    roic: true,
    moat: true,
    expectations: true,
    probabilistic: true,
    management: true,
    conclusion: true
  });

  // Load API key from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('fmp_api_key');
    if (stored) {
      setApiKey(stored);
      setApiKeyStored(true);
    }
  }, []);

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('fmp_api_key', apiKey.trim());
      setApiKeyStored(true);
      setShowApiKeyInput(false);
    }
  };

  const clearApiKey = () => {
    localStorage.removeItem('fmp_api_key');
    setApiKey('');
    setApiKeyStored(false);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const analyzeCompany = async () => {
    if (!companyInput.trim()) {
      setError('Please enter a company name or ticker symbol');
      return;
    }

    if (!apiKey) {
      setError('Please enter your Financial Modeling Prep API key');
      setShowApiKeyInput(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      // Step 1: Get company ticker if name was provided
      setLoadingStep('🔍 Looking up company ticker...');
      let ticker = companyInput.trim().toUpperCase();
      
      // If input looks like a company name (contains spaces or lowercase), search for ticker
      if (companyInput.includes(' ') || companyInput !== companyInput.toUpperCase()) {
        try {
          const searchResponse = await fetch(
            `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(companyInput)}&limit=5&apikey=${apiKey}`
          );
          
          if (!searchResponse.ok) {
            throw new Error('Failed to search for company. Check your API key.');
          }
          
          const searchData = await searchResponse.json();
          
          if (searchData && searchData.length > 0) {
            ticker = searchData[0].symbol;
            setLoadingStep(`✓ Found ticker: ${ticker}`);
          } else {
            throw new Error('Company not found. Try using the ticker symbol (e.g., AAPL)');
          }
        } catch (searchErr) {
          console.error('Search error:', searchErr);
          // Try to proceed with original input as ticker
        }
      }

      // Step 2: Fetch company profile
      setLoadingStep(`📊 Fetching ${ticker} company profile...`);
      const profileResponse = await fetch(
        `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${apiKey}`
      );

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch company profile. Check ticker symbol and API key.');
      }

      const profileData = await profileResponse.json();
      
      if (!profileData || profileData.length === 0) {
        throw new Error(`No data found for ticker: ${ticker}`);
      }

      const profile = profileData[0];

      // Step 3: Fetch Income Statement
      setLoadingStep('📈 Fetching income statement from SEC filings...');
      const incomeResponse = await fetch(
        `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`
      );

      if (!incomeResponse.ok) {
        throw new Error('Failed to fetch income statement');
      }

      const incomeData = await incomeResponse.json();
      
      if (!incomeData || incomeData.length === 0) {
        throw new Error('No income statement data available');
      }

      const income = incomeData[0];

      // Step 4: Fetch Balance Sheet
      setLoadingStep('💰 Fetching balance sheet from SEC filings...');
      const balanceResponse = await fetch(
        `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`
      );

      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balance sheet');
      }

      const balanceData = await balanceResponse.json();
      
      if (!balanceData || balanceData.length === 0) {
        throw new Error('No balance sheet data available');
      }

      const balance = balanceData[0];

      // Step 5: Fetch Cash Flow
      setLoadingStep('💵 Fetching cash flow statement...');
      const cashFlowResponse = await fetch(
        `https://financialmodelingprep.com/api/v3/cash-flow-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`
      );

      if (!cashFlowResponse.ok) {
        throw new Error('Failed to fetch cash flow statement');
      }

      const cashFlowData = await cashFlowResponse.json();
      
      if (!cashFlowData || cashFlowData.length === 0) {
        throw new Error('No cash flow data available');
      }

      const cashFlow = cashFlowData[0];

      // Step 6: Prepare financial data for analysis
      const financialData = {
        companyName: profile.companyName,
        ticker: ticker,
        industry: profile.industry || profile.sector,
        description: profile.description,
        fiscalPeriod: income.calendarYear,
        currency: profile.currency || 'USD',
        
        incomeStatement: {
          revenue: income.revenue,
          costOfRevenue: income.costOfRevenue,
          grossProfit: income.grossProfit,
          operatingExpenses: income.operatingExpenses,
          operatingIncome: income.operatingIncome,
          ebitda: income.ebitda,
          ebit: income.ebitda - income.depreciationAndAmortization,
          interestExpense: income.interestExpense,
          taxExpense: income.incomeTaxExpense,
          netIncome: income.netIncome,
          taxRate: income.incomeTaxExpense / income.incomeBeforeTax
        },
        
        balanceSheet: {
          totalAssets: balance.totalAssets,
          currentAssets: balance.totalCurrentAssets,
          cash: balance.cashAndCashEquivalents,
          accountsReceivable: balance.netReceivables,
          inventory: balance.inventory,
          ppe: balance.propertyPlantEquipmentNet,
          goodwill: balance.goodwill,
          intangibleAssets: balance.intangibleAssets,
          
          totalLiabilities: balance.totalLiabilities,
          currentLiabilities: balance.totalCurrentLiabilities,
          accountsPayable: balance.accountPayables,
          shortTermDebt: balance.shortTermDebt,
          longTermDebt: balance.longTermDebt,
          
          totalEquity: balance.totalStockholdersEquity
        },
        
        cashFlow: {
          operatingCashFlow: cashFlow.operatingCashFlow,
          capitalExpenditures: cashFlow.capitalExpenditure,
          freeCashFlow: cashFlow.freeCashFlow
        }
      };

      // Step 7: Perform Mauboussin Analysis using Claude API
      setLoadingStep('🧮 Calculating ROIC and applying Mauboussin framework...');
      
      const analysisResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          messages: [
            {
              role: "user",
              content: `You are a strategic analyst using Michael Mauboussin's investment frameworks.

=== FINANCIAL DATA FROM SEC FILING (via FMP API) ===

Company: ${financialData.companyName} (${financialData.ticker})
Industry: ${financialData.industry}
Fiscal Year: ${financialData.fiscalPeriod}
Currency: ${financialData.currency}

INCOME STATEMENT:
Revenue: ${financialData.incomeStatement.revenue / 1e6}M
Cost of Revenue: ${financialData.incomeStatement.costOfRevenue / 1e6}M
Gross Profit: ${financialData.incomeStatement.grossProfit / 1e6}M
Operating Expenses: ${financialData.incomeStatement.operatingExpenses / 1e6}M
Operating Income: ${financialData.incomeStatement.operatingIncome / 1e6}M
EBIT: ${financialData.incomeStatement.ebit / 1e6}M
Interest Expense: ${financialData.incomeStatement.interestExpense / 1e6}M
Tax Expense: ${financialData.incomeStatement.taxExpense / 1e6}M
Net Income: ${financialData.incomeStatement.netIncome / 1e6}M
Effective Tax Rate: ${(financialData.incomeStatement.taxRate * 100).toFixed(1)}%

BALANCE SHEET:
Total Assets: ${financialData.balanceSheet.totalAssets / 1e6}M
Current Assets: ${financialData.balanceSheet.currentAssets / 1e6}M
  - Cash: ${financialData.balanceSheet.cash / 1e6}M
  - Accounts Receivable: ${financialData.balanceSheet.accountsReceivable / 1e6}M
  - Inventory: ${financialData.balanceSheet.inventory / 1e6}M
PP&E (net): ${financialData.balanceSheet.ppe / 1e6}M
Goodwill: ${financialData.balanceSheet.goodwill / 1e6}M
Intangible Assets: ${financialData.balanceSheet.intangibleAssets / 1e6}M

Total Liabilities: ${financialData.balanceSheet.totalLiabilities / 1e6}M
Current Liabilities: ${financialData.balanceSheet.currentLiabilities / 1e6}M
  - Accounts Payable: ${financialData.balanceSheet.accountsPayable / 1e6}M
  - Short-term Debt: ${financialData.balanceSheet.shortTermDebt / 1e6}M
Long-term Debt: ${financialData.balanceSheet.longTermDebt / 1e6}M

Total Equity: ${financialData.balanceSheet.totalEquity / 1e6}M

CASH FLOW:
Operating Cash Flow: ${financialData.cashFlow.operatingCashFlow / 1e6}M
Capital Expenditures: ${financialData.cashFlow.capitalExpenditures / 1e6}M
Free Cash Flow: ${financialData.cashFlow.freeCashFlow / 1e6}M

=== YOUR TASK ===

Perform a complete Mauboussin competitive analysis. Calculate ROIC precisely using the data above.

CRITICAL: Show all mathematical steps clearly. Use the actual numbers provided.

Your response MUST be valid JSON in this EXACT format (no additional text, no markdown, no code blocks):

{
  "companyName": "${financialData.companyName}",
  "ticker": "${financialData.ticker}",
  "businessModel": "2-3 sentence description of how the company makes money",
  "industry": "${financialData.industry}",
  "fiscalYear": "${financialData.fiscalPeriod}",
  
  "roicAnalysis": {
    "nopat": {
      "ebit": "Number in millions",
      "taxRate": "Percentage",
      "nopatCalculated": "EBIT × (1 - tax rate) in millions",
      "calculationShown": "Show step: EBIT $X × (1 - Y%) = NOPAT $Z"
    },
    "investedCapital": {
      "method": "Operating approach: NWC + Net Fixed Assets",
      "currentAssets": "Number in millions",
      "currentLiabilities": "Number in millions",
      "netWorkingCapital": "Current Assets - Current Liabilities",
      "ppe": "PP&E in millions",
      "goodwill": "Goodwill in millions",
      "intangibles": "Intangibles in millions",
      "totalIC": "Sum of components",
      "calculationShown": "Show: NWC $X + PP&E $Y + Goodwill $Z = IC $Total",
      "alternativeMethod": "Also show: Equity + Debt - Excess Cash"
    },
    "roicCalculated": {
      "percentage": "ROIC as percentage",
      "calculation": "NOPAT / IC = X%",
      "interpretation": "Assessment vs industry and cost of capital"
    },
    "dupontDecomposition": {
      "profitMargin": "NOPAT / Revenue as %",
      "capitalTurnover": "Revenue / IC as ratio",
      "validation": "Margin × Turnover = ROIC (validate)",
      "strategyInsight": "High margin (differentiation) or high turnover (cost leadership)?"
    },
    "valueCreation": {
      "estimatedWACC": "Estimate 8-12% for this industry",
      "spread": "ROIC - WACC",
      "verdict": "Creating/destroying value?",
      "context": "How does moat enable this ROIC?"
    },
    "historicalTrend": "Is ROIC improving or declining? (mention if you need more years)",
    "dataQuality": "Confidence in the calculations (high/medium/low)"
  },
  
  "moatAnalysis": {
    "moatType": "Network effects / Scale / Intangibles / Switching costs / Cost advantages",
    "moatStrength": "Wide / Narrow / None with justification",
    "evidenceForMoat": "Specific financial evidence (margins, market position, pricing power)",
    "moatDurability": "How long can this moat last? Risks?",
    "linkToROIC": "How does moat create the ROIC observed?"
  },
  
  "expectationsAnalysis": {
    "impliedExpectations": "What growth/ROIC is market pricing in?",
    "currentValuation": "P/E or EV/EBITDA if you can estimate",
    "scenarioAnalysis": "Bull / Base / Bear cases with assumptions",
    "probabilityWeighted": "Weight the scenarios"
  },
  
  "probabilistic": {
    "baseRates": "What % of companies in this industry sustain high ROIC?",
    "skillVsLuck": "How much is replicable skill vs luck?",
    "keyUncertainties": "Top 2-3 uncertainties"
  },
  
  "management": {
    "capitalAllocation": "Track record and quality",
    "strategicThinking": "Evidence of long-term focus",
    "overallAssessment": "Trust them with capital?"
  },
  
  "conclusion": {
    "investmentThesis": "3-5 sentence thesis",
    "keyRisks": "Top 3 risks",
    "whatWouldChange": "What would change your view?",
    "recommendation": "Context-dependent recommendation"
  }
}

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, just pure JSON.`
            }
          ]
        })
      });

      if (!analysisResponse.ok) {
        throw new Error(`Analysis failed: ${analysisResponse.status}`);
      }

      const analysisData = await analysisResponse.json();
      let analysisText = analysisData.content[0].text;
      
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

  const generateReport = () => {
    if (!analysis) return '';

    return `
╔════════════════════════════════════════════════════════════════════╗
║   MAUBOUSSIN COMPETITIVE ANALYSIS - CALCULATED ROIC               ║
║   ${analysis.companyName} (${analysis.ticker})                    ║
║   Fiscal Year: ${analysis.fiscalYear}                             ║
║   Data Source: SEC Filings via Financial Modeling Prep           ║
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

Evidence: ${analysis.moatAnalysis.evidenceForMoat}

Durability: ${analysis.moatAnalysis.moatDurability}

Link to ROIC: ${analysis.moatAnalysis.linkToROIC}

═══════════════════════════════════════════════════════════════════════
3️⃣  EXPECTATIONS INVESTING
═══════════════════════════════════════════════════════════════════════

Implied Expectations: ${analysis.expectationsAnalysis.impliedExpectations}
Valuation: ${analysis.expectationsAnalysis.currentValuation}

Scenarios: ${analysis.expectationsAnalysis.scenarioAnalysis}

Probability Weighted: ${analysis.expectationsAnalysis.probabilityWeighted}

═══════════════════════════════════════════════════════════════════════
4️⃣  PROBABILISTIC THINKING
═══════════════════════════════════════════════════════════════════════

Base Rates: ${analysis.probabilistic.baseRates}

Skill vs Luck: ${analysis.probabilistic.skillVsLuck}

Key Uncertainties: ${analysis.probabilistic.keyUncertainties}

═══════════════════════════════════════════════════════════════════════
5️⃣  MANAGEMENT QUALITY
═══════════════════════════════════════════════════════════════════════

Capital Allocation: ${analysis.management.capitalAllocation}

Strategic Thinking: ${analysis.management.strategicThinking}

Assessment: ${analysis.management.overallAssessment}

═══════════════════════════════════════════════════════════════════════
6️⃣  INVESTMENT CONCLUSION
═══════════════════════════════════════════════════════════════════════

💡 Thesis: ${analysis.conclusion.investmentThesis}

⚠️  Risks: ${analysis.conclusion.keyRisks}

🔄 What Would Change: ${analysis.conclusion.whatWouldChange}

📊 Recommendation: ${analysis.conclusion.recommendation}

═══════════════════════════════════════════════════════════════════════
Data: SEC Filings via Financial Modeling Prep API
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
          <p className="text-sm text-gray-500">Powered by Financial Modeling Prep API</p>
        </div>

        {/* API Key Status & Settings */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border-2 border-purple-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {apiKeyStored ? (
                <>
                  <CheckCircle size={24} className="text-green-600" />
                  <span className="text-green-700 font-medium">API Key Configured</span>
                </>
              ) : (
                <>
                  <Key size={24} className="text-orange-600" />
                  <span className="text-orange-700 font-medium">API Key Required</span>
                </>
              )}
            </div>
            <button
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Settings size={18} />
              {apiKeyStored ? 'Change Key' : 'Add Key'}
            </button>
          </div>
          
          {showApiKeyInput && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-3">
                Get your free API key at <a href="https://financialmodelingprep.com/developer" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Financial Modeling Prep</a> (250 requests/day free)
              </p>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your FMP API key"
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={saveApiKey}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  Save
                </button>
                {apiKeyStored && (
                  <button
                    onClick={clearApiKey}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8 border-2 border-purple-200">
          <div className="flex gap-4">
            <input
              type="text"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isAnalyzing && analyzeCompany()}
              placeholder="Enter company name or ticker (e.g., Apple or AAPL)"
              disabled={isAnalyzing}
              className="flex-1 px-6 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:border-purple-500 disabled:bg-gray-100"
            />
            <button
              onClick={analyzeCompany}
              disabled={isAnalyzing || !companyInput.trim() || !apiKey}
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
          
          {loadingStep && (
            <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <div className="flex items-center gap-3">
                <Loader className="animate-spin text-blue-600" size={20} />
                <span className="text-blue-800 font-medium">{loadingStep}</span>
              </div>
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
              <p className="text-sm text-gray-500 mb-4">Fiscal Year: {analysis.fiscalYear} | Data: SEC Filings via FMP API</p>
              <p className="text-gray-700 text-lg leading-relaxed">{analysis.businessModel}</p>
            </div>

            {/* ROIC Analysis */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-green-200">
              <button
                onClick={() => toggleSection('roic')}
                className="w-full px-8 py-6 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 transition-all flex items-center justify-between border-b-2 border-green-200"
              >
                <div className="flex items-center gap-3">
                  <Calculator size={28} className="text-green-600" />
                  <h3 className="text-2xl font-bold text-gray-800">ROIC Analysis (Real SEC Data)</h3>
                </div>
                {expandedSections.roic ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.roic && (
                <div className="p-8 space-y-8">
                  {/* NOPAT */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
                    <h4 className="text-xl font-bold text-blue-900 mb-4">📈 NOPAT</h4>
                    <div className="space-y-2 text-gray-700">
                      <p><strong>EBIT:</strong> {analysis.roicAnalysis.nopat.ebit}</p>
                      <p><strong>Tax Rate:</strong> {analysis.roicAnalysis.nopat.taxRate}</p>
                      <div className="mt-4 p-4 bg-white rounded-lg border border-blue-300">
                        <p className="font-mono text-sm">{analysis.roicAnalysis.nopat.calculationShown}</p>
                        <p className="mt-2 text-lg font-bold text-blue-900">NOPAT = {analysis.roicAnalysis.nopat.nopatCalculated}</p>
                      </div>
                    </div>
                  </div>

                  {/* Invested Capital */}
                  <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6">
                    <h4 className="text-xl font-bold text-purple-900 mb-4">💰 Invested Capital</h4>
                    <div className="space-y-2 text-gray-700">
                      <p><strong>Method:</strong> {analysis.roicAnalysis.investedCapital.method}</p>
                      <div className="grid md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <p><strong>Current Assets:</strong> {analysis.roicAnalysis.investedCapital.currentAssets}</p>
                          <p><strong>Current Liabilities:</strong> {analysis.roicAnalysis.investedCapital.currentLiabilities}</p>
                          <p><strong>Net Working Capital:</strong> {analysis.roicAnalysis.investedCapital.netWorkingCapital}</p>
                        </div>
                        <div>
                          <p><strong>PP&E:</strong> {analysis.roicAnalysis.investedCapital.ppe}</p>
                          <p><strong>Goodwill:</strong> {analysis.roicAnalysis.investedCapital.goodwill}</p>
                          <p><strong>Intangibles:</strong> {analysis.roicAnalysis.investedCapital.intangibles}</p>
                        </div>
                      </div>
                      <div className="mt-4 p-4 bg-white rounded-lg border border-purple-300">
                        <p className="font-mono text-sm">{analysis.roicAnalysis.investedCapital.calculationShown}</p>
                        <p className="mt-2 text-lg font-bold text-purple-900">Total IC = {analysis.roicAnalysis.investedCapital.totalIC}</p>
                      </div>
                    </div>
                  </div>

                  {/* ROIC Result */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-4 border-green-400 rounded-xl p-8">
                    <h4 className="text-2xl font-bold text-green-900 mb-4">🎯 ROIC Calculation</h4>
                    <div className="space-y-4">
                      <p className="font-mono text-lg">{analysis.roicAnalysis.roicCalculated.calculation}</p>
                      <div className="text-4xl font-bold text-green-700 my-4">
                        ROIC = {analysis.roicAnalysis.roicCalculated.percentage}
                      </div>
                      <p className="text-gray-700">{analysis.roicAnalysis.roicCalculated.interpretation}</p>
                    </div>
                  </div>

                  {/* DuPont */}
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6">
                    <h4 className="text-xl font-bold text-yellow-900 mb-4">📊 DuPont Decomposition</h4>
                    <div className="space-y-2 text-gray-700">
                      <p><strong>Profit Margin:</strong> {analysis.roicAnalysis.dupontDecomposition.profitMargin}</p>
                      <p><strong>Capital Turnover:</strong> {analysis.roicAnalysis.dupontDecomposition.capitalTurnover}</p>
                      <p className="mt-3 p-3 bg-white rounded border border-yellow-300">{analysis.roicAnalysis.dupontDecomposition.validation}</p>
                      <p className="text-yellow-800 font-medium mt-3"><strong>Strategy:</strong> {analysis.roicAnalysis.dupontDecomposition.strategyInsight}</p>
                    </div>
                  </div>

                  {/* Value Creation */}
                  <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-6">
                    <h4 className="text-xl font-bold text-indigo-900 mb-4">💎 Value Creation Test</h4>
                    <div className="space-y-2 text-gray-700">
                      <p><strong>Estimated WACC:</strong> {analysis.roicAnalysis.valueCreation.estimatedWACC}</p>
                      <p><strong>Economic Spread:</strong> {analysis.roicAnalysis.valueCreation.spread}</p>
                      <div className="mt-4 p-4 bg-white rounded-lg border-2 border-indigo-400">
                        <p className="text-lg font-bold text-indigo-900">{analysis.roicAnalysis.valueCreation.verdict}</p>
                        <p className="mt-2 text-gray-700">{analysis.roicAnalysis.valueCreation.context}</p>
                      </div>
                    </div>
                  </div>

                  {/* Historical & Quality */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h5 className="font-bold text-gray-800 mb-2">📈 Historical Trend</h5>
                      <p className="text-sm text-gray-700">{analysis.roicAnalysis.historicalTrend}</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h5 className="font-bold text-gray-800 mb-2">📋 Data Quality</h5>
                      <p className="text-sm text-gray-700">{analysis.roicAnalysis.dataQuality}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Moat Analysis */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-blue-200">
              <button
                onClick={() => toggleSection('moat')}
                className="w-full px-8 py-6 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-all flex items-center justify-between border-b-2 border-blue-200"
              >
                <div className="flex items-center gap-3">
                  <Shield size={28} className="text-blue-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Competitive Moat Analysis</h3>
                </div>
                {expandedSections.moat ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.moat && (
                <div className="p-8 space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-bold text-blue-900 mb-2">Moat Type</h4>
                      <p className="text-gray-700">{analysis.moatAnalysis.moatType}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-bold text-blue-900 mb-2">Moat Strength</h4>
                      <p className="text-gray-700 font-semibold">{analysis.moatAnalysis.moatStrength}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-2">Evidence</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.moatAnalysis.evidenceForMoat}</p>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-2">Durability</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.moatAnalysis.moatDurability}</p>
                  </div>
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                    <h4 className="text-lg font-bold text-green-800 mb-2">🔗 Link to ROIC</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.moatAnalysis.linkToROIC}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Expectations */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-purple-200">
              <button
                onClick={() => toggleSection('expectations')}
                className="w-full px-8 py-6 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-all flex items-center justify-between border-b-2 border-purple-200"
              >
                <div className="flex items-center gap-3">
                  <TrendingUp size={28} className="text-purple-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Expectations Investing</h3>
                </div>
                {expandedSections.expectations ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.expectations && (
                <div className="p-8 space-y-6">
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-2">Implied Expectations</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.expectationsAnalysis.impliedExpectations}</p>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-2">Valuation</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.expectationsAnalysis.currentValuation}</p>
                  </div>
                  <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
                    <h4 className="text-lg font-bold text-purple-800 mb-2">📊 Scenarios</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.expectationsAnalysis.scenarioAnalysis}</p>
                  </div>
                  <div className="bg-pink-50 border-2 border-pink-200 rounded-xl p-4">
                    <h4 className="text-lg font-bold text-pink-800 mb-2">🎲 Probability Weighted</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.expectationsAnalysis.probabilityWeighted}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Probabilistic */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-orange-200">
              <button
                onClick={() => toggleSection('probabilistic')}
                className="w-full px-8 py-6 bg-gradient-to-r from-orange-50 to-yellow-50 hover:from-orange-100 hover:to-yellow-100 transition-all flex items-center justify-between border-b-2 border-orange-200"
              >
                <div className="flex items-center gap-3">
                  <Brain size={28} className="text-orange-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Probabilistic Thinking</h3>
                </div>
                {expandedSections.probabilistic ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.probabilistic && (
                <div className="p-8 space-y-6">
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                    <h4 className="text-lg font-bold text-blue-800 mb-2">📊 Base Rates</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.probabilistic.baseRates}</p>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-2">Skill vs Luck</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.probabilistic.skillVsLuck}</p>
                  </div>
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                    <h4 className="text-lg font-bold text-yellow-800 mb-2">⚠️ Key Uncertainties</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.probabilistic.keyUncertainties}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Management */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-cyan-200">
              <button
                onClick={() => toggleSection('management')}
                className="w-full px-8 py-6 bg-gradient-to-r from-cyan-50 to-teal-50 hover:from-cyan-100 hover:to-teal-100 transition-all flex items-center justify-between border-b-2 border-cyan-200"
              >
                <div className="flex items-center gap-3">
                  <Users size={28} className="text-cyan-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Management Quality</h3>
                </div>
                {expandedSections.management ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.management && (
                <div className="p-8 space-y-6">
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-2">Capital Allocation</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.management.capitalAllocation}</p>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-2">Strategic Thinking</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.management.strategicThinking}</p>
                  </div>
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                    <h4 className="text-lg font-bold text-green-800 mb-2">Overall Assessment</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.management.overallAssessment}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Conclusion */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-red-200">
              <button
                onClick={() => toggleSection('conclusion')}
                className="w-full px-8 py-6 bg-gradient-to-r from-red-50 to-pink-50 hover:from-red-100 hover:to-pink-100 transition-all flex items-center justify-between border-b-2 border-red-200"
              >
                <div className="flex items-center gap-3">
                  <Target size={28} className="text-red-600" />
                  <h3 className="text-2xl font-bold text-gray-800">Investment Conclusion</h3>
                </div>
                {expandedSections.conclusion ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </button>

              {expandedSections.conclusion && (
                <div className="p-8 space-y-6">
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-blue-900 mb-2">💡 Investment Thesis</h4>
                    <p className="text-gray-800 text-lg whitespace-pre-line">{analysis.conclusion.investmentThesis}</p>
                  </div>
                  <div className="border-2 border-red-200 rounded-xl p-6 bg-red-50">
                    <h4 className="text-lg font-bold text-red-900 mb-2">⚠️ Key Risks</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.conclusion.keyRisks}</p>
                  </div>
                  <div className="border-2 border-yellow-200 rounded-xl p-6 bg-yellow-50">
                    <h4 className="text-lg font-bold text-yellow-900 mb-2">🔄 What Would Change</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.conclusion.whatWouldChange}</p>
                  </div>
                  <div className="border-2 border-green-200 rounded-xl p-6 bg-green-50">
                    <h4 className="text-lg font-bold text-green-900 mb-2">📊 Recommendation</h4>
                    <p className="text-gray-700 whitespace-pre-line">{analysis.conclusion.recommendation}</p>
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

        {/* Footer */}
        {!isAnalyzing && !analysis && (
          <div className="text-center mt-12 space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-purple-200">
              <h3 className="text-2xl font-bold text-gray-800 mb-6">🚀 Fully Automated Financial Analysis</h3>
              <div className="grid md:grid-cols-4 gap-6 text-left">
                <div className="space-y-2">
                  <div className="text-3xl">🔍</div>
                  <h4 className="font-bold text-gray-800">Auto-Fetch</h4>
                  <p className="text-sm text-gray-600">Retrieves SEC filings via FMP API</p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl">🧮</div>
                  <h4 className="font-bold text-gray-800">Calculate ROIC</h4>
                  <p className="text-sm text-gray-600">Real math from actual financials</p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl">📊</div>
                  <h4 className="font-bold text-gray-800">DuPont Analysis</h4>
                  <p className="text-sm text-gray-600">Strategy decomposition</p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl">🎯</div>
                  <h4 className="font-bold text-gray-800">Full Framework</h4>
                  <p className="text-sm text-gray-600">Complete Mauboussin analysis</p>
                </div>
              </div>
            </div>
            
            <blockquote className="text-gray-600 italic text-lg">
              "The big money is not in the buying or selling, but in the waiting."
              <br />
              <span className="text-gray-500 text-base">— Charlie Munger</span>
            </blockquote>
          </div>
        )}
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
    </div>
  );
};

export default MauboussinAIAnalyzer;
