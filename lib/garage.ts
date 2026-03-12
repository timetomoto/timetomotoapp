import AsyncStorage from '@react-native-async-storage/async-storage';

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
// AsyncStorage helpers
// ---------------------------------------------------------------------------

function maintenanceKey(bikeId: string) { return `ttm_maintenance_${bikeId}`; }
function modificationsKey(bikeId: string) { return `ttm_modifications_${bikeId}`; }
function documentsKey(bikeId: string) { return `ttm_documents_${bikeId}`; }

// ── Maintenance ──

export async function loadMaintenance(bikeId: string): Promise<MaintenanceRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(maintenanceKey(bikeId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveMaintenance(bikeId: string, records: MaintenanceRecord[]): Promise<void> {
  await AsyncStorage.setItem(maintenanceKey(bikeId), JSON.stringify(records));
}

export async function addMaintenanceRecord(bikeId: string, record: MaintenanceRecord): Promise<void> {
  const existing = await loadMaintenance(bikeId);
  await saveMaintenance(bikeId, [record, ...existing]);
}

export async function updateMaintenanceRecord(bikeId: string, record: MaintenanceRecord): Promise<void> {
  const existing = await loadMaintenance(bikeId);
  await saveMaintenance(bikeId, existing.map((r) => r.id === record.id ? record : r));
}

export async function deleteMaintenanceRecord(bikeId: string, id: string): Promise<void> {
  const existing = await loadMaintenance(bikeId);
  await saveMaintenance(bikeId, existing.filter((r) => r.id !== id));
}

export async function bulkDeleteMaintenance(bikeId: string, ids: string[]): Promise<void> {
  const existing = await loadMaintenance(bikeId);
  await saveMaintenance(bikeId, existing.filter((r) => !ids.includes(r.id)));
}

// ── Modifications ──

export async function loadModifications(bikeId: string): Promise<Modification[]> {
  try {
    const raw = await AsyncStorage.getItem(modificationsKey(bikeId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveModifications(bikeId: string, records: Modification[]): Promise<void> {
  await AsyncStorage.setItem(modificationsKey(bikeId), JSON.stringify(records));
}

export async function addModification(bikeId: string, record: Modification): Promise<void> {
  const existing = await loadModifications(bikeId);
  await saveModifications(bikeId, [record, ...existing]);
}

export async function updateModification(bikeId: string, record: Modification): Promise<void> {
  const existing = await loadModifications(bikeId);
  await saveModifications(bikeId, existing.map((r) => r.id === record.id ? record : r));
}

export async function deleteModification(bikeId: string, id: string): Promise<void> {
  const existing = await loadModifications(bikeId);
  await saveModifications(bikeId, existing.filter((r) => r.id !== id));
}

export async function bulkDeleteModifications(bikeId: string, ids: string[]): Promise<void> {
  const existing = await loadModifications(bikeId);
  await saveModifications(bikeId, existing.filter((r) => !ids.includes(r.id)));
}

// ── Documents ──

export async function loadDocuments(bikeId: string): Promise<GarageDocument[]> {
  try {
    const raw = await AsyncStorage.getItem(documentsKey(bikeId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveDocuments(bikeId: string, records: GarageDocument[]): Promise<void> {
  await AsyncStorage.setItem(documentsKey(bikeId), JSON.stringify(records));
}

export async function addDocument(bikeId: string, record: GarageDocument): Promise<void> {
  const existing = await loadDocuments(bikeId);
  await saveDocuments(bikeId, [record, ...existing]);
}

export async function updateDocument(bikeId: string, record: GarageDocument): Promise<void> {
  const existing = await loadDocuments(bikeId);
  await saveDocuments(bikeId, existing.map((r) => r.id === record.id ? record : r));
}

export async function deleteDocument(bikeId: string, id: string): Promise<void> {
  const existing = await loadDocuments(bikeId);
  await saveDocuments(bikeId, existing.filter((r) => r.id !== id));
}

export async function bulkDeleteDocuments(bikeId: string, ids: string[]): Promise<void> {
  const existing = await loadDocuments(bikeId);
  await saveDocuments(bikeId, existing.filter((r) => !ids.includes(r.id)));
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
