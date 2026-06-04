// views/CalendarView.tsx — Appointment calendar, Tablet-optimized
// Day/Week view, filter by doctor, walk-in queue
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/api';
import dayjs from 'dayjs';

interface Appointment {
  id: number;
  appointment_date: string;
  duration_min: number;
  reason?: string;
  status: string;
  is_walk_in: boolean;
  pets: { id: number; name: string; species: string; photo_url?: string };
  users?: { id: number; name: string };
}

const STATUS_COLOR: Record<string, string> = {
  scheduled:   'bg-blue-100 text-blue-700 border-blue-200',
  confirmed:   'bg-green-100 text-green-700 border-green-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed:   'bg-slate-100 text-slate-500 border-slate-200',
  cancelled:   'bg-red-50 text-red-400 border-red-100',
  no_show:     'bg-red-100 text-red-600 border-red-200',
};

const SPECIES_EMOJI: Record<string, string> = {
  Dog: '🐕', Cat: '🐈', Rabbit: '🐇', Bird: '🦜', Hamster: '🐹', Other: '🐾',
};

const CalendarView: React.FC = () => {
  const navigate  = useNavigate();
  const [selectedDate, setDate]       = useState(dayjs());
  const [appointments, setAppts]      = useState<Appointment[]>([]);
  const [loading, setLoading]         = useState(false);
  const [view, setView]               = useState<'day' | 'week'>('day');

  const fetchAppointments = async (date: dayjs.Dayjs) => {
    setLoading(true);
    try {
      const startDate = view === 'day'
        ? date.startOf('day').toISOString()
        : date.startOf('week').toISOString();
      const endDate = view === 'day'
        ? date.endOf('day').toISOString()
        : date.endOf('week').toISOString();

      const res = await apiClient.get(`/appointments?startDate=${startDate}&endDate=${endDate}`);
      setAppts(res.data.data);
    } catch { /* global error handler */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAppointments(selectedDate); }, [selectedDate, view]);

  const prevDay = () => setDate(d => d.subtract(1, view === 'day' ? 'day' : 'week'));
  const nextDay = () => setDate(d => d.add(1,      view === 'day' ? 'day' : 'week'));

  const updateStatus = async (aptId: number, status: string) => {
    try {
      await apiClient.put(`/appointments/${aptId}/status`, { status });
      fetchAppointments(selectedDate);
    } catch { /* global error handler */ }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
        <button
          onClick={() => navigate('/appointments/new')}
          className="bg-blue-600 text-white px-5 py-3 rounded-2xl font-semibold text-sm
                     min-h-[48px] hover:bg-blue-700 active:scale-[0.97] transition-all"
        >
          + Book Appointment
        </button>
      </div>

      {/* View toggle + Date navigation */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">

        {/* Day / Week toggle */}
        <div className="flex bg-slate-100 rounded-2xl p-1">
          {(['day','week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold min-h-[40px] transition-all
                ${view === v ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-2 bg-white rounded-2xl shadow-sm px-4 py-2 flex-1">
          <button onClick={prevDay}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center
                       hover:bg-slate-100 rounded-xl text-xl transition-colors">
            ‹
          </button>
          <button onClick={() => setDate(dayjs())}
            className="flex-1 text-center text-sm font-semibold text-slate-800 min-h-[44px]
                       hover:text-blue-600 transition-colors">
            {view === 'day'
              ? selectedDate.format('dddd, D MMMM YYYY')
              : `${selectedDate.startOf('week').format('D MMM')} – ${selectedDate.endOf('week').format('D MMM YYYY')}`}
          </button>
          <button onClick={nextDay}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center
                       hover:bg-slate-100 rounded-xl text-xl transition-colors">
            ›
          </button>
        </div>

        {/* Today */}
        <button onClick={() => setDate(dayjs())}
          className="px-4 py-2 bg-white rounded-2xl text-sm font-medium text-blue-600
                     border border-blue-200 min-h-[48px] hover:bg-blue-50 transition-colors">
          Today
        </button>
      </div>

      {/* Appointment List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-[88px] bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">📅</div>
          <p className="text-lg font-medium">No appointments</p>
          <p className="text-sm mt-1">Clear schedule for this period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(apt => (
            <div
              key={apt.id}
              className={`bg-white rounded-2xl p-4 shadow-sm border-l-4
                ${STATUS_COLOR[apt.status]?.split(' ')[0] ? '' : 'border-slate-200'}
                ${apt.status === 'in_progress' ? 'border-l-amber-400'
                  : apt.status === 'completed' ? 'border-l-slate-300'
                  : apt.status === 'cancelled' ? 'border-l-red-300'
                  : 'border-l-blue-400'}`}
            >
              <div className="flex items-center gap-4">

                {/* Time */}
                <div className="text-center shrink-0 w-14">
                  <p className="text-base font-bold text-slate-800">
                    {dayjs(apt.appointment_date).format('HH:mm')}
                  </p>
                  <p className="text-xs text-slate-400">{apt.duration_min}m</p>
                </div>

                {/* Pet avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center
                                shrink-0 text-xl overflow-hidden">
                  {apt.pets.photo_url
                    ? <img src={apt.pets.photo_url} alt="" className="w-full h-full object-cover" />
                    : SPECIES_EMOJI[apt.pets.species] ?? '🐾'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {apt.pets.name}
                    {apt.is_walk_in && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Walk-in</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{apt.reason || 'No reason specified'}</p>
                  {apt.users && <p className="text-xs text-slate-400">Dr. {apt.users.name}</p>}
                </div>

                {/* Status badge + quick actions */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-xs px-3 py-1 rounded-full font-medium border ${STATUS_COLOR[apt.status] || 'bg-slate-100 text-slate-500'}`}>
                    {apt.status.replace('_', ' ')}
                  </span>
                  {apt.status === 'scheduled' || apt.status === 'confirmed' ? (
                    <button
                      onClick={() => updateStatus(apt.id, 'in_progress')}
                      className="text-xs text-blue-600 font-medium hover:underline min-h-[32px] px-2"
                    >
                      Start →
                    </button>
                  ) : apt.status === 'in_progress' ? (
                    <button
                      onClick={() => navigate(`/pets/${apt.pets.id}/visit/new`)}
                      className="text-xs text-green-600 font-medium hover:underline min-h-[32px] px-2"
                    >
                      Open EMR →
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Walk-in FAB */}
      <button
        onClick={() => navigate('/appointments/walk-in')}
        className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full
                   w-16 h-16 text-2xl shadow-xl hover:bg-blue-700 active:scale-[0.95]
                   transition-all flex items-center justify-center"
        aria-label="Add walk-in"
        title="Add walk-in patient"
      >
        +
      </button>
    </div>
  );
};

export default CalendarView;
