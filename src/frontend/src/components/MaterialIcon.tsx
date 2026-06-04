import React from 'react'

interface Props {
  name: string
  fill?: 0 | 1
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700
  size?: number
  className?: string
}

export default function MaterialIcon({ name, fill = 0, weight = 400, size = 24, className = '' }: Props) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        fontSize: `${size}px`,
      }}
    >
      {name}
    </span>
  )
}
