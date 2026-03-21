import type { DAGNode } from '../schemas/dag.schema.js';

/** Providers suportados para adaptacao de formato */
type ModelProvider = 'anthropic' | 'openai' | 'deepseek';

/**
 * Gera system prompt para Worker agent operando em worktree isolado.
 * Adapta formato por provider: XML tags (anthropic), Markdown (openai/deepseek).
 * Prompt segue sandwich method com max ~280 palavras para evitar over-prompting.
 *
 * @param node - Node do DAG com task, files e dependencies
 * @param gitLog - Resumo do git log das branches mergidas (max 500 tokens)
 * @param modelProvider - Provider do modelo para adaptacao de formato
 * @returns System prompt formatado para o provider especificado
 * @throws {Error} Provider desconhecido
 * @example
 * const prompt = generateWorkerPrompt(
 *   { id: 'task-001', task: 'Converter format.js para TS', dependencies: [], status: 'pending', files: ['utils/format.js'] },
 *   'abc123 feat: add format utils\ndef456 fix: handle edge case',
 *   'anthropic'
 * );
 */
export function generateWorkerPrompt(
  node: DAGNode,
  gitLog: string,
  modelProvider: string,
): string {
  const provider = normalizeProvider(modelProvider);
  const filesList = node.files.length > 0 ? node.files.join(', ') : 'nenhum especificado';
  const depsSummary = node.dependencies.length > 0
    ? `Dependencias completadas: ${node.dependencies.join(', ')}.`
    : 'Sem dependencias — primeira task do pipeline.';
  const trimmedLog = truncateGitLog(gitLog, 500);

  return provider === 'anthropic'
    ? buildAnthropicPrompt(node.task, filesList, depsSummary, trimmedLog)
    : buildMarkdownPrompt(node.task, filesList, depsSummary, trimmedLog);
}

// --- Formatadores por provider ---

function buildAnthropicPrompt(
  task: string,
  filesList: string,
  depsSummary: string,
  gitLog: string,
): string {
  return [
    '<system>',
    '<role>Engenheiro TypeScript operando em worktree Git isolado. Implemente APENAS a tarefa descrita.</role>',
    '',
    '<code_standards>',
    'Max 500 LOC/arquivo (ideal 200-300). Max 50 LOC/funcao. 5-10 funcoes/arquivo.',
    'Complexidade ciclomatica <10. TSDoc com @param, @returns, @throws, @example em exportacoes.',
    'Comentar PORQUÊ, nunca o quê. TypeScript strict, sem any, sem console.log.',
    'Imutabilidade: retornar novos objetos, nunca mutar. Validar inputs com Zod em boundaries.',
    '</code_standards>',
    '',
    '<task>',
    task,
    '</task>',
    '',
    '<files>',
    filesList,
    '</files>',
    '',
    '<dependencies>',
    depsSummary,
    '</dependencies>',
    '',
    '<git_context>',
    gitLog || 'Nenhum historico disponivel.',
    '</git_context>',
    '',
    '<rules>',
    'Ao terminar: git add dos arquivos modificados. NAO faca commit.',
    'Se a tarefa for ambigua: pare e retorne uma pergunta clara.',
    `NUNCA modifique arquivos fora de: ${filesList}.`,
    'Se precisar de arquivo nao listado, retorne pedido explicito.',
    '</rules>',
    '</system>',
  ].join('\n');
}

function buildMarkdownPrompt(
  task: string,
  filesList: string,
  depsSummary: string,
  gitLog: string,
): string {
  return [
    '# Role',
    'Engenheiro TypeScript operando em worktree Git isolado. Implemente APENAS a tarefa descrita.',
    '',
    '## Code Standards',
    '- Max 500 LOC/arquivo (ideal 200-300), max 50 LOC/funcao, 5-10 funcoes/arquivo',
    '- Complexidade ciclomatica <10, TSDoc com @param/@returns/@throws/@example',
    '- Comentar PORQUÊ, nunca o quê. TS strict, sem `any`, sem `console.log`',
    '- Imutabilidade: retornar novos objetos, nunca mutar. Validar inputs com Zod',
    '',
    '## Task',
    task,
    '',
    '## Files',
    filesList,
    '',
    '## Dependencies',
    depsSummary,
    '',
    '## Git Context',
    gitLog || 'Nenhum historico disponivel.',
    '',
    '## Rules (CRITICAL)',
    `- Ao terminar: git add dos arquivos modificados. NAO faca commit.`,
    '- Se a tarefa for ambigua: pare e retorne uma pergunta clara.',
    `- NUNCA modifique arquivos fora de: ${filesList}.`,
    '- Se precisar de arquivo nao listado, retorne pedido explicito.',
  ].join('\n');
}

// --- Utilitarios ---

/**
 * Normaliza string do provider para tipo interno.
 * Fallback para 'openai' em providers desconhecidos (formato Markdown e universal).
 */
function normalizeProvider(raw: string): ModelProvider {
  const lower = raw.toLowerCase();
  if (lower.includes('anthropic') || lower.includes('claude')) return 'anthropic';
  if (lower.includes('deepseek')) return 'deepseek';
  return 'openai';
}

/**
 * Trunca git log para caber no budget de tokens.
 * Corta por linhas completas para nao quebrar mensagens de commit.
 */
function truncateGitLog(log: string, maxChars: number): string {
  if (log.length <= maxChars) return log;
  const truncated = log.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  return lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;
}
