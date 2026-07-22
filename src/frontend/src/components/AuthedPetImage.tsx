import { useEffect, useState } from 'react'
import api from '../utils/api'
import MaterialIcon from './MaterialIcon'

/**
 * Fetches a private pet photo as a blob (carrying the Bearer auth header
 * via the axios interceptor) and exposes it as a revocable object URL.
 * Plain `<img src="/api/pets/:id/photo">` cannot send the Authorization
 * header, so this hook is the only correct way to render a pet photo
 * post-ADR-0022.
 */
export function useAuthedImage(petId: number | undefined): { objectUrl: string | null; loading: boolean } {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (!petId) { setObjectUrl(null); return }
    let cancelled = false
    let currentUrl: string | null = null
    setLoading(true)

    api.get(`/api/pets/${petId}/photo`, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(res.data as Blob)
        setObjectUrl(currentUrl)
      })
      .catch(() => { if (!cancelled) setObjectUrl(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [petId])

  return { objectUrl, loading }
}

interface AuthedPetImageProps {
  petId?:     number
  alt:        string
  className?: string
  iconSize?:  number
}

export default function AuthedPetImage({ petId, alt, className, iconSize = 24 }: AuthedPetImageProps) {
  const { objectUrl } = useAuthedImage(petId)

  if (!objectUrl) {
    return (
      <div className={`bg-surface-container-high flex items-center justify-center ${className ?? ''}`}>
        <MaterialIcon name="pets" size={iconSize} className="text-on-surface-variant" />
      </div>
    )
  }
  return <img src={objectUrl} alt={alt} className={className} />
}
