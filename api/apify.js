// /api/apify.js
// Serverless proxy for Apify — keeps APIFY_KEY secret on the server.
// Deploy this file inside an `api/` folder at your project root on Vercel.
// In Vercel dashboard: Settings -> Environment Variables -> add APIFY_KEY (your real token).

export default async function handler(req, res) {
  // Basic CORS (same-origin requests from your own site only need this if you
  // ever call it from a different domain — harmless to leave in)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const APIFY_TOKEN = process.env.APIFY_KEY;
  if (!APIFY_TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: APIFY_KEY missing in environment.' });
  }

  try {
    const { action } = req.method === 'GET' ? req.query : req.body;

    // ---- 1. START A RUN ----
    // POST /api/apify  { action: "runActor", actor: "trudax~reddit-scraper", input: {...} }
    if (action === 'runActor') {
      const { actor, input } = req.body;
      if (!actor || !input) {
        return res.status(400).json({ error: 'Missing actor or input' });
      }
      const r = await fetch(
        `https://api.apify.com/v2/acts/${actor}/runs?token=${APIFY_TOKEN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        }
      );
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    // ---- 2. CHECK RUN STATUS ----
    // GET /api/apify?action=runStatus&runId=xxx
    if (action === 'runStatus') {
      const { runId } = req.query;
      if (!runId) return res.status(400).json({ error: 'Missing runId' });
      const r = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    // ---- 3. GET DATASET ITEMS ----
    // GET /api/apify?action=datasetItems&datasetId=xxx&limit=50
    if (action === 'datasetItems') {
      const { datasetId, limit } = req.query;
      if (!datasetId) return res.status(400).json({ error: 'Missing datasetId' });
      const r = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=${limit || 50}`
      );
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    return res.status(400).json({ error: 'Unknown or missing action' });
  } catch (err) {
    return res.status(500).json({ error: 'Proxy error', detail: err.message });
  }
}
