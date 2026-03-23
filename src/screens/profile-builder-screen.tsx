/**
 * Tela do builder de perfis no formato config-card.
 * Usa hook dedicado para manter o arquivo enxuto.
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { modelLabel, HEADER_FIELD_DESCRIPTIONS, ConfigRow, SelectorRow } from '../components/builder-helpers.js';
import { buildTargetOptions } from '../components/step-field-defs.js';
import { StepEditor } from '../components/step-editor.js';
import { PipelineGraph } from '../components/pipeline-graph.js';
import {
  HEADER_KEYS,
  useProfileBuilderState,
  type EditingContext,
} from '../components/profile-builder-state.js';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import type { HeaderFieldKey } from '../components/builder-helpers.js';

interface ProfileBuilderScreenProps {
  readonly existingProfile?: WorkerProfile;
  readonly onSave: (profile: WorkerProfile) => void;
  readonly onCancel: () => void;
}

/**
 * Builder visual de perfis.
 *
 * @param props - Props da tela
 * @returns Tela de criacao/edicao de perfil
 *
 * @example
 * <ProfileBuilderScreen onSave={save} onCancel={back} />
 */
export const ProfileBuilderScreen = ({ existingProfile, onSave, onCancel }: ProfileBuilderScreenProps) => {
  const state = useProfileBuilderState({ existingProfile, onSave, onCancel });

  useInput((input, key) => {
    if (state.editing.mode !== 'none') {
      if (key.escape) {
        state.setEditing({ mode: 'none' });
      }
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }
    if (input === 'j' || key.downArrow) {
      state.setSelectedIndex((prev) => Math.min(state.items.length - 1, prev + 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      state.setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.return) {
      state.handleEnter();
      return;
    }
    if (input === 'a') {
      state.openCreateStep();
      return;
    }
    if (input === 'b') {
      state.openBranchOnCondition();
      return;
    }
    if (input === 'v') {
      state.startAddVariable();
      return;
    }
    if (input === 'x') {
      state.handleDelete();
      return;
    }
    if (input === 's') {
      state.saveProfile();
    }
  });

  if (state.editing.mode === 'field-input') {
    const context = state.editing;
    return (
      <TextInputEditor
        context={context}
        onSubmit={(value) => {
          state.applyTextField(context.field, value);
          state.setEditing({ mode: 'none' });
        }}
      />
    );
  }
  if (state.editing.mode === 'field-select') {
    const context = state.editing;
    return (
      <SelectEditor
        context={context}
        onSelect={(value) => {
          state.applySelectField(context.field, value);
          state.setEditing({ mode: 'none' });
        }}
      />
    );
  }
  if (state.editing.mode === 'step-editor') {
    const context = state.editing;
    return (
      <Box padding={1}>
        <StepEditor
          mode={context.action}
          stepId={context.stepId}
          existingStep={context.existingStep}
          nextTarget={context.nextTarget}
          validTargets={new Set(buildTargetOptions(state.steps))}
          onCancel={() => state.setEditing({ mode: 'none' })}
          onSave={(step) => {
            state.applyStepEdit(context, step);
            state.setEditing({ mode: 'none' });
          }}
        />
      </Box>
    );
  }
  if (state.editing.mode === 'variable-add') {
    return (
      <VariableAddEditor
        context={state.editing}
        onChange={(next) => state.setEditing(next)}
        onDone={() => state.setEditing({ mode: 'none' })}
        onConfirm={(name, value) => state.confirmAddVariable(name, value)}
      />
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">Criar Pipeline Profile</Text>
        <Text dimColor>Config-card: todos os campos visiveis. Enter para editar.</Text>

        <Box marginTop={1} flexDirection="column">
          {HEADER_KEYS.map((keyName) => renderHeaderRow(keyName))}
        </Box>

        {state.selectedItem?.kind === 'header' && (
          <Box marginTop={1}>
            <Text dimColor>{HEADER_FIELD_DESCRIPTIONS[state.selectedItem.key as HeaderFieldKey]}</Text>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          <Text bold>── Variaveis ──</Text>
          <Text dimColor>Reservadas (auto): $task  $diff  $error</Text>
          {state.sortedVariables.length === 0 && <Text dimColor>Custom: (nenhuma)</Text>}
          {state.sortedVariables.map(([name, value]) => {
            const selected = state.selectedItem?.kind === 'variable' && state.selectedItem.key === name;
            return (
              <Box key={name}>
                <Text color={selected ? 'cyan' : 'white'}>
                  {selected ? '> ' : '  '}
                  ${name} = {String(value)}
                </Text>
                <Text dimColor>  [x]</Text>
              </Box>
            );
          })}
          <Text dimColor>[v] adicionar variavel  [Enter] editar valor  [x] deletar</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>── Steps ──</Text>
          <PipelineGraph
            steps={state.orderedSteps}
            selectedStepId={state.selectedItem?.kind === 'step' ? state.selectedItem.key : null}
          />
        </Box>

        <Box marginTop={1} gap={2}>
          <Text dimColor>[j/k] navegar</Text>
          <Text dimColor>[Enter] editar</Text>
          <Text dimColor>[a] add step</Text>
          <Text dimColor>[b] add branch</Text>
          <Text dimColor>[v] add var</Text>
          <Text dimColor>[x] delete</Text>
          <Text dimColor>[s] save</Text>
          <Text dimColor>[ESC] cancel</Text>
        </Box>

        {state.validationErrors.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red" bold>Erros de validacao:</Text>
            {state.validationErrors.map((error) => (
              <Text key={error} color="red" dimColor>{`- ${error}`}</Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );

  function renderHeaderRow(keyName: HeaderFieldKey) {
    const selected = state.selectedItem?.kind === 'header' && state.selectedItem.key === keyName;
    const invalid = Boolean(state.fieldErrors[keyName]);
    switch (keyName) {
      case 'id':
        return <ConfigRow label="Profile ID" value={state.meta.id} selected={selected} required invalid={invalid} />;
      case 'scope':
        return <SelectorRow label="Scope" value={state.meta.scope} selected={selected} invalid={invalid} />;
      case 'entryStepId':
        return (
          <SelectorRow
            label="Entry Step"
            value={state.entryStepId.length > 0 ? state.entryStepId : '(auto)'}
            selected={selected}
            invalid={invalid}
          />
        );
      case 'maxStepExecutions':
        return (
          <ConfigRow
            label="Max step executions (loop guard)"
            value={String(state.meta.maxStepExecutions)}
            selected={selected}
            required
            invalid={invalid}
          />
        );
      case 'seats':
        return (
          <ConfigRow
            label="Assentos (paralelismo)"
            value={String(state.meta.seats)}
            selected={selected}
            required
            invalid={invalid}
          />
        );
      case 'workerModel':
        return (
          <SelectorRow
            label="Worker Model"
            value={modelLabel(state.meta.workerModel)}
            selected={selected}
            invalid={invalid}
          />
        );
      case 'langchainModel':
        return (
          <SelectorRow
            label="LangChain Model"
            value={modelLabel(state.meta.langchainModel)}
            selected={selected}
            invalid={invalid}
          />
        );
      case 'description':
        return <ConfigRow label="Description" value={state.meta.description} selected={selected} invalid={invalid} />;
    }
  }
};

interface TextInputEditorProps {
  readonly context: Extract<EditingContext, { mode: 'field-input' }>;
  readonly onSubmit: (value: string) => void;
}

function TextInputEditor({ context, onSubmit }: TextInputEditorProps) {
  const [value, setValue] = useState(context.initialValue);
  return (
    <Box padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1} flexDirection="column">
        <Text bold color="cyan">Editar campo</Text>
        <Text dimColor>{String(context.field)}</Text>
        <Box marginTop={1}>
          <Text color="cyan">{'> '}</Text>
          <TextInput value={value} onChange={setValue} onSubmit={onSubmit} />
        </Box>
        <Text dimColor>Enter confirma, ESC cancela</Text>
      </Box>
    </Box>
  );
}

interface SelectEditorProps {
  readonly context: Extract<EditingContext, { mode: 'field-select' }>;
  readonly onSelect: (value: string) => void;
}

function SelectEditor({ context, onSelect }: SelectEditorProps) {
  return (
    <Box padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1} flexDirection="column">
        <Text bold color="cyan">Selecionar valor</Text>
        <Text dimColor>{context.field}</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[...context.options]}
            onSelect={(item) => onSelect(item.value)}
            initialIndex={Math.max(0, context.options.findIndex((opt) => opt.value === context.initialValue))}
          />
        </Box>
      </Box>
    </Box>
  );
}

interface VariableAddEditorProps {
  readonly context: Extract<EditingContext, { mode: 'variable-add' }>;
  readonly onChange: (next: Extract<EditingContext, { mode: 'variable-add' }>) => void;
  readonly onDone: () => void;
  readonly onConfirm: (name: string, value: string) => string | null;
}

function VariableAddEditor({ context, onChange, onDone, onConfirm }: VariableAddEditorProps) {
  return (
    <Box padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1} flexDirection="column">
        <Text bold color="cyan">Adicionar variavel custom</Text>
        <Text dimColor>Prefixo obrigatorio: custom_</Text>
        <Box marginTop={1}>
          <Text color={context.focus === 'name' ? 'cyan' : 'gray'}>Nome: </Text>
          <TextInput
            value={context.name}
            onChange={(value) => onChange({ ...context, name: value })}
            onSubmit={() => onChange({ ...context, focus: 'value' })}
            placeholder="custom_tries"
          />
        </Box>
        <Box marginTop={1}>
          <Text color={context.focus === 'value' ? 'cyan' : 'gray'}>Valor inicial: </Text>
          <TextInput
            value={context.value}
            onChange={(value) => onChange({ ...context, value })}
            onSubmit={() => {
              const maybeError = onConfirm(context.name, context.value);
              if (maybeError) {
                onChange({ ...context, error: maybeError });
                return;
              }
              onDone();
            }}
            placeholder="0"
          />
        </Box>
        {context.error && <Text color="red">{context.error}</Text>}
        <Text dimColor>Enter confirma em cada campo, ESC cancela</Text>
      </Box>
    </Box>
  );
}
