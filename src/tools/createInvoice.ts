import { generateInvoiceLink } from '../solana/pay.js'
import { createInvoice, getUserByTelegramId, type Country } from '../db/supabase.js'

const FEE_PERCENT = 0.01  // 1% fee

export interface CreateInvoiceInput {
  amount_usd: number
  client_name: string
  country: Country
  description?: string
}

export interface CreateInvoiceResult {
  invoice_id: string
  solana_pay_url: string
  reference: string
  qr_buffer: Buffer
  amount_usdc: number
  fee_usdc: number
  net_usdc: number
  client_name: string
  country: Country
}

export async function createInvoiceTool(
  input: CreateInvoiceInput,
  telegramId: number
): Promise<CreateInvoiceResult> {
  const { amount_usd, client_name, country, description } = input

  // Get user from DB
  const user = await getUserByTelegramId(telegramId)
  if (!user) throw new Error('User not found. Please send /start first.')

  // Calculate fee
  const feeUsdc = parseFloat((amount_usd * FEE_PERCENT).toFixed(6))
  const netUsdc = parseFloat((amount_usd - feeUsdc).toFixed(6))

  // Generate a short unique ID
  const shortId = `INV-${Date.now().toString(36).toUpperCase()}`

  // Generate Solana Pay link + QR
  const link = await generateInvoiceLink(
    amount_usd,        // client pays full amount
    shortId,
    client_name,
    description
  )

  // Save to DB
  const invoice = await createInvoice({
    user_id: user.id,
    client_name,
    description,
    amount_usdc: amount_usd,
    country,
    solana_pay_url: link.url,
    reference_pubkey: link.reference,
    fee_usdc: feeUsdc,
  })

  return {
    invoice_id: invoice.id,
    solana_pay_url: link.url,
    reference: link.reference,
    qr_buffer: link.qrBuffer,
    amount_usdc: amount_usd,
    fee_usdc: feeUsdc,
    net_usdc: netUsdc,
    client_name,
    country,
  }
}
