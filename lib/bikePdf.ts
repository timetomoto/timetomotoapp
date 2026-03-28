import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Bike } from './store';
import { bikeLabel } from './store';
import { loadMaintenance, loadModifications } from './garage';
import { fetchServiceIntervals as fetchIntervalsFromGemini } from '../components/garage/ServiceIntervalsSection';
import { useServiceBulletinsStore, type NHTSARecall, type NHTSAComplaint, type BulletinResult } from './serviceBulletinsStore';

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

  // Build spec rows from both bike-level fields and specs object
  const specRows: [string, string][] = [];
  if (bike.bike_type) specRows.push(['Type', escHtml(bike.bike_type)]);
  if (specs?.engineDisplacement) specRows.push(['Engine', escHtml(specs.engineDisplacement)]);
  if (specs?.engineType) specRows.push(['Engine Type', escHtml(specs.engineType)]);
  if (specs?.wetWeightLbs) specRows.push(['Weight', `${specs.wetWeightLbs} lbs`]);
  if (specs?.seatHeight) specRows.push(['Seat Height', escHtml(specs.seatHeight)]);
  const fuelCap = specs?.fuelCapacityGal ?? bike.tank_gallons ?? bike.fuelCapacity;
  const fuelUnit = bike.fuelCapacityUnit === 'liters' ? 'L' : 'gal';
  if (fuelCap) specRows.push(['Fuel Capacity', `${fuelCap} ${fuelUnit}`]);
  if (specs?.fuelType) specRows.push(['Fuel Type', escHtml(specs.fuelType)]);
  if (bike.avg_mpg) specRows.push(['Avg MPG', `${bike.avg_mpg}`]);
  if (specs?.oilType) specRows.push(['Oil Type', escHtml(specs.oilType)]);
  if (specs?.oilCapacityQt) specRows.push(['Oil Capacity', `${specs.oilCapacityQt} qt`]);
  if (specs?.tireFrontSize) specRows.push(['Front Tire', escHtml(specs.tireFrontSize)]);
  if (specs?.tireRearSize) specRows.push(['Rear Tire', escHtml(specs.tireRearSize)]);
  if (specs?.tirePressureFrontPsi) specRows.push(['Front PSI', `${specs.tirePressureFrontPsi}`]);
  if (specs?.tirePressureRearPsi) specRows.push(['Rear PSI', `${specs.tirePressureRearPsi}`]);
  if (specs?.maxLoadLbs) specRows.push(['Max Load', `${specs.maxLoadLbs} lbs`]);
  if (specs?.groundClearance) specRows.push(['Ground Clearance', escHtml(specs.groundClearance)]);
  if (specs?.overallLength) specRows.push(['Length', escHtml(specs.overallLength)]);
  if (specs?.overallWidth) specRows.push(['Width', escHtml(specs.overallWidth)]);
  if (specs?.overallHeight) specRows.push(['Height', escHtml(specs.overallHeight)]);

  // Build sections array — only include sections that have data
  const sections: string[] = [];

  if (specRows.length > 0) {
    sections.push(`
<h2>Specifications</h2>
<table>
${specRows.map(([label, val]) => `<tr><td class="label-col">${label}</td><td>${val}</td></tr>`).join('\n')}
</table>
${specs?.specsSource ? `<p class="muted">Source: ${specs.specsSource}</p>` : ''}`);
  }

  if (intervals.items.length > 0) {
    sections.push(`
<h2>Service Intervals</h2>
${intervals.assumption ? `<p class="muted">${escHtml(intervals.assumption)}</p>` : ''}
<table>
<tr><th>Item</th><th>Interval</th><th>Notes</th></tr>
${intervals.items.map((si) => `<tr><td>${escHtml(si.item)}</td><td>${escHtml(si.interval)}</td><td class="muted">${escHtml(si.notes)}</td></tr>`).join('\n')}
</table>`);
  }

  if (maintenance.length > 0) {
    sections.push(`
<h2>Maintenance Log (${maintenance.length})</h2>
<table>
<tr><th>Date</th><th>Service</th><th>Mileage</th><th>Cost</th><th>Notes</th></tr>
${maintenance.map((m) => `<tr><td>${formatDate(m.date)}</td><td>${escHtml(m.title)}</td><td>${m.mileage ? m.mileage.toLocaleString() : '—'}</td><td class="cost">${formatCost(m.cost)}</td><td class="muted">${escHtml(m.notes)}</td></tr>`).join('\n')}
</table>`);
  }

  if (modifications.length > 0) {
    sections.push(`
<h2>Modifications (${modifications.length})</h2>
<table>
<tr><th>Date</th><th>Modification</th><th>Brand</th><th>Category</th><th>Cost</th><th>Notes</th></tr>
${modifications.map((m) => `<tr><td>${formatDate(m.dateInstalled)}</td><td>${escHtml(m.title)}</td><td>${escHtml(m.brand)}</td><td>${escHtml(m.category)}</td><td class="cost">${formatCost(m.cost)}</td><td class="muted">${escHtml(m.notes)}</td></tr>`).join('\n')}
</table>`);
  }

  if (recalls.length > 0) {
    sections.push(`
<h2>NHTSA Recalls (${recalls.length})</h2>
${recalls.map((r) => `
<div class="recall">
  <div class="recall-title">${escHtml(r.Component)} — ${escHtml(r.NHTSACampaignNumber)}</div>
  <div>${escHtml(r.Summary)}</div>
  ${r.Remedy ? `<div class="muted" style="margin-top:4px;">Remedy: ${escHtml(r.Remedy)}</div>` : ''}
</div>`).join('\n')}`);
  }

  if (complaints.length > 0) {
    sections.push(`
<h2>NHTSA Complaints${totalComplaints > complaints.length ? ` (${complaints.length} of ${totalComplaints})` : ` (${complaints.length})`}</h2>
${complaints.map((c) => `
<div class="complaint">
  <strong>${escHtml(c.components)}</strong> · ${formatDate(c.dateOfIncident)}${c.crash ? ' · 🚨 Crash' : ''}${c.fire ? ' · 🔥 Fire' : ''}
  <div style="margin-top:3px;">${escHtml(c.summary)}</div>
</div>`).join('\n')}`);
  }

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
</style>
</head>
<body>

