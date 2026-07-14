import { Router } from 'express'
import { dispatchDue } from '../services/reminder.service'
import { logger } from '../utils/logger'

// Vercel Cron calls this on schedule (see vercel.json "crons") with
// `Authorization: Bearer ${CRON_SECRET}` — no user session involved.
const router = Router()

router.get('/reminders', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
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
