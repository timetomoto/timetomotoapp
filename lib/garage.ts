import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface MaintenanceRecord {
  id: string;
  bikeId: string;
  title: string;
  maintenanceType: string;
  date: string;
  mileage?: number;
  cost?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Modification {
  id: string;
  bikeId: string;
  title: string;
  brand?: string;
  category: string;
  dateInstalled?: string;
  cost?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GarageDocument {
  id: string;
  bikeId: string;
  title: string;
  documentType: string;
  fileURL?: string;
  dateAdded: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const MAINTENANCE_TYPES = [
  'Oil Change',
  'Chain Adjustment',
  'Chain Replacement',
  'Brake Pads',
  'Brake Fluid',
  'Coolant',
  'Tire Replacement',
  'Spark Plugs',
  'Battery',
  'Air Filter',
  'Valve Adjustment',
  'Suspension Service',
  'Inspection',
  'Other',
];

export const MODIFICATION_CATEGORIES = [
  'Exhaust',
  'ECU',
  'Suspension',
  'Lighting',
  'Bodywork',
  'Brakes',
  'Electronics',
  'Protection',
  'Comfort',
  'Other',
];

export const DOCUMENT_TYPES = [
  'Receipt',
  'Manual',
  'Insurance',
  'Registration',
  'Warranty',
  'Photo',
  'Other',
];

// ---------------------------------------------------------------------------
// AsyncStorage cache keys
// ---------------------------------------------------------------------------

function maintenanceKey(bikeId: string) { return `ttm_maintenance_${bikeId}`; }
function modificationsKey(bikeId: string) { return `ttm_modifications_${bikeId}`; }
function documentsKey(bikeId: string) { return `ttm_documents_${bikeId}`; }

// ---------------------------------------------------------------------------
// Row mappers (Supabase snake_case ↔ app camelCase)
// ---------------------------------------------------------------------------

function toMaintenanceRecord(row: any): MaintenanceRecord {
  return {
    id: row.id,
    bikeId: row.bike_id,
    title: row.title,
    maintenanceType: row.maintenance_type,
    date: row.date,
    mileage: row.mileage ?? undefined,
    cost: row.cost != null ? Number(row.cost) : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toModification(row: any): Modification {
  return {
    id: row.id,
    bikeId: row.bike_id,
    title: row.title,
    brand: row.brand ?? undefined,
    category: row.category,
    dateInstalled: row.date_installed ?? undefined,
    cost: row.cost != null ? Number(row.cost) : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGarageDocument(row: any): GarageDocument {
  return {
    id: row.id,
    bikeId: row.bike_id,
    title: row.title,
    documentType: row.document_type,
    fileURL: row.file_url ?? undefined,
    dateAdded: row.date_added,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Maintenance — Supabase + AsyncStorage cache
// ---------------------------------------------------------------------------

export async function loadMaintenance(bikeId: string, userId?: string): Promise<MaintenanceRecord[]> {
  // Show cached data immediately
  const cacheKey = maintenanceKey(bikeId);
  let cached: MaintenanceRecord[] = [];
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) cached = JSON.parse(raw);
  } catch {}

  if (!userId) return cached;

  // Fetch from Supabase and update cache
  const { data } = await supabase
    .from('maintenance_logs')
    .select('id, bike_id, user_id, title, maintenance_type, date, mileage, cost, notes, created_at, updated_at')
    .eq('bike_id', bikeId)
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (data) {
    const records = data.map(toMaintenanceRecord);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(records));
    return records;
  }
  return cached;
}

export async function addMaintenanceRecord(bikeId: string, record: MaintenanceRecord, userId?: string): Promise<void> {
  if (userId && userId !== 'local') {
    const { error } = await supabase.from('maintenance_logs').insert({
      id: record.id,
      bike_id: bikeId,
      user_id: userId,
      title: record.title,
      maintenance_type: record.maintenanceType,
      date: record.date,
      mileage: record.mileage ?? null,
      cost: record.cost ?? null,
      notes: record.notes ?? null,
    });
    if (error) console.error('addMaintenanceRecord Supabase error:', error.message);
  }
  // Always update local cache
  const existing = await loadLocalMaintenance(bikeId);
  await AsyncStorage.setItem(maintenanceKey(bikeId), JSON.stringify([record, ...existing]));
}

export async function updateMaintenanceRecord(bikeId: string, record: MaintenanceRecord, userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('maintenance_logs').update({
      title: record.title,
      maintenance_type: record.maintenanceType,
      date: record.date,
      mileage: record.mileage ?? null,
      cost: record.cost ?? null,
      notes: record.notes ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', record.id);
  }
  const existing = await loadLocalMaintenance(bikeId);
  await AsyncStorage.setItem(maintenanceKey(bikeId), JSON.stringify(existing.map((r) => r.id === record.id ? record : r)));
}

export async function deleteMaintenanceRecord(bikeId: string, id: string, userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('maintenance_logs').delete().eq('id', id);
  }
  const existing = await loadLocalMaintenance(bikeId);
  await AsyncStorage.setItem(maintenanceKey(bikeId), JSON.stringify(existing.filter((r) => r.id !== id)));
}

export async function bulkDeleteMaintenance(bikeId: string, ids: string[], userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('maintenance_logs').delete().in('id', ids);
  }
  const existing = await loadLocalMaintenance(bikeId);
  await AsyncStorage.setItem(maintenanceKey(bikeId), JSON.stringify(existing.filter((r) => !ids.includes(r.id))));
}

async function loadLocalMaintenance(bikeId: string): Promise<MaintenanceRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(maintenanceKey(bikeId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Modifications — Supabase + AsyncStorage cache
// ---------------------------------------------------------------------------

export async function loadModifications(bikeId: string, userId?: string): Promise<Modification[]> {
  const cacheKey = modificationsKey(bikeId);
  let cached: Modification[] = [];
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) cached = JSON.parse(raw);
  } catch {}

  if (!userId) return cached;

  const { data } = await supabase
    .from('mod_logs')
    .select('id, bike_id, user_id, title, brand, category, date_installed, cost, notes, created_at, updated_at')
    .eq('bike_id', bikeId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (data) {
    const records = data.map(toModification);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(records));
    return records;
  }
  return cached;
}

export async function addModification(bikeId: string, record: Modification, userId?: string): Promise<void> {
  if (userId && userId !== 'local') {
    const { error } = await supabase.from('mod_logs').insert({
      id: record.id,
      bike_id: bikeId,
      user_id: userId,
      title: record.title,
      brand: record.brand ?? null,
      category: record.category,
      date_installed: record.dateInstalled ?? null,
      cost: record.cost ?? null,
      notes: record.notes ?? null,
    });
    if (error) console.error('addModification Supabase error:', error.message);
  }
  const existing = await loadLocalModifications(bikeId);
  await AsyncStorage.setItem(modificationsKey(bikeId), JSON.stringify([record, ...existing]));
}

export async function updateModification(bikeId: string, record: Modification, userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('mod_logs').update({
      title: record.title,
      brand: record.brand ?? null,
      category: record.category,
      date_installed: record.dateInstalled ?? null,
      cost: record.cost ?? null,
      notes: record.notes ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', record.id);
  }
  const existing = await loadLocalModifications(bikeId);
  await AsyncStorage.setItem(modificationsKey(bikeId), JSON.stringify(existing.map((r) => r.id === record.id ? record : r)));
}

export async function deleteModification(bikeId: string, id: string, userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('mod_logs').delete().eq('id', id);
  }
  const existing = await loadLocalModifications(bikeId);
  await AsyncStorage.setItem(modificationsKey(bikeId), JSON.stringify(existing.filter((r) => r.id !== id)));
}

export async function bulkDeleteModifications(bikeId: string, ids: string[], userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('mod_logs').delete().in('id', ids);
  }
  const existing = await loadLocalModifications(bikeId);
  await AsyncStorage.setItem(modificationsKey(bikeId), JSON.stringify(existing.filter((r) => !ids.includes(r.id))));
}

async function loadLocalModifications(bikeId: string): Promise<Modification[]> {
  try {
    const raw = await AsyncStorage.getItem(modificationsKey(bikeId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Documents — Supabase + AsyncStorage cache
// ---------------------------------------------------------------------------

export async function loadDocuments(bikeId: string, userId?: string): Promise<GarageDocument[]> {
  const cacheKey = documentsKey(bikeId);
  let cached: GarageDocument[] = [];
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) cached = JSON.parse(raw);
  } catch {}

  if (!userId) return cached;

  const { data } = await supabase
    .from('documents')
    .select('id, bike_id, user_id, title, document_type, file_url, date_added, notes, created_at, updated_at')
    .eq('bike_id', bikeId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (data) {
    const records = data.map(toGarageDocument);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(records));
    return records;
  }
  return cached;
}

export async function addDocument(bikeId: string, record: GarageDocument, userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('documents').insert({
      id: record.id,
      bike_id: bikeId,
      user_id: userId,
      title: record.title,
      document_type: record.documentType,
      file_url: record.fileURL ?? null,
      date_added: record.dateAdded,
      notes: record.notes ?? null,
    });
  }
  const existing = await loadLocalDocuments(bikeId);
  await AsyncStorage.setItem(documentsKey(bikeId), JSON.stringify([record, ...existing]));
}

export async function updateDocument(bikeId: string, record: GarageDocument, userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('documents').update({
      title: record.title,
      document_type: record.documentType,
      file_url: record.fileURL ?? null,
      date_added: record.dateAdded,
      notes: record.notes ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', record.id);
  }
  const existing = await loadLocalDocuments(bikeId);
  await AsyncStorage.setItem(documentsKey(bikeId), JSON.stringify(existing.map((r) => r.id === record.id ? record : r)));
}

export async function deleteDocument(bikeId: string, id: string, userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('documents').delete().eq('id', id);
  }
  const existing = await loadLocalDocuments(bikeId);
  await AsyncStorage.setItem(documentsKey(bikeId), JSON.stringify(existing.filter((r) => r.id !== id)));
}

export async function bulkDeleteDocuments(bikeId: string, ids: string[], userId?: string): Promise<void> {
  if (userId) {
    await supabase.from('documents').delete().in('id', ids);
  }
  const existing = await loadLocalDocuments(bikeId);
  await AsyncStorage.setItem(documentsKey(bikeId), JSON.stringify(existing.filter((r) => !ids.includes(r.id))));
}

async function loadLocalDocuments(bikeId: string): Promise<GarageDocument[]> {
  try {
    const raw = await AsyncStorage.getItem(documentsKey(bikeId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Deprecated — kept for backward compat, prefer functions above
// ---------------------------------------------------------------------------

export async function saveMaintenance(bikeId: string, records: MaintenanceRecord[]): Promise<void> {
  await AsyncStorage.setItem(maintenanceKey(bikeId), JSON.stringify(records));
}

export async function saveModifications(bikeId: string, records: Modification[]): Promise<void> {
  await AsyncStorage.setItem(modificationsKey(bikeId), JSON.stringify(records));
}

export async function saveDocuments(bikeId: string, records: GarageDocument[]): Promise<void> {
  await AsyncStorage.setItem(documentsKey(bikeId), JSON.stringify(records));
}

// ---------------------------------------------------------------------------
// UUID generator (simple, no external deps)
// ---------------------------------------------------------------------------

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
