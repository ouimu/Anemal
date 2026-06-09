import app from './app'
import { config } from './config/env'
import { logger } from './utils/logger'
import { startReminderWorker } from './workers/reminder.worker'

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'VetClinic API started')
  startReminderWorker()
})

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection')
})
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception')
  process.exit(1)
})
