import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Scout daily message quota
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'ttm_scout_quota';
const DAILY_LIMIT = 500;

// Bypass list — unlimited usage during testing
const BYPASS_USER_IDS = new Set<string>([
  // Add your Supabase user ID here to bypass limits during testing
  '__TEST_BYPASS__',
]);

interface QuotaRecord {
  date: string;   // YYYY-MM-DD
  count: number;
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY}_${userId}`;
}

/** Check whether the user is bypassed from quota limits. */
export function isQuotaBypassed(userId: string): boolean {
  return BYPASS_USER_IDS.has(userId);
}

/** Add a user ID to the bypass set (for testing). */
export function addQuotaBypass(userId: string): void {
  BYPASS_USER_IDS.add(userId);
}

/** Load today's usage count. */
async function loadRecord(userId: string): Promise<QuotaRecord> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) {
      const record = JSON.parse(raw) as QuotaRecord;
      if (record.date === todayKey()) return record;
    }
  } catch { /* fresh start */ }
  return { date: todayKey(), count: 0 };
}

/** Save today's usage count. */
async function saveRecord(userId: string, record: QuotaRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(record));
  } catch { /* non-fatal */ }
}

/** Get remaining messages for today. Returns Infinity for bypassed users. */
export async function getRemaining(userId: string): Promise<number> {
  if (isQuotaBypassed(userId)) return Infinity;
  const record = await loadRecord(userId);
  return Math.max(0, DAILY_LIMIT - record.count);
}

/** Check if user can send a message. */
export async function canSend(userId: string): Promise<boolean> {
  if (isQuotaBypassed(userId)) return true;
  const remaining = await getRemaining(userId);
  return remaining > 0;
}

/** Increment usage after a successful Scout message. Returns remaining count. */
export async function recordUsage(userId: string): Promise<number> {
  if (isQuotaBypassed(userId)) return Infinity;
  const record = await loadRecord(userId);
  record.count += 1;
  await saveRecord(userId, record);
  return Math.max(0, DAILY_LIMIT - record.count);
}

/** Get the daily limit constant. */
export function getDailyLimit(): number {
  return DAILY_LIMIT;
}
