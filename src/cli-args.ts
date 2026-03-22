import { parseArgs } from 'node:util';
import { z } from 'zod';
import { findModel, MODEL_CATALOG } from './data/models.js';

/**
 * Schema Zod para os argumentos CLI parseados.
 * Validação centralizada — nenhum outro módulo faz parsing manual.
 */
const CliArgsSchema = z.object({
  help: z.boolean().default(false),
  version: z.boolean().default(false),
  task: z.string().optional(),
  context: z.array(z.string()).optional(),
  planner: z.string().optional().refine(
    (id) => !id || findModel(id),
    (id) => ({ message: `Modelo planner "${id}" nao encontrado no catalogo. Use --help para ver modelos disponiveis.` }),
  ),
  worker: z.string().optional().refine(
    (id) => !id || findModel(id),
    (id) => ({ message: `Modelo worker "${id}" nao encontrado no catalogo. Use --help para ver modelos disponiveis.` }),
  ),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

/**
 * Gera texto de ajuda formatado para o terminal.
 *
 * @returns Texto completo do --help
 * @example
 * ```ts
 * process.stdout.write(buildHelpText());
 * process.exit(0);
 * ```
 */
export const buildHelpText = (): string => {
  const plannerIds = MODEL_CATALOG
    .filter((m) => m.tier === 'planner' || m.tier === 'both')
    .map((m) => m.id);
  const workerIds = MODEL_CATALOG
    .filter((m) => m.tier === 'worker' || m.tier === 'both')
    .map((m) => m.id);

  return `
pi-dag — Decomposicao de tarefas em DAG com agentes IA em paralelo

USO:
  pi-dag [opcoes]

OPCOES:
  -h, --help               Mostra esta ajuda e sai
  -v, --version            Mostra a versao e sai
  -t, --task <texto>       Macro-task a ser decomposta (pula tela de input)
  -c, --context <caminhos> Arquivos/dirs de contexto, separados por virgula
      --planner <modelo>   Modelo para o planner (override config persistida)
      --worker <modelo>    Modelo para os workers (override config persistida)

PRECEDENCIA:
  Flags CLI > config persistida (~/.pi-dag-cli.json) > defaults

EXEMPLOS:
  pi-dag
  pi-dag --task "Adicionar autenticacao JWT"
  pi-dag -t "Refatorar modulo de pagamento" -c src/payments,src/utils
  pi-dag --planner google/gemini-3.1-pro --worker xiaomi/mimo-v2-flash

MODELOS PLANNER:
  ${plannerIds.join('\n  ')}

MODELOS WORKER:
  ${workerIds.join('\n  ')}
`.trimStart();
};

/**
 * Parseia process.argv e valida com Zod.
 * Erros de validacao sao impressos em stderr e o processo encerra com exit(1).
 *
 * @param argv - Argumentos do processo (default: process.argv)
 * @returns Argumentos CLI validados
 * @throws {z.ZodError} Se validacao Zod falhar (tratado internamente com exit)
 * @example
 * ```ts
 * const args = parseCliArgs();
 * if (args.help) { process.stdout.write(buildHelpText()); process.exit(0); }
 * ```
 */
export const parseCliArgs = (argv: readonly string[] = process.argv): CliArgs => {
  try {
    const { values } = parseArgs({
      args: argv.slice(2),
      options: {
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
        task: { type: 'string', short: 't' },
        context: { type: 'string', short: 'c' },
        planner: { type: 'string' },
        worker: { type: 'string' },
      },
      strict: true,
    });

    // Converte --context "a,b,c" em array de paths
    const contextPaths = values.context
      ? values.context.split(',').map((p) => p.trim()).filter(Boolean)
      : undefined;

    return CliArgsSchema.parse({
      help: values.help,
      version: values.version,
      task: values.task,
      context: contextPaths,
      planner: values.planner,
      worker: values.worker,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.errors.map((e) => e.message).join('\n');
      process.stderr.write(`Erro nos argumentos:\n${messages}\n`);
      process.exit(1);
    }
    // Erro do parseArgs (flag desconhecida, etc.)
    if (err instanceof Error) {
      process.stderr.write(`${err.message}\nUse --help para ver opcoes disponiveis.\n`);
      process.exit(1);
    }
    throw err;
  }
};
