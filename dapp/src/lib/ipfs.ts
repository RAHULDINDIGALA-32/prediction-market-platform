// Pinata IPFS configuration
const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";



export interface MarketMetadata {
  title: string;
  description: string;
  category: string;
  resolutionSource: string;
  resolutionRules: string[];
  outcomes: ["YES", "NO"];
  endTime: number;
  createdBy: string;
  createdAt: number;
  lmsrB?: string; // Creator-specified LMSR liquidity parameter
  subsidyAmount?: string; // Creator's subsidy deposit
}

/**
 * Upload market metadata to IPFS via Pinata
 */
export async function uploadToIPFS(metadata: MarketMetadata): Promise<string> {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error("PINATA_API_KEY and PINATA_SECRET_KEY must be set");
  }

  // Upload to Pinata
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `market-${metadata.createdAt}`,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload to IPFS: ${error}`);
  }

  const data = await response.json();
  return data.IpfsHash; // Pinata returns IpfsHash
}

/**
 * Fetch market metadata from IPFS
 */
export async function fetchFromIPFS(cid: string): Promise<MarketMetadata> {
  const url = `${PINATA_GATEWAY}${cid}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Compute metadata hash (keccak256 of JSON string)
 */
export function computeMetadataHash(metadata: MarketMetadata): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { keccak256, toUtf8Bytes } = require("ethers") as typeof import("ethers");
  const jsonString = JSON.stringify(metadata, Object.keys(metadata).sort());
  const hash = keccak256(toUtf8Bytes(jsonString));
  return hash;
}

