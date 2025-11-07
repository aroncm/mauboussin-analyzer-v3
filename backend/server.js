const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!ALPHA_VANTAGE_API_KEY
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Mauboussin Alpha Vantage API Proxy',
    status: 'running',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      api: '/api/av/*'
    },
    example: '/api/av/overview/AAPL'
  });
});

// Alpha Vantage proxy endpoint - Company Overview
app.get('/api/av/overview/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!ALPHA_VANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }

    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'OVERVIEW',
        symbol: symbol.toUpperCase(),
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    // Transform to FMP-like format for compatibility
    const data = response.data;
    
    if (!data.Symbol) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const transformed = [{
      symbol: data.Symbol,
      companyName: data.Name,
      currency: data.Currency || 'USD',
      exchange: data.Exchange,
      industry: data.Industry,
      sector: data.Sector,
      description: data.Description,
      ceo: data.CEO || 'N/A',
      country: data.Country,
      marketCap: parseFloat(data.MarketCapitalization) || 0,
      employees: parseInt(data.FullTimeEmployees) || 0
    }];

    res.json(transformed);
  } catch (error) {
    console.error('Alpha Vantage Overview Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch company overview',
      details: error.response?.data || error.message 
    });
  }
});

// Company Search
app.get('/api/av/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    if (!ALPHA_VANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }

    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'SYMBOL_SEARCH',
        keywords: query,
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    // Transform to FMP-like format
    const matches = response.data.bestMatches || [];
    const transformed = matches.slice(0, 5).map(match => ({
      symbol: match['1. symbol'],
      name: match['2. name'],
      type: match['3. type'],
      region: match['4. region'],
      currency: match['8. currency']
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Alpha Vantage Search Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to search companies',
      details: error.response?.data || error.message 
    });
  }
});

// Income Statement
app.get('/api/av/income-statement/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!ALPHA_VANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }

    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'INCOME_STATEMENT',
        symbol: symbol.toUpperCase(),
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    const data = response.data;
    
    if (!data.annualReports || data.annualReports.length === 0) {
      return res.status(404).json({ error: 'No income statement data found' });
    }

    // Get most recent annual report
    const report = data.annualReports[0];
    
    // Transform to FMP-like format
    const transformed = [{
      date: report.fiscalDateEnding,
      symbol: data.symbol,
      calendarYear: report.fiscalDateEnding.split('-')[0],
      revenue: parseFloat(report.totalRevenue) || 0,
      costOfRevenue: parseFloat(report.costOfRevenue) || 0,
      grossProfit: parseFloat(report.grossProfit) || 0,
      operatingExpenses: parseFloat(report.operatingExpenses) || 0,
      operatingIncome: parseFloat(report.operatingIncome) || 0,
      ebitda: parseFloat(report.ebitda) || 0,
      depreciationAndAmortization: parseFloat(report.depreciationAndAmortization) || 0,
      interestExpense: parseFloat(report.interestExpense) || 0,
      incomeTaxExpense: parseFloat(report.incomeTaxExpense) || 0,
      incomeBeforeTax: parseFloat(report.incomeBeforeTax) || 0,
      netIncome: parseFloat(report.netIncome) || 0
    }];

    res.json(transformed);
  } catch (error) {
    console.error('Alpha Vantage Income Statement Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch income statement',
      details: error.response?.data || error.message 
    });
  }
});

// Balance Sheet
app.get('/api/av/balance-sheet/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!ALPHA_VANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }

    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'BALANCE_SHEET',
        symbol: symbol.toUpperCase(),
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    const data = response.data;
    
    if (!data.annualReports || data.annualReports.length === 0) {
      return res.status(404).json({ error: 'No balance sheet data found' });
    }

    // Get most recent annual report
    const report = data.annualReports[0];
    
    // Transform to FMP-like format
    const transformed = [{
      date: report.fiscalDateEnding,
      symbol: data.symbol,
      calendarYear: report.fiscalDateEnding.split('-')[0],
      totalAssets: parseFloat(report.totalAssets) || 0,
      totalCurrentAssets: parseFloat(report.totalCurrentAssets) || 0,
      cashAndCashEquivalents: parseFloat(report.cashAndCashEquivalentsAtCarryingValue) || 0,
      netReceivables: parseFloat(report.currentNetReceivables) || 0,
      inventory: parseFloat(report.inventory) || 0,
      propertyPlantEquipmentNet: parseFloat(report.propertyPlantEquipment) || 0,
      goodwill: parseFloat(report.goodwill) || 0,
      intangibleAssets: parseFloat(report.intangibleAssets) || 0,
      totalLiabilities: parseFloat(report.totalLiabilities) || 0,
      totalCurrentLiabilities: parseFloat(report.totalCurrentLiabilities) || 0,
      accountPayables: parseFloat(report.currentAccountsPayable) || 0,
      shortTermDebt: parseFloat(report.shortTermDebt) || 0,
      longTermDebt: parseFloat(report.longTermDebt) || 0,
      totalStockholdersEquity: parseFloat(report.totalShareholderEquity) || 0
    }];

    res.json(transformed);
  } catch (error) {
    console.error('Alpha Vantage Balance Sheet Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch balance sheet',
      details: error.response?.data || error.message 
    });
  }
});

// Cash Flow Statement
app.get('/api/av/cash-flow/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!ALPHA_VANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }

    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'CASH_FLOW',
        symbol: symbol.toUpperCase(),
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    const data = response.data;
    
    if (!data.annualReports || data.annualReports.length === 0) {
      return res.status(404).json({ error: 'No cash flow data found' });
    }

    // Get most recent annual report
    const report = data.annualReports[0];
    
    // Transform to FMP-like format
    const transformed = [{
      date: report.fiscalDateEnding,
      symbol: data.symbol,
      calendarYear: report.fiscalDateEnding.split('-')[0],
      operatingCashFlow: parseFloat(report.operatingCashflow) || 0,
      capitalExpenditure: Math.abs(parseFloat(report.capitalExpenditures)) || 0,
      freeCashFlow: (parseFloat(report.operatingCashflow) || 0) - Math.abs(parseFloat(report.capitalExpenditures) || 0)
    }];

    res.json(transformed);
  } catch (error) {
    console.error('Alpha Vantage Cash Flow Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch cash flow statement',
      details: error.response?.data || error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Mauboussin Alpha Vantage API Proxy running on port ${PORT}`);
  console.log(`✅ Alpha Vantage API Key: ${ALPHA_VANTAGE_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
});
