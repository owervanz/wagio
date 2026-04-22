import express from 'express'
import { parseHeliusPayment } from '../solana/monitor.js'
import { getInvoiceByReference, updateInvoice, getUserByTelegramId } from '../db/supabase.js'
import { offrampToLocal } from '../offramp/bitso.js'
import { bot } from '../bot.js'

export const webhookRouter = express.Router()

// ─── Helius payment webhook ───────────────────────────────────────────────────
// Called by Helius when any USDC transfer hits the merchant wallet

webhookRouter.post('/payment', express.json(), async (req, res) => {
  res.status(200).send('ok')  // Always respond fast to Helius

  try {
    const transactions = Array.isArray(req.body) ? req.body : [req.body]

    for (const rawTx of transactions) {
      const payment = parseHeliusPayment(rawTx)
      if (!payment) continue

      console.log('💰 Payment detected:', {
        sig: payment.txSignature.slice(0, 12),
        amount: payment.amountUsdc,
        memo: payment.memoField,
      })

      // Try to match via memo field (invoice ID)
      let invoice = null
      if (payment.memoField) {
        invoice = await getInvoiceByReference(payment.memoField)
      }

      if (!invoice) {
        console.log('⚠️  No invoice found for memo:', payment.memoField)
        continue
      }

      if (invoice.status !== 'pending') {
        console.log('⚠️  Invoice already processed:', invoice.status)
        continue
      }

      // Mark invoice as paid
      await updateInvoice(invoice.id, {
        status: 'paid',
        tx_signature: payment.txSignature,
        paid_at: new Date().toISOString(),
      })

      // Notify the freelancer via Telegram
      const user = await getUserByTelegramId(
        // We need to get the telegram_id from the user_id
        0  // placeholder — see below
      )

      // Get user via invoice's user_id
      const { data: userRow } = await import('../db/supabase.js').then(m =>
        m.db.from('users').select('*').eq('id', invoice!.user_id).single()
      )

      if (!userRow) continue

      await bot.telegram.sendMessage(
        userRow.telegram_id,
        `💰 *¡Pago recibido!*\n\n` +
        `Cliente: ${invoice.client_name}\n` +
        `Monto: $${invoice.amount_usdc} USDC\n` +
        `Tx: \`${payment.txSignature.slice(0, 12)}...\`\n\n` +
        `🔄 Iniciando conversión a ${invoice.country === 'AR' ? 'ARS' : invoice.country === 'MX' ? 'MXN' : invoice.country === 'BR' ? 'BRL' : 'COP'}...`,
        { parse_mode: 'Markdown' }
      )

      // Auto off-ramp if user has bank account configured
      if (userRow.bank_account && userRow.country) {
        try {
          const netUsdc = invoice.amount_usdc - (invoice.fee_usdc ?? 0)
          const result = await offrampToLocal(
            netUsdc,
            userRow.country,
            userRow.bank_account
          )

          await updateInvoice(invoice.id, {
            status: 'offramp_pending',
            local_amount: result.localAmount,
            local_currency: result.localCurrency,
            offramp_id: result.payoutId,
            offramp_rate: result.rate,
          })

          await bot.telegram.sendMessage(
            userRow.telegram_id,
            `✅ *Conversión iniciada*\n\n` +
            `1 USDC = ${result.rate.toFixed(2)} ${result.localCurrency}\n` +
            `*Vas a recibir: ${result.localAmount.toFixed(2)} ${result.localCurrency}*\n` +
            `Tiempo estimado: ${result.eta}\n\n` +
            `_Te avisaré cuando acredite_ 🏦`,
            { parse_mode: 'Markdown' }
          )
        } catch (offrampErr) {
          console.error('Off-ramp error:', offrampErr)
          await bot.telegram.sendMessage(
            userRow.telegram_id,
            `⚠️ El pago fue recibido pero hubo un error en la conversión automática.\n` +
            `Escribí "quiero retirar" para intentarlo manualmente.`
          )
        }
      } else {
        // No bank account — prompt user to set up
        await bot.telegram.sendMessage(
          userRow.telegram_id,
          `✅ *Pago recibido*\n\n` +
          `Para convertir a tu moneda local, configurá tu cuenta bancaria con /setup`,
          { parse_mode: 'Markdown' }
        )
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
  }
})

// ─── Health check ─────────────────────────────────────────────────────────────

webhookRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    network: process.env.SOLANA_NETWORK ?? 'unknown',
  })
})
