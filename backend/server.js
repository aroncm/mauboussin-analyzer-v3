require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || '*'
    : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use('/api/', limiter);

// Get API key from environment variable
let API_KEY = process.env.FMP_API_KEY || '';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!API_KEY
  });
});

// Set API key endpoint (for development only)
app.post('/api/set-key', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ 
      error: 'API key must be set via environment variable in production' 
    });
  }
  
  API_KEY = req.body.apiKey;
  res.json({ success: true, message: 'API key set successfully' });
});

// Proxy endpoint for FMP API
app.get('/api/fmp/*', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ 
      error: 'API key not configured',
      message: 'Set FMP_API_KEY environment variable'
    });
  }

  // Extract the FMP endpoint from the request
  const fmpPath = req.params[0];
  const queryParams = new URLSearchParams(req.query);
  queryParams.append('apikey', API_KEY);
  
  const fmpUrl = `https://financialmodelingprep.com/api/v3/${fmpPath}?${queryParams.toString()}`;
  
  // Log in development, hide API key
  if (process.env.NODE_ENV !== 'production') {
    console.log('Proxying request to:', fmpUrl.replace(API_KEY, 'API_KEY_HIDDEN'));
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(fmpUrl);
    const data = await response.json();
    
    if (!response.ok) {
      console.error('FMP API error:', response.status, data);
      return res.status(response.status).json({ 
        error: 'FMP API error', 
        status: response.status,
        message: data.message || 'Failed to fetch from FMP API'
      });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch from FMP API', 
      message: error.message 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 FMP Proxy Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 API Key configured: ${API_KEY ? 'Yes' : 'No'}`);
  console.log(`\n✅ Server ready!\n`);
});
