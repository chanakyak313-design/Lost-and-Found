import Item from '../models/Item.js';
import Match from '../models/Match.js';
import { createMatch } from './matchService.js';

/**
 * Calculate distance between two [longitude, latitude] coordinates.
 * Returns distance in kilometers.
 */
function calculateDistance(coord1, coord2) {
  if (
    !Array.isArray(coord1) ||
    !Array.isArray(coord2) ||
    coord1.length < 2 ||
    coord2.length < 2
  ) {
    return Infinity;
  }

  const [lng1, lat1] = coord1.map(Number);
  const [lng2, lat2] = coord2.map(Number);

  if (
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng2) ||
    !Number.isFinite(lat2)
  ) {
    return Infinity;
  }

  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

/**
 * Normalize text before comparison.
 */
function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert text into useful words.
 */
function getWords(text = '') {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'is',
    'was',
    'were',
    'near',
    'at',
    'in',
    'on',
    'of',
    'to',
    'with',
    'for',
    'my',
    'this',
    'that',
    'found',
    'lost',
  ]);

  return normalizeText(text)
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 &&
        !stopWords.has(word)
    );
}

/**
 * Calculate similarity between two text fields.
 */
function textSimilarity(text1 = '', text2 = '') {
  const words1 = new Set(getWords(text1));
  const words2 = new Set(getWords(text2));

  if (
    words1.size === 0 ||
    words2.size === 0
  ) {
    return 0;
  }

  let overlap = 0;

  for (const word of words1) {
    if (words2.has(word)) {
      overlap++;
    }
  }

  return (
    overlap /
    Math.max(words1.size, words2.size)
  );
}

/**
 * Calculate similarity between AI keywords.
 */
function keywordSimilarity(
  keywords1 = [],
  keywords2 = []
) {
  if (
    !Array.isArray(keywords1) ||
    !Array.isArray(keywords2) ||
    keywords1.length === 0 ||
    keywords2.length === 0
  ) {
    return 0;
  }

  const set1 = new Set(
    keywords1.map((keyword) =>
      normalizeText(keyword)
    )
  );

  const set2 = new Set(
    keywords2.map((keyword) =>
      normalizeText(keyword)
    )
  );

  let overlap = 0;

  for (const keyword of set1) {
    if (set2.has(keyword)) {
      overlap++;
    }
  }

  return (
    overlap /
    Math.max(set1.size, set2.size)
  );
}

/**
 * Calculate similarity between AI-detected colors.
 */
function colorSimilarity(
  colors1 = [],
  colors2 = []
) {
  if (
    !Array.isArray(colors1) ||
    !Array.isArray(colors2) ||
    colors1.length === 0 ||
    colors2.length === 0
  ) {
    return 0;
  }

  const normalized1 = colors1.map(
    (color) => normalizeText(color)
  );

  const normalized2 = colors2.map(
    (color) => normalizeText(color)
  );

  let overlap = 0;

  for (const color of normalized1) {
    if (normalized2.includes(color)) {
      overlap++;
    }
  }

  return (
    overlap /
    Math.max(
      normalized1.length,
      normalized2.length
    )
  );
}

/**
 * Calculate the overall match score.
 *
 * Category       = 25
 * Title          = 15
 * Description    = 20
 * AI colors      = 15
 * Brand          = 10
 * AI keywords    = 10
 * Location       = 5
 *
 * Maximum = 100
 */
