// views/PetProfile.tsx — Pet profile with treatment timeline
// Tablet-optimized: large cards, easy navigation
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../utils/api';

interface Owner {
  id: number; first_name: string; last_name: string; phone: string; email?: string;
}

interface Vaccination {
  id: number; vaccine_name: string; administered_date: string; next_due_date?: string;
}

interface MedicalRecord {
  id: number; visit_date: string; assessment?: string; subjective?: string;
  status: string;
  users?: { name: string };
}

interface Pet {
  id: number; name: string; species: string; breed?: string;
  birth_date?: string; gender?: string; color?: string;
  microchip_id?: string; photo_url?: string; is_flagged?: boolean; flag_reason?: string;
  notes?: string;
  owners: Owner;
  vaccinations: Vaccination[];
}

const SPECIES_EMOJI: Record<string, string> = {
  Dog: '🐕', Cat: '🐈', Rabbit: '🐇', Bird: '🦜', Hamster: '🐹', Reptile: '🦎', Other: '🐾',
};

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calcAge(birthDate?: string): string {
  if (!birthDate) return 'Unknown';
  const years = Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} year${years !== 1 ? 's' : ''}`;
}

type ActiveTab = 'info' | 'history' | 'vaccines';

const PetProfile: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pet, setPet]             = useState<Pet | null>(null);
  const [records, setRecords]     = useState<MedicalRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setTab]       = useState<ActiveTab>('info');

  useEffect(() => {
    const load = async () => {
      try {
        const [petRes, recRes] = await Promise.all([
          apiClient.get(`/pets/${id}`),
          apiClient.get(`/medical-records?petId=${id}&limit=10`),
        ]);
        setPet(petRes.data.data);
        setRecords(recRes.data.data);
      } catch { /* global error handler */ }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="p-6 text-center">
        <div className="text-5xl mb-3">🐾</div>
        <p className="text-slate-500">Patient not found.</p>
        <button onClick={() => navigate('/pets')} className="mt-4 text-blue-600 underline min-h-[44px]">
          Back to Patients
        </button>
      </div>
    );
  }

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'info',     label: 'Profile'   },
    { key: 'history',  label: `History (${records.length})` },
    { key: 'vaccines', label: `Vaccines (${pet.vaccinations?.length ?? 0})` },
  ];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">

      {/* Back + New Visit */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate('/pets')}
          className="min-h-[44px] min-w-[44px] flex items-center gap-2 text-slate-600
                     hover:bg-slate-100 rounded-xl px-3 transition-colors"
        >
          ← <span className="text-sm font-medium">Patients</span>
        </button>
        <button
          onClick={() => navigate(`/pets/${id}/visit/new`)}
          className="bg-blue-600 text-white px-5 py-3 rounded-2xl font-semibold text-sm
                     min-h-[48px] hover:bg-blue-700 active:scale-[0.97] transition-all"
        >
          + New Visit
        </button>
      </div>

      {/* Pet Header Card */}
      <div className={`bg-white rounded-3xl p-5 shadow-sm mb-5 ${pet.is_flagged ? 'border-2 border-amber-400' : ''}`}>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-blue-50
                          flex items-center justify-center shrink-0 text-4xl">
            {pet.photo_url
              ? <img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" />
              : SPECIES_EMOJI[pet.species] ?? '🐾'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{pet.name}</h1>
              {pet.is_flagged && (
                <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-medium">
                  ⚠ {pet.flag_reason || 'Watch'}
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm mt-0.5">
              {pet.species}{pet.breed ? ` · ${pet.breed}` : ''} · {calcAge(pet.birth_date)}
              {pet.gender ? ` · ${pet.gender}` : ''}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              Owner: <span className="text-slate-600 font-medium">
                {pet.owners.first_name} {pet.owners.last_name}
              </span> · {pet.owners.phone}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-5">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`flex-1 py-3 rounded-2xl text-sm font-semibold min-h-[48px] transition-all
              ${activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
          <InfoRow label="Microchip ID"   value={pet.microchip_id} />
          <InfoRow label="Date of Birth"  value={formatDate(pet.birth_date)} />
          <InfoRow label="Color / Markings" value={pet.color} />
          <InfoRow label="Gender"         value={pet.gender} />
          <InfoRow label="Owner Email"    value={pet.owners.email} />
          {pet.notes && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-700">{pet.notes}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {records.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-2">📋</div>
              <p>No visit records yet.</p>
            </div>
          ) : records.map(rec => (
            <button
              key={rec.id}
              onClick={() => navigate(`/medical-records/${rec.id}`)}
              className="w-full bg-white rounded-2xl p-4 shadow-sm text-left
                         hover:shadow-md active:scale-[0.98] transition-all min-h-[72px]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {formatDate(rec.visit_date)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {rec.assessment || rec.subjective || 'No diagnosis recorded'}
                  </p>
                  {rec.users && (
                    <p className="text-xs text-slate-400 mt-0.5">Dr. {rec.users.name}</p>
                  )}
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 ml-3
                  ${rec.status === 'completed' ? 'bg-green-100 text-green-700'
                    : rec.status === 'billed'  ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'}`}>
                  {rec.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {activeTab === 'vaccines' && (
        <div className="space-y-3">
          {(!pet.vaccinations || pet.vaccinations.length === 0) ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-2">💉</div>
              <p>No vaccination records.</p>
            </div>
          ) : pet.vaccinations.map(v => (
            <div key={v.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{v.vaccine_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Given: {formatDate(v.administered_date)}</p>
                </div>
                {v.next_due_date && (
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Next due</p>
                    <p className={`text-xs font-medium
                      ${new Date(v.next_due_date) < new Date() ? 'text-red-600' : 'text-green-600'}`}>
                      {formatDate(v.next_due_date)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Sub-component
const InfoRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="flex justify-between items-center py-2 border-b border-slate-50">
    <span className="text-sm text-slate-400">{label}</span>
    <span className="text-sm text-slate-700 font-medium">{value || '—'}</span>
  </div>
);

export default PetProfile;
