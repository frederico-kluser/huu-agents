/**
 * Input multi-linha para Ink.
 * Captura keystrokes via useInput, renderiza texto com quebras de linha,
 * e submete apenas quando Enter é pressionado duas vezes seguidas.
 * Suporta paste de conteúdo multi-linha (detecta input > 1 char).
 * Durante a edição, apenas ESC funciona como hotkey externa.
 *
 * @module
 */

import React, { useState, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

/** Mínimo de caracteres para permitir submit */
const MIN_LENGTH = 5;

/** Número máximo de linhas visíveis antes de scroll */
const MAX_VISIBLE_LINES = 15;

interface MultiLineInputProps {
  /** Callback ao submeter (double Enter) */
  readonly onSubmit: (value: string) => void;
  /** Callback ao cancelar (ESC) */
  readonly onCancel: () => void;
  /** Texto placeholder quando vazio */
  readonly placeholder?: string;
  /** Se o input está ativo (capturando teclas) */
  readonly isActive?: boolean;
}

/** Retorna true se a tecla é de controle/navegação (não produz texto) */
const isControlKey = (key: {
  ctrl: boolean; meta: boolean; upArrow: boolean; downArrow: boolean;
  leftArrow: boolean; rightArrow: boolean; pageUp: boolean; pageDown: boolean;
  home: boolean; end: boolean; tab: boolean;
}): boolean =>
  key.ctrl || key.meta || key.upArrow || key.downArrow || key.leftArrow
  || key.rightArrow || key.pageUp || key.pageDown || key.home || key.end || key.tab;

/**
 * Quebra uma linha longa em múltiplas linhas respeitando a largura do terminal.
 * Reserva espaço para: padding (2), borda (2), número de linha (4).
 *
 * @param line - Linha a quebrar
 * @param maxWidth - Largura máxima disponível
 * @returns Array de linhas quebradas
 */
function wrapLine(line: string, maxWidth: number): readonly string[] {
  if (maxWidth <= 0 || line.length <= maxWidth) return [line];
  const wrapped: string[] = [];
  let remaining = line;
  while (remaining.length > maxWidth) {
    wrapped.push(remaining.slice(0, maxWidth));
    remaining = remaining.slice(maxWidth);
  }
  wrapped.push(remaining);
  return wrapped;
}

/** Processa Enter: double-Enter submete, single-Enter adiciona newline */
function processEnter(
  value: string,
  lastKeyWasEnterRef: React.MutableRefObject<boolean>,
  onSubmit: (v: string) => void,
  setValue: React.Dispatch<React.SetStateAction<string>>,
) {
  if (lastKeyWasEnterRef.current && value.trim().length >= MIN_LENGTH) {
    onSubmit(value.replace(/\n$/, '').trim());
  } else {
    lastKeyWasEnterRef.current = true;
    setValue((prev) => prev + '\n');
  }
}

/**
 * Hook que gerencia estado do input multi-linha.
 * Enter adiciona newline; double-Enter submete; ESC cancela.
 * Detecta paste (input com múltiplos chars) e trata corretamente.
 *
 * @param onSubmit - Callback com texto final
 * @param onCancel - Callback de cancelamento
 * @param isActive - Se está capturando input
 * @returns Estado do input (value, showSubmitHint)
 */
function useMultiLineInput(
  onSubmit: (value: string) => void,
  onCancel: () => void,
  isActive: boolean,
) {
  const [value, setValue] = useState('');
  const lastKeyWasEnterRef = useRef(false);

  const handleKey = useRef({ onSubmit, onCancel });
  handleKey.current = { onSubmit, onCancel };

  useInput((input, key) => {
    if (!isActive) return;
    if (key.escape) { handleKey.current.onCancel(); return; }
    if (key.return) { processEnter(value, lastKeyWasEnterRef, handleKey.current.onSubmit, setValue); return; }

    lastKeyWasEnterRef.current = false;

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (isControlKey(key)) return;

    // Paste detection: input > 1 char means pasted content.
    // Pasted text may contain \r\n or \r — normalize to \n.
    if (input && input.length > 0) {
      const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      setValue((prev) => prev + normalized);
    }
  }, { isActive });

  return { value, showSubmitHint: lastKeyWasEnterRef.current && value.trim().length >= MIN_LENGTH };
}

/**
 * Input multi-linha controlado internamente.
 * Enter adiciona nova linha; Enter + Enter (consecutivos) submete.
 * Suporta paste de conteúdo multi-linha com word-wrap automático.
 *
 * @example
 * <MultiLineInput
 *   onSubmit={(text) => handlePrompt(text)}
 *   onCancel={() => goBack()}
 *   placeholder="Descreva a pipeline..."
 * />
 */
export function MultiLineInput({
  onSubmit, onCancel, placeholder = '', isActive = true,
}: MultiLineInputProps) {
  const { value, showSubmitHint } = useMultiLineInput(onSubmit, onCancel, isActive);
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  // Reserve space for: border (2) + paddingX (2) + line number prefix (4)
  const contentWidth = Math.max(termWidth - 8, 20);
  const lines = value.split('\n');
  const isEmpty = value.length === 0;
  const lineCount = lines.length;

  // Build display lines with wrapping
  const displayLines: Array<{ text: string; lineNum: number; isWrapped: boolean }> = [];
  for (let i = 0; i < lines.length; i++) {
    const wrapped = wrapLine(lines[i]!, contentWidth);
    for (let j = 0; j < wrapped.length; j++) {
      displayLines.push({ text: wrapped[j]!, lineNum: i + 1, isWrapped: j > 0 });
    }
  }

  // Scroll: show last MAX_VISIBLE_LINES lines
  const visibleStart = Math.max(0, displayLines.length - MAX_VISIBLE_LINES);
  const visibleLines = displayLines.slice(visibleStart);
  const hasScrolledContent = visibleStart > 0;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={isEmpty ? 'gray' : 'cyan'} paddingX={1} minHeight={3}>
        {isEmpty ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <>
            {hasScrolledContent && (
              <Text dimColor color="yellow">{`   \u2191 ${visibleStart} linhas acima`}</Text>
            )}
            {visibleLines.map((dl, i) => {
              const isLastLine = visibleStart + i === displayLines.length - 1;
              return (
                <Text key={`${dl.lineNum}-${i}`}>
                  <Text dimColor>{dl.isWrapped ? '   ' : String(dl.lineNum).padStart(2) + ' '}</Text>
                  <Text wrap="truncate">{dl.text}</Text>
                  {isLastLine && <Text color="cyan">{'\u2588'}</Text>}
                </Text>
              );
            })}
          </>
        )}
      </Box>
      <Box paddingX={1} gap={2}>
        {showSubmitHint ? (
          <Text color="yellow">Pressione Enter novamente para enviar</Text>
        ) : (
          <>
            <Text dimColor>[Enter] nova linha</Text>
            <Text dimColor>[Enter+Enter] enviar</Text>
            <Text dimColor>[ESC] cancelar</Text>
            {lineCount > 1 && <Text dimColor>{lineCount} linhas</Text>}
          </>
        )}
      </Box>
    </Box>
  );
}
