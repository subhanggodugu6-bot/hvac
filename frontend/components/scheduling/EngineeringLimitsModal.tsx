'use client';

import React, { useState, useEffect } from 'react';
import { EngineeringLimits } from '@/lib/types';
import { Sliders, X, Check, ShieldCheck } from 'lucide-react';
import { fetchLimits, updateLimits } from '@/lib/api';

interface EngineeringLimitsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EngineeringLimitsModal: React.FC<EngineeringLimitsModalProps> = ({ isOpen, onClose }) => {
  const [limits, setLimits] = useState<EngineeringLimits | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchLimits().then(setLimits).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen || !limits) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateLimits(limits);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">Engineering Limits & Safety Constraints</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Building Thermal Limits */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-sky-400 uppercase font-mono tracking-wider">
            Building Space & Comfort Limits (ASHRAE 55)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Min Space Temp (°C)</label>
              <input
                type="number"
                step="0.5"
                value={limits.building.min_space_temp_c}
                onChange={(e) => setLimits({
                  ...limits,
                  building: { ...limits.building, min_space_temp_c: parseFloat(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Max Space Temp (°C)</label>
              <input
                type="number"
                step="0.5"
                value={limits.building.max_space_temp_c}
                onChange={(e) => setLimits({
                  ...limits,
                  building: { ...limits.building, max_space_temp_c: parseFloat(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Max Setpoint Step (°C)</label>
              <input
                type="number"
                step="0.1"
                value={limits.building.max_zone_setpoint_step_c}
                onChange={(e) => setLimits({
                  ...limits,
                  building: { ...limits.building, max_zone_setpoint_step_c: parseFloat(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* AHU Supply Air Limits */}
        <div className="space-y-3 border-t border-slate-800 pt-3">
          <h3 className="text-xs font-bold text-emerald-700 uppercase font-mono tracking-wider">
            AHU Supply Air Temperature Limits (Guideline 36)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Min Freeze SAT (°C)</label>
              <input
                type="number"
                step="0.5"
                value={limits.ahu.min_sat_c}
                onChange={(e) => setLimits({
                  ...limits,
                  ahu: { ...limits.ahu, min_sat_c: parseFloat(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Max De-humid SAT (°C)</label>
              <input
                type="number"
                step="0.5"
                value={limits.ahu.max_sat_c}
                onChange={(e) => setLimits({
                  ...limits,
                  ahu: { ...limits.ahu, max_sat_c: parseFloat(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Max SAT Step/Cycle (°C)</label>
              <input
                type="number"
                step="0.1"
                value={limits.ahu.max_sat_step_c}
                onChange={(e) => setLimits({
                  ...limits,
                  ahu: { ...limits.ahu, max_sat_step_c: parseFloat(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Chiller Plant Limits */}
        <div className="space-y-3 border-t border-slate-800 pt-3">
          <h3 className="text-xs font-bold text-amber-400 uppercase font-mono tracking-wider">
            Chiller Plant & Anti-Cycling Constraints
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Min ChW Temp (°C)</label>
              <input
                type="number"
                step="0.1"
                value={limits.chiller_plant.min_chws_temp_c}
                onChange={(e) => setLimits({
                  ...limits,
                  chiller_plant: { ...limits.chiller_plant, min_chws_temp_c: parseFloat(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Max ChW Reset Temp (°C)</label>
              <input
                type="number"
                step="0.1"
                value={limits.chiller_plant.max_chws_temp_c}
                onChange={(e) => setLimits({
                  ...limits,
                  chiller_plant: { ...limits.chiller_plant, max_chws_temp_c: parseFloat(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Min Run Timer (mins)</label>
              <input
                type="number"
                value={limits.chiller_plant.chiller_min_run_minutes}
                onChange={(e) => setLimits({
                  ...limits,
                  chiller_plant: { ...limits.chiller_plant, chiller_min_run_minutes: parseInt(e.target.value) }
                })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-lg shadow-sky-600/20 disabled:opacity-50"
          >
            {saveSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : <ShieldCheck className="w-4 h-4" />}
            <span>{saveSuccess ? 'Limits Saved!' : isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
