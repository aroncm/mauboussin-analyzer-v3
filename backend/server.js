import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    alphaVantageConfigured: !!process.env.ALPHA_VANTAGE_API_KEY,
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY
  });
});

// Search for company ticker
app.get('/api/av/search', async (req, res) => {
  const { query } = req.query;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
  }

  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      return res.status(429).json({ error: 'API rate limit reached. Please wait a minute.' });
    }

    res.json(data.bestMatches || []);
  } catch (error) {
    console.error('Error searching company:', error);
    res.status(500).json({ error: 'Failed to search company' });
  }
});

// Fetch company overview
app.get('/api/av/overview/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
  }

  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      return res.status(429).json({ error: 'API rate limit reached. Please wait a minute.' });
    }

    if (!data.Symbol) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json([data]);
  } catch (error) {
    console.error('Error fetching company data:', error);
    res.status(500).json({ error: 'Failed to fetch company data' });
  }
});

// Fetch income statement
app.get('/api/av/income-statement/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
  }

  try {
    const url = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      return res.status(429).json({ error: 'API rate limit reached. Please wait a minute.' });
    }

    res.json(data.annualReports || []);
  } catch (error) {
    console.error('Error fetching income statement:', error);
    res.status(500).json({ error: 'Failed to fetch income statement' });
  }
});

// Fetch balance sheet
app.get('/api/av/balance-sheet/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
  }

  try {
    const url = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      return res.status(429).json({ error: 'API rate limit reached. Please wait a minute.' });
    }

    res.json(data.annualReports || []);
  } catch (error) {
    console.error('Error fetching balance sheet:', error);
    res.status(500).json({ error: 'Failed to fetch balance sheet' });
  }
});

// Fetch cash flow statement
app.get('/api/av/cash-flow/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
  }

  try {
    const url = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      return res.status(429).json({ error: 'API rate limit reached. Please wait a minute.' });
    }

    res.json(data.annualReports || []);
  } catch (error) {
    console.error('Error fetching cash flow statement:', error);
    res.status(500).json({ error: 'Failed to fetch cash flow statement' });
  }
});

// Analyze company using Anthropic API
app.post('/api/analyze', async (req, res) => {
  const { companyData } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  if (!companyData) {
    return res.status(400).json({ error: 'Company data is required' });
  }

  try {
    const prompt = `You are a strategic analyst using Michael Mauboussin's investment frameworks.

=== FINANCIAL DATA FROM SEC FILING (via Alpha Vantage API) ===

Company: ${companyData.companyName} (${companyData.ticker})
Industry: ${companyData.industry}
Fiscal Year: ${companyData.fiscalPeriod}
Currency: ${companyData.currency}

INCOME STATEMENT:
Revenue: ${(companyData.incomeStatement.revenue / 1e6).toFixed(1)}M
Cost of Revenue: ${(companyData.incomeStatement.costOfRevenue / 1e6).toFixed(1)}M
Gross Profit: ${(companyData.incomeStatement.grossProfit / 1e6).toFixed(1)}M
Operating Expenses: ${(companyData.incomeStatement.operatingExpenses / 1e6).toFixed(1)}M
Operating Income: ${(companyData.incomeStatement.operatingIncome / 1e6).toFixed(1)}M
EBIT: ${(companyData.incomeStatement.ebit / 1e6).toFixed(1)}M
Interest Expense: ${(companyData.incomeStatement.interestExpense / 1e6).toFixed(1)}M
Tax Expense: ${(companyData.incomeStatement.taxExpense / 1e6).toFixed(1)}M
Net Income: ${(companyData.incomeStatement.netIncome / 1e6).toFixed(1)}M
Effective Tax Rate: ${(companyData.incomeStatement.taxRate * 100).toFixed(1)}%

BALANCE SHEET:
Total Assets: ${(companyData.balanceSheet.totalAssets / 1e6).toFixed(1)}M
Current Assets: ${(companyData.balanceSheet.currentAssets / 1e6).toFixed(1)}M
  - Cash: ${(companyData.balanceSheet.cash / 1e6).toFixed(1)}M
  - Accounts Receivable: ${(companyData.balanceSheet.accountsReceivable / 1e6).toFixed(1)}M
  - Inventory: ${(companyData.balanceSheet.inventory / 1e6).toFixed(1)}M
PP&E (net): ${(companyData.balanceSheet.ppe / 1e6).toFixed(1)}M
Goodwill: ${(companyData.balanceSheet.goodwill / 1e6).toFixed(1)}M
Intangible Assets: ${(companyData.balanceSheet.intangibleAssets / 1e6).toFixed(1)}M

Total Liabilities: ${(companyData.balanceSheet.totalLiabilities / 1e6).toFixed(1)}M
Current Liabilities: ${(companyData.balanceSheet.currentLiabilities / 1e6).toFixed(1)}M
  - Accounts Payable: ${(companyData.balanceSheet.accountsPayable / 1e6).toFixed(1)}M
  - Short-term Debt: ${(companyData.balanceSheet.shortTermDebt / 1e6).toFixed(1)}M
Long-term Debt: ${(companyData.balanceSheet.longTermDebt / 1e6).toFixed(1)}M

Total Equity: ${(companyData.balanceSheet.totalEquity / 1e6).toFixed(1)}M

CASH FLOW:
Operating Cash Flow: ${(companyData.cashFlow.operatingCashFlow / 1e6).toFixed(1)}M
Capital Expenditures: ${(companyData.cashFlow.capitalExpenditures / 1e6).toFixed(1)}M
Free Cash Flow: ${(companyData.cashFlow.freeCashFlow / 1e6).toFixed(1)}M

=== YOUR TASK ===

Perform a complete Mauboussin competitive analysis. Calculate ROIC precisely using the data above.

CRITICAL: Show all mathematical steps clearly. Use the actual numbers provided.

Your response MUST be valid JSON in this EXACT format (no additional text, no markdown, no code blocks):

{
  "companyName": "${companyData.companyName}",
  "ticker": "${companyData.ticker}",
  "businessModel": "2-3 sentence description of how the company makes money",
  "industry": "${companyData.industry}",
  "fiscalYear": "${companyData.fiscalPeriod}",
  
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

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, just pure JSON.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Anthropic API error:', errorData);
      return res.status(response.status).json({ 
        error: 'Failed to analyze company',
        details: errorData
      });
    }

    const analysisData = await response.json();
    const analysisText = analysisData.content[0].text;

    res.json({ analysis: analysisText });
  } catch (error) {
    console.error('Error analyzing company:', error);
    res.status(500).json({ error: 'Failed to analyze company' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Alpha Vantage API key configured: ${!!process.env.ALPHA_VANTAGE_API_KEY}`);
  console.log(`Anthropic API key configured: ${!!process.env.ANTHROPIC_API_KEY}`);
});
