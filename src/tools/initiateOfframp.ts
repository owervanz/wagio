import { offrampToLocal, type OfframpResult } from '../offramp/bitso.js'
import { db, updateInvoice, getUserByTelegramId, type Invoice } from '../db/supabase.js'

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

  const { data: invoice } = await db
    .from('invoices')
    .select('*')
    .eq('id', input.invoice_id)
    .eq('user_id', user.id)
    .single<Invoice>()

  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status !== 'paid') {
    throw new Error(`Invoice is ${invoice.status}, not paid. Cannot off-ramp yet.`)
  }

  const netUsdc = invoice.amount_usdc - (invoice.fee_usdc ?? 0)

  const result = await offrampToLocal(netUsdc, user.country, user.bank_account)

  await updateInvoice(invoice.id, {
    status: 'offramp_pending',
    local_amount: result.localAmount,
    local_currency: result.localCurrency,
    offramp_id: result.payoutId,
    offramp_rate: result.rate,
  })

  return { ...result, invoiceId: invoice.id }
}
