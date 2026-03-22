import { Box, Text } from 'ink';
import { findModel, formatPrice } from '../data/models.js';

interface StatusBarProps {
  readonly plannerModel: string;
  readonly workerModel: string;
  readonly onChangeModels?: () => void;
}

/** Formata resumo compacto de um modelo: "Nome ($in/$out)" */
const modelLabel = (id: string): string => {
  const m = findModel(id);
  if (!m) return id;
  return `${m.name} (${formatPrice(m.inputPrice)}/${formatPrice(m.outputPrice)})`;
};

/**
 * Barra de status compacta mostrando modelos Planner e Worker atuais.
 * Visível em todas as telas exceto loading e config.
 *
 * @example
 * ```tsx
 * <StatusBar plannerModel="google/gemini-3.1-pro" workerModel="xiaomi/mimo-v2-flash" onChangeModels={() => setScreen('model-change')} />
 * ```
 */
export const StatusBar = ({ plannerModel, workerModel, onChangeModels }: StatusBarProps) => (
  <Box borderStyle="single" borderColor="gray" paddingX={1} gap={1} marginBottom={1}>
    <Text>
      <Text dimColor>Planner: </Text>
      <Text bold color="cyan">{modelLabel(plannerModel)}</Text>
    </Text>
    <Text dimColor>|</Text>
    <Text>
      <Text dimColor>Worker: </Text>
      <Text bold color="cyan">{modelLabel(workerModel)}</Text>
    </Text>
    {onChangeModels && (
      <>
        <Text dimColor>|</Text>
        <Text dimColor>[m] modelos</Text>
      </>
    )}
  </Box>
);
