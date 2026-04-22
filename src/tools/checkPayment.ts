import { getUserByTelegramId, getUserInvoices, getPendingInvoices, type Invoice } from '../db/supabase.js'

export interface CheckPaymentResult {
  invoices: Invoice[]
  summary: string
}

export async function checkPaymentTool(
  invoiceId: string | undefined,
  telegramId: number
): Promise<CheckPaymentResult> {
  const user = await getUserByTelegramId(telegramId)
  if (!user) throw new Error('User not found.')

  if (invoiceId) {
    // Check specific invoice
    const invoices = await getUserInvoices(user.id, 10)
    const invoice = invoices.find(i => i.id === invoiceId || i.id.startsWith(invoiceId))

    if (!invoice) {
      return { invoices: [], summary: 'Invoice not found.' }
    }

    const statusEmoji = {
      pending: '⏳',
      paid: '💰',
      offramp_pending: '🔄',
      completed: '✅',
      failed: '❌',
    }[invoice.status] ?? '❓'

    const summary =
      `${statusEmoji} *Invoice ${invoice.id.slice(0, 8)}*\n` +
      `Client: ${invoice.client_name}\n` +
      `Amount: $${invoice.amount_usdc} USDC\n` +
      `Status: ${invoice.status}\n` +
      (invoice.paid_at ? `Paid: ${new Date(invoice.paid_at).toLocaleString()}\n` : '') +
      (invoice.local_amount
        ? `Received: ${invoice.local_amount} ${invoice.local_currency}\n`
        : '')

    return { invoices: [invoice], summary }
  }

  // Show all pending invoices
  const pending = await getPendingInvoices(user.id)
  const recent = await getUserInvoices(user.id, 3)

  if (pending.length === 0 && recent.length === 0) {
    return { invoices: [], summary: 'No invoices yet. Create one by telling me about your work!' }
  }

  const lines: string[] = ['📊 *Your invoices:*\n']

  if (pending.length > 0) {
    lines.push(`⏳ *Pending (${pending.length}):*`)
    for (const inv of pending) {
      lines.push(`• $${inv.amount_usdc} USDC — ${inv.client_name}`)
    }
    lines.push('')
  }

  const completed = recent.filter(i => i.status === 'completed')
  if (completed.length > 0) {
    lines.push(`✅ *Recent completed:*`)
    for (const inv of completed) {
      lines.push(`• $${inv.amount_usdc} USDC — ${inv.client_name} → ${inv.local_amount} ${inv.local_currency}`)
    }
  }

  return { invoices: [...pending, ...recent], summary: lines.join('\n') }
}
