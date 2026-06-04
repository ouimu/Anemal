// ==============================================
// components/PetCard.tsx
// Touch-friendly pet card for Tablet
// Min touch target: 72px height
// ==============================================

import React from 'react';

export interface Pet {
  id: number;
  name: string;
  species: string;
  breed?: string;
  birth_date?: string;
  gender?: string;
  photo_url?: string;
  is_flagged?: boolean;
  owners: {
    first_name: string;
    last_name: string;
    phone: string;
  };
}

interface PetCardProps {
  pet: Pet;
  onPress: (id: number) => void;
}

const SPECIES_EMOJI: Record<string, string> = {
  Dog: '🐕',
  Cat: '🐈',
  Rabbit: '🐇',
  Bird: '🦜',
  Hamster: '🐹',
  Reptile: '🦎',
  Other: '🐾',
};

function calculateAge(birthDate?: string): string {
  if (!birthDate) return 'Unknown age';
  const birth = new Date(birthDate);
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear();
  const months = now.getMonth() - birth.getMonth();
  if (years === 0) return `${months}m`;
  return `${years}y ${months < 0 ? months + 12 : months}m`;
}

export const PetCard: React.FC<PetCardProps> = ({ pet, onPress }) => (
  <button
    onClick={() => onPress(pet.id)}
    className={`
      w-full flex items-center gap-4 px-4 py-3 bg-white rounded-2xl
      shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150
      min-h-[72px] touch-manipulation text-left
      border-2 ${pet.is_flagged ? 'border-amber-400' : 'border-transparent'}
    `}
    aria-label={`View ${pet.name}'s profile`}
  >
    {/* Pet photo or species emoji */}
    <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-50 flex items-center justify-center shrink-0">
      {pet.photo_url ? (
        <img
          src={pet.photo_url}
          alt={pet.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-2xl" role="img" aria-label={pet.species}>
          {SPECIES_EMOJI[pet.species] ?? '🐾'}
        </span>
      )}
    </div>

    {/* Pet info */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-base font-semibold text-neutral-900 truncate">{pet.name}</p>
        {pet.is_flagged && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">
            ⚠ Watch
          </span>
        )}
      </div>
      <p className="text-sm text-neutral-500 truncate">
        {pet.species}{pet.breed ? ` · ${pet.breed}` : ''} · {calculateAge(pet.birth_date)}
      </p>
      <p className="text-xs text-neutral-400 truncate">
        {pet.owners.first_name} {pet.owners.last_name} · {pet.owners.phone}
      </p>
    </div>

    {/* Chevron */}
    <svg className="w-5 h-5 text-neutral-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

export default PetCard;
