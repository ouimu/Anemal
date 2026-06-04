import { Request, Response, NextFunction } from 'express'
import { quickSearch } from '../services/searchService'

export async function handleSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = String(req.query.q ?? '').trim()
    if (!q) { res.json({ success: true, data: [] }); return }
    const data = await quickSearch(req.context!.tenantId, q)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
