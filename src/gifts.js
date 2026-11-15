'use strict';
// Common gift catalogue (diamonds = per-unit coin value).
const GIFTS = [
  { name: 'Rose', diamonds: 1 },
  { name: 'TikTok', diamonds: 1 },
  { name: 'GG', diamonds: 1 },
  { name: 'Finger Heart', diamonds: 5 },
  { name: 'Perfume', diamonds: 20 },
  { name: 'Doughnut', diamonds: 30 },
  { name: 'Hand Hearts', diamonds: 100 },
  { name: 'Corgi', diamonds: 299 },
  { name: 'Money Gun', diamonds: 500 },
  { name: 'Galaxy', diamonds: 1000 },
  { name: 'Lion', diamonds: 29999 },
  { name: 'Universe', diamonds: 44999 },
];

function findGift(name) {
  const n = String(name || '').toLowerCase();
  return GIFTS.find((g) => g.name.toLowerCase() === n) || null;
}

module.exports = { GIFTS, findGift };
