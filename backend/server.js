import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import Stripe from 'stripe';
// import yahooFinance from 'yahoo-finance2'; // TEMPORARILY DISABLED due to v3 API issues

dotenv.config();

// Initialize Stripe (optional - only if keys are provided)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Initialize Sentry for error monitoring (production only)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
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

// Currency formatting function
const formatCurrency = (value, decimals = 1) => {
  if (!value || isNaN(value) || value === 0) return '$0';

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e12) {
    return `${sign}$${(absValue / 1e12).toFixed(decimals)}T`;
  } else if (absValue >= 1e9) {
    return `${sign}$${(absValue / 1e9).toFixed(decimals)}B`;
  } else if (absValue >= 1e6) {
    return `${sign}$${(absValue / 1e6).toFixed(decimals)}M`;
  } else if (absValue >= 1e3) {
    return `${sign}$${(absValue / 1e3).toFixed(decimals)}K`;
  }

  return `${sign}$${absValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// Trust proxy - Railway uses 1 proxy level
app.set('trust proxy', 1);

// Configure CORS with allowed origins
const allowedOrigins = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000', // Alternative dev port
  process.env.FRONTEND_URL // Production frontend URL
].filter(Boolean); // Remove undefined values

console.log('Allowed CORS origins:', allowedOrigins);
console.log('NODE_ENV:', process.env.NODE_ENV);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow localhost for development
    if (origin.startsWith('http://localhost:')) {
      console.log('CORS check - Origin:', origin, '| Allowed: true (localhost)');
      return callback(null, true);
    }

    // Allow all Vercel preview and production deployments
    if (origin.endsWith('.vercel.app')) {
      console.log('CORS check - Origin:', origin, '| Allowed: true (vercel.app)');
      return callback(null, true);
    }

    // Check against explicit allowed origins
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('CORS check - Origin:', origin, '| Allowed: true (explicit)');
      return callback(null, true);
    }

    console.log('CORS check - Origin:', origin, '| Allowed: false');
    callback(new Error('Not allowed by CORS'));
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
// TEMPORARILY DISABLED: Yahoo Finance v3 API integration issue
// Returns null values to not block analysis
app.get('/api/yf/quote/:symbol', cacheMiddleware, async (req, res) => {
  const { symbol } = req.params;

  console.log(`Yahoo Finance request for ${symbol} - returning null values (API temporarily disabled)`);

  // Return empty data to not block analysis
  res.json({
    marketCap: null,
    enterpriseValue: null,
    trailingPE: null,
    forwardPE: null,
    priceToBook: null,
    beta: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    sharesOutstanding: null,
    floatShares: null,
    averageVolume: null,
    currentPrice: null,
    currency: null
  });
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
Market Cap: ${formatCurrency(companyData.marketData.marketCap, 2)}
Enterprise Value: ${formatCurrency(companyData.marketData.enterpriseValue, 2)}
Current Price: ${companyData.marketData.currentPrice ? '$' + companyData.marketData.currentPrice.toFixed(2) : 'N/A'}
Trailing P/E: ${companyData.marketData.trailingPE?.toFixed(1) || 'N/A'}
Forward P/E: ${companyData.marketData.forwardPE?.toFixed(1) || 'N/A'}
Price-to-Book: ${companyData.marketData.priceToBook?.toFixed(2) || 'N/A'}
Beta: ${companyData.marketData.beta?.toFixed(2) || 'N/A'}
Shares Outstanding: ${formatCurrency(companyData.marketData.sharesOutstanding, 1)}
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
Revenue: ${formatCurrency(companyData.incomeStatement.revenue)}
Cost of Revenue: ${formatCurrency(companyData.incomeStatement.costOfRevenue)}
Gross Profit: ${formatCurrency(companyData.incomeStatement.grossProfit)}
Operating Expenses: ${formatCurrency(companyData.incomeStatement.operatingExpenses)}
Operating Income: ${formatCurrency(companyData.incomeStatement.operatingIncome)}
EBIT: ${formatCurrency(companyData.incomeStatement.ebit)}
Interest Expense: ${formatCurrency(companyData.incomeStatement.interestExpense)}
Tax Expense: ${formatCurrency(companyData.incomeStatement.taxExpense)}
Net Income: ${formatCurrency(companyData.incomeStatement.netIncome)}
Effective Tax Rate: ${(companyData.incomeStatement.taxRate * 100).toFixed(1)}%

BALANCE SHEET:
Total Assets: ${formatCurrency(companyData.balanceSheet.totalAssets)}
Current Assets: ${formatCurrency(companyData.balanceSheet.currentAssets)}
  - Cash: ${formatCurrency(companyData.balanceSheet.cash)}
  - Accounts Receivable: ${formatCurrency(companyData.balanceSheet.accountsReceivable)}
  - Inventory: ${formatCurrency(companyData.balanceSheet.inventory)}
PP&E (net): ${formatCurrency(companyData.balanceSheet.ppe)}
Goodwill: ${formatCurrency(companyData.balanceSheet.goodwill)}
Intangible Assets: ${formatCurrency(companyData.balanceSheet.intangibleAssets)}

Total Liabilities: ${formatCurrency(companyData.balanceSheet.totalLiabilities)}
Current Liabilities: ${formatCurrency(companyData.balanceSheet.currentLiabilities)}
  - Accounts Payable: ${formatCurrency(companyData.balanceSheet.accountsPayable)}
  - Short-term Debt: ${formatCurrency(companyData.balanceSheet.shortTermDebt)}
Long-term Debt: ${formatCurrency(companyData.balanceSheet.longTermDebt)}

Total Equity: ${formatCurrency(companyData.balanceSheet.totalEquity)}

CASH FLOW:
Operating Cash Flow: ${formatCurrency(companyData.cashFlow.operatingCashFlow)}
Capital Expenditures: ${formatCurrency(companyData.cashFlow.capitalExpenditures)}
Free Cash Flow: ${formatCurrency(companyData.cashFlow.freeCashFlow)}

${companyData.historicalData ? `
HISTORICAL DATA (${companyData.historicalData.yearsAvailable} years available):

