import model from '../config/gemini.js';

const FALLBACK = {
  description: 'Could not analyze image',
  category: 'other',
  dominantColors: [],
  brand: null,
  uniqueFeatures: [],
  keywords: [],
  confidence: 0,
};

const PROMPT = `Analyze this image of a lost/found item. Return ONLY valid JSON (no markdown, no code blocks):
{
  "description": "brief description of the item",
  "category": "one of: electronics, clothing, books, id-cards, accessories, bags, sports, stationery, food, other",
  "dominantColors": ["color1", "color2"],
  "brand": "brand name if visible or null",
  "uniqueFeatures": ["feature1", "feature2"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "confidence": 0.95
}`;

export async function analyzeImage(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    return { ...FALLBACK, description: 'No image provided' };
  }

  try {
    const imageParts = imageUrls.map((url) => ({
      fileData: { mimeType: 'image/jpeg', fileUri: url },
    }));

    const result = await model.generateContent([PROMPT, ...imageParts]);
    const response = result.response;
    const text = response.text().trim();

    const cleaned = text.replace(/```json?\s*/gi, '').replace(/```\s*$/gi, '').trim();
    const analysis = JSON.parse(cleaned);

    return {
      description: analysis.description || FALLBACK.description,
      category: analysis.category || FALLBACK.category,
      dominantColors: analysis.dominantColors || FALLBACK.dominantColors,
      brand: analysis.brand || FALLBACK.brand,
      uniqueFeatures: analysis.uniqueFeatures || FALLBACK.uniqueFeatures,
      keywords: analysis.keywords || FALLBACK.keywords,
      confidence: analysis.confidence || FALLBACK.confidence,
    };
  } catch (error) {
    console.error('Gemini analysis error:', error.message);
    return { ...FALLBACK };
  }
}
