// views/EMRView.tsx — SOAP Note entry, Tablet-optimized
// Touch-friendly: steppers for numbers, quick-select for common values
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../utils/api';

type SoapTab = 'S' | 'O' | 'A' | 'P';

const COMMON_COMPLAINTS = ['Vomiting','Diarrhea','Not eating','Lethargy','Limping','Skin issue','Coughing','Urinary problem','Eye/Ear issue','Annual checkup','Vaccination','Other'];

const EMRView: React.FC = () => {
  const { petId, id: recordId } = useParams();
  const navigate                = useNavigate();
  const [activeTab, setTab]     = useState<SoapTab>('S');
  const [saving, setSaving]     = useState(false);

  const [form, setForm] = useState({
    subjective: '', objective: '', assessment: '', plan: '',
    weightKg: '', temperatureC: '', heartRateBpm: '', respRateRpm: '',
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        petId: petId ? parseInt(petId) : undefined,
        ...form,
        weightKg:      form.weightKg      ? parseFloat(form.weightKg)      : undefined,
        temperatureC:  form.temperatureC  ? parseFloat(form.temperatureC)  : undefined,
        heartRateBpm:  form.heartRateBpm  ? parseInt(form.heartRateBpm)    : undefined,
        respRateRpm:   form.respRateRpm   ? parseInt(form.respRateRpm)      : undefined,
      };
      const res = await apiClient.post('/medical-records', payload);
      navigate(`/medical-records/${res.data.data.id}`);
    } catch { /* global error handler */ }
    finally { setSaving(false); }
  };

  const tabs: { key: SoapTab; label: string; color: string }[] = [
    { key: 'S', label: 'Subjective',  color: 'bg-blue-500' },
    { key: 'O', label: 'Objective',   color: 'bg-green-500' },
    { key: 'A', label: 'Assessment',  color: 'bg-amber-500' },
    { key: 'P', label: 'Plan',        color: 'bg-purple-500' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center
                     rounded-xl hover:bg-slate-100 text-xl"
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Visit Record</h1>
          <p className="text-sm text-slate-500">SOAP Note</p>
        </div>
      </div>

      {/* SOAP Tab Switcher — large, easy to tap */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`
              py-3 rounded-2xl font-semibold text-sm min-h-[52px] transition-all
              ${activeTab === tab.key
                ? `${tab.color} text-white shadow-md`
                : 'bg-white text-slate-500 border border-slate-200'}
            `}
          >
            [{tab.key}] {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-3xl p-5 shadow-sm mb-4">

        {/* S — Subjective */}
        {activeTab === 'S' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-blue-700 mb-2">Chief Complaint</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {COMMON_COMPLAINTS.map(c => (
                <button
                  key={c}
                  onClick={() => update('subjective', form.subjective ? `${form.subjective}, ${c}` : c)}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm
                             min-h-[44px] hover:bg-blue-100 active:scale-[0.97] transition-all"
                >
                  {c}
                </button>
              ))}
            </div>
            <textarea
              value={form.subjective}
              onChange={e => update('subjective', e.target.value)}
              placeholder="Additional subjective details..."
              rows={4}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-base
                         focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        )}

        {/* O — Objective (Vitals) */}
        {activeTab === 'O' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-green-700 mb-2">Vital Signs</p>
            <div className="grid grid-cols-2 gap-4">
              <NumericField label="Weight (kg)"    value={form.weightKg}     onChange={v => update('weightKg', v)}     step="0.1" />
              <NumericField label="Temperature °C" value={form.temperatureC} onChange={v => update('temperatureC', v)} step="0.1" />
              <NumericField label="Heart Rate BPM" value={form.heartRateBpm} onChange={v => update('heartRateBpm', v)} step="1" />
              <NumericField label="Resp Rate RPM"  value={form.respRateRpm}  onChange={v => update('respRateRpm', v)}  step="1" />
            </div>
            <textarea
              value={form.objective}
              onChange={e => update('objective', e.target.value)}
              placeholder="Physical exam findings..."
              rows={4}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-base
                         focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
        )}

        {/* A — Assessment */}
        {activeTab === 'A' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-amber-700 mb-2">Diagnosis / Assessment</p>
            <textarea
              value={form.assessment}
              onChange={e => update('assessment', e.target.value)}
              placeholder="Diagnosis and differential diagnoses..."
              rows={8}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-base
                         focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>
        )}

        {/* P — Plan */}
        {activeTab === 'P' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-purple-700 mb-2">Treatment Plan</p>
            <textarea
              value={form.plan}
              onChange={e => update('plan', e.target.value)}
              placeholder="Treatment plan, medications, follow-up instructions..."
              rows={8}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-base
                         focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            {/* Quick action buttons */}
            <div className="flex gap-3 flex-wrap">
              <button className="flex items-center gap-2 px-4 py-3 bg-purple-50 text-purple-700
                                 rounded-2xl text-sm font-medium min-h-[48px] hover:bg-purple-100">
                💊 Add Medicine
              </button>
              <button className="flex items-center gap-2 px-4 py-3 bg-purple-50 text-purple-700
                                 rounded-2xl text-sm font-medium min-h-[48px] hover:bg-purple-100">
                🧪 Order Lab
              </button>
              <button className="flex items-center gap-2 px-4 py-3 bg-purple-50 text-purple-700
                                 rounded-2xl text-sm font-medium min-h-[48px] hover:bg-purple-100">
                📅 Follow-up
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save button — always visible, thumb-reachable */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 text-white font-bold py-5 rounded-2xl text-base
                   min-h-[60px] hover:bg-blue-700 active:scale-[0.98] transition-all
                   disabled:opacity-50 shadow-lg shadow-blue-200"
      >
        {saving ? 'Saving...' : '💾 Save Record & Proceed to Billing'}
      </button>
    </div>
  );
};

// ── NumericField — stepper + direct input, large tap target ──
interface NumericFieldProps {
  label: string; value: string; onChange: (v: string) => void; step: string;
}
const NumericField: React.FC<NumericFieldProps> = ({ label, value, onChange, step }) => {
  const adjust = (delta: number) => {
    const current = parseFloat(value || '0');
    onChange(String(Math.max(0, +(current + delta * parseFloat(step)).toFixed(2))));
  };
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <button onClick={() => adjust(-1)}
          className="min-w-[44px] min-h-[48px] bg-slate-100 rounded-xl text-xl font-bold
                     hover:bg-slate-200 active:scale-[0.95] flex items-center justify-center">
          −
        </button>
        <input
          type="number" value={value} onChange={e => onChange(e.target.value)}
          step={step} min="0"
          className="flex-1 border border-slate-200 rounded-xl px-3 py-3 text-center text-base
                     min-h-[48px] focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button onClick={() => adjust(1)}
          className="min-w-[44px] min-h-[48px] bg-slate-100 rounded-xl text-xl font-bold
                     hover:bg-slate-200 active:scale-[0.95] flex items-center justify-center">
          +
        </button>
      </div>
    </div>
  );
};

// Stub views (expand in Phase 2)
export const PetProfile: React.FC  = () => <div className="p-6"><h1 className="text-2xl font-bold">Pet Profile — WIP</h1></div>;
export const CalendarView: React.FC = () => <div className="p-6"><h1 className="text-2xl font-bold">Appointment Calendar — WIP</h1></div>;

export default EMRView;
