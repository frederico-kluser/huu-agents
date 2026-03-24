/**
 * Serviço de catálogo de perfis de worker pipeline.
 * Baseado em wXTUC — Result<T> pattern com error discrimination.
 *
 * Persistência dual: global (~/.pi-dag-cli/worker-profiles.json)
 * e local (.pi-dag/worker-profiles.json). Local tem precedência em merge.
 *
 * @module
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import {
  ProfileCatalogSchema,
  type ProfileCatalog,
  type WorkerProfile,
  type ProfileScope,
} from '../schemas/worker-profile.schema.js';

// ── Paths ─────────────────────────────────────────────────────────

const GLOBAL_DIR = '.pi-dag-cli';
const CATALOG_FILENAME = 'worker-profiles.json';
const LOCAL_DIR = '.pi-dag';

/** Caminho absoluto do catálogo global */
export const getGlobalCatalogPath = (): string =>
  join(homedir(), GLOBAL_DIR, CATALOG_FILENAME);

/**
 * Caminho absoluto do catálogo local (project-scoped).
 *
 * @param rootPath - Raiz do projeto
 * @returns Caminho para `.pi-dag/worker-profiles.json`
 */
export const getLocalCatalogPath = (rootPath: string): string =>
  join(rootPath, LOCAL_DIR, CATALOG_FILENAME);

// ── Error types ───────────────────────────────────────────────────

/** Tipos discriminados de erro do catálogo */
export type CatalogErrorKind =
  | { readonly kind: 'file_not_found'; readonly path: string }
  | { readonly kind: 'parse_error'; readonly path: string; readonly detail: string }
  | { readonly kind: 'schema_error'; readonly path: string; readonly detail: string }
  | { readonly kind: 'write_error'; readonly path: string; readonly detail: string }
  | { readonly kind: 'profile_not_found'; readonly profileId: string };

/** Result type discriminado — sem throw/catch para flow control */
type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CatalogErrorKind };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: CatalogErrorKind): Result<T> => ({ ok: false, error });

// ── Empty catalog ─────────────────────────────────────────────────

const EMPTY_CATALOG: ProfileCatalog = { version: 1, profiles: [] };

// ── Load ──────────────────────────────────────────────────────────

/**
 * Carrega e valida um catálogo de perfis do disco.
 * Retorna catálogo vazio se arquivo não existir (não é erro).
 *
 * @param catalogPath - Caminho absoluto do arquivo JSON
 * @returns Catálogo parseado ou erro tipado
 *
 * @example
 * const result = await loadCatalog(getGlobalCatalogPath());
 * if (result.ok) console.log(result.value.profiles.length);
 */
export async function loadCatalog(catalogPath: string): Promise<Result<ProfileCatalog>> {
  let raw: string;
  try {
    raw = await readFile(catalogPath, 'utf-8');
  } catch (e: unknown) {
    if (isNodeError(e) && e.code === 'ENOENT') {
      return ok(EMPTY_CATALOG);
    }
    return err({ kind: 'file_not_found', path: catalogPath });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err({ kind: 'parse_error', path: catalogPath, detail: 'Invalid JSON' });
  }

  const validation = ProfileCatalogSchema.safeParse(parsed);
  if (!validation.success) {
    return err({
      kind: 'schema_error',
      path: catalogPath,
      detail: validation.error.issues.map((i) => i.message).join('; '),
    });
  }

  return ok(validation.data);
}

/** Carrega catálogo global */
export const loadGlobalCatalog = (): Promise<Result<ProfileCatalog>> =>
  loadCatalog(getGlobalCatalogPath());

/** Carrega catálogo local (project-scoped) */
export const loadLocalCatalog = (rootPath: string): Promise<Result<ProfileCatalog>> =>
  loadCatalog(getLocalCatalogPath(rootPath));

// ── Merge ─────────────────────────────────────────────────────────

/**
 * Merge de catálogos global e local. Local vence em ID duplicado.
 *
 * @param global - Catálogo global (menor precedência)
 * @param local - Catálogo local (maior precedência)
 * @returns Catálogo mesclado com perfis únicos
 */
export function mergeCatalogs(global: ProfileCatalog, local: ProfileCatalog): ProfileCatalog {
  const localIds = new Set(local.profiles.map((p) => p.id));
  return {
    version: 1,
    profiles: [...local.profiles, ...global.profiles.filter((p) => !localIds.has(p.id))],
  };
}

