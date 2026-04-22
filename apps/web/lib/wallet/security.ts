import type { EIP1193Provider } from "@/lib/wallet/eip6963";

export function assertSignableMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Cannot sign an empty message.");
  if (trimmed.length > 5000) throw new Error("Message is too large to sign safely.");
  return trimmed.replace(/[<>]/g, "");
}

export function buildNonceMessage(baseMessage: string, nonce: string): string {
  return `${baseMessage}\n\nNonce: ${nonce}`;
}

export async function requestValidatedPersonalSign(args: {
  provider: EIP1193Provider;
  message: string;
  address: string;
  nonce: string;
  onPreview?: (humanReadableMessage: string) => void;
}) {
  const safeMessage = assertSignableMessage(args.message);
  const messageWithNonce = buildNonceMessage(safeMessage, args.nonce);
  args.onPreview?.(messageWithNonce);
  return args.provider.request({
    method: "personal_sign",
    params: [messageWithNonce, args.address]
  });
}

export async function pollTransactionReceipt(args: {
  provider: EIP1193Provider;
  transactionHash: string;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const timeoutMs = args.timeoutMs ?? 120_000;
  const intervalMs = args.intervalMs ?? 3_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const receipt = await args.provider.request({
      method: "eth_getTransactionReceipt",
      params: [args.transactionHash]
    });
    if (receipt) return receipt;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  throw new Error("Transaction confirmation timed out.");
}
