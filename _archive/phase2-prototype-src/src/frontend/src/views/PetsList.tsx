// views/PetsList.tsx — Patient list with quick search (Tablet-optimized)
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/api';
import PetCard, { Pet } from '../components/PetCard';

const PetsList: React.FC = () => {
  const navigate = useNavigate();
  const [pets, setPets]         = useState<Pet[]>([]);
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [page, setPage]         = useState(1);
  const [hasMore, setHasMore]   = useState(true);

  const fetchPets = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      const endpoint = q.length >= 2 ? `/pets/search?q=${encodeURIComponent(q)}` : `/pets?page=${p}&limit=20`;
      const res = await apiClient.get(endpoint);
      const data: Pet[] = res.data.data;
      if (p === 1 || q.length >= 2) {
        setPets(data);
      } else {
        setPets(prev => [...prev, ...data]);
      }
      setHasMore(data.length === 20);
    } catch { /* error handled globally */ }
    finally { setLoading(false); }
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchPets(query, 1); }, 300);
    return () => clearTimeout(t);
  }, [query, fetchPets]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPets(query, next);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
        <button
          onClick={() => navigate('/pets/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-2xl
                     font-semibold text-sm min-h-[48px] hover:bg-blue-700 active:scale-[0.97] transition-all"
        >
          + New Patient
        </button>
      </div>

      {/* Search bar — large tap target */}
      <div className="relative mb-5">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, phone, or microchip..."
          className="w-full pl-11 pr-4 py-4 bg-white border border-slate-200 rounded-2xl
                     text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[56px]"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl min-h-[44px] min-w-[44px]
                       flex items-center justify-center"
          >
            ✕
          </button>
        )}
      </div>

      {/* List */}
      <div className="space-y-3">
        {pets.map(pet => (
          <PetCard key={pet.id} pet={pet} onPress={id => navigate(`/pets/${id}`)} />
        ))}

        {/* Empty state */}
        {!loading && pets.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <div className="text-5xl mb-3">🐾</div>
            <p className="text-lg font-medium">
              {query ? 'No patients found' : 'No patients yet'}
            </p>
            <p className="text-sm mt-1">
              {query ? 'Try a different search term' : 'Add your first patient to get started'}
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[72px] bg-white rounded-2xl animate-pulse" />
        ))}

        {/* Load more */}
        {!loading && hasMore && pets.length > 0 && query.length < 2 && (
          <button
            onClick={loadMore}
            className="w-full py-4 text-blue-600 font-medium text-sm min-h-[56px]
                       hover:bg-blue-50 rounded-2xl transition-colors"
          >
            Load more patients
          </button>
        )}
      </div>
    </div>
  );
};

export default PetsList;