// ── Save ──────────────────────────────────────────────────────────

/**
 * Salva perfil no catálogo apropriado (global ou local).
 * Cria diretório e arquivo se não existirem.
 * Se perfil com mesmo ID existir, substitui.
 *
 * @param profile - Perfil a salvar
 * @param scope - Global ou project
 * @param rootPath - Raiz do projeto (obrigatório se scope = project)
 */
export async function saveProfile(
  profile: WorkerProfile,
  scope: ProfileScope,
  rootPath?: string,
): Promise<Result<void>> {
  const catalogPath = scope === 'global'
    ? getGlobalCatalogPath()
    : getLocalCatalogPath(rootPath ?? '.');

  const loadResult = await loadCatalog(catalogPath);
  const catalog = loadResult.ok ? loadResult.value : EMPTY_CATALOG;

  const filtered = catalog.profiles.filter((p) => p.id !== profile.id);
  const updated: ProfileCatalog = {
    version: 1,
    profiles: [...filtered, profile],
  };

  try {
    await mkdir(dirname(catalogPath), { recursive: true });
    await writeFile(catalogPath, JSON.stringify(updated, null, 2), 'utf-8');
    return ok(undefined);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'Unknown write error';
    return err({ kind: 'write_error', path: catalogPath, detail });
  }
}

// ── Delete ───────────────────────────────────────────────────

/**
 * Remove perfil por ID do catálogo do scope indicado.
 * Não é erro se o perfil não existir — operação idempotente.
 *
 * @param profileId - ID do perfil a remover
 * @param scope - Global ou project
 * @param rootPath - Raiz do projeto (obrigatório se scope = project)
 * @returns Resultado indicando sucesso ou erro de escrita
 *
 * @example
 * const result = await deleteProfile('test-driven-fixer', 'project', '/home/user/my-project');
 * if (result.ok) console.log('Perfil removido');
 */
export async function deleteProfile(
  profileId: string,
  scope: ProfileScope,
  rootPath?: string,
): Promise<Result<void>> {
  const catalogPath = scope === 'global'
    ? getGlobalCatalogPath()
    : getLocalCatalogPath(rootPath ?? '.');

  const loadResult = await loadCatalog(catalogPath);
  const catalog = loadResult.ok ? loadResult.value : EMPTY_CATALOG;

  const updated: ProfileCatalog = {
    version: 1,
    profiles: catalog.profiles.filter((p) => p.id !== profileId),
  };

  try {
    await mkdir(dirname(catalogPath), { recursive: true });
    await writeFile(catalogPath, JSON.stringify(updated, null, 2), 'utf-8');
    return ok(undefined);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'Unknown write error';
    return err({ kind: 'write_error', path: catalogPath, detail });
  }
}

// ── Resolve ───────────────────────────────────────────────────────

/**
 * Resolve perfil por ID dos catálogos mesclados (local tem precedência).
 *
 * @param profileId - ID do perfil
 * @param rootPath - Raiz do projeto
 * @returns Perfil encontrado ou erro profile_not_found
 */
export async function resolveProfile(
  profileId: string,
  rootPath: string,
): Promise<Result<WorkerProfile>> {
  const [globalResult, localResult] = await Promise.all([
    loadGlobalCatalog(),
    loadLocalCatalog(rootPath),
  ]);

  const global = globalResult.ok ? globalResult.value : EMPTY_CATALOG;
  const local = localResult.ok ? localResult.value : EMPTY_CATALOG;
  const merged = mergeCatalogs(global, local);

  const profile = merged.profiles.find((p) => p.id === profileId);
  if (!profile) {
    return err({ kind: 'profile_not_found', profileId });
  }

  return ok(profile);
}

/**
 * Lista todos os perfis disponíveis (global + local, local vence em colisão).
 *
 * @param rootPath - Raiz do projeto
 * @returns Array de perfis (vazio se nenhum catálogo existir)
 */
export async function listProfiles(rootPath: string): Promise<readonly WorkerProfile[]> {
  const [globalResult, localResult] = await Promise.all([
    loadGlobalCatalog(),
    loadLocalCatalog(rootPath),
  ]);

  const global = globalResult.ok ? globalResult.value : EMPTY_CATALOG;
  const local = localResult.ok ? localResult.value : EMPTY_CATALOG;
  return mergeCatalogs(global, local).profiles;
}

// ── Helpers ───────────────────────────────────────────────────────

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e;
}
