# Wagio 🤖💸

> An AI-powered payment agent for LATAM freelancers — generate USDC invoices and receive local currency automatically, all through Telegram.

Built for the **[Solana Frontier Hackathon 2026](https://colosseum.com/frontier)**.

---

## The Problem

LATAM freelancers working with international clients face a broken payment experience:

- ⏳ **30-60 days** waiting for payments via Payoneer or wire transfer
- 💸 **6-10% fees** eaten by traditional payment processors
- 📉 **Currency devaluation** while waiting (ARS loses ~2% per month)
- 🔧 **3+ apps** needed to create invoice, receive payment, and cash out

## The Solution

Wagio lets a freelancer say:

> *"I finished a $400 logo for Acme Corp"*

And the AI agent handles everything:
1. Generates a USDC invoice + QR code via Solana Pay
2. Detects payment on-chain in ~2 seconds (via Helius)
3. Converts USDC → local currency at the best available rate (via Bitso)
4. Deposits to their bank account (CBU, SPEI, PIX, PSE)

**Total time: ~60 seconds. The freelancer never touches crypto.**

---

## Demo

[▶️ Watch Demo Video](#) | [🤖 Try the Bot on Telegram](#) | [🌐 Landing Page](#)

### How it looks

```
Freelancer → Telegram: "I finished a $400 design for Acme Corp"

Wagio: ✅ Invoice created
       Client: Acme Corp
       Amount: $400 USDC
       Fee: $3.96 (0.99%)
       You'll receive: $396.04 USDC
       
       📲 Share the QR with your client [QR CODE IMAGE]
       I'll notify you when payment arrives 🔔

--- (client scans QR and pays) ---

Wagio: 💰 Payment received on-chain
       Tx: 5Kp9abc...x2aB
       Converting 396 USDC → ARS...

Wagio: ✅ Transfer complete
       Rate: 1 USDC = 1,301 ARS
       You received: 515,196 ARS
       ETA: 2-5 minutes to your CVU
```

---

## Why Solana

| Feature | Solana | Traditional Rails |
|---------|--------|-------------------|
| Settlement time | **~2 seconds** | 2-10 business days |
| Transaction fee | **$0.00025** | $15-50 wire fee |
| Availability | **24/7** | Business hours only |
| Transparency | **On-chain, auditable** | Black box |

USDC on Solana is the only rail that makes sub-$500 freelance payments economically viable.

---

## Architecture

```
┌─────────────────────┐
│  Freelancer         │
│  (Telegram)         │
└──────────┬──────────┘
           │ natural language
           ▼
┌──────────────────────────────┐
│  Wagio AI Agent              │
│  (Groq / Llama 3.3 70B)      │
│  - understands intent        │
│  - calls tools automatically │
└──┬──────────┬─────────┬──────┘
   │          │         │
   ▼          ▼         ▼
┌────────┐ ┌──────┐ ┌────────┐
│Solana  │ │Bitso │ │Supabase│
│  Pay   │ │ API  │ │   DB   │
└───┬────┘ └──┬───┘ └────────┘
    │         │
    ▼         ▼
┌──────────────────┐    ┌──────────────────┐
│ Solana Mainnet   │    │ Local Bank       │
│ (USDC transfer)  │───▶│ (ARS/MXN/BRL/COP)│
└──────────────────┘    └──────────────────┘
         ▲
         │ webhook
┌──────────────────┐
│ Helius RPC       │
│ (payment monitor)│
└──────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Interface | Telegram Bot (telegraf.js) | Zero-friction UX — no app download needed |
| AI Agent | Groq / Llama 3.3 70B | Natural language → structured invoice actions |
| Blockchain | @solana/pay + @solana/web3.js | Payment links, QR codes, on-chain settlement |
| Monitoring | Helius Webhooks | Real-time payment detection (~2s) |
| LATAM Off-ramp | Bitso API | USDC → ARS, MXN, BRL, COP + local bank deposit |
| Database | Supabase (PostgreSQL) | Invoice state, user accounts, payment history |
| Hosting | Railway | Always-on deployment, zero DevOps |

**Total infrastructure cost: ~$0/month** (all free tiers)

---

## Supported Countries

| Country | Currency | Rail | ETA |
|---------|----------|------|-----|
| 🇦🇷 Argentina | ARS | CVU | 2-5 min |
| 🇲🇽 Mexico | MXN | SPEI | 2-10 min |
| 🇧🇷 Brazil | BRL | PIX | 1-3 min |
| 🇨🇴 Colombia | COP | PSE | 10-30 min |

---

## Business Model

- **1% fee** per invoice processed (taken automatically at settlement)
- **Pro plan** $9/month — unlimited invoices, branded PDFs, multi-client dashboard *(roadmap)*
- **Platform API** for marketplaces (Workana, Freelancer LATAM) — 0.5% rev share *(roadmap)*

### Revenue projections

| Active Users | Avg Monthly Volume | Monthly Revenue |
|-------------|-------------------|-----------------|
| 100 | $500/user | $500 |
| 1,000 | $800/user | $8,000 |
| 10,000 | $1,200/user | $120,000 |

---

## Project Structure

```
src/
├── index.ts              # Entry point — Express server + Telegram bot startup
├── bot.ts                # Telegram handlers (/start, /setup, /status, /help)
├── agent.ts              # Gemini AI agent with function calling (3 tools)
├── tools/
│   ├── createInvoice.ts  # Solana Pay link generation + DB storage
│   ├── checkPayment.ts   # Invoice status queries
│   └── initiateOfframp.ts # USDC → local currency trigger
├── solana/
│   ├── pay.ts            # encodeURL() + QR code generation
│   └── monitor.ts        # Helius webhook registration
├── offramp/
│   └── bitso.ts          # Bitso API: quote + payout for 4 LATAM countries
├── db/
│   ├── supabase.ts       # Database client + typed helpers
│   └── schema.sql        # PostgreSQL schema (users + invoices)
└── webhook/
    └── handler.ts        # Payment detection → auto off-ramp → Telegram notify
```

---

## Local Setup

### Prerequisites

- Node.js 20+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Groq API key (free) from [console.groq.com](https://console.groq.com)
- Helius API key (free) from [helius.xyz](https://helius.xyz)
- Supabase project from [supabase.com](https://supabase.com)
- Bitso Business account from [bitso.com/business](https://bitso.com/business/developers)

### Installation

```bash
git clone https://github.com/owervanz/wagio
cd wagio
npm install
cp .env.example .env
```

Fill in all values in `.env`.

### Database setup

Run `src/db/schema.sql` in your Supabase SQL Editor.

### Run locally

```bash
npm run dev
```

For payment webhooks in development, expose localhost with:

```bash
npx localtunnel --port 3000
```

Set the generated URL as `WEBHOOK_BASE_URL` in `.env` and restart.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `GROQ_API_KEY` | Groq API key (free at console.groq.com) |
| `HELIUS_API_KEY` | Solana RPC + webhooks |
| `HELIUS_AUTH_HEADER` | Secret string to validate incoming Helius webhooks |
| `SOLANA_RPC_URL` | Helius RPC endpoint |
| `SOLANA_NETWORK` | `devnet` or `mainnet-beta` |
| `USDC_MINT` | USDC token mint address |
| `MERCHANT_WALLET_ADDRESS` | Your Solana wallet (receives USDC) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `BITSO_API_KEY` | Bitso Business API key |
| `BITSO_API_SECRET` | Bitso Business API secret |
| `BITSO_ENV` | `sandbox` or `production` |
| `WEBHOOK_BASE_URL` | Public URL for Helius webhooks |

---

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add all environment variables in Railway dashboard
4. Set `NODE_ENV=production` and `WEBHOOK_BASE_URL` to your Railway URL
5. Railway auto-deploys on every push

---

## Competitive Landscape

| Product | What they do | What's missing |
|---------|-------------|----------------|
| Request Finance | USDC invoices on-chain | No LATAM off-ramp, no bot, manual flow |
| Huma Finance | Invoice financing | B2B only, not for individual freelancers |
| Mural Pay | USDC → 40 fiat currencies | Infrastructure only, no UX layer |
| Payoneer | International payments | 6% fees, 5-10 days, no crypto |
| **Wagio** | Full pipeline in Telegram | ✨ 60 seconds, 0.99% fee, AI-native |

---

## Roadmap

### Phase 1 — Current (Hackathon MVP)
- [x] Telegram bot with AI agent
- [x] Solana Pay invoice + QR generation
- [x] Automatic payment detection via Helius
- [x] USDC → ARS/MXN/BRL/COP off-ramp
- [x] Auto bank deposit notification

### Phase 2 — Post-Hackathon
- [ ] WhatsApp Business API integration (10x more users in LATAM)
- [ ] Branded PDF invoices
- [ ] Multi-client dashboard (web)
- [ ] Recurring payment support

### Phase 3 — Scale
- [ ] Platform API for LATAM freelance marketplaces
- [ ] x402 protocol integration for AI agent payments
- [ ] Treasury management (idle USDC yield)
- [ ] Expand to Chile, Peru, Uruguay

---

## Why This Wins

Wagio hits all three of Solana Foundation's 2026 priorities:

1. **AI Agents** — Groq/Llama agent handles the full payment pipeline autonomously
2. **Stablecoins as payment rail** — USDC on Solana is the invisible engine
3. **Consumer adoption without friction** — freelancers never see "blockchain"

Pattern match with previous winners: CargoBill (supply chain payments), Sphere (SMB payments), Credible Finance (stablecoin remittance corridor) — all won by solving real payment problems with Solana.

---

## License

MIT

---

*Built in 21 days for the Solana Frontier Hackathon 2026*
