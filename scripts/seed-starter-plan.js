/**
 * Upserts the one-time ₹1 starter plan (code STARTER_1RS).
 * Usage (from Magic-Formula-Backend, MONGO_URI in .env):
 *   npm run seed:starter
 *
 * Eligibility: set STARTER_OFFER_SINCE (ISO date, e.g. 2026-04-01) so only users
 * with createdAt >= that date see the starter plan. If unset, any user who has
 * never purchased it may see it (useful for local dev).
 */
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');

const Plan = require(path.join(__dirname, '../src/modules/subscription/plan.model'));

async function main () {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const doc = {
    title: 'New user — 1 month intro',
    code: 'STARTER_1RS',
    description: [
      'Full app access for 1 month',
      'One-time ₹1 offer for eligible new accounts'
    ],
    durationInMonths: 1,
    actualPrice: 999,
    discountedPrice: 1,
    isStarterOffer: true,
    isActive: true,
    showOfferBadge: true,
    offerText: 'One-time new user offer'
  };

  await Plan.findOneAndUpdate(
    { code: 'STARTER_1RS' },
    { $set: doc },
    { upsert: true, new: true }
  );

  console.log('Starter plan STARTER_1RS upserted.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
