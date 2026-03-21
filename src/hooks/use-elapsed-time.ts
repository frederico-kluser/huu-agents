import { useState, useEffect } from 'react';

/**
 * Hook que retorna o tempo decorrido formatado como MM:SS.
 * Atualiza a cada segundo a partir do startTime fornecido.
 *
 * @param startTime - Timestamp em ms do inicio da execucao
 * @returns String formatada "MM:SS"
 *
 * @example
 * ```tsx
 * const elapsed = useElapsedTime(Date.now());
 * // "00:42"
 * ```
 */
export const useElapsedTime = (startTime: number): string => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.floor((now - startTime) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};
