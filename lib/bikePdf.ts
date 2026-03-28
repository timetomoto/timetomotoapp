import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Bike } from './store';
import { bikeLabel } from './store';
import { loadMaintenance, loadModifications } from './garage';
import { useServiceBulletinsStore, type NHTSARecall, type NHTSAComplaint } from './serviceBulletinsStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceItem { item: string; interval: string; notes?: string }

// ---------------------------------------------------------------------------
// Data collectors
// ---------------------------------------------------------------------------

async function loadServiceIntervals(bikeId: string): Promise<{ items: ServiceItem[]; assumption?: string }> {
  try {
    const raw = await AsyncStorage.getItem(`ttm_service_intervals_${bikeId}`);
    if (!raw) return { items: [] };
    const cached = JSON.parse(raw);
    return { items: cached.items ?? [], assumption: cached.assumption };
  } catch {
    return { items: [] };
  }
}

function loadBulletins(year: string, make: string, model: string): { recalls: NHTSARecall[]; complaints: NHTSAComplaint[]; total: number } {
  const key = `${year}_${make}_${model}`;
  const result = useServiceBulletinsStore.getState().results[key];
  if (!result) return { recalls: [], complaints: [], total: 0 };
  return { recalls: result.recalls, complaints: result.complaints, total: result.totalComplaints };
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function escHtml(s: string | null | undefined): string {
  return (s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCost(c: number | null | undefined): string {
  if (c == null) return '';
  return `$${c.toFixed(2)}`;
}

function buildHtml(opts: {
  riderName: string;
  bike: Bike;
  photoUri: string | null;
  maintenance: any[];
  modifications: any[];
  specs: Bike['specs'];
  intervals: { items: ServiceItem[]; assumption?: string };
  recalls: NHTSARecall[];
  complaints: NHTSAComplaint[];
  totalComplaints: number;
}): string {
  const { riderName, bike, photoUri, maintenance, modifications, specs, intervals, recalls, complaints, totalComplaints } = opts;
  const title = `${riderName}'s Moto: ${bike.nickname || bikeLabel(bike)}`;
  const bikeDesc = `${bike.year ?? ''} ${bike.make ?? ''} ${bike.model ?? ''}`.trim();

  const specRows = specs ? [
    specs.engineDisplacement && ['Engine', escHtml(specs.engineDisplacement)],
    specs.engineType && ['Engine Type', escHtml(specs.engineType)],
    specs.wetWeightLbs && ['Weight', `${specs.wetWeightLbs} lbs`],
    specs.seatHeight && ['Seat Height', escHtml(specs.seatHeight)],
    specs.fuelCapacityGal && ['Fuel Capacity', `${specs.fuelCapacityGal} gal`],
    specs.fuelType && ['Fuel Type', escHtml(specs.fuelType)],
    specs.oilType && ['Oil Type', escHtml(specs.oilType)],
    specs.oilCapacityQt && ['Oil Capacity', `${specs.oilCapacityQt} qt`],
    specs.tireFrontSize && ['Front Tire', escHtml(specs.tireFrontSize)],
    specs.tireRearSize && ['Rear Tire', escHtml(specs.tireRearSize)],
    specs.tirePressureFrontPsi && ['Front PSI', `${specs.tirePressureFrontPsi}`],
    specs.tirePressureRearPsi && ['Rear PSI', `${specs.tirePressureRearPsi}`],
    specs.maxLoadLbs && ['Max Load', `${specs.maxLoadLbs} lbs`],
    specs.groundClearance && ['Ground Clearance', escHtml(specs.groundClearance)],
    specs.overallLength && ['Length', escHtml(specs.overallLength)],
    specs.overallWidth && ['Width', escHtml(specs.overallWidth)],
    specs.overallHeight && ['Height', escHtml(specs.overallHeight)],
  ].filter(Boolean) as [string, string][] : [];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 32px 24px; color: #222; font-size: 13px; }
  h1 { font-size: 22px; font-weight: 800; color: #111; margin: 0 0 4px 0; }
  h2 { font-size: 15px; font-weight: 700; color: #C62828; margin: 28px 0 10px 0; border-bottom: 2px solid #C62828; padding-bottom: 4px; }
  .subtitle { font-size: 14px; color: #555; margin: 0 0 20px 0; }
  .photo { width: 100%; max-height: 280px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; font-size: 11px; font-weight: 700; color: #777; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  .label-col { width: 140px; color: #555; font-weight: 600; }
  .muted { color: #999; font-size: 11px; }
  .cost { color: #2E7D32; font-weight: 600; }
  .recall { background: #FFF3E0; border-left: 3px solid #FF9800; padding: 8px 12px; margin-bottom: 8px; border-radius: 4px; }
  .recall-title { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
  .complaint { background: #F5F5F5; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; font-size: 11px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 10px; }
  .footer-logo { font-size: 14px; font-weight: 800; color: #C62828; letter-spacing: 1px; }
  .empty { color: #999; font-style: italic; font-size: 12px; }
</style>
</head>
<body>

<h1>${escHtml(title)}</h1>
<p class="subtitle">${escHtml(bikeDesc)}${bike.odometer ? ` · ${bike.odometer.toLocaleString()} miles` : ''}</p>

${photoUri ? `<img class="photo" src="${photoUri}" />` : ''}

<!-- SPECIFICATIONS -->
<h2>Specifications</h2>
${specRows.length > 0 ? `
<table>
${specRows.map(([label, val]) => `<tr><td class="label-col">${label}</td><td>${val}</td></tr>`).join('\n')}
</table>
${specs?.specsSource ? `<p class="muted">Source: ${specs.specsSource}</p>` : ''}
` : '<p class="empty">No specifications on file.</p>'}

<!-- SERVICE INTERVALS -->
<h2>Service Intervals</h2>
${intervals.items.length > 0 ? `
${intervals.assumption ? `<p class="muted">${escHtml(intervals.assumption)}</p>` : ''}
<table>
<tr><th>Item</th><th>Interval</th><th>Notes</th></tr>
${intervals.items.map((si) => `<tr><td>${escHtml(si.item)}</td><td>${escHtml(si.interval)}</td><td class="muted">${escHtml(si.notes)}</td></tr>`).join('\n')}
</table>
` : '<p class="empty">No service intervals on file. Ask Scout to look them up.</p>'}

<!-- MAINTENANCE LOG -->
<h2>Maintenance Log</h2>
${maintenance.length > 0 ? `
<table>
<tr><th>Date</th><th>Service</th><th>Mileage</th><th>Cost</th><th>Notes</th></tr>
${maintenance.map((m) => `<tr><td>${formatDate(m.date)}</td><td>${escHtml(m.title)}</td><td>${m.mileage ? m.mileage.toLocaleString() : '—'}</td><td class="cost">${formatCost(m.cost)}</td><td class="muted">${escHtml(m.notes)}</td></tr>`).join('\n')}
</table>
` : '<p class="empty">No maintenance records.</p>'}

<!-- MODIFICATIONS -->
<h2>Modifications</h2>
${modifications.length > 0 ? `
<table>
<tr><th>Date</th><th>Modification</th><th>Brand</th><th>Category</th><th>Cost</th><th>Notes</th></tr>
${modifications.map((m) => `<tr><td>${formatDate(m.dateInstalled)}</td><td>${escHtml(m.title)}</td><td>${escHtml(m.brand)}</td><td>${escHtml(m.category)}</td><td class="cost">${formatCost(m.cost)}</td><td class="muted">${escHtml(m.notes)}</td></tr>`).join('\n')}
</table>
` : '<p class="empty">No modifications recorded.</p>'}

<!-- NHTSA RECALLS -->
<h2>NHTSA Recalls</h2>
${recalls.length > 0 ? recalls.map((r) => `
<div class="recall">
  <div class="recall-title">${escHtml(r.Component)} — ${escHtml(r.NHTSACampaignNumber)}</div>
  <div>${escHtml(r.Summary)}</div>
  ${r.Remedy ? `<div class="muted" style="margin-top:4px;">Remedy: ${escHtml(r.Remedy)}</div>` : ''}
</div>
`).join('\n') : '<p class="empty">No recalls found for this vehicle.</p>'}

<!-- NHTSA COMPLAINTS -->
<h2>NHTSA Complaints${totalComplaints > complaints.length ? ` (showing ${complaints.length} of ${totalComplaints})` : ''}</h2>
${complaints.length > 0 ? complaints.map((c) => `
<div class="complaint">
  <strong>${escHtml(c.components)}</strong> · ${formatDate(c.dateOfIncident)}${c.crash ? ' · 🚨 Crash' : ''}${c.fire ? ' · 🔥 Fire' : ''}
  <div style="margin-top:3px;">${escHtml(c.summary)}</div>
</div>
`).join('\n') : '<p class="empty">No complaints found for this vehicle.</p>'}

<!-- FOOTER -->
<div class="footer">
  <div class="footer-logo">TIME TO MOTO</div>
  <div style="margin-top:4px;">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  <div>timetomoto.com</div>
</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Export function
// ---------------------------------------------------------------------------

export async function exportBikePdf(bike: Bike, userId: string | undefined, photoUri: string | null): Promise<void> {
  // Get rider name
  const { data: { user } } = await supabase.auth.getUser();
  const riderName = user?.user_metadata?.first_name
    || user?.user_metadata?.name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || 'Rider';

  // Collect all data in parallel
  const [maintenance, modifications, intervals] = await Promise.all([
    loadMaintenance(bike.id, userId),
    loadModifications(bike.id, userId),
    loadServiceIntervals(bike.id),
  ]);

  const bulletins = loadBulletins(
    String(bike.year ?? ''),
    bike.make ?? '',
    bike.model ?? '',
  );

  const html = buildHtml({
    riderName,
    bike,
    photoUri,
    maintenance,
    modifications,
    specs: bike.specs ?? null,
    intervals,
    recalls: bulletins.recalls,
    complaints: bulletins.complaints,
    totalComplaints: bulletins.total,
  });

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
