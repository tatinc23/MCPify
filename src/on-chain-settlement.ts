// On-chain USDC transfer from platform custody wallet to merchant wallet
// Uses Base (L2) for low gas fees

import { usdcToAtomic } from "./types";

// USDC contract on Base mainnet
const USDC_CONTRACT_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ERC-20 transfer ABI (minimal)
const TRANSFER_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Encode ERC-20 transfer call
function encodeTransfer(to: string, amount: bigint): string {
  // Simple ABI encoding for transfer(address,uint256)
  const selector = "a9059cbb"; // transfer(address,uint256) selector
  const paddedTo = to.slice(2).toLowerCase().padStart(64, "0");
  const paddedAmount = amount.toString(16).padStart(64, "0");
  return `0x${selector}${paddedTo}${paddedAmount}`;
}

export interface OnChainResult {
  txHash: string;
  success: boolean;
  error?: string;
}

export async function transferUsdcOnChain(
  privateKey: string,
  toAddress: string,
  amountUsdc: string,
  network: string = "eip155:8453" // Base mainnet
): Promise<OnChainResult> {
  const atomicAmount = usdcToAtomic(amountUsdc);

  if (atomicAmount === 0n) {
    return { txHash: "", success: false, error: "Zero amount" };
  }

  // ── On-chain transfer ──────────────────────────────
  // In production, use viem or ethers.js to sign and broadcast:
  //
  // import { createWalletClient, http } from "viem";
  // import { base } from "viem/chains";
  // import { privateKeyToAccount } from "viem/accounts";
  //
  // const account = privateKeyToAccount(privateKey as `0x${string}`);
  // const client = createWalletClient({ account, chain: base, transport: http() });
  //
  // const txHash = await client.writeContract({
  //   address: USDC_CONTRACT_BASE,
  //   abi: TRANSFER_ABI,
  //   functionName: "transfer",
  //   args: [toAddress as `0x${string}`, atomicAmount],
  // });
  //
  // return { txHash, success: true };

  // Placeholder — replace with actual viem/ethers implementation
  console.log(`[on-chain] Transfer ${amountUsdc} USDC to ${toAddress}`);
  console.log(`[on-chain] Atomic: ${atomicAmount}`);
  console.log(`[on-chain] Contract: ${USDC_CONTRACT_BASE}`);
  console.log(`[on-chain] Encoded: ${encodeTransfer(toAddress, atomicAmount)}`);

  return {
    txHash: "0x_placeholder_tx_hash",
    success: true,
  };
}
