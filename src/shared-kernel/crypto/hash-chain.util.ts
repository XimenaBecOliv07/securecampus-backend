import { createHash } from 'crypto';

/**
 * Utilidad de encadenado de hashes (evidencia de no-manipulacion) usada
 * por grade_version y audit_log. Cada registro incorpora el hash del
 * anterior, asi que alterar un registro antiguo rompe la cadena completa
 * y es detectable con `verifyChain`.
 */
export function computeRowHash(prevHash: string | null, payload: Record<string, unknown>): string {
  const serialized = (prevHash ?? '') + Object.values(payload).join('|');
  return createHash('sha256').update(serialized).digest('hex');
}

export function verifyChain(
  rows: { prevHash: string | null; rowHash: string; payload: Record<string, unknown> }[],
): boolean {
  for (const row of rows) {
    const expected = computeRowHash(row.prevHash, row.payload);
    if (expected !== row.rowHash) return false;
  }
  return true;
}
