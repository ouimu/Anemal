import { Request, Response } from 'express'
import { quickSearch } from '../services/searchService'

export async function handleSearch(req: Request, res: Response) {
  try {
    const q = String(req.query.q ?? '').trim()
    if (!q) return res.json({ success: true, data: [] })
    const data = await quickSearch(req.context!.tenantId, q)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, error: 'Search failed' })
  }
}
