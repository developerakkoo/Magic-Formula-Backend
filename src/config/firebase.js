const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  const serviceAccountFileName = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || 'magic-formula-d55e8-firebase-adminsdk-fbsvc-f0f70a2c7c.json';
  const serviceAccountPath = path.join(process.cwd(), serviceAccountFileName);
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
