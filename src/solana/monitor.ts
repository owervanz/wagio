import axios from 'axios'

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL!
const MERCHANT_WALLET = process.env.MERCHANT_WALLET_ADDRESS!
const HELIUS_BASE = `https://api.helius.xyz/v0`

// ─── Register Helius webhook on startup ───────────────────────────────────────

export async function registerWebhook(): Promise<void> {
  const webhookUrl = `${WEBHOOK_BASE_URL}/webhook/payment`

  try {
    // Check if webhook already exists
    const { data: existing } = await axios.get(`${HELIUS_BASE}/webhooks`, {
      params: { 'api-key': HELIUS_API_KEY },
    })

    const alreadyRegistered = existing?.some(
      (wh: { webhookURL: string }) => wh.webhookURL === webhookUrl
    )

    if (alreadyRegistered) {
      console.log('✅ Helius webhook already registered')
      return
    }

    // Register new webhook
    await axios.post(
      `${HELIUS_BASE}/webhooks`,
      {
        webhookURL: webhookUrl,
        transactionTypes: ['TRANSFER'],
        accountAddresses: [MERCHANT_WALLET],
        webhookType: 'enhanced',
      },
      { params: { 'api-key': HELIUS_API_KEY } }
    )

    console.log('✅ Helius webhook registered:', webhookUrl)
  } catch (err) {
    // Non-fatal — webhook may already exist or sandbox may not support it
    console.warn('⚠️  Could not register Helius webhook:', (err as Error).message)
    console.warn('   In development, use ngrok to expose localhost')
  }
}

// ─── Parse Helius enhanced transaction ────────────────────────────────────────

export interface ParsedPayment {
  txSignature: string
  amountUsdc: number
  memoField?: string
  accountData: Array<{ account: string; nativeBalanceChange: number }>
}

export function parseHeliusPayment(rawTx: Record<string, unknown>): ParsedPayment | null {
  try {
    const signature = rawTx.signature as string
    const tokenTransfers = rawTx.tokenTransfers as Array<{
      mint: string
      tokenAmount: number
      toUserAccount: string
    }> | undefined

    if (!tokenTransfers?.length) return null

    // Filter for USDC transfers to merchant wallet
    const usdcTransfer = tokenTransfers.find(
      t =>
        t.mint === process.env.USDC_MINT &&
        t.toUserAccount === MERCHANT_WALLET
    )

    if (!usdcTransfer) return null

    // Extract memo from instructions
    const instructions = rawTx.instructions as Array<{
      programId: string
      data?: string
    }> | undefined

    let memoField: string | undefined
    const memoInstruction = instructions?.find(
      i => i.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
    )
    if (memoInstruction?.data) {
      try {
        memoField = Buffer.from(memoInstruction.data, 'base64').toString('utf8')
      } catch {
        memoField = undefined
      }
    }

    return {
      txSignature: signature,
      amountUsdc: usdcTransfer.tokenAmount,
      memoField,
      accountData: (rawTx.accountData as ParsedPayment['accountData']) ?? [],
    }
  } catch {
    return null
  }
}
