import { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import {
  STEP_TYPE_ITEMS,
  buildStepFromFields,
  extractFields,
  extractVariableUsage,
  getFieldDefs,
  validateStepFields,
} from './step-field-defs.js';
import type { StepType, WorkerStep } from '../schemas/worker-profile.schema.js';

interface StepEditorProps {
  readonly mode: 'create' | 'edit';
  readonly stepId: string;
  readonly existingStep?: WorkerStep;
  readonly nextTarget: string;
  readonly validTargets: ReadonlySet<string>;
  readonly onSave: (step: WorkerStep) => void;
  readonly onCancel: () => void;
}

type EditorPhase = 'type' | 'fields';

/**
 * Modal de edicao/criacao de step.
 *
 * @param props - Estado inicial e callbacks
 * @returns Componente de editor
 *
 * @example
 * <StepEditor mode="create" stepId="4" nextTarget="__end__" ... />
 */
export function StepEditor({
  mode,
  stepId,
  existingStep,
  nextTarget,
  validTargets,
  onSave,
  onCancel,
}: StepEditorProps) {
  const initialType: StepType | null = existingStep?.type ?? null;
  const [phase, setPhase] = useState<EditorPhase>(initialType ? 'fields' : 'type');
  const [type, setType] = useState<StepType | null>(initialType);
  const [fields, setFields] = useState<Readonly<Record<string, string>>>(
    existingStep ? extractFields(existingStep) : {},
  );
  const [fieldIndex, setFieldIndex] = useState(0);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  const targetOptions = useMemo(() => [...validTargets], [validTargets]);
  const fieldDefs = useMemo(
    () => (type ? getFieldDefs(type, targetOptions) : []),
    [type, targetOptions],
  );

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (phase !== 'fields') {
      return;
    }
    if (key.upArrow || input === 'k') {
      setFieldIndex((value) => Math.max(0, value - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setFieldIndex((value) => Math.min(fieldDefs.length - 1, value + 1));
      return;
    }
    if (key.ctrl && input === 's') {
      trySave();
    }
  });

  if (phase === 'type') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
        <Text bold color="cyan">
          {mode === 'create' ? 'Adicionar step' : 'Editar step'} #{stepId}
        </Text>
        <Text dimColor>Selecione o tipo do step (ID e auto-gerado e read-only).</Text>
        <Box marginTop={1}>
          <SelectInput
            items={STEP_TYPE_ITEMS.map((item) => ({ label: `${item.label} — ${item.description}`, value: item.value }))}
            onSelect={(item) => {
              setType(item.value as StepType);
              setPhase('fields');
              setFieldIndex(0);
              setFields({});
            }}
          />
        </Box>
      </Box>
    );
  }

  if (!type) {
    return null;
  }

  const previewStep = buildStepFromFields(type, stepId, fields, nextTarget);
  const usage = extractVariableUsage(previewStep);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        {mode === 'create' ? 'Novo step' : 'Editar step'} #{stepId} ({type})
      </Text>
      <Text dimColor>ID auto-gerado (somente leitura): {stepId}</Text>
      <Text dimColor>Ctrl+S salva, ESC cancela, j/k navega campos</Text>

      <Box flexDirection="column" marginTop={1}>
        {fieldDefs.map((fieldDef, index) => {
          const isSelected = index === fieldIndex;
          const rawValue = fields[fieldDef.key] ?? '';
          const fieldError = errors[fieldDef.key];
          const isInvalid = saveAttempted && Boolean(fieldError);
          return (
            <Box key={fieldDef.key} flexDirection="column">
              <Box>
                <Text color={isSelected ? 'cyan' : 'gray'}>
                  {isSelected ? '> ' : '  '}
                  {fieldDef.label}
                </Text>
                {fieldDef.required && rawValue.trim().length === 0 && <Text color="yellow"> *</Text>}
              </Box>
              {isSelected ? (
                <Box marginLeft={2}>
                  <TextInput
                    value={rawValue}
                    onChange={(value) => {
                      setFields((prev) => ({ ...prev, [fieldDef.key]: value }));
                    }}
                    onSubmit={() => {
                      setFieldIndex((value) => Math.min(fieldDefs.length - 1, value + 1));
                    }}
                    placeholder={fieldDef.placeholder}
                  />
                </Box>
              ) : (
                <Box marginLeft={2}>
                  <Text color={isInvalid ? 'red' : 'white'} underline={isInvalid}>
                    {rawValue.length > 0 ? rawValue : '[vazio]'}
                  </Text>
                </Box>
              )}
              {isInvalid && <Text color="red" dimColor>{`  ${fieldError}`}</Text>}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Le: {usage.reads.length > 0 ? usage.reads.map((item) => `$${item}`).join(', ') : '(nenhuma)'}</Text>
        <Text dimColor>Escreve: {usage.writes.length > 0 ? usage.writes.map((item) => `$${item}`).join(', ') : '(nenhuma)'}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{'Target sequencial automatico: '}</Text>
        <Text>{nextTarget}</Text>
      </Box>

      {saveAttempted && Object.keys(errors).length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">Corrija os erros antes de salvar:</Text>
          {Object.values(errors).map((error) => (
            <Text key={error} color="red" dimColor>{`- ${error}`}</Text>
          ))}
        </Box>
      )}
    </Box>
  );

  function trySave(): void {
    const currentType = type;
    if (!currentType) {
      return;
    }
    const result = validateStepFields(currentType, fields, validTargets);
    setSaveAttempted(true);
    setErrors(result.errors);
    if (!result.valid) {
      return;
    }
    onSave(buildStepFromFields(currentType, stepId, fields, nextTarget));
  }
}
