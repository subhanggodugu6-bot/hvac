'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import type { O15Command } from '@/lib/hvac/o15Types';
import { fmtDash } from '@/lib/hvac/o15Format';

function gateStatus(gates: unknown): string {
  if (!Array.isArray(gates) || !gates.length) return '—';
  const blocked = gates.some((g) => {
    if (typeof g === 'string') return /FAIL|BLOCK|REJECT/i.test(g);
    if (g && typeof g === 'object' && 'result' in g) return String((g as { result?: string }).result).toUpperCase() !== 'PASS';
    return false;
  });
  return blocked ? 'BLOCK' : 'PASS';
}

function verifyLabel(c: O15Command): string {
  const status = (c.status || '').toUpperCase();
  if (c.verified_at || status === 'VERIFIED') return 'VERIFIED';
  if (status === 'ROLLED_BACK') return 'ROLLED_BACK';
  if (status === 'REJECTED' || status === 'BLOCKED') return 'BLOCKED';
  return '—';
}

export function O15CommandHistory({ commands }: { commands: O15Command[] }) {
  return (
    <section className="kpi-tile col-span-12" aria-labelledby="o15-cmd-hist">
      <h2 id="o15-cmd-hist" className="text-sm font-semibold text-slate-900 mb-2">
        Command History
      </h2>
      {!commands?.length ? (
        <EmptyState title="No commands" detail="Command history is loaded from persisted O15 control_commands." />
      ) : (
        <EngineeringTable>
          <thead>
            <tr>
              <th>Time</th>
              <th>Command</th>
              <th>Old Target</th>
              <th>New Target</th>
              <th>Decision</th>
              <th>Safety</th>
              <th>Verification</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((c) => (
              <tr key={c.command_id || c.id}>
                <td>{fmtDash(c.created_at)}</td>
                <td>{fmtDash(c.point_id)}</td>
                <td>{fmtDash(c.old_value)}</td>
                <td>{fmtDash(c.new_value)}</td>
                <td>{fmtDash(c.reason)}</td>
                <td>{gateStatus(c.safety_gates)}</td>
                <td>{verifyLabel(c)}</td>
                <td>{fmtDash(c.status)}</td>
              </tr>
            ))}
          </tbody>
        </EngineeringTable>
      )}
    </section>
  );
}