function calculateScore(item1, item2) {
  let score = 0;
  const reasons = [];

  // CATEGORY — 25 points
  const category1 = normalizeText(
    item1.category
  );

  const category2 = normalizeText(
    item2.category
  );

  if (
    category1 &&
    category2 &&
    category1 === category2
  ) {
    score += 25;
    reasons.push('Same category');
  } else if (
    category1 &&
    category2 &&
    category1 !== 'other' &&
    category2 !== 'other'
  ) {
    return {
      score: 0,
      reasons: [],
    };
  }

  // TITLE — 15 points
  const titleScore = textSimilarity(
    item1.title,
    item2.title
  );

  score += titleScore * 15;

  if (titleScore >= 0.5) {
    reasons.push('Very similar title');
  } else if (titleScore > 0) {
    reasons.push('Similar title');
  }

  // DESCRIPTION — 20 points
  const descriptionScore =
    textSimilarity(
      item1.description,
      item2.description
    );

  score += descriptionScore * 20;

  if (descriptionScore >= 0.5) {
    reasons.push(
      'Very similar description'
    );
  } else if (descriptionScore >= 0.25) {
    reasons.push(
      'Similar description'
    );
  }

  // AI COLORS — 15 points
  const colors1 =
    item1.aiAnalysis?.dominantColors || [];

  const colors2 =
    item2.aiAnalysis?.dominantColors || [];

  const colorScore =
    colorSimilarity(
      colors1,
      colors2
    );

  score += colorScore * 15;

  if (colorScore > 0) {
    reasons.push('Similar colors');
  }

  // BRAND — 10 points
  const brand1 = normalizeText(
    item1.aiAnalysis?.brand || ''
  );

  const brand2 = normalizeText(
    item2.aiAnalysis?.brand || ''
  );

  if (
    brand1 &&
    brand2 &&
    brand1 === brand2
  ) {
    score += 10;
    reasons.push('Same brand');
  }

  // AI KEYWORDS — 10 points
  const keywords1 =
    item1.aiAnalysis?.keywords || [];

  const keywords2 =
    item2.aiAnalysis?.keywords || [];

  const keywordScore =
    keywordSimilarity(
      keywords1,
      keywords2
    );

  score += keywordScore * 10;

  if (keywordScore > 0) {
    reasons.push(
      'Similar item features'
    );
  }

  // LOCATION — 5 points
  const coordinates1 =
    item1.location?.coordinates;

  const coordinates2 =
    item2.location?.coordinates;

  if (
    coordinates1 &&
    coordinates2
  ) {
    const distance =
      calculateDistance(
        coordinates1,
        coordinates2
      );

    if (distance <= 0.5) {
      score += 5;
      reasons.push(
        'Very close location'
      );
    } else if (distance <= 2) {
      score += 3;
      reasons.push(
        'Nearby location'
      );
    } else if (distance <= 5) {
      score += 1;
      reasons.push(
        'Same general area'
      );
    }
  }

  return {
    score: Math.round(
      Math.min(score, 100)
    ),
    reasons,
  };
}

/**
 * Check whether a match already exists
 * between two items.
 */
async function matchAlreadyExists(
  lostItemId,
  foundItemId
) {
  return Match.exists({
    $or: [
      {
        lostItem: lostItemId,
        foundItem: foundItemId,
      },
      {
        lostItem: foundItemId,
        foundItem: lostItemId,
      },
    ],
    status: {
      $nin: [
        'rejected',
        'cancelled',
      ],
    },
  });
}

/**
 * Find possible matches for an item.
 */
export async function findMatches(
  item,
  io
) {
  const oppositeType =
    item.type === 'lost'
      ? 'found'
      : 'lost';

  const candidates =
    await Item.find({
      type: oppositeType,
      status: 'open',
      _id: {
        $ne: item._id,
      },
    });

  const matches = [];

  for (const candidate of candidates) {
    const {
      score,
      reasons,
    } = calculateScore(
      item,
      candidate
    );

    if (score >= 50) {
      matches.push({
        item: candidate,
        score,
        reasons,
      });
    }
  }

  // Highest score first
  matches.sort(
    (a, b) =>
      b.score - a.score
  );

  // Keep top five
  const topMatches =
    matches.slice(0, 5);

  /*
   * Create a Match document only if:
   *
   * 1. A strong match exists
   * 2. The pair has never already been matched
   */
  if (
    topMatches.length > 0 &&
    topMatches[0].score >= 50
  ) {
    const best =
      topMatches[0];

    let lostItem;
    let foundItem;

    if (item.type === 'lost') {
      lostItem = item;
      foundItem = best.item;
    } else {
      lostItem = best.item;
      foundItem = item;
    }

    const existingMatch =
      await matchAlreadyExists(
        lostItem._id,
        foundItem._id
      );

    if (existingMatch) {
      console.log(
        `Match already exists for items ${lostItem._id} and ${foundItem._id}`
      );
    } else {
      try {
        await createMatch(
          lostItem,
          foundItem,
          best.score,
          best.reasons,
          io
        );

        console.log(
          `New match created: ${best.score}%`
        );
      } catch (error) {
        console.error(
          'Failed to create match:',
          error.message
        );
      }
    }
  }

  return topMatches;
}