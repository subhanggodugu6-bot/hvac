'use client';

import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { TableEmptyState } from '@/components/hvac/TableEmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { useO19Mutations } from '@/hooks/useO19';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o19ErrorMessage, o19Findings } from '@/lib/hvac/o19Format';

const STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export function MaintenanceWorkOrderTable({
  data,
  onView,
}: {
  data: OmOpportunity;
  onView: (equipmentId: string | null) => void;
}) {
  const { maintenanceAction } = useO19Mutations();
  const orders = o19Findings(data);

  function act(id: string | null, status: string) {
    if (!id) return;
    maintenanceAction.mutate({ work_order_id: id, status });
  }

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Work orders">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Work order workflow</h2>
      <p className="text-[11px] text-slate-500">Actions call POST /api/hvac/operations-maintenance/O19/maintenance-action. HVAC setpoints are not written.</p>
      <EngineeringTable>
        <thead>
          <tr>
            <th>Work Order</th>
            <th>Equipment</th>
            <th>Issue</th>
            <th>Priority</th>
            <th>Created</th>
            <th>Assigned</th>
            <th>Status</th>
            <th>Resolution</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {!orders || orders.length === 0 ? (
            <TableEmptyState colSpan={9} detail="No maintenance work orders were returned." />
          ) : (
            orders.map((o) => {
              const st = (o.status || '').toUpperCase();
              return (
                <tr key={o.id || `${o.equipmentId}-${o.maintenanceType}`}>
                  <td className="font-mono">{formatDash(o.id)}</td>
                  <td className="font-mono">{formatDash(o.equipmentId)}</td>
                  <td>{formatDash(o.recommendation || o.finding || o.maintenanceType)}</td>
                  <td>
                    <StatusBadge tone={toneForStatus(o.priority)}>{formatDash(o.priority)}</StatusBadge>
                  </td>
                  <td className="font-mono">—</td>
                  <td className="font-mono">—</td>
                  <td>
                    <StatusBadge tone={toneForStatus(st)}>{STATUSES.includes(st as (typeof STATUSES)[number]) ? st : formatDash(o.status)}</StatusBadge>
                  </td>
                  <td className="font-mono">{formatDash(o.completedAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className="px-2 py-1 text-[10px] border border-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-400" disabled={!o.id || st === 'ASSIGNED' || st === 'COMPLETED'} onClick={() => act(o.id, 'ASSIGNED')}>
                        Assign
                      </button>
                      <button type="button" className="px-2 py-1 text-[10px] border border-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-400" disabled={!o.id || st === 'IN_PROGRESS' || st === 'COMPLETED'} onClick={() => act(o.id, 'IN_PROGRESS')}>
                        Start
                      </button>
                      <button type="button" className="px-2 py-1 text-[10px] border border-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-400" disabled={!o.id || st === 'COMPLETED'} onClick={() => act(o.id, 'COMPLETED')}>
                        Complete
                      </button>
                      <button type="button" className="px-2 py-1 text-[10px] border border-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => onView(o.equipmentId)}>
                        View Details
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </EngineeringTable>
      {maintenanceAction.isError ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {o19ErrorMessage(maintenanceAction.error)}
        </p>
      ) : null}
    </section>
  );
}
