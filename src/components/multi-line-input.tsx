/**
 * Input multi-linha para Ink.
 * Captura keystrokes via useInput, renderiza texto com quebras de linha,
 * e submete apenas quando Enter é pressionado duas vezes seguidas.
 * Durante a edição, apenas ESC funciona como hotkey externa.
 *
 * Suporta paste de conteúdo multi-linha: detecta input com newlines
 * (que chega como string única em paste) e o processa corretamente.
 * Linhas longas são truncadas visualmente para respeitar bordas do box.
 *
 * @module
 */

import React, { useState, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

/** Mínimo de caracteres para permitir submit */
const MIN_LENGTH = 5;

/** Máximo de linhas exibidas (scroll virtual para textos longos) */
const MAX_VISIBLE_LINES = 20;

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

/** Processa caractere: backspace remove, texto adiciona, controle ignora */
function processChar(
  input: string,
  isDelete: boolean,
  isControl: boolean,
  setValue: React.Dispatch<React.SetStateAction<string>>,
) {
  if (isDelete) { setValue((prev) => prev.slice(0, -1)); }
  else if (!isControl && input) {
    // Paste pode chegar como string multi-char: adiciona tudo de uma vez
    setValue((prev) => prev + input);
  }
}

/**
 * Hook que gerencia estado do input multi-linha.
 * Enter adiciona newline; double-Enter submete; ESC cancela.
 * Paste de texto longo é aceito como input de string única.
 *
 * @param onSubmit - Callback com texto final
 * @param onCancel - Callback de cancelamento
 * @param isActive - Se está capturando input
 * @returns Estado do input (value, showSubmitHint, lineCount)
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
    processChar(input, key.backspace || key.delete, isControlKey(key), setValue);
  }, { isActive });

  const lineCount = value.split('\n').length;
  return { value, showSubmitHint: lastKeyWasEnterRef.current && value.trim().length >= MIN_LENGTH, lineCount };
}

/**
 * Trunca uma linha para caber na largura disponível do box.
 * Considera padding e line number prefix.
 */
function truncateLine(line: string, maxWidth: number): string {
  if (maxWidth <= 0 || line.length <= maxWidth) return line;
  return line.slice(0, maxWidth - 1) + '\u2026';
}

/**
 * Input multi-linha controlado internamente.
 * Enter adiciona nova linha; Enter + Enter (consecutivos) submete.
 * Suporta paste de conteúdo multi-linha.
 * Linhas longas são truncadas para respeitar bordas do box.
 * Textos com muitas linhas mostram apenas as últimas MAX_VISIBLE_LINES.
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
  const { value, showSubmitHint, lineCount } = useMultiLineInput(onSubmit, onCancel, isActive);
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  // Largura útil: terminal - padding (2*1) - border (2*1) - line number prefix (~4 chars)
  const maxLineWidth = termWidth - 8;

  const allLines = value.split('\n');
  const isEmpty = value.length === 0;

  // Scroll virtual: mostra apenas as últimas N linhas se o texto for muito longo
  const startIdx = allLines.length > MAX_VISIBLE_LINES ? allLines.length - MAX_VISIBLE_LINES : 0;
  const visibleLines = allLines.slice(startIdx);
  const hasScrolled = startIdx > 0;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={isEmpty ? 'gray' : 'cyan'} paddingX={1} minHeight={3}>
        {isEmpty ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <>
            {hasScrolled && (
              <Text dimColor italic>  ... {startIdx} linha(s) acima ...</Text>
            )}
            {visibleLines.map((line, i) => {
              const lineNum = startIdx + i + 1;
              const isLast = lineNum === allLines.length;
              const displayLine = truncateLine(line, maxLineWidth);
              return (
                <Text key={i}>
                  <Text dimColor>{String(lineNum).padStart(3)} </Text>
                  <Text>{displayLine}</Text>
                  {isLast && <Text color="cyan">{'\u2588'}</Text>}
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
          <Text dimColor>[Enter] nova linha  |  [Enter+Enter] enviar  |  [ESC] cancelar</Text>
        )}
        {lineCount > 1 && <Text dimColor>({lineCount} linhas)</Text>}
      </Box>
    </Box>
  );
}
