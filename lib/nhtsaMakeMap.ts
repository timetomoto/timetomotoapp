// ---------------------------------------------------------------------------
// NHTSA make normalization
// ---------------------------------------------------------------------------

export const NHTSA_MAKE_MAP: Record<string, string> = {
  'harley': 'HARLEY-DAVIDSON',
  'hd': 'HARLEY-DAVIDSON',
  'h-d': 'HARLEY-DAVIDSON',
  'harley-davidson': 'HARLEY-DAVIDSON',
  'beemer': 'BMW',
  'bmw': 'BMW',
  'kawi': 'KAWASAKI',
  'kawasaki': 'KAWASAKI',
  'zuki': 'SUZUKI',
  'suzuki': 'SUZUKI',
  'yami': 'YAMAHA',
  'yamaha': 'YAMAHA',
  'duc': 'DUCATI',
  'ducati': 'DUCATI',
  'aprilia': 'APRILIA',
  'triumph': 'TRIUMPH',
  'ktm': 'KTM',
  'honda': 'HONDA',
  'indian': 'INDIAN',
  'zero': 'ZERO MOTORCYCLES',
  'zero motorcycles': 'ZERO MOTORCYCLES',
  'royal enfield': 'ROYAL ENFIELD',
  'moto guzzi': 'MOTO GUZZI',
  'husqvarna': 'HUSQVARNA',
  'gas gas': 'GAS GAS',
  'can-am': 'CAN-AM',
  'canam': 'CAN-AM',
  'cfmoto': 'CFMOTO',
  'benelli': 'BENELLI',
  'beta': 'BETA',
  'sherco': 'SHERCO',
};

export function normalizeNHTSAMake(make: string): string {
  const lower = make.toLowerCase().trim();
  return NHTSA_MAKE_MAP[lower] ?? make.toUpperCase();
}

/**
 * Score how well userModel matches an nhtsaModel.
 * Splits both into words and counts matching tokens (case-insensitive).
 */
export function modelMatchScore(userModel: string, nhtsaModel: string): number {
  const userWords  = userModel.toLowerCase().split(/\W+/).filter(Boolean);
  const nhtsaWords = new Set(nhtsaModel.toLowerCase().split(/\W+/).filter(Boolean));
  return userWords.reduce((acc, w) => acc + (nhtsaWords.has(w) ? 1 : 0), 0);
}

/**
 * Find the best-matching NHTSA model name from a list.
 * Returns the best match if score >= 1, otherwise returns the raw model.
 */
export function bestNHTSAModel(userModel: string, nhtsaModels: string[]): string {
  let best = { score: 0, model: userModel };
  for (const m of nhtsaModels) {
    const score = modelMatchScore(userModel, m);
    if (score > best.score) best = { score, model: m };
  }
  return best.score >= 1 ? best.model : userModel;
}
