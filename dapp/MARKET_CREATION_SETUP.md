# Market Creation Feature - Setup Guide

## Overview

The market creation feature allows authorized administrators to create new prediction markets. Market metadata is stored on IPFS (via Pinata) for immutability, while only the metadata hash and end time are stored on-chain.

## Environment Variables Required

Add these to your `.env` file:

```env
# Pinata IPFS Configuration
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs/

# Blockchain Configuration
MARKET_FACTORY_ADDRESS=0x... # Address of deployed MarketFactory contract
MARKET_CREATOR_PRIVATE_KEY=0x... # Private key of wallet authorized to create markets
RPC_URL=https://... # RPC endpoint for blockchain

# LMSR Configuration
LMSR_B=1000000000000000000 # Default liquidity parameter (1 ETH in wei)
```

## Database Migration

After updating the Prisma schema, run:

```bash
npm run prisma:migrate
npm run prisma:generate
```

## Setting Up Creators

To authorize a creator, you can use Prisma Studio or create a script:

```typescript
import { prisma } from "@/lib/db";

// Add an admin creator
await prisma.creator.create({
  data: {
    address: "0x...", // Creator's wallet address (lowercase)
    role: "ADMIN", // or "EDITOR"
  },
});
```

## Features Implemented

### 1. Backend API (`/api/markets/create`)
- Permission checking (only authorized creators)
- Input validation (title, description, rules, timing)
- IPFS upload via Pinata
- Metadata hash computation
- On-chain market deployment via MarketFactory
- Database record creation

### 2. Admin UI (`/admin/create-market`)
- Permission-gated access
- Comprehensive form with validation
- Real-time preview
- Resolution rules editor
- Success feedback with market links

### 3. Permission System
- Creator model in database
- Role-based access (ADMIN/EDITOR)
- API endpoint to check authorization
- UI automatically hides admin features for non-authorized users

### 4. Market Display Updates
- Markets now show title and description from IPFS metadata
- Category badges
- All metadata fields are displayed

## Usage Flow

1. **Admin connects wallet** → System checks if address is authorized
2. **Admin fills form** → Real-time validation and preview
3. **Submit** → Backend:
   - Validates input
   - Uploads metadata to IPFS
   - Computes metadata hash
   - Deploys market on-chain
   - Creates database record
4. **Success** → Admin sees market address, IPFS CID, and link to view market

## Security Features

- ✅ Permission-based access (database-enforced)
- ✅ Input validation (length limits, required fields)
- ✅ Duplicate prevention (metadata hash uniqueness)
- ✅ Time validation (future dates, max 365 days)
- ✅ Immutable metadata (IPFS storage)
- ✅ On-chain verification (metadata hash stored on-chain)

## Testing

1. Add yourself as a creator in the database
2. Connect wallet with authorized address
3. Navigate to `/admin/create-market`
4. Fill out the form and create a market
5. Verify market appears on home page with correct metadata

