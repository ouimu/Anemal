import prisma from '../config/db'

export async function quickSearch(tenantId: number, query: string) {
  if (!query || query.trim().length < 1) return []

  const q = query.trim()

  const [pets, owners] = await Promise.all([
    prisma.pet.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { name:        { contains: q, mode: 'insensitive' } },
          { microchipId: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      include: { owner: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    }),
    prisma.owner.findMany({
      where: {
        tenantId,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName:  { contains: q, mode: 'insensitive' } },
          { phone:     { contains: q } },
        ],
      },
      take: 5,
      include: { pets: { where: { isActive: true }, select: { id: true, name: true, species: true } } },
    }),
  ])

  const results = [
    ...pets.map(p => ({
      type: 'pet' as const,
      petId: p.id,
      petName: p.name,
      species: p.species,
      ownerId: p.owner.id,
      ownerName: `${p.owner.firstName} ${p.owner.lastName}`,
      phone: p.owner.phone,
    })),
    ...owners.flatMap(o =>
      o.pets.map(p => ({
        type: 'pet' as const,
        petId: p.id,
        petName: p.name,
        species: p.species,
        ownerId: o.id,
        ownerName: `${o.firstName} ${o.lastName}`,
        phone: o.phone,
      }))
    ),
  ]

  const seen = new Set<number>()
  return results.filter(r => {
    if (seen.has(r.petId)) return false
    seen.add(r.petId)
    return true
  }).slice(0, 10)
}
