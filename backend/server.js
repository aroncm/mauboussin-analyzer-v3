import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import yahooFinance from 'yahoo-finance2';

dotenv.config();

// Initialize Sentry for error monitoring (production only)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      new ProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
  });
}

// Initialize cache with 1 hour TTL (3600 seconds)
// Financial data doesn't change frequently, so caching is safe
const cache = new NodeCache({
  stdTTL: 3600, // 1 hour default TTL
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false // Don't clone objects (better performance)
});

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS with allowed origins
const allowedOrigins = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000', // Alternative dev port
  process.env.FRONTEND_URL // Production frontend URL
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 analysis requests per windowMs (more expensive)
  message: 'Too many analysis requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Cache middleware - checks cache before proceeding to handler
const cacheMiddleware = (req, res, next) => {
  const cacheKey = req.originalUrl || req.url;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    console.log(`Cache hit: ${cacheKey}`);
    return res.json(cachedData);
  }

  // Store original res.json to intercept response
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    // Cache successful responses (status 200)
    if (res.statusCode === 200) {
      cache.set(cacheKey, data);
      console.log(`Cached: ${cacheKey}`);
    }
    return originalJson(data);
  };

  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    alphaVantageConfigured: !!process.env.ALPHA_VANTAGE_API_KEY,
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY
  });
});

