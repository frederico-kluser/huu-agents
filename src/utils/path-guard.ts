/**
 * Guarda contra path traversal — valida que caminhos ficam dentro do diretório raiz.
 * Usado pelas tools do Explorer para prevenir acesso a arquivos fora do repositório.
 */

import { resolve, sep } from 'node:path';

/** Diretório raiz permitido para operações de leitura. */
let allowedRoot = '/';

/**
 * Define o diretório raiz permitido para todas as operações de arquivo.
 * Deve ser chamado antes de invocar qualquer tool do Explorer.
 *
 * @param root - Caminho absoluto do diretório raiz
 * @example
 * setAllowedRoot("/home/user/my-repo");
 */
export function setAllowedRoot(root: string): void {
  allowedRoot = resolve(root);
}

/** Retorna o diretório raiz atual. */
export function getAllowedRoot(): string {
  return allowedRoot;
}

/**
 * Valida que um caminho resolvido está dentro do diretório raiz permitido.
 * Previne path traversal (ex: ../../etc/passwd).
 *
 * @param targetPath - Caminho a validar
 * @returns Caminho absoluto resolvido e validado
 * @throws {Error} Se o caminho está fora do diretório raiz
 * @example
 * const safe = assertWithinRoot("/repo/src/index.ts");
 * // OK: retorna "/repo/src/index.ts"
 *
 * assertWithinRoot("/etc/passwd");
 * // Throws: "Acesso negado: ..."
 */
export function assertWithinRoot(targetPath: string): string {
  const resolvedTarget = resolve(targetPath);
  if (resolvedTarget !== allowedRoot && !resolvedTarget.startsWith(allowedRoot + sep)) {
    throw new Error(`Acesso negado: "${targetPath}" está fora do diretório permitido`);
  }
  return resolvedTarget;
}
