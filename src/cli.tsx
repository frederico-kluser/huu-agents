#!/usr/bin/env node
import { render } from 'ink';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { App } from './app.js';
import { parseCliArgs, buildHelpText } from './cli-args.js';

/**
 * Entry point do Pi DAG CLI.
 *
 * Parseia argumentos, trata --help/--version com saida imediata,
 * e renderiza o componente App com cliArgs como props.
 *
 * @example
 * ```bash
 * node dist/cli.js
 * node dist/cli.js --help
 * node dist/cli.js --task "Refatorar auth" --context src/auth
 * ```
 */
const args = parseCliArgs();

if (args.help) {
  process.stdout.write(buildHelpText());
  process.exit(0);
}

if (args.version) {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const pkg: { version: string } = JSON.parse(await readFile(pkgPath, 'utf-8'));
  process.stdout.write(`pi-dag v${pkg.version}\n`);
  process.exit(0);
}

const instance = render(<App cliArgs={args} />, {
  exitOnCtrlC: true,
  patchConsole: true,
});

await instance.waitUntilExit();
