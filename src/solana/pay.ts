import { encodeURL } from '@solana/pay'
import { Keypair, PublicKey } from '@solana/web3.js'
import BigNumber from 'bignumber.js'
import QRCode from 'qrcode'

const USDC_MINT = new PublicKey(process.env.USDC_MINT!)
const MERCHANT_WALLET = new PublicKey(process.env.MERCHANT_WALLET_ADDRESS!)

export interface InvoiceLink {
  url: string
  reference: string     // base58 pubkey — used as memo to match on-chain
  qrBuffer: Buffer      // PNG image ready to send via Telegram
}

// ─── Generate Solana Pay link + QR ───────────────────────────────────────────

export async function generateInvoiceLink(
  amountUsdc: number,
  invoiceId: string,
  clientName: string,
  description?: string
): Promise<InvoiceLink> {
  // Each invoice gets a unique reference keypair
  // We use this to identify the payment on-chain
  const reference = Keypair.generate().publicKey

  const url = encodeURL({
    recipient: MERCHANT_WALLET,
    amount: new BigNumber(amountUsdc),
    splToken: USDC_MINT,
    reference,
    label: 'Wagio',
    message: description ?? `Invoice for ${clientName}`,
    memo: invoiceId,
  })

  const qrBuffer = await QRCode.toBuffer(url.toString(), {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 512,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })

  return {
    url: url.toString(),
    reference: reference.toBase58(),
    qrBuffer,
  }
}

// ─── Format Solana Pay URL for Telegram clickable link ────────────────────────

export function formatPaymentMessage(
  link: InvoiceLink,
  clientName: string,
  amountUsdc: number,
  invoiceId: string
): string {
  const shortRef = link.reference.slice(0, 8) + '...'
  return (
    `💳 *Invoice created*\n\n` +
    `Client: ${clientName}\n` +
    `Amount: *$${amountUsdc} USDC*\n` +
    `Invoice: \`${invoiceId}\`\n` +
    `Reference: \`${shortRef}\`\n\n` +
    `📲 *Share this with your client:*\n` +
    `[Pay with Phantom/Solflare](${link.url})\n\n` +
    `Or scan the QR code below 👇\n\n` +
    `_Waiting for payment..._`
  )
}
