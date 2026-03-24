/**
 * Input multi-linha para Ink.
 * Captura keystrokes via useInput, renderiza texto com quebras de linha,
 * e submete apenas quando Enter é pressionado duas vezes seguidas.
 * Durante a edição, apenas ESC funciona como hotkey externa.
 *
 * @module
 */

import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

/** Mínimo de caracteres para permitir submit */
const MIN_LENGTH = 5;

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
  else if (!isControl && input) { setValue((prev) => prev + input); }
}

/**
 * Hook que gerencia estado do input multi-linha.
 * Enter adiciona newline; double-Enter submete; ESC cancela.
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
    processChar(input, key.backspace || key.delete, isControlKey(key), setValue);
  }, { isActive });

  return { value, showSubmitHint: lastKeyWasEnterRef.current && value.trim().length >= MIN_LENGTH };
}

/**
 * Input multi-linha controlado internamente.
 * Enter adiciona nova linha; Enter + Enter (consecutivos) submete.
 * Suporta paste de conteúdo multi-linha.
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
  const lines = value.split('\n');
  const isEmpty = value.length === 0;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={isEmpty ? 'gray' : 'cyan'} paddingX={1} minHeight={3}>
        {isEmpty ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          lines.map((line, i) => (
            <Text key={i}>
              <Text dimColor>{String(i + 1).padStart(2)} </Text>
              <Text>{line}</Text>
              {i === lines.length - 1 && <Text color="cyan">{'\u2588'}</Text>}
            </Text>
          ))
        )}
      </Box>
      <Box paddingX={1}>
        {showSubmitHint ? (
          <Text color="yellow">Pressione Enter novamente para enviar</Text>
        ) : (
          <Text dimColor>[Enter] nova linha  |  [Enter+Enter] enviar  |  [ESC] cancelar</Text>
        )}
      </Box>
    </Box>
  );
}
