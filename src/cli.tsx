#!/usr/bin/env node
import { render } from 'ink';
import { App } from './app.js';

/**
 * Entry point do Pi DAG CLI.
 *
 * Renderiza o componente raiz App no terminal via Ink v6.
 * O render() retorna controle de lifecycle (waitUntilExit, unmount, clear).
 *
 * @example
 * ```bash
 * node dist/cli.js
 * # ou via bin:
 * pi-dag
 * ```
 */
const instance = render(<App />, {
  exitOnCtrlC: true,
  patchConsole: true,
});

await instance.waitUntilExit();
