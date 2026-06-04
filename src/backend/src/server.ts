import app from './app'
import { config } from './config/env'

app.listen(config.port, () => {
  console.log(`🚀 VetClinic API running on http://localhost:${config.port}`)
  console.log(`   ENV: ${config.nodeEnv}`)
})
