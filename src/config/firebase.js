const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  const serviceAccountPath = path.join(process.cwd(), 'firebase.json');
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
