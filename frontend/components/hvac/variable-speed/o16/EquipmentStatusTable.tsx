'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import type { O16Dashboard, O16EquipmentRow } from '@/lib/hvac/o16Types';
import { fmtDash, isSimulation, secondsAgo } from '@/lib/hvac/o16Format';

function telLabel(row: O16EquipmentRow, sim: boolean): string {
  if (sim || (row.source || '').toUpperCase().includes('SIMUL')) return 'SIMULATION';
  return row.data_quality || '—';
}

export function EquipmentStatusTable({
  data,
  equipment,
}: {
  data: O16Dashboard;
  equipment: O16EquipmentRow[];
}) {
  const sim = isSimulation(data);
  const cs = data.current_state || {};
  return (
    <section className="kpi-tile col-span-12" aria-labelledby="o16-eq">
      <h2 id="o16-eq" className="text-sm font-semibold text-slate-900 mb-2">
        Water-Cooled Condenser Equipment
      </h2>
      {!equipment.length ? (
        <EmptyState title="No equipment entities" detail="IDs come from the equipment registry. None are hardcoded." />
      ) : (
        <EngineeringTable>
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Status</th>
              <th>Load</th>
              <th>Speed</th>
              <th>Pressure</th>
              <th>Temperature</th>
              <th>Telemetry</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((e) => {
              const blob = `${e.type || ''} ${e.name || ''}`.toUpperCase();
              const isPump = blob.includes('PUMP');
              const isTower = blob.includes('TOWER');
              const isChiller = blob.includes('CHILLER') || blob.includes('COMPRESSOR');
              const isCond = blob.includes('CONDENSER');
              return (
                <tr key={e.equipment_id || e.name || `eq-${e.type}`}>
                  <td>
                    {fmtDash(e.name || e.equipment_id)}
                    <div className="text-[10px] text-slate-500">{fmtDash(e.type)}</div>
                  </td>
                  <td>{fmtDash(e.status ?? (isPump ? cs.pump_status : isChiller ? cs.compressor_status : null))}</td>
                  <td>{isChiller || isCond ? fmtDash(cs.load_pct) : '—'}</td>
                  <td>{isPump ? fmtDash(cs.pump_speed_pct) : isTower ? '—' : fmtDash(e.current_value)}</td>
                  <td>{isCond || isChiller ? fmtDash(cs.head_pressure) : '—'}</td>
                  <td>{isTower ? fmtDash(cs.cewt_c) : isCond ? fmtDash(cs.clwt_c) : isPump ? fmtDash(cs.cewt_c) : '—'}</td>
                  <td>{telLabel(e, sim)}</td>
                  <td>{e.last_seen ? secondsAgo(String(e.last_seen)) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </EngineeringTable>
      )}
    </section>
  );
}