<h1>${escHtml(title)}</h1>
<p class="subtitle">${escHtml(bikeDesc)}${bike.odometer ? ` · ${bike.odometer.toLocaleString()} miles` : ''}${bike.bike_type ? ` · ${escHtml(bike.bike_type)}` : ''}</p>

${photoUri ? `<img class="photo" src="${photoUri}" />` : ''}

${sections.length > 0 ? sections.join('\n') : '<p style="color:#999; font-style:italic;">No data on file for this bike yet.</p>'}

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

export async function exportBikePdf(
  bike: Bike,
  userId: string | undefined,
  photoUri: string | null,
  signal?: { cancelled: boolean },
): Promise<void> {
  const check = () => { if (signal?.cancelled) throw new Error('cancelled'); };

  // Get rider name
  const { data: { user } } = await supabase.auth.getUser();
  check();
  const riderName = user?.user_metadata?.first_name
    || user?.user_metadata?.name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || 'Rider';

  // Trigger bulletins fetch if not cached — this populates the store
  const year = String(bike.year ?? '');
  const make = bike.make ?? '';
  const model = bike.model ?? '';
  const bulletinKey = `${year}_${make}_${model}`;
  if (!useServiceBulletinsStore.getState().results[bulletinKey] && year && make && model) {
    await useServiceBulletinsStore.getState().fetchBulletins(year, make, model).catch(() => {});
  }
  check();

  // Collect all data in parallel — fetch fresh if cache is empty
  const [maintenance, modifications, cachedIntervals] = await Promise.all([
    loadMaintenance(bike.id, userId),
    loadModifications(bike.id, userId),
    loadServiceIntervals(bike.id),
  ]);
  check();

  // If intervals cache is empty and bike has year/make/model, fetch from Gemini
  let intervals = cachedIntervals;
  if (intervals.items.length === 0 && year && make && model) {
    try {
      const fresh = await fetchIntervalsFromGemini(bike);
      if (fresh.items.length > 0) {
        intervals = fresh;
        // Cache for next time
        await AsyncStorage.setItem(`ttm_service_intervals_${bike.id}`, JSON.stringify({
          bikeKey: `${year}_${make}_${model}`,
          ...fresh,
          fetchedAt: new Date().toISOString(),
        }));
      }
    } catch {}
  }
  check();

  const bulletins = loadBulletins(year, make, model);

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

  check();
  const { uri } = await Print.printToFileAsync({ html });
  check();
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
