/**
 * AI step handlers: pi_agent e langchain_prompt.
 * Baseado em 6sD5N — respeita model overrides do perfil.
 *
 * pi_agent delega ao runWorker existente (Pi Coding Agent SDK).
 * langchain_prompt usa ChatOpenAI via OpenRouter para geração de texto.
 *
 * @module
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import type { PiAgentStep, LangchainPromptStep } from '../../schemas/worker-profile.schema.js';
import { END_STEP_ID } from '../../schemas/worker-profile.schema.js';
import { resolveTemplate } from '../variable-resolver.js';
import { runWorker } from '../../agents/worker-runner.js';
import type { StepHandler } from './types.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Handles pi_agent steps: executa o Pi Coding Agent no worktree.
 * Resolve $var no taskTemplate antes de enviar ao agente.
 * Se o agente falhar, popula $error mas continua o fluxo
 * (o perfil pode usar condition para reagir).
 */
export const handlePiAgent: StepHandler = async (step, state, ctx) => {
  const s = step as PiAgentStep;
  const resolvedTask = resolveTemplate(s.taskTemplate, state);
  const model = ctx.profile.workerModel ?? 'openai/gpt-4.1-mini';

  ctx.onProgress?.(`[pi_agent:${s.id}] Starting: ${resolvedTask.slice(0, 80)}...`);

  const result = await runWorker(
    { id: s.id, task: resolvedTask, dependencies: [], status: 'running', files: [] },
    ctx.worktreePath,
    resolvedTask,
    {
      model,
      apiKey: ctx.apiKey,
      onProgress: ctx.onProgress
        ? (event) => ctx.onProgress?.(`[pi_agent:${s.id}] ${event.content}`)
        : undefined,
    },
  );

  ctx.onProgress?.(`[pi_agent:${s.id}] Done: ${result.status}`);

  // Se pi_agent falhou, seta error mas continua fluxo
  if (result.error) {
    return {
      nextStepId: s.next === END_STEP_ID ? null : s.next,
      stateUpdates: {
        reservedVars: { error: result.error },
      },
    };
  }

  return { nextStepId: s.next === END_STEP_ID ? null : s.next };
};

/**
 * Handles langchain_prompt steps: gera texto via LLM e armazena resultado.
 * Usa ChatOpenAI via OpenRouter, resolve $var no inputTemplate,
 * escreve output no outputTarget.
 */
export const handleLangchainPrompt: StepHandler = async (step, state, ctx) => {
  const s = step as LangchainPromptStep;
  const input = resolveTemplate(s.inputTemplate, state);
  const model = ctx.profile.langchainModel ?? 'openai/gpt-4.1-mini';

  ctx.onProgress?.(`[langchain:${s.id}] Generating with ${model}...`);

  const llm = new ChatOpenAI({
    model,
    temperature: 0.3,
    apiKey: ctx.apiKey,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });

  const response = await llm.invoke([new HumanMessage(input)]);
  const output = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);

  ctx.onProgress?.(`[langchain:${s.id}] Done (${output.length} chars)`);

  // Escreve output na variável target
  const reservedKeys = ['task', 'diff', 'error', 'context'] as const;
  if ((reservedKeys as readonly string[]).includes(s.outputTarget)) {
    return {
      nextStepId: s.next === END_STEP_ID ? null : s.next,
      stateUpdates: {
        reservedVars: { [s.outputTarget]: output },
      },
    };
  }

  return {
    nextStepId: s.next === END_STEP_ID ? null : s.next,
    stateUpdates: {
      customVars: { [s.outputTarget]: output },
    },
  };
};
