import { Router } from 'express'
import { config } from '../config/env'
import { dispatchDue } from '../services/reminder.service'
import { logger } from '../utils/logger'

// Vercel Cron calls this on schedule (see vercel.json "crons") with
// `Authorization: Bearer ${CRON_SECRET}` — no user session involved.
// `config.cronSecret` is validated as required at startup (config/env.ts),
// so it is always a non-empty string here — no fail-open path exists.
const router = Router()

router.get('/reminders', async (req, res) => {
  const expected = `Bearer ${config.cronSecret}`
  if (req.headers.authorization !== expected) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    const { sent } = await dispatchDue()
    res.json({ sent })
  } catch (err) {
    logger.error({ err }, 'cron reminder dispatch failed')
    res.status(500).json({ error: 'dispatch failed' })
  }
})

export default router
