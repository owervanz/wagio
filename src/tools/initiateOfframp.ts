import { offrampToLocal, type OfframpResult } from '../offramp/bitso.js'
import { getInvoiceByReference, updateInvoice, getUserByTelegramId } from '../db/supabase.js'

export interface OfframpInput {
  invoice_id: string
  bank_account?: string   // if not set, uses user's saved bank account
}

export async function initiateOfframpTool(
  input: OfframpInput,
  telegramId: number
): Promise<OfframpResult & { invoiceId: string }> {
  const user = await getUserByTelegramId(telegramId)
  if (!user) throw new Error('User not found.')
  if (!user.bank_account) {
    throw new Error('No bank account saved. Please set up your bank account first with /setup.')
  }
  if (!user.country) {
    throw new Error('No country set. Please configure your country first with /setup.')
  }

  // Find invoice
  const { data: invoices } = await import('../db/supabase.js').then(m =>
    m.db.from('invoices').select('*').eq('id', input.invoice_id).eq('user_id', user.id).single()
  )

  if (!invoices) throw new Error('Invoice not found.')
  if (invoices.status !== 'paid') {
    throw new Error(`Invoice is ${invoices.status}, not paid. Cannot off-ramp yet.`)
  }

  const netUsdc = invoices.amount_usdc - (invoices.fee_usdc ?? 0)

  // Initiate off-ramp
  const result = await offrampToLocal(
    netUsdc,
    user.country as 'AR' | 'MX' | 'BR' | 'CO',
    user.bank_account
  )

  // Update invoice
  await updateInvoice(invoices.id, {
    status: 'offramp_pending',
    local_amount: result.localAmount,
    local_currency: result.localCurrency,
    offramp_id: result.payoutId,
    offramp_rate: result.rate,
  })

  return { ...result, invoiceId: invoices.id }
}
