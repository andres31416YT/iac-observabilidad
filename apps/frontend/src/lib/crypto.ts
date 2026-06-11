export interface KeyPair {
  publicKey: string;
  secretKey: string;
}

import nacl from 'tweetnacl';

export function generateKeyPair(): KeyPair {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: toHex(keyPair.publicKey),
    secretKey: toHex(keyPair.secretKey),
  };
}

export function signMessage(message: string, secretKeyHex: string): string {
  const messageBytes = new TextEncoder().encode(message);
  const keyBytes = fromHex(secretKeyHex);
  const signature = nacl.sign.detached(messageBytes, keyBytes);
  return toHex(signature);
}

export function verifySignature(
  message: string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = fromHex(signatureHex);
  const keyBytes = fromHex(publicKeyHex);
  return nacl.sign.detached.verify(messageBytes, signatureBytes, keyBytes);
}

export function createVotePayload(
  voterPublicKey: string,
  candidateId: string,
  electionId: string
): string {
  return JSON.stringify({
    voter_public_key: voterPublicKey,
    candidate_id: candidateId,
    election_id: electionId,
    timestamp: Date.now(),
  });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
