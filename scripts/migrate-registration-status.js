/**
 * Backfill registrationStatus for existing users (all → approved).
 * Usage (from Magic-Formula-Backend, MONGO_URI in .env):
 *   node scripts/migrate-registration-status.js
 */
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');

const User = require(path.join(__dirname, '../src/modules/user/user.model'));

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const result = await User.updateMany(
    {
      $or: [
        { registrationStatus: { $exists: false } },
        { registrationStatus: null }
      ]
    },
    {
      $set: { registrationStatus: 'APPROVED' }
    }
  );

  console.log(
    `Migration complete: matched ${result.matchedCount}, modified ${result.modifiedCount} users → approved`
  );
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
