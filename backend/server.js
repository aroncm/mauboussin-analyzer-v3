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

// Fetch company overview from Alpha Vantage
app.get('/api/company/:symbol', async (req, res) => {
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

    res.json(data);
  } catch (error) {
    console.error('Error fetching company data:', error);
    res.status(500).json({ error: 'Failed to fetch company data' });
  }
});

// Fetch income statement from Alpha Vantage
app.get('/api/income-statement/:symbol', async (req, res) => {
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

    res.json(data);
  } catch (error) {
    console.error('Error fetching income statement:', error);
    res.status(500).json({ error: 'Failed to fetch income statement' });
  }
});

// Fetch balance sheet from Alpha Vantage
app.get('/api/balance-sheet/:symbol', async (req, res) => {
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

    res.json(data);
  } catch (error) {
    console.error('Error fetching balance sheet:', error);
    res.status(500).json({ error: 'Failed to fetch balance sheet' });
  }
});

// NEW: Analyze company using Anthropic API
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
    const prompt = `You are a financial analyst applying Michael Mauboussin's investment frameworks to analyze companies. 

Here is the company financial data:

${JSON.stringify(companyData, null, 2)}

Please provide a comprehensive analysis following Mauboussin's framework:

1. **ROIC Analysis**
   - Calculate ROIC using the financial data provided
   - Show your calculations step-by-step
   - Perform DuPont analysis to understand drivers
   - Compare to WACC to test value creation

2. **Competitive Moat Analysis**
   Evaluate across these five dimensions:
   - Intangible Assets (brands, patents, regulatory)
   - Switching Costs (for customers)
   - Network Effects (does value increase with users?)
   - Cost Advantages (scale, location, unique assets)
   - Efficient Scale (limited competitive market)

3. **Expectations Analysis**
   - What expectations are baked into current valuation?
   - What needs to happen for stock to outperform?
   - What's priced in vs. what's likely?

4. **Probabilistic Thinking**
   - What are the key uncertainties?
   - Range of possible outcomes
   - Base rates for similar situations

5. **Management Quality**
   - Capital allocation track record
   - Incentive alignment
   - Communication quality

6. **Investment Conclusion**
   - Overall assessment
   - Key risks and opportunities
   - Is this a buy, hold, or avoid?

Format your response with clear headers and bullet points. Be specific and quantitative where possible.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
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
