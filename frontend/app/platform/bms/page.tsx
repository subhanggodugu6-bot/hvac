'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import { hvacFetch } from '@/lib/api/client';
import { PLATFORM_POLL_MS } from '@/lib/hvac/poll';

type StageGCheck = { name: string; ok: boolean; detail?: string };
type StageGCommand = {
  command_id?: string;
  point_id?: string;
  status?: string;
  old_value?: number | null;
  new_value?: number | null;
  opportunity?: string;
};

type BmsTab = 'status' | 'connection' | 'devices' | 'points' | 'mapping' | 'writes';

function BmsPageInner() {
  const qc = useQueryClient();
  const search = useSearchParams();
  const tabParam = (search.get('tab') || 'status').toLowerCase();
  const tab: BmsTab = (['status', 'connection', 'devices', 'points', 'mapping', 'writes'] as BmsTab[]).includes(tabParam as BmsTab)
    ? (tabParam as BmsTab)
    : 'status';
  const setTab = (next: BmsTab) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    setTabState(next);
  };
  const [tabState, setTabState] = useState<BmsTab>(tab);
  const [protocol, setProtocol] = useState('bacnet');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('47808');
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapForm, setMapForm] = useState({
    equipment_id: search.get('equipment') || 'AHU-01',
    canonical_point: search.get('point') || 'supply_air_temperature',
    bms_point_id: search.get('bms_point_id') || '',
    direction: 'READ',
  });
  const activeTab = tabState;

  useEffect(() => {
    setTabState(tab);
  }, [tab]);

  useEffect(() => {
    const eq = search.get('equipment');
    const pt = search.get('point');
    const bmsId = search.get('bms_point_id');
    if (eq || pt || bmsId) {
      setMapForm((f) => ({
        ...f,
        equipment_id: eq || f.equipment_id,
        canonical_point: pt || f.canonical_point,
        bms_point_id: bmsId || f.bms_point_id,
      }));
    }
  }, [search]);

  const status = useQuery({
    queryKey: ['bms-status'],
    queryFn: async () => (await hvacFetch('/api/platform/bms/status')).json(),
    refetchInterval: PLATFORM_POLL_MS,
  });
  const stageG = useQuery({
    queryKey: ['bms-stage-g'],
    queryFn: async () => (await hvacFetch('/api/platform/bms/stage-g/status?point_id=ZONE-01.cooling_setpoint')).json(),
    refetchInterval: PLATFORM_POLL_MS,
  });
  const devices = useQuery({
    queryKey: ['bms-devices'],
    queryFn: async () => (await hvacFetch('/api/platform/bms/devices')).json(),
    refetchInterval: PLATFORM_POLL_MS,
  });
  const mappings = useQuery({
    queryKey: ['bms-mappings'],
    queryFn: async () => (await hvacFetch('/api/platform/bms/mappings')).json(),
    refetchInterval: PLATFORM_POLL_MS,
  });
  const points = useQuery({
    queryKey: ['bms-points', selected],
    queryFn: async () => {
      if (!selected) return { points: [] };
      return (await hvacFetch(`/api/platform/bms/devices/${selected}/points`)).json();
    },
    enabled: Boolean(selected),
  });

  const post = useMutation({
    mutationFn: async (path: string) => {
      const res = await hvacFetch(path, {
        method: 'POST',
        body: JSON.stringify({ protocol, host, port: Number(port) || 47808 }),
      });
      return res.json();
    },
    onSuccess: (body) => {
      setMessage(body.message || body.status || body.code || null);
      qc.invalidateQueries();
    },
  });

  const connect = (testOnly: boolean) =>
    hvacFetch('/api/platform/bms/connect', {
      method: 'POST',
      body: JSON.stringify({ protocol, host, port: Number(port) || 47808, test_only: testOnly }),
    }).then(async (res) => {
      const body = await res.json();
      setMessage(body.message || body.status || body.code || null);
      qc.invalidateQueries();
    });

  const saveMap = () =>
    hvacFetch('/api/platform/bms/mappings', {
      method: 'PUT',
      body: JSON.stringify({ ...mapForm, safety_enabled: true }),
    }).then(async (res) => {
      const body = await res.json();
      setMessage(body.message || 'MAPPING SAVED');
      qc.invalidateQueries();
    });

  const cmdAction = (commandId: string, action: 'approve' | 'apply' | 'verify' | 'rollback') =>
    hvacFetch(`/api/platform/commands/${commandId}/${action}`, { method: 'POST' }).then(async (res) => {
      const body = await res.json();
      const detail = body.detail;
      setMessage(
        body.message ||
          body.status ||
          body.code ||
          (typeof detail === 'object' ? detail?.message || detail?.code : detail) ||
          (res.ok ? action.toUpperCase() : 'FAILED'),
      );
      qc.invalidateQueries();
    });

  const st = status.data || {};
  const sg = stageG.data || {};
  const sgChecks: StageGCheck[] = Array.isArray(sg.checks) ? sg.checks : [];
  const sgCommands: StageGCommand[] = Array.isArray(sg.commands) ? sg.commands : [];
  const sgOk = Boolean(sg.ok);
  const sgOkToEnable = Boolean(sg.ok_to_enable ?? sg.ok);
  const activeCmd =
    sgCommands.find((c) =>
      ['PROPOSED', 'APPROVED', 'APPLIED', 'VERIFYING', 'VERIFICATION_FAILED'].includes(String(c.status || '').toUpperCase()),
    ) || sgCommands[0];
  const deviceRows = devices.data?.devices || [];
  const pointRows = points.data?.points || [];
  const mapRows = mappings.data?.mappings || [];
  const catalog = mappings.data?.catalog || [];
  const livePlant = st.plantMode === 'LIVE_BMS';
  const defaultPorts: Record<string, string> = { bacnet: '47808', modbus: '502', mqtt: '1883', rest: '443' };

  return (
    <div className="page-shell">
      <PageHeader icon={Radio} title="Gateway" subtitle="Commissioning: connect, discover, and map canonical points so O1–O20 can run." badge="READ-ONLY" />
      <div className="flex flex-wrap gap-1.5">
        {(['status', 'connection', 'devices', 'points', 'mapping', 'writes'] as BmsTab[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`px-3.5 py-2 text-[11px] font-semibold tracking-wide rounded-full border transition-colors ${
              activeTab === id
                ? 'border-violet-400 text-white bg-violet-500 shadow-md shadow-violet-200'
                : 'border-slate-200 text-slate-500 bg-white hover:border-violet-200 hover:text-violet-700'
            }`}
            onClick={() => setTab(id)}
          >
            {id === 'status'
              ? 'Status'
              : id === 'connection'
                ? 'Connection'
                : id === 'devices'
                  ? 'Devices'
                  : id === 'points'
                    ? 'Points'
                    : id === 'mapping'
                      ? 'Mapping'
                      : 'Writes'}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900" role="status">
        READ-ONLY COMMISSIONING — BMS writes are disabled until Stage G prerequisites pass and ENABLE WRITES is confirmed.
        {st.labMode ? ' Lab BACnet (HVAC_BMS_LAB=1) is active — LIVE_BMS path, not dataset simulation.' : ''}
      </div>

      {activeTab === 'status' ? (
        <section className="glass-card p-5 space-y-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <StatusBadge tone={toneForStatus(st.status)}>{st.status || 'UNKNOWN'}</StatusBadge>
            <StatusBadge tone="neutral">{st.plantMode || '—'}</StatusBadge>
            <StatusBadge tone={st.write_enabled ? 'live' : 'warn'}>{st.write_enabled ? 'WRITES ARMED' : 'WRITES OFF'}</StatusBadge>
          </div>
          <div className="text-[12px] font-mono text-slate-600">
            Devices {deviceRows.length} · Mappings {mapRows.length} · Protocol {st.protocol || '—'}
          </div>
          <div className="text-[12px] text-slate-600">Last error: {st.last_error || st.lastError || '—'}</div>
          {message ? <div className="text-[12px] text-slate-600 font-mono">{message}</div> : null}
        </section>
      ) : null}

      {activeTab === 'connection' ? (
        <section className="glass-card p-5 space-y-4">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">BMS Connection</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-[11px] text-slate-600 space-y-1.5">
              Protocol
              <select
                value={protocol}
                onChange={(e) => {
                  const next = e.target.value;
                  setProtocol(next);
                  setPort(defaultPorts[next] || '47808');
                }}
                className="form-control"
              >
                <option value="bacnet">BACnet/IP</option>
                <option value="modbus">Modbus TCP</option>
                <option value="mqtt">MQTT</option>
                <option value="rest">REST</option>
              </select>
            </label>
            <label className="text-[11px] text-slate-600 space-y-1.5">
              Host
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="gateway IP" className="form-control" />
            </label>
            <label className="text-[11px] text-slate-600 space-y-1.5">
              Port
              <input value={port} onChange={(e) => setPort(e.target.value)} className="form-control" />
            </label>
            <div className="flex items-end gap-2">
              <button type="button" className="btn-primary" onClick={() => connect(false)} disabled={!host}>
                CONNECT
              </button>
              <button type="button" className="btn-ghost" onClick={() => connect(true)} disabled={!host}>
                TEST
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => post.mutate('/api/platform/bms/discover')}>
              DISCOVER
            </button>
            <button type="button" className="btn-ghost" onClick={() => post.mutate('/api/platform/bms/disconnect')}>
              DISCONNECT
            </button>
          </div>
          {message ? <div className="text-[12px] text-slate-600 font-mono">{message}</div> : null}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <StatusBadge tone={toneForStatus(st.status)}>{st.status || 'UNKNOWN'}</StatusBadge>
            <StatusBadge tone="neutral">{st.plantMode || '—'}</StatusBadge>
            <StatusBadge tone={st.write_enabled ? 'live' : 'warn'}>{st.write_enabled ? 'WRITES ARMED' : 'WRITES OFF'}</StatusBadge>
          </div>
        </section>
      ) : null}

      {activeTab === 'devices' || activeTab === 'points' ? (
        <section className="glass-card p-5 space-y-3">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">Discovered devices</div>
          {deviceRows.length === 0 ? (
            <EmptyState title="No devices" detail="Connect and discover to list BACnet devices." />
          ) : (
            <div className="overflow-auto max-h-64">
              <table className="bms-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceRows.map((d: { id: string; name?: string; device_type?: string; status?: string }) => (
                    <tr
                      key={d.id}
                      className={selected === d.id ? 'bg-violet-50 cursor-pointer' : 'cursor-pointer hover:bg-slate-50'}
                      onClick={() => setSelected(d.id)}
                    >
                      <td>{d.name || d.id}</td>
                      <td>{d.device_type || '—'}</td>
                      <td>{d.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selected ? (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-600 uppercase">Points</div>
              <div className="overflow-auto max-h-48">
                <table className="bms-table">
                  <thead>
                    <tr>
                      <th>Identifier</th>
                      <th>Unit</th>
                      <th>Writable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pointRows.map((p: { id: string; point_identifier?: string; unit?: string; writable?: boolean }) => (
                      <tr
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => setMapForm((f) => ({ ...f, bms_point_id: p.id }))}
                      >
                        <td className="font-mono text-[11px]">{p.point_identifier}</td>
                        <td>{p.unit || '—'}</td>
                        <td>{p.writable ? 'Y' : 'N'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'mapping' ? (
      <section className="glass-card p-5 space-y-3">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">Point mapping</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select
            className="form-control"
            value={`${mapForm.equipment_id}.${mapForm.canonical_point}`}
            onChange={(e) => {
              const [equipment_id, ...rest] = e.target.value.split('.');
              setMapForm({ ...mapForm, equipment_id, canonical_point: rest.join('.') });
            }}
          >
            {(
              catalog.length
                ? catalog
                : [{ qualified: 'AHU-01.supply_air_temperature', equipment_id: 'AHU-01', canonical_point: 'supply_air_temperature' }]
            ).map((c: { qualified?: string; canonical_point: string; equipment_id?: string }) => {
              const q = c.qualified || `${c.equipment_id}.${c.canonical_point}`;
              return (
                <option key={q} value={q}>
                  {q}
                </option>
              );
            })}
          </select>
          <input
            className="form-control"
            value={mapForm.bms_point_id}
            onChange={(e) => setMapForm({ ...mapForm, bms_point_id: e.target.value })}
            placeholder="discovered point id"
          />
          <select className="form-control" value={mapForm.direction} onChange={(e) => setMapForm({ ...mapForm, direction: e.target.value })}>
            <option value="READ">READ</option>
            <option value="READ_WRITE">READ/WRITE</option>
          </select>
          <button
            type="button"
            className="btn-primary"
            onClick={saveMap}
            disabled={!mapForm.bms_point_id}
            title={!mapForm.bms_point_id ? 'Select a discovered BMS point first' : undefined}
          >
            SAVE MAPPING
          </button>
        </div>
        {mapRows.length === 0 ? (
          <EmptyState title="No mappings" detail="Select a discovered point, then save a canonical mapping. BACnet IDs are never invented here." />
        ) : (
          <table className="bms-table">
            <thead>
              <tr>
                <th>Canonical</th>
                <th>BMS Point</th>
                <th>Unit</th>
                <th>Direction</th>
                <th>Value</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {mapRows.map(
                (m: {
                  id: string;
                  qualified?: string;
                  point_identifier?: string;
                  unit?: string;
                  direction?: string;
                  current_value?: number | null;
                  quality?: string;
                }) => (
                  <tr key={m.id}>
                    <td className="font-mono">{m.qualified}</td>
                    <td>{m.point_identifier || '—'}</td>
                    <td>{m.unit || '—'}</td>
                    <td>{m.direction}</td>
                    <td>{m.current_value == null ? '—' : m.current_value}</td>
                    <td>{m.quality || '—'}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>
      ) : null}

      {activeTab === 'writes' ? (
      <>
      <section className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-600 uppercase">Stage G — controlled writes</div>
          <StatusBadge tone={sgOk || sgOkToEnable ? 'live' : 'warn'}>
            {sgOk ? 'G1 APPLY READY' : sgOkToEnable ? 'G1 ARM READY' : 'G1 BLOCKED'}
          </StatusBadge>
        </div>
        <p className="text-[12px] text-slate-600">
          First writable point only: <span className="font-mono text-slate-900">ZONE-01.cooling_setpoint</span>. Expand to{' '}
          <span className="font-mono">AHU-01.sat_setpoint</span> via env after verify success rate is stable.
        </p>
        <ul className="space-y-1.5 text-[12px]">
          {sgChecks.map((c) => (
            <li key={c.name} className="flex flex-wrap gap-2 items-baseline">
              <span className={c.ok ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>{c.ok ? 'PASS' : 'FAIL'}</span>
              <span className="font-mono text-slate-800">{c.name}</span>
              <span className="text-slate-500">{c.detail}</span>
            </li>
          ))}
          {!sgChecks.length ? <li className="text-slate-500">Loading Stage G checklist…</li> : null}
        </ul>
        {sg.verify_stats ? (
          <div className="text-[11px] font-mono text-slate-500">
            verify success {sg.verify_stats.verified}/{sg.verify_stats.sample_size} (window {sg.verify_stats.window}, min{' '}
            {sg.verify_stats.min_success_rate}) · expand_ready={String(sg.verify_stats.expand_ready)}
          </div>
        ) : null}

        <div className="mt-2 text-sm text-slate-800 font-semibold">{st.write_enabled ? 'SUPERVISED WRITES ARMED' : 'READ-ONLY COMMISSIONING'}</div>
        <div className="text-[11px] font-mono text-slate-500 mt-1">
          HVAC_BMS_WRITE_ENABLED must be 1 · BMS WRITE: {st.write_enabled ? 'ENABLED' : 'DISABLED'} · allowlist:{' '}
          {(sg.allowlist || ['ZONE-01.cooling_setpoint']).join(', ')}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="btn-primary"
            disabled={!livePlant || mapRows.length === 0 || !sgOkToEnable}
            title={
              !sgOkToEnable
                ? 'Pass Stage G checklist first (ZONE-01.cooling_setpoint only; arming comes next)'
                : 'Requires Live BMS, writable mapping, HVAC_BMS_WRITE_ENABLED=1, and operator confirm'
            }
            onClick={() => {
              const ok = window.confirm(
                'Enable supervised BMS writes?\n\nFirst allowed point: ZONE-01.cooling_setpoint only.\nApply still requires operator Approve → Rule Engine → Verify.',
              );
              if (!ok) return;
              hvacFetch('/api/platform/bms/write-enable', {
                method: 'POST',
                body: JSON.stringify({ confirm: true }),
              }).then(async (res) => {
                const body = await res.json();
                setMessage(body.message || body.code || body.status || body.detail?.message);
                qc.invalidateQueries();
              });
            }}
          >
            ENABLE WRITES
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              hvacFetch('/api/platform/bms/write-disable', { method: 'POST' }).then(async (res) => {
                const body = await res.json();
                setMessage(body.message || body.code || 'WRITE_DISABLED');
                qc.invalidateQueries();
              })
            }
          >
            DISABLE WRITES
          </button>
        </div>
      </section>

      <section className="glass-card p-4 space-y-3">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-600 uppercase">Supervised write</div>
        <p className="text-[12px] text-slate-600">
          Apply an existing Safe RL / O* <span className="font-mono">control_commands</span> row — PROPOSED → APPROVED → APPLY → VERIFY →
          ROLLBACK.
        </p>
        {!activeCmd ? (
          <EmptyState
            title="No allowlisted command"
            detail="Run Safe RL recommend (or O*) to create a PROPOSED command for ZONE-01.cooling_setpoint."
          />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px] font-mono text-slate-600">
              <div>command_id: {activeCmd.command_id}</div>
              <div>status: {activeCmd.status}</div>
              <div>point: {activeCmd.point_id}</div>
              <div>
                {activeCmd.old_value} → {activeCmd.new_value} ({activeCmd.opportunity || '—'})
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={String(activeCmd.status || '').toUpperCase() !== 'PROPOSED'}
                onClick={() => activeCmd.command_id && cmdAction(activeCmd.command_id, 'approve')}
              >
                APPROVE
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={String(activeCmd.status || '').toUpperCase() !== 'APPROVED' || !sgOk || !st.write_enabled}
                onClick={() => activeCmd.command_id && cmdAction(activeCmd.command_id, 'apply')}
              >
                APPLY
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={!['APPLIED', 'VERIFYING', 'VERIFICATION_FAILED'].includes(String(activeCmd.status || '').toUpperCase())}
                onClick={() => activeCmd.command_id && cmdAction(activeCmd.command_id, 'verify')}
              >
                VERIFY
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={
                  !['APPLIED', 'VERIFIED', 'VERIFICATION_FAILED', 'VERIFYING'].includes(String(activeCmd.status || '').toUpperCase())
                }
                onClick={() => activeCmd.command_id && cmdAction(activeCmd.command_id, 'rollback')}
              >
                ROLLBACK
              </button>
            </div>
          </div>
        )}
      </section>
      </>
      ) : null}
    </div>
  );
}

export default function BmsPage() {
  return (
    <Suspense fallback={<div className="text-[11px] font-mono text-slate-500">Loading Gateway…</div>}>
      <BmsPageInner />
    </Suspense>
  );
}
