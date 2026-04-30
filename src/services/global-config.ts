/**
 * Persistencia da configuracao global do model-selector-ink.
 *
 * Localizacao padrao: ~/.model-selector-ink/config.json
 *
 * Permite salvar API keys uma vez na maquina e usar em qualquer projeto
 * que importe model-selector-ink — sem precisar repetir keys em cada CWD.
 *
 * @module
 */

import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';

const NAMESPACE = '.model-selector-ink';
const CONFIG_FILENAME = 'config.json';

const ConfigSchema = z.object({
  openRouterApiKey: z.string().optional(),
  artificialAnalysisApiKey: z.string().optional(),
});

export type GlobalConfig = z.infer<typeof ConfigSchema>;

const getConfigDir = (): string => join(homedir(), NAMESPACE);

/** Caminho absoluto do arquivo de configuracao global. */
export const getGlobalConfigPath = (): string =>
  join(getConfigDir(), CONFIG_FILENAME);

/**
 * Le a config global de forma sincrona.
 * Usado durante a inicializacao do componente para resolver API keys.
 * Retorna `{}` em qualquer erro (arquivo ausente, JSON invalido, schema invalido).
 */
export const loadGlobalConfigSync = (): GlobalConfig => {
  try {
    const raw = readFileSync(getGlobalConfigPath(), 'utf-8');
    const json: unknown = JSON.parse(raw);
    const parsed = ConfigSchema.safeParse(json);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

/**
 * Le a config global de forma assincrona.
 * Mesma semantica de `loadGlobalConfigSync` — retorna `{}` em qualquer erro.
 */
export const loadGlobalConfig = async (): Promise<GlobalConfig> => {
  try {
    const raw = await readFile(getGlobalConfigPath(), 'utf-8');
    const json: unknown = JSON.parse(raw);
    const parsed = ConfigSchema.safeParse(json);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

/**
 * Persiste a config global em disco.
 * Cria o diretorio se nao existir e aplica chmod 600 (somente owner) por seguranca.
 */
export const saveGlobalConfig = async (config: GlobalConfig): Promise<void> => {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  const path = getGlobalConfigPath();
  await writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
  // Best-effort: restringe permissoes (segredo). Ignora erros (e.g. Windows).
  try {
    await chmod(path, 0o600);
  } catch {
    // ignore
  }
};
