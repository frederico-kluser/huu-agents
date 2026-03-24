import { parseArgs } from 'node:util';
import { z } from 'zod';

/**
 * Schema Zod para os argumentos CLI parseados.
 * Validação centralizada — nenhum outro módulo faz parsing manual.
 * Modelos não são validados contra catálogo (catálogo é dinâmico via API).
 */
const CliArgsSchema = z.object({
  help: z.boolean().default(false),
  version: z.boolean().default(false),
  task: z.string().optional(),
  context: z.array(z.string()).optional(),
  planner: z.string().min(1).optional(),
  worker: z.string().min(1).optional(),
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
export const buildHelpText = (): string => `
pi-dag — Decomposicao de tarefas em DAG com agentes IA em paralelo

USO:
  pi-dag [opcoes]

OPCOES:
  -h, --help               Mostra esta ajuda e sai
  -v, --version            Mostra a versao e sai
  -t, --task <texto>       Macro-task a ser decomposta (pula tela de input)
  -c, --context <caminhos> Arquivos/dirs de contexto, separados por virgula
      --planner <modelo>   Modelo para o planner (ex: google/gemini-3.1-pro)
      --worker <modelo>    Modelo para os workers (ex: anthropic/claude-sonnet-4-6)

PRECEDENCIA:
  Flags CLI > config persistida (~/.pi-dag-cli.json) > defaults

MODELOS:
  Todos os modelos 2025+ disponiveis na OpenRouter sao carregados em tempo real.
  Use o formato "provider/model-name" (ex: openai/gpt-5.4).
  Veja a lista completa em: https://openrouter.ai/models

EXEMPLOS:
  pi-dag
  pi-dag --task "Adicionar autenticacao JWT"
  pi-dag -t "Refatorar modulo de pagamento" -c src/payments,src/utils
  pi-dag --planner google/gemini-3.1-pro --worker anthropic/claude-sonnet-4-6
`.trimStart();

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
