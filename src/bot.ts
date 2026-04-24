import { Telegraf, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { getOrCreateUser, updateUser } from './db/supabase.js'
import { runAgent } from './agent.js'
import { COUNTRY_NAMES, COUNTRY_FLAGS, BANK_LABELS, BANK_EXAMPLES, BANK_TYPES } from './lib/countries.js'
import { resetConversation } from './lib/conversations.js'
import type { Country } from './db/supabase.js'

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!)

// ─── Rate limiter ─────────────────────────────────────────────────────────────

const OWNER_ID = 0 // ← poné tu Telegram ID acá para tener acceso ilimitado
const LIMIT_PER_HOUR = 10   // mensajes al agente AI por hora
const LIMIT_PER_DAY  = 30   // mensajes al agente AI por día

interface UserUsage {
  hourCount: number
  dayCount:  number
  hourReset: number   // timestamp
  dayReset:  number   // timestamp
}

const usage = new Map<number, UserUsage>()

function checkRateLimit(telegramId: number): { allowed: boolean; reason?: string } {
  if (telegramId === OWNER_ID) return { allowed: true }

  const now = Date.now()
  const u = usage.get(telegramId) ?? {
    hourCount: 0, dayCount: 0,
    hourReset: now + 3_600_000,   // 1 hora
    dayReset:  now + 86_400_000,  // 24 horas
  }

  // Reset counters if windows expired
  if (now > u.hourReset) { u.hourCount = 0; u.hourReset = now + 3_600_000 }
  if (now > u.dayReset)  { u.dayCount  = 0; u.dayReset  = now + 86_400_000 }

  if (u.dayCount >= LIMIT_PER_DAY) {
    const mins = Math.ceil((u.dayReset - now) / 60_000)
    return { allowed: false, reason: `Alcanzaste el límite diario (${LIMIT_PER_DAY} mensajes). Volvé en ${mins} minutos.` }
  }

  if (u.hourCount >= LIMIT_PER_HOUR) {
    const mins = Math.ceil((u.hourReset - now) / 60_000)
    return { allowed: false, reason: `Límite por hora alcanzado (${LIMIT_PER_HOUR} mensajes). Volvé en ${mins} minutos.` }
  }

  u.hourCount++
  u.dayCount++
  usage.set(telegramId, u)
  return { allowed: true }
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────

function countryButton(c: Country): string {
  return `${COUNTRY_FLAGS[c]} ${COUNTRY_NAMES[c]} (${c})`
}

const COUNTRY_OPTIONS = Markup.keyboard([
  [countryButton('AR'), countryButton('MX')],
  [countryButton('BR'), countryButton('CO')],
]).oneTime().resize()

const COUNTRY_MAP: Record<string, Country> = {
  [countryButton('AR')]: 'AR',
  [countryButton('MX')]: 'MX',
  [countryButton('BR')]: 'BR',
  [countryButton('CO')]: 'CO',
}

// ─── /start ───────────────────────────────────────────────────────────────────

bot.start(async ctx => {
  const telegramId = ctx.from.id
  const username = ctx.from.username
  const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ')

  resetConversation(telegramId)
  await getOrCreateUser(telegramId, username, fullName)

  await ctx.replyWithMarkdown(
    `👋 *¡Hola${fullName ? `, ${fullName}` : ''}!*\n\n` +
    `Soy *Wagio* — cobro tus trabajos en dólares y te deposito en tu cuenta bancaria en minutos.\n\n` +
    `―――――――――――\n\n` +
    `*¿Cómo funciona?*\n\n` +
    `Vos: _"Terminé un diseño de $400 para Acme"_\n` +
    `→ Te genero el link de pago al instante ⚡\n` +
    `→ Tu cliente paga en dólares\n` +
    `→ Vos recibís pesos/reales en tu banco 🏦\n\n` +
    `―――――――――――\n\n` +
    `🌎 Cobertura: 🇦🇷 🇲🇽 🇧🇷 🇨🇴\n\n` +
    `¿Desde qué país cobrás?`,
    COUNTRY_OPTIONS
  )

  await updateUser(telegramId, { onboarding_step: 'country' })
})

// ─── /setup ───────────────────────────────────────────────────────────────────

bot.command('setup', async ctx => {
  await ctx.reply('¿Desde qué país vas a cobrar?', COUNTRY_OPTIONS)
})

// ─── /reset ──────────────────────────────────────────────────────────────────

bot.command('reset', async ctx => {
  resetConversation(ctx.from.id)
  await ctx.reply('🧹 Conversación reiniciada.\n\nContame en qué te ayudo.')
})

// ─── /status ─────────────────────────────────────────────────────────────────

bot.command('status', async ctx => {
  const telegramId = ctx.from.id
  await getOrCreateUser(telegramId)

  const result = await runAgent('Mostrame todas mis facturas', telegramId)
  await ctx.replyWithMarkdown(result.text)
})

// ─── /help ───────────────────────────────────────────────────────────────────

bot.command('help', async ctx => {
  await ctx.replyWithMarkdown(
    `🤖 *Wagio — Cómo funciona*\n\n` +
    `*1️⃣  Terminás un trabajo*\n` +
    `_"Terminé el logo de $500 para Acme"_\n\n` +
    `*2️⃣  Te genero el link de pago*\n` +
    `QR o link que tu cliente paga en dólares desde cualquier país.\n\n` +
    `*3️⃣  Tu cliente paga*\n` +
    `Te aviso al instante cuando entra el dinero.\n\n` +
    `*4️⃣  Recibís en tu moneda local*\n` +
    `ARS · MXN · BRL · COP directo a tu cuenta bancaria.\n\n` +
    `―――――――――――\n\n` +
    `💸 *Comisión:* 1% — sin costos ocultos\n` +
    `🌎 *Países:* 🇦🇷 🇲🇽 🇧🇷 🇨🇴\n\n` +
    `―――――――――――\n\n` +
    `*Ejemplos:*\n` +
    `• _"Cobré $800 a Globant por un proyecto"_\n` +
    `• _"¿Me pagó el cliente de la semana pasada?"_\n` +
    `• _"Quiero retirar a mi banco"_\n` +
    `• _"¿Cómo funciona esto?"_\n\n` +
    `*Comandos:*\n` +
    `/status · /setup · /reset · /help`
  )
})

// ─── Handle country selection ─────────────────────────────────────────────────

bot.on(message('text'), async ctx => {
  const telegramId = ctx.from.id
  const text = ctx.message.text
  const user = await getOrCreateUser(telegramId, ctx.from.username)

  // Handle country selection
  if (COUNTRY_MAP[text]) {
    const country = COUNTRY_MAP[text]
    await updateUser(telegramId, {
      country,
      onboarding_step: user.bank_account ? 'done' : 'bank',
    })

    const countryLabel = `${COUNTRY_FLAGS[country]} ${COUNTRY_NAMES[country]}`

    if (!user.bank_account) {
      await ctx.replyWithMarkdown(
        `✅ *País configurado: ${countryLabel}*\n\n` +
        `Ahora necesito tu cuenta bancaria para depositarte cuando cobres.\n\n` +
        `Enviame tu *${BANK_LABELS[country]}*\n\n` +
        `_Ej: ${BANK_EXAMPLES[country]}_`
      )
      return
    }

    await ctx.replyWithMarkdown(
      `✅ *País actualizado: ${countryLabel}*\n\n` +
      `¡Listo! Contame sobre tu próximo trabajo y te genero la factura.`
    )
    return
  }

  // Handle bank account setup
  if (user.onboarding_step === 'bank' && user.country) {
    const bankType = BANK_TYPES[user.country]
    await updateUser(telegramId, {
      bank_account: { type: bankType, account: text.trim() },
      onboarding_step: 'done',
    })

    await ctx.replyWithMarkdown(
      `🎉 *¡Todo listo!*\n\n` +
      `Tipo: ${bankType.toUpperCase()}\n` +
      `Cuenta: \`${text.trim()}\`\n\n` +
      `―――――――――――\n\n` +
      `Ya podés cobrar 💪\n\n` +
      `Escribime sobre tu próximo trabajo y te genero la factura en segundos.`
    )
    return
  }

  // Handle all other messages via Claude agent
  try {
    // Check rate limit before calling the AI agent
    const limit = checkRateLimit(telegramId)
    if (!limit.allowed) {
      await ctx.replyWithMarkdown(`⏳ *Límite alcanzado*\n\n${limit.reason}`)
      return
    }

    await ctx.sendChatAction('typing')
    const result = await runAgent(text, telegramId, user.country as Country | undefined)

    // Send text response
    if (result.text) {
      await ctx.replyWithMarkdown(result.text)
    }

    // Send QR code if invoice was created
    if (result.invoiceResult?.qr_buffer) {
      await ctx.replyWithPhoto(
        { source: result.invoiceResult.qr_buffer },
        { caption: `📲 QR para ${result.invoiceResult.client_name} — $${result.invoiceResult.amount_usdc} USDC` }
      )
    }
  } catch (err) {
    console.error('Agent error:', err)
    await ctx.reply('❌ Algo salió mal.\n\nPor favor intentá de nuevo.')
  }
})

// ─── Error handler ────────────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error('Bot error for', ctx.updateType, err)
})