Revenue Trend:
${companyData.historicalData.incomeStatements.map(yr => `  ${yr.fiscalYear}: ${formatCurrency(yr.revenue)} (Growth: ${yr.revenue > 0 ? 'calculated' : 'N/A'})`).join('\n')}

Operating Income Trend:
${companyData.historicalData.incomeStatements.map(yr => `  ${yr.fiscalYear}: ${formatCurrency(yr.operatingIncome)} (Margin: ${yr.revenue > 0 ? ((yr.operatingIncome / yr.revenue) * 100).toFixed(1) + '%' : 'N/A'})`).join('\n')}

Free Cash Flow Trend:
${companyData.historicalData.cashFlows.map(yr => `  ${yr.fiscalYear}: ${formatCurrency(yr.freeCashFlow)}`).join('\n')}

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

CURRENCY FORMATTING RULE: Format ALL currency values using:
- $X.XT for trillions (e.g., $2.5T)
- $X.XB for billions (e.g., $123.5B)
- $X.XM for millions (e.g., $456.7M)
- $X.XK for thousands (e.g., $789.2K)
Show 1 decimal place. Examples: "$45.2B", "$1.3T", "$789.5M"

{
  "companyName": "${companyData.companyName}",
  "ticker": "${companyData.ticker}",
  "businessModel": "2-3 sentence description of how the company makes money",
  "industry": "${companyData.industry}",
  "fiscalYear": "${companyData.fiscalPeriod}",

  "roicAnalysis": {
    "nopat": {
      "ebit": "Currency formatted (e.g., $45.2B)",
      "taxRate": "Percentage (e.g., 21.0%)",
      "nopatCalculated": "Currency formatted (e.g., $35.7B)",
      "calculationShown": "Show step with currency format: EBIT $45.2B × (1 - 21.0%) = NOPAT $35.7B"
    },
    "investedCapital": {
      "method": "Operating approach: NWC + Net Fixed Assets",
      "currentAssets": "Currency formatted (e.g., $123.5B)",
      "currentLiabilities": "Currency formatted (e.g., $78.2B)",
      "netWorkingCapital": "Currency formatted (e.g., $45.3B)",
      "ppe": "Currency formatted (e.g., $89.4B)",
      "goodwill": "Currency formatted (e.g., $12.3B)",
      "intangibles": "Currency formatted (e.g., $8.7B)",
      "totalIC": "Currency formatted total (e.g., $155.7B)",
      "calculationShown": "Show all components with currency format: NWC $45.3B + PP&E $89.4B + Goodwill $12.3B + Intangibles $8.7B = IC $155.7B",
      "alternativeMethod": "Also show with currency format: Total Equity + Total Debt - Excess Cash"
    },
    "roicCalculated": {
      "percentage": "ROIC as percentage (e.g., 22.9%)",
      "calculation": "Show with currency format: NOPAT $35.7B / IC $155.7B = 22.9%",
      "interpretation": "Assessment vs industry and cost of capital"
    },
    "dupontDecomposition": {
      "profitMargin": "NOPAT / Revenue as % (e.g., 18.5%)",
      "capitalTurnover": "Revenue / IC as ratio (e.g., 1.24x)",
      "validation": "Margin × Turnover = ROIC",
      "strategyInsight": "High margin (differentiation) or high turnover (cost leadership)?"
    },
    "valueCreation": {
      "estimatedWACC": "Estimated WACC as percentage (e.g., 8.5%)",
      "spread": "ROIC - WACC in percentage points (e.g., +14.4%)",
      "verdict": "Creating/destroying value? If possible show economic profit with currency format (e.g., Annual value creation: $22.3B)",
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

// ==================== STRIPE PAYMENT ENDPOINTS ====================

// Create Stripe checkout session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { successUrl, cancelUrl } = req.body;

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Mauboussin AI Analyzer - Unlimited Access',
              description: 'One-time payment for unlimited company analyses',
              images: ['https://your-domain.com/logo.png'], // Optional: Add your logo URL
            },
            unit_amount: 999, // $9.99 in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        product: 'unlimited_access',
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook handler
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return res.status(400).send('Webhook secret not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Payment successful:', session.id);
      // In a production app, you would:
      // 1. Store the payment in your database
      // 2. Associate it with a user account
      // 3. Send confirmation email
      break;
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent was successful:', paymentIntent.id);
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Verify payment status (optional - for additional security)
app.get('/api/verify-payment/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      paid: session.payment_status === 'paid',
      status: session.payment_status,
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
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
  console.log(`Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`Sentry monitoring: ${process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN ? 'enabled' : 'disabled'}`);
});
