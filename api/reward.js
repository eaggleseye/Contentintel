/**
 * /api/reward.js
 * 
 * Serverless function to verify ad completion and grant Pro access
 * Called by frontend after user watches ad + clicks X
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin using service account from Vercel env var
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    // 1. VERIFY FIREBASE ID TOKEN
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;

    // 2. CHECK DAILY AD LIMIT (max 2 per day)
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      await userRef.set({
        email: userEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        adsWatchedToday: 0,
        lastAdDate: new Date().toDateString(),
      });
    }

    const userData = userDoc.data() || {};
    const today = new Date().toDateString();
    const lastAdDate = userData.lastAdDate || '';
    
    let adsWatchedToday = userData.adsWatchedToday || 0;

    // Reset counter if date changed
    if (lastAdDate !== today) {
      adsWatchedToday = 0;
    }

    // Check daily limit
    if (adsWatchedToday >= 2) {
      return res.status(429).json({
        error: 'Daily ad limit reached',
        message: 'You can watch 2 ads per day. Come back tomorrow!',
        adsWatchedToday,
      });
    }

    // 3. CALCULATE NEW PRO EXPIRY
    const now = new Date();
    const currentProExpiry = userData.proExpiresAt ? new Date(userData.proExpiresAt) : null;
    const baseTime = currentProExpiry && currentProExpiry > now ? currentProExpiry : now;
    const newProExpiry = new Date(baseTime.getTime() + 30 * 60 * 1000);

    // 4. UPDATE FIRESTORE
    await userRef.update({
      adsWatchedToday: adsWatchedToday + 1,
      lastAdDate: today,
      proExpiresAt: newProExpiry.toISOString(),
      lastAdWatchedAt: admin.firestore.FieldValue.serverTimestamp(),
      adWatchHistory: admin.firestore.FieldValue.arrayUnion({
        watchedAt: new Date().toISOString(),
        proGrantedUntil: newProExpiry.toISOString(),
      }),
    });

    // 5. RETURN SUCCESS
    return res.status(200).json({
      success: true,
      message: 'Pro access granted for 30 minutes',
      proExpiresAt: newProExpiry.toISOString(),
      adsWatchedToday: adsWatchedToday + 1,
    });

  } catch (error) {
    console.error('Reward endpoint error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message,
    });
  }
};
