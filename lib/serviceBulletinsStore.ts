import { create } from 'zustand';
import { normalizeNHTSAMake, bestNHTSAModel } from './nhtsaMakeMap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NHTSARecall {
  NHTSACampaignNumber: string;
  Component: string;
  Summary: string;
  Consequence: string;
  Remedy: string;
  ReportReceivedDate: string;
  Manufacturer: string;
}

export interface NHTSAComplaint {
  odiNumber: number;
  components: string;
  summary: string;
  dateOfIncident: string;
  dateComplaintFiled: string;
  crash: boolean;
  fire: boolean;
  numberOfInjuries: number;
  numberOfDeaths: number;
}

export interface BulletinResult {
  fetchedAt: number;
  recalls: NHTSARecall[];
  complaints: NHTSAComplaint[];
  nhtsaMake: string;
  nhtsaModel: string;
  totalComplaints: number;
}

interface ServiceBulletinsStore {
  results: Record<string, BulletinResult>;
  loading: Record<string, boolean>;
  fetchBulletins: (year: string, make: string, model: string, vin?: string) => Promise<void>;
  clearCache: (key: string) => void;
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

export function bulletinKey(year: string, make: string, model: string): string {
  return `${year}-${make.toLowerCase()}-${model.toLowerCase()}`;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS   = 12_000;

// ---------------------------------------------------------------------------
// Fetch helper with timeout
// ---------------------------------------------------------------------------

async function fetchJSON(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) {
      // 404 often means "no data" for this vehicle — treat as empty, not error
      if (resp.status === 404) return { results: [] };
      throw new Error(`HTTP ${resp.status}`);
    }
    return await resp.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// NHTSA step helpers — each isolated so one failure doesn't break the rest
// ---------------------------------------------------------------------------

async function getNHTSAMake(year: string, rawMake: string): Promise<string> {
  const normalized = normalizeNHTSAMake(rawMake);
  try {
    const data = await fetchJSON(
      `https://api.nhtsa.gov/products/vehicle/makes?modelYear=${year}&issueType=r`,
    );
    const makes: string[] = (data?.results ?? []).map((r: any) =>
      (r.make ?? '').toUpperCase(),
    );
    const exact   = makes.find((m) => m === normalized);
    const partial = exact ?? makes.find((m) => m.includes(normalized) || normalized.includes(m));
    return partial ?? normalized;
  } catch {
    return normalized;
  }
}

async function getNHTSAModels(year: string, make: string): Promise<string[]> {
  try {
    const data = await fetchJSON(
      `https://api.nhtsa.gov/products/vehicle/models?modelYear=${year}&make=${encodeURIComponent(make)}&issueType=r`,
    );
    return (data?.results ?? []).map((r: any) => r.model as string).filter(Boolean);
  } catch {
    return [];
  }
}

async function getRecalls(make: string, model: string, year: string): Promise<NHTSARecall[]> {
  try {
    const data = await fetchJSON(
      `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`,
    );
    return (data?.results ?? []) as NHTSARecall[];
  } catch {
    return [];
  }
}

async function getComplaints(
  make: string,
  model: string,
  year: string,
): Promise<{ complaints: NHTSAComplaint[]; total: number }> {
  try {
    const data = await fetchJSON(
      `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`,
    );
    const all: NHTSAComplaint[] = (data?.results ?? []) as NHTSAComplaint[];
    const sorted = [...all].sort(
      (a, b) =>
        new Date(b.dateComplaintFiled || 0).getTime() -
        new Date(a.dateComplaintFiled || 0).getTime(),
    );
    return { complaints: sorted.slice(0, 10), total: all.length };
  } catch {
    return { complaints: [], total: 0 };
  }
}

async function getRecallsByVin(vin: string): Promise<NHTSARecall[]> {
  try {
    const data = await fetchJSON(
      `https://api.nhtsa.gov/recalls/recallsByVehicle?vin=${encodeURIComponent(vin)}`,
    );
    return (data?.results ?? []) as NHTSARecall[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useServiceBulletinsStore = create<ServiceBulletinsStore>((set, get) => ({
  results: {},
  loading: {},

  fetchBulletins: async (year, make, model, vin) => {
    const key = bulletinKey(year, make, model);

    const cached = get().results[key];
    if (cached && !cached.error && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;

    set((s) => ({ loading: { ...s.loading, [key]: true } }));

    // Step 1 — resolve NHTSA make
    const nhtsaMake = await getNHTSAMake(year, make);

    // Step 2 — fuzzy model match
    const nhtsaModels = await getNHTSAModels(year, nhtsaMake);
    const nhtsaModel  = bestNHTSAModel(model, nhtsaModels);

    // Steps 3 & 4 — recalls and complaints in parallel
    const [recalls, { complaints, total }] = await Promise.all([
      vin ? getRecallsByVin(vin) : getRecalls(nhtsaMake, nhtsaModel, year),
      getComplaints(nhtsaMake, nhtsaModel, year),
    ]);

    const result: BulletinResult = {
      fetchedAt: Date.now(),
      recalls,
      complaints,
      nhtsaMake,
      nhtsaModel,
      totalComplaints: total,
      error: null,
    };

    set((s) => ({
      results: { ...s.results, [key]: result },
      loading: { ...s.loading, [key]: false },
    }));
  },

  clearCache: (key) =>
    set((s) => {
      const results = { ...s.results };
      delete results[key];
      return { results };
    }),
}));