// Search for company ticker
app.get('/api/av/search', cacheMiddleware, async (req, res) => {
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
app.get('/api/av/overview/:symbol', cacheMiddleware, async (req, res) => {
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
app.get('/api/av/income-statement/:symbol', cacheMiddleware, async (req, res) => {
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
app.get('/api/av/balance-sheet/:symbol', cacheMiddleware, async (req, res) => {
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
app.get('/api/av/cash-flow/:symbol', cacheMiddleware, async (req, res) => {
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

// Fetch market data from Yahoo Finance (market cap, beta, etc.)
app.get('/api/yf/quote/:symbol', cacheMiddleware, async (req, res) => {
  const { symbol } = req.params;

  try {
    const quote = await yahooFinance.quote(symbol);

    if (!quote) {
      return res.status(404).json({ error: 'Symbol not found in Yahoo Finance' });
    }

    // Extract relevant data
    const marketData = {
      marketCap: quote.marketCap,
      enterpriseValue: quote.enterpriseValue,
      trailingPE: quote.trailingPE,
      forwardPE: quote.forwardPE,
      priceToBook: quote.priceToBook,
      beta: quote.beta,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      sharesOutstanding: quote.sharesOutstanding,
      floatShares: quote.floatShares,
      averageVolume: quote.averageVolume,
      currentPrice: quote.regularMarketPrice,
      currency: quote.currency
    };

    res.json(marketData);
  } catch (error) {
    console.error('Error fetching Yahoo Finance data:', error);
    res.status(500).json({ error: 'Failed to fetch market data from Yahoo Finance' });
  }
});

// Fetch earnings call transcript (using financial modeling prep or similar)
app.get('/api/earnings-transcript/:symbol', cacheMiddleware, async (req, res) => {
  const { symbol } = req.params;

  try {
    // For now, we'll use Alpha Vantage earnings endpoint
    // In production, you might want to use a dedicated transcript service
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }

    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note) {
      return res.status(429).json({ error: 'API rate limit reached. Please wait a minute.' });
    }

    // Return quarterly and annual earnings
    res.json({
      quarterlyEarnings: data.quarterlyEarnings || [],
      annualEarnings: data.annualEarnings || []
    });
  } catch (error) {
    console.error('Error fetching earnings data:', error);
    res.status(500).json({ error: 'Failed to fetch earnings data' });
  }
});

// Analyze company using Anthropic API (with stricter rate limiting)
app.post('/api/analyze', strictLimiter, async (req, res) => {
  const { companyData } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  if (!companyData) {
    return res.status(400).json({ error: 'Company data is required' });
  }

  try {
    // Calculate WACC using CAPM if we have beta
    let waccSection = '';
    if (companyData.marketData && companyData.marketData.beta) {
      const riskFreeRate = 0.045; // Current 10-year Treasury yield ~4.5%
      const marketRiskPremium = 0.08; // Historical equity risk premium ~8%
      const beta = companyData.marketData.beta;
      const costOfEquity = riskFreeRate + (beta * marketRiskPremium);

      waccSection = `
CALCULATED COST OF EQUITY (CAPM):
Risk-Free Rate: ${(riskFreeRate * 100).toFixed(2)}%
Beta: ${beta.toFixed(2)}
Market Risk Premium: ${(marketRiskPremium * 100).toFixed(1)}%
Cost of Equity = ${(riskFreeRate * 100).toFixed(2)}% + (${beta.toFixed(2)} × ${(marketRiskPremium * 100).toFixed(1)}%) = ${(costOfEquity * 100).toFixed(2)}%

Note: Use this calculated cost of equity in your WACC estimation, adjusting for capital structure.`;
    }

    // Add market data section if available
    let marketDataSection = '';
    if (companyData.marketData) {
      marketDataSection = `
MARKET DATA (Yahoo Finance):
Market Cap: $${(companyData.marketData.marketCap / 1e9).toFixed(2)}B
Enterprise Value: $${(companyData.marketData.enterpriseValue / 1e9).toFixed(2)}B
Current Price: $${companyData.marketData.currentPrice?.toFixed(2) || 'N/A'}
Trailing P/E: ${companyData.marketData.trailingPE?.toFixed(1) || 'N/A'}
Forward P/E: ${companyData.marketData.forwardPE?.toFixed(1) || 'N/A'}
Price-to-Book: ${companyData.marketData.priceToBook?.toFixed(2) || 'N/A'}
Beta: ${companyData.marketData.beta?.toFixed(2) || 'N/A'}
Shares Outstanding: ${(companyData.marketData.sharesOutstanding / 1e6).toFixed(1)}M
${waccSection}`;
    }

    // Add earnings trend section if available
    let earningsSection = '';
    if (companyData.earningsData && companyData.earningsData.quarterlyEarnings) {
      const quarters = companyData.earningsData.quarterlyEarnings.slice(0, 4);
      const beatCount = quarters.filter(q => parseFloat(q.surprise || 0) > 0).length;
      const missCount = quarters.filter(q => parseFloat(q.surprise || 0) < 0).length;

      earningsSection = `
RECENT EARNINGS TREND & SENTIMENT (Last 4 Quarters):
${quarters.map((q, i) => {
  const surprise = parseFloat(q.surprise || 0);
  const sentiment = surprise > 2 ? '📈 Strong Beat' : surprise > 0 ? '✅ Beat' : surprise < -2 ? '📉 Big Miss' : '❌ Miss';
  return `Q${4-i} ${q.fiscalDateEnding}: EPS $${q.reportedEPS || 'N/A'} (Est: $${q.estimatedEPS || 'N/A'}) - Surprise: ${q.surprise || 'N/A'}% ${sentiment}`;
}).join('\n')}

Earnings Pattern: ${beatCount} beats, ${missCount} misses out of ${quarters.length} quarters
Track Record: ${beatCount >= 3 ? 'Consistently beating expectations 🟢' : beatCount >= 2 ? 'Mixed performance 🟡' : 'Struggling to meet expectations 🔴'}

**CRITICAL: Perform EARNINGS CALL SENTIMENT ANALYSIS**
Based on the earnings pattern above, provide a qualitative sentiment assessment:
- Management credibility (are they sandbagging guidance or overpromising?)
- Earnings quality (are beats driven by one-time items or sustainable operations?)
- Forward guidance tone (optimistic, cautious, or deteriorating?)
- Red flags (repeated misses, declining margins, weakening demand signals)
- Positive signals (consistent beats, margin expansion, strong guidance)`;
    }

    const prompt = `You are a strategic analyst using Michael Mauboussin's investment frameworks, specifically "Measuring the Moat" and competitive analysis principles.

=== FINANCIAL DATA FROM SEC FILING (via Alpha Vantage API) ===

Company: ${companyData.companyName} (${companyData.ticker})
Industry: ${companyData.industry}
Fiscal Year: ${companyData.fiscalPeriod}
Currency: ${companyData.currency}
${marketDataSection}
${earningsSection}

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

${companyData.historicalData ? `
HISTORICAL DATA (${companyData.historicalData.yearsAvailable} years available):

Revenue Trend:
${companyData.historicalData.incomeStatements.map(yr => `  ${yr.fiscalYear}: $${(yr.revenue / 1e6).toFixed(1)}M (Growth: ${yr.revenue > 0 ? 'calculated' : 'N/A'})`).join('\n')}

Operating Income Trend:
${companyData.historicalData.incomeStatements.map(yr => `  ${yr.fiscalYear}: $${(yr.operatingIncome / 1e6).toFixed(1)}M (Margin: ${yr.revenue > 0 ? ((yr.operatingIncome / yr.revenue) * 100).toFixed(1) + '%' : 'N/A'})`).join('\n')}

Free Cash Flow Trend:
${companyData.historicalData.cashFlows.map(yr => `  ${yr.fiscalYear}: $${(yr.freeCashFlow / 1e6).toFixed(1)}M`).join('\n')}

Gross Margin Trend:
${companyData.historicalData.incomeStatements.map(yr => `  ${yr.fiscalYear}: ${(yr.grossMargin * 100).toFixed(1)}%`).join('\n')}

Use this historical data to:
- Calculate ROIC for multiple years and identify trends
- Assess whether competitive advantages are strengthening or weakening
- Evaluate earnings quality and consistency
- Determine if growth is profitable (incremental ROIC analysis)
` : ''}

=== YOUR TASK ===

Perform a complete Mauboussin competitive analysis using the "Measuring the Moat" framework. Calculate ROIC precisely using the data above.

KEY FRAMEWORKS TO APPLY:

1. **MEASURING THE MOAT** (Mauboussin) - **PRIMARY FOCUS OF ANALYSIS**:
   - **CRITICAL**: Provide a comprehensive competitive moat assessment as the centerpiece of your analysis
   - Identify PRIMARY moat source: Network effects / Scale economies / Intangible assets / Switching costs / Cost advantages
   - Assess moat STRENGTH: Wide (sustainable 10+ years) / Narrow (5-10 years) / None (< 5 years)
   - Classify advantage type: Supply-side (scale, network) or Demand-side (brand, habit, search costs)
   - Evaluate moat TRAJECTORY: WIDENING (strengthening) / STABLE (maintaining) / NARROWING (weakening)
   - Provide QUANTITATIVE evidence: gross margins vs peers, customer retention rates, market share trends, pricing power metrics
   - Connect moat strength directly to sustained ROIC > WACC and explain the causal mechanism
   - Identify threats to the moat and timeline for potential erosion

2. **ROIC ANALYSIS**:
   - Calculate ROIC with precision, showing all steps
   - Use DuPont decomposition to understand drivers (margin vs turnover)
   - Compare ROIC to calculated WACC (use CAPM if beta provided)
   - Assess value creation: ROIC - WACC = Economic Profit spread

3. **EXPECTATIONS INVESTING**:
   - Reverse engineer what growth and ROIC the current valuation implies
   - Build scenarios: What needs to go RIGHT (bull), WRONG (bear), or STAY THE COURSE (base)
   - Probability-weight outcomes

4. **EARNINGS QUALITY** (if quarterly data provided):
   - Consistency of beat/miss patterns
   - Improving or deteriorating trajectory
   - Management credibility

CRITICAL REQUIREMENTS:
- Show all mathematical steps clearly using actual numbers provided
- Use the calculated CAPM cost of equity if beta is provided
- Base moat assessment on QUANTITATIVE evidence (margins, ROIC trends, market share)
- Return ONLY valid JSON with no markdown or code blocks

Your response MUST be valid JSON in this EXACT format:

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
      "calculatedWACC": "Use CAPM cost of equity if provided, adjust for debt. Show calculation.",
      "spread": "ROIC - WACC in percentage points",
      "verdict": "Creating/destroying value? Quantify economic profit if possible.",
      "context": "How does moat enable this ROIC?"
    },
    "historicalTrend": "Calculate ROIC for all available years. Is it improving, stable, or declining? What does this say about moat strength?",
    "incrementalROIC": "If multi-year data available: Are new investments generating good returns? (Change in NOPAT / Change in IC)",
    "dataQuality": "Confidence in the calculations (high/medium/low)"
  },
  
  "moatAnalysis": {
    "summary": "2-3 sentence executive summary of the competitive moat",
    "moatType": "Primary moat source (choose one or ranked combination): Network effects / Scale economies / Intangible assets (brand, patents) / Switching costs / Cost advantages",
    "moatStrength": "Wide (10+ years sustainable) / Narrow (5-10 years) / None (< 5 years) - with detailed justification",
    "moatStrengthRating": "Rate from 1-10 where 10 is an unassailable moat",
    "supplyOrDemandAdvantage": "Classify as: Supply-side (scale, network effects) or Demand-side (brand, habit, search costs) or Both",
    "evidenceForMoat": "QUANTITATIVE evidence REQUIRED: gross margins %, customer retention %, market share %, pricing power examples, historical stability",
    "moatDurability": "Trajectory: WIDENING (moat strengthening over time) / STABLE (maintaining position) / NARROWING (competitive threats eroding advantages)",
    "threatsToMoat": "Specific competitive threats and timeline for potential erosion (e.g., technological disruption, regulatory changes, new entrants)",
    "linkToROIC": "Detailed mechanism: how does this moat create pricing power, cost advantages, or capital efficiency that sustains ROIC > WACC?",
    "comparativeMoat": "How does this moat compare to key competitors? Better/Similar/Worse?",
    "measurability": "How easy is it to measure this moat objectively? High/Medium/Low with explanation"
  },

  "earningsCallSentiment": {
    "overallSentiment": "Positive / Neutral / Negative - based on recent earnings pattern",
    "managementCredibility": "High / Medium / Low - Are they sandbagging or overpromising? Track record of meeting guidance",
    "earningsQuality": "Sustainable / Mixed / Concerning - Are beats from operations or one-time items?",
    "forwardGuidance": "Optimistic / Cautious / Deteriorating - Tone and substance of management commentary",
    "beatMissPattern": "Detailed analysis of the X beats / Y misses pattern - what does it reveal?",
    "redFlags": "List specific red flags: repeated misses, margin pressure, weakening demand signals, accounting concerns",
    "positiveSignals": "List positive signals: consistent beats, margin expansion, strong guidance, market share gains",
    "sentimentScore": "Rate management credibility and earnings quality from 1-10 where 10 is impeccable",
    "applicableIfDataProvided": "Complete this section ONLY if quarterly earnings data was provided above"
  },
  
  "expectationsAnalysis": {
    "impliedExpectations": "What growth rate and ROIC is the current valuation pricing in? Work backwards from P/E or EV/EBITDA.",
    "currentValuation": "Use provided P/E, Price-to-Book, or calculate EV/EBITDA",
    "scenarioAnalysis": {
      "bull": "Optimistic case: assumptions and probability",
      "base": "Most likely case: assumptions and probability",
      "bear": "Pessimistic case: assumptions and probability"
    },
    "probabilityWeighted": "Expected value across scenarios",
    "marketView": "Is the market too optimistic, pessimistic, or about right?"
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

// Sentry error handler (must be before any other error middleware)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// Sentry error handler (must be after all controllers)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Alpha Vantage API key configured: ${!!process.env.ALPHA_VANTAGE_API_KEY}`);
  console.log(`Anthropic API key configured: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`Sentry monitoring: ${process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN ? 'enabled' : 'disabled'}`);
});
