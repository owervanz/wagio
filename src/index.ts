import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { bot } from './bot.js'
import { webhookRouter } from './webhook/handler.js'
import { registerWebhook } from './solana/monitor.js'

const PORT = parseInt(process.env.PORT ?? '3000')
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL
const NODE_ENV = process.env.NODE_ENV ?? 'development'

// ─── Validate required env vars ───────────────────────────────────────────────

const required = [
  'TELEGRAM_BOT_TOKEN',
  'GROQ_API_KEY',
  'SOLANA_RPC_URL',
  'HELIUS_API_KEY',
  'HELIUS_AUTH_HEADER',
  'USDC_MINT',
  'MERCHANT_WALLET_ADDRESS',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
]

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`)
    process.exit(1)
  }
}

// ─── Express server ───────────────────────────────────────────────────────────

const app = express()

app.use(cors())
app.use(express.static('public'))
app.use('/webhook', webhookRouter)

// Health check for Railway (doesn't conflict with static index.html)
app.get('/health', (_req, res) => {
  res.json({
    name: 'Wagio',
    version: '0.1.0',
    status: 'running',
    network: process.env.SOLANA_NETWORK,
  })
})

// ─── Start server + bot ───────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting Wagio...')
  console.log(`   Network: ${process.env.SOLANA_NETWORK ?? 'devnet'}`)
  console.log(`   Env:     ${NODE_ENV}`)

  // Start Express
  app.listen(PORT, () => {
    console.log(`   Server:  http://localhost:${PORT}`)
  })

  // Register Helius webhook
  if (WEBHOOK_BASE_URL) {
    await registerWebhook()
  } else {
    console.warn('⚠️  WEBHOOK_BASE_URL not set — Helius notifications disabled')
    console.warn('   In dev: use ngrok and set WEBHOOK_BASE_URL=https://xxx.ngrok.io')
  }

  // Start Telegram bot
  if (NODE_ENV === 'production' && WEBHOOK_BASE_URL) {
    // Production: use Telegram webhooks (more efficient)
    const telegramWebhookUrl = `${WEBHOOK_BASE_URL}/telegram`
    await bot.telegram.setWebhook(telegramWebhookUrl)
    app.use('/telegram', bot.webhookCallback('/telegram'))
    console.log(`   Telegram webhook: ${telegramWebhookUrl}`)
  } else {
    // Development: use long polling
    await bot.launch()
    console.log('   Telegram: polling mode')
  }

  console.log('✅ Wagio is running!')
  console.log(`   Bot: https://t.me/${(await bot.telegram.getMe()).username}`)
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.once('SIGINT', () => {
  console.log('\n🛑 Shutting down...')
  bot.stop('SIGINT')
  process.exit(0)
})

process.once('SIGTERM', () => {
  console.log('\n🛑 Shutting down...')
  bot.stop('SIGTERM')
  process.exit(0)
})

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
