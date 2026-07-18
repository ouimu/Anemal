// Force tests onto vetclinic_test — override:true beats Prisma's own auto-load of .env,
// which otherwise points at the dev DB and lets tests pollute it (see .env.test).
require('dotenv').config({ path: require('path').join(__dirname, '.env.test'), override: true })
