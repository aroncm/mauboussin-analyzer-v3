import React, { useState, useEffect } from 'react';
import { Building2, TrendingUp, Shield, Users, Brain, Target, Search, Loader, AlertCircle, ChevronDown, ChevronUp, Copy, X, Calculator, Server } from 'lucide-react';

const MauboussinAIAnalyzer = () => {
  const [companyInput, setCompanyInput] = useState('');
  const [backendConnected, setBackendConnected] = useState(false);
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

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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

    if (!backendConnected) {
      setError('Backend server not connected. Please check your connection.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      // Step 1: Get company ticker if name was provided
      setLoadingStep('🔍 Looking up company ticker...');
      let ticker = companyInput.trim().toUpperCase();
      
      if (companyInput.includes(' ') || companyInput !== companyInput.toUpperCase()) {
        try {
          const searchResponse = await fetch(
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

      // Step 2: Fetch company profile
      setLoadingStep(`📊 Fetching ${ticker} company profile...`);
      const profileResponse = await fetch(`${BACKEND_URL}/api/av/overview/${ticker}`);

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch company profile. Check ticker symbol.');
      }

      const profileData = await profileResponse.json();
      
      if (!profileData || profileData.length === 0) {
        throw new Error(`No data found for ticker: ${ticker}`);
      }

      const profile = profileData[0];

      // Step 3: Fetch Income Statement
      setLoadingStep('📈 Fetching income statement from SEC filings...');
      const incomeResponse = await fetch(
        `${BACKEND_URL}/api/av/income-statement/${ticker}`
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
        `${BACKEND_URL}/api/av/balance-sheet/${ticker}`
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
        `${BACKEND_URL}/api/av/cash-flow/${ticker}`
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
          ebit: income.ebitda - (income.depreciationAndAmortization || 0),
          interestExpense: income.interestExpense,
          taxExpense: income.incomeTaxExpense,
          netIncome: income.netIncome,
          taxRate: income.incomeBeforeTax !== 0 ? income.incomeTaxExpense / income.incomeBeforeTax : 0.21
        },
        
        balanceSheet: {
          totalAssets: balance.totalAssets,
          currentAssets: balance.totalCurrentAssets,
          cash: balance.cashAndCashEquivalents,
          accountsReceivable: balance.netReceivables,
          inventory: balance.inventory,
          ppe: balance.propertyPlantEquipmentNet,
          goodwill: balance.goodwill || 0,
          intangibleAssets: balance.intangibleAssets || 0,
          
          totalLiabilities: balance.totalLiabilities,
          currentLiabilities: balance.totalCurrentLiabilities,
          accountsPayable: balance.accountPayables,
          shortTermDebt: balance.shortTermDebt || 0,
          longTermDebt: balance.longTermDebt || 0,
          
          totalEquity: balance.totalStockholdersEquity
        },
        
        cashFlow: {
          operatingCashFlow: cashFlow.operatingCashFlow,
          capitalExpenditures: Math.abs(cashFlow.capitalExpenditure || 0),
          freeCashFlow: cashFlow.freeCashFlow
        }
      };

      // Step 7: Perform Mauboussin Analysis using Backend API (which calls Claude)
      setLoadingStep('🧮 Calculating ROIC and applying Mauboussin framework...');
      
      const analysisResponse = await fetch(`${BACKEND_URL}/api/analyze`, {
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

        {/* Backend Status */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border-2 border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server size={24} className={backendConnected ? 'text-green-600' : 'text-red-600'} />
              <div>
                <span className={`font-medium ${backendConnected ? 'text-green-700' : 'text-red-700'}`}>
                  Backend Server: {backendConnected ? 'Connected ✅' : 'Not Connected ❌'}
                </span>
                {!backendConnected && (
                  <p className="text-sm text-gray-600 mt-1">
                    Check if your backend is running
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={checkBackendConnection}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
            >
              Retry Connection
            </button>
          </div>
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
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Evidence:</p>
                    <p className="text-gray-800">{analysis.moatAnalysis.evidenceForMoat}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Durability:</p>
                    <p className="text-gray-800">{analysis.moatAnalysis.moatDurability}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium mb-1">Link to ROIC:</p>
                    <p className="text-gray-800">{analysis.moatAnalysis.linkToROIC}</p>
                  </div>
                </div>
              )}
            </div>

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
                    <p className="text-gray-800">{analysis.expectationsAnalysis.scenarioAnalysis}</p>
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

        {/* Footer */}
        {!isAnalyzing && !analysis && (
          <div className="text-center mt-12 space-y-6">
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
