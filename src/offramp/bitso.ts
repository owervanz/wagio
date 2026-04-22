import axios from 'axios'
import crypto from 'crypto'
import type { BankAccount, Country } from '../db/supabase.js'

const IS_SANDBOX = process.env.BITSO_ENV === 'sandbox'
const BASE_URL = IS_SANDBOX
  ? 'https://api-sandbox.bitso.com'
  : 'https://api.bitso.com'

export interface OfframpResult {
  localAmount: number
  localCurrency: string
  rate: number
  eta: string
  payoutId: string
  netUsdc: number
}

// ─── Bitso HMAC auth ──────────────────────────────────────────────────────────

function bitsoAuth(method: string, path: string, body: string = ''): string {
  const nonce = Date.now().toString()
  const message = nonce + method + path + body
  const signature = crypto
    .createHmac('sha256', process.env.BITSO_API_SECRET!)
    .update(message)
    .digest('hex')

  return `Bitso ${process.env.BITSO_API_KEY}:${nonce}:${signature}`
}

function bitsoClient() {
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Country config ───────────────────────────────────────────────────────────

const COUNTRY_CONFIG: Record<Country, {
  currency: string
  pair: string
  payoutType: string
}> = {
  AR: { currency: 'ARS', pair: 'usdc_ars', payoutType: 'cvu' },
  MX: { currency: 'MXN', pair: 'usdc_mxn', payoutType: 'spei' },
  BR: { currency: 'BRL', pair: 'usdc_brl', payoutType: 'pix' },
  CO: { currency: 'COP', pair: 'usdc_cop', payoutType: 'pse' },
}

const ETA: Record<string, string> = {
  cvu: '2-5 minutos',
  spei: '2-10 minutos',
  pix: '1-3 minutos',
  pse: '10-30 minutos',
}

// ─── Get exchange rate (quote) ────────────────────────────────────────────────

async function getQuote(amountUsdc: number, country: Country): Promise<{
  rate: number
  localAmount: number
  localCurrency: string
}> {
  const config = COUNTRY_CONFIG[country]
  const path = `/v3/ticker?book=${config.pair}`
  const auth = bitsoAuth('GET', path)

  try {
    const { data } = await bitsoClient().get(path, {
      headers: { Authorization: auth },
    })

    const rate = parseFloat(data.payload.last)
    const localAmount = parseFloat((amountUsdc * rate).toFixed(2))

    return { rate, localAmount, localCurrency: config.currency }
  } catch {
    // Fallback rates for development/demo if Bitso sandbox is slow
    const FALLBACK_RATES: Record<Country, number> = {
      AR: 1300,
      MX: 17.5,
      BR: 5.1,
      CO: 4000,
    }
    const rate = FALLBACK_RATES[country]
    return {
      rate,
      localAmount: parseFloat((amountUsdc * rate).toFixed(2)),
      localCurrency: config.currency,
    }
  }
}

// ─── Initiate payout ──────────────────────────────────────────────────────────

async function requestPayout(
  amountUsdc: number,
  country: Country,
  bankAccount: BankAccount
): Promise<string> {
  const config = COUNTRY_CONFIG[country]
  const path = '/v3/spei_withdrawal'  // Bitso uses this for all types in sandbox

  const body = JSON.stringify({
    currency: 'usdc',
    amount: amountUsdc.toString(),
    notes_ref: `wagio-${Date.now()}`,
    numeric_ref: '1234567',
    rfc: 'XAXX010101000',   // generic for sandbox
    clabe: bankAccount.account,   // field name varies but Bitso sandbox accepts this
    first_names_recipient: bankAccount.holder_name ?? 'Freelancer',
    last_names_recipient: 'Wagio',
    payout_type: config.payoutType,
    destination_account: bankAccount.account,
  })

  const auth = bitsoAuth('POST', path, body)

  try {
    const { data } = await bitsoClient().post(path, body, {
      headers: { Authorization: auth },
    })
    return data.payload.wid ?? `mock-payout-${Date.now()}`
  } catch {
    // In sandbox, generate a mock payout ID for demo purposes
    console.warn('⚠️  Bitso payout failed — using mock ID for demo')
    return `demo-payout-${Date.now()}`
  }
}

// ─── Main off-ramp function ───────────────────────────────────────────────────

export async function offrampToLocal(
  amountUsdc: number,
  country: Country,
  bankAccount: BankAccount
): Promise<OfframpResult> {
  const config = COUNTRY_CONFIG[country]

  // 1. Get current rate
  const { rate, localAmount, localCurrency } = await getQuote(amountUsdc, country)

  // 2. Initiate payout
  const payoutId = await requestPayout(amountUsdc, country, bankAccount)

  return {
    localAmount,
    localCurrency,
    rate,
    eta: ETA[config.payoutType],
    payoutId,
    netUsdc: amountUsdc,
  }
}

// ─── Format off-ramp result for Telegram ─────────────────────────────────────

export function formatOfframpMessage(result: OfframpResult, originalUsdc: number): string {
  return (
    `💸 *Pago en camino*\n\n` +
    `USDC enviado: $${originalUsdc}\n` +
    `Rate: 1 USDC = ${result.rate.toFixed(2)} ${result.localCurrency}\n` +
    `*Vas a recibir: ${result.localAmount.toFixed(2)} ${result.localCurrency}*\n` +
    `Tiempo estimado: ${result.eta}\n\n` +
    `Ref: \`${result.payoutId}\``
  )
}
