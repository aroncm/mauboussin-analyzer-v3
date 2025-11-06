// Vercel Serverless Function: /api/fmp.js
// This replaces the need for a separate backend server

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Get API key from environment variable
  const FMP_API_KEY = process.env.FMP_API_KEY;
  
  if (!FMP_API_KEY) {
    return res.status(500).json({ 
      error: 'API key not configured',
      message: 'Set FMP_API_KEY environment variable in Vercel settings'
    });
  }

  // Extract path from query parameters
  const { path, ...otherParams } = req.query;
  
  if (!path) {
    return res.status(400).json({ 
      error: 'Missing path parameter',
      usage: '/api/fmp?path=profile/AAPL'
    });
  }

  try {
    // Build FMP API URL
    const queryString = new URLSearchParams({
      ...otherParams,
      apikey: FMP_API_KEY
    }).toString();
    
    const fmpUrl = `https://financialmodelingprep.com/api/v3/${path}?${queryString}`;
    
    // Fetch from FMP API
    const response = await fetch(fmpUrl);
    
    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ 
        error: 'FMP API error',
        status: response.status,
        message: errorData.message || 'Failed to fetch from FMP API'
      });
    }
    
    const data = await response.json();
    
    // Return data
    res.status(200).json(data);
    
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
