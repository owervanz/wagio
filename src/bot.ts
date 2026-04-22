import { Telegraf, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { getOrCreateUser, updateUser, getUserByTelegramId } from './db/supabase.js'
import { runAgent } from './agent.js'
import type { Country } from './db/supabase.js'

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!)

const COUNTRY_OPTIONS = Markup.keyboard([
  ['🇦🇷 Argentina (AR)', '🇲🇽 México (MX)'],
  ['🇧🇷 Brasil (BR)', '🇨🇴 Colombia (CO)'],
]).oneTime().resize()

// ─── /start ───────────────────────────────────────────────────────────────────

bot.start(async ctx => {
  const telegramId = ctx.from.id
  const username = ctx.from.username
  const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ')

  await getOrCreateUser(telegramId, username, fullName)

  await ctx.replyWithMarkdown(
    `👋 *¡Hola${fullName ? `, ${fullName}` : ''}!*\n\n` +
    `Soy *Wagio* — tu asistente de cobros.\n\n` +
    `Contame sobre tu trabajo y te genero el link de pago en segundos.\n\n` +
    `_Ejemplo: "Terminé un diseño de $400 para Acme Corp"_\n\n` +
    `Para empezar, ¿desde qué país vas a cobrar?`,
    COUNTRY_OPTIONS
  )

  await updateUser(telegramId, { onboarding_step: 'country' })
})

// ─── /setup ───────────────────────────────────────────────────────────────────

bot.command('setup', async ctx => {
  await ctx.reply('¿Desde qué país vas a cobrar?', COUNTRY_OPTIONS)
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
    `🤖 *Wagio — Ayuda*\n\n` +
    `*¿Qué puedo hacer?*\n` +
    `• Generar facturas en USDC\n` +
    `• Cobrar pagos de clientes internacionales\n` +
    `• Convertir a tu moneda local automáticamente\n\n` +
    `*¿Cómo usarlo?*\n` +
    `Simplemente escribí lo que terminaste:\n` +
    `_"Terminé el logo de $500 para Acme"_\n` +
    `_"¿Me pagó el cliente de la semana pasada?"_\n` +
    `_"Quiero retirar mi pago a mi banco"_\n\n` +
    `*Comandos:*\n` +
    `/status — ver tus facturas\n` +
    `/setup — configurar tu cuenta\n` +
    `/help — esta ayuda`
  )
})

// ─── Handle country selection ─────────────────────────────────────────────────

const COUNTRY_MAP: Record<string, Country> = {
  '🇦🇷 Argentina (AR)': 'AR',
  '🇲🇽 México (MX)': 'MX',
  '🇧🇷 Brasil (BR)': 'BR',
  '🇨🇴 Colombia (CO)': 'CO',
}

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

    if (!user.bank_account) {
      const bankLabel = BANK_LABELS[country]
      await ctx.replyWithMarkdown(
        `✅ País configurado: *${COUNTRY_NAMES[country]}*\n\n` +
        `Ahora enviame tu *${bankLabel}* para que podamos depositarte cuando cobres.\n\n` +
        `_Ejemplo: ${BANK_EXAMPLES[country]}_`
      )
      return
    }

    await ctx.replyWithMarkdown(
      `✅ País actualizado: *${COUNTRY_NAMES[country]}*\n\n` +
      `¡Listo! Contame sobre tu próximo trabajo para generar una factura.`
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
      `✅ *¡Cuenta configurada!*\n\n` +
      `Tipo: ${bankType.toUpperCase()}\n` +
      `Número: \`${text.trim()}\`\n\n` +
      `Ya podés cobrar. Contame sobre tu trabajo y te genero la factura 💪`
    )
    return
  }

  // Handle all other messages via Claude agent
  try {
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
    await ctx.reply(
      '❌ Hubo un error procesando tu mensaje. Por favor intentá de nuevo.'
    )
  }
})

// ─── Error handler ────────────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error('Bot error for', ctx.updateType, err)
})

// ─── Constants ────────────────────────────────────────────────────────────────

const COUNTRY_NAMES: Record<Country, string> = {
  AR: 'Argentina 🇦🇷',
  MX: 'México 🇲🇽',
  BR: 'Brasil 🇧🇷',
  CO: 'Colombia 🇨🇴',
}

const BANK_LABELS: Record<Country, string> = {
  AR: 'CBU o CVU',
  MX: 'CLABE interbancaria',
  BR: 'chave PIX',
  CO: 'número de cuenta PSE',
}

const BANK_EXAMPLES: Record<Country, string> = {
  AR: '0000003100012345678901',
  MX: '646180110400000001',
  BR: 'email@tudominio.com o CPF',
  CO: '1234567890 (Bancolombia)',
}

const BANK_TYPES: Record<Country, 'cvu' | 'spei' | 'pix' | 'pse'> = {
  AR: 'cvu',
  MX: 'spei',
  BR: 'pix',
  CO: 'pse',
}
