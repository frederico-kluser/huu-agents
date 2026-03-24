/**
 * Tela do builder de perfis no formato config-card.
 * Usa hook dedicado para manter o arquivo enxuto.
 * Inclui documentacao inline de variaveis e tutorial contextual.
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
 * Builder visual de perfis com documentacao inline.
 *
 * @param props - Props da tela
 * @returns Tela de criacao/edicao de perfil
 *
 * @example
 * <ProfileBuilderScreen onSave={save} onCancel={back} />
 */
export const ProfileBuilderScreen = ({ existingProfile, onSave, onCancel }: ProfileBuilderScreenProps) => {
  const state = useProfileBuilderState({ existingProfile, onSave, onCancel });
  const [showVarHelp, setShowVarHelp] = useState(false);

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
      return;
    }
    if (input === '?') {
      setShowVarHelp((prev) => !prev);
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
        <Text bold color="cyan">{'\u{1F527}'} {existingProfile ? 'Editar' : 'Criar'} Pipeline Profile</Text>
        <Text dimColor>
          {existingProfile
            ? `Editando perfil "${existingProfile.id}". [?] ajuda sobre variaveis`
            : 'Monte uma pipeline multi-step para seus workers. [?] ajuda sobre variaveis'}
        </Text>

        {/* Header fields */}
        <Box marginTop={1} flexDirection="column">
          {HEADER_KEYS.map((keyName) => renderHeaderRow(keyName))}
        </Box>

        {/* Descricao contextual do campo selecionado */}
        {state.selectedItem?.kind === 'header' && (
          <Box marginTop={1} paddingX={2}>
            <Text color="yellow">{'\u{1F4A1}'} </Text>
            <Text dimColor>{HEADER_FIELD_DESCRIPTIONS[state.selectedItem.key as HeaderFieldKey]}</Text>
          </Box>
        )}

        {/* Variables section */}
        <Box marginTop={1} flexDirection="column">
          <Box gap={1}>
            <Text bold>{'\u2500\u2500'} Variaveis {'\u2500\u2500'}</Text>
            <Text dimColor>[?] toggle ajuda</Text>
          </Box>

          {/* Quick reference for reserved vars */}
          <Box paddingX={2} flexDirection="column">
            <Text dimColor>Reservadas (auto): <Text color="white">$task</Text>  <Text color="white">$diff</Text>  <Text color="white">$error</Text></Text>
          </Box>

          {/* Variable help panel */}
          {showVarHelp && <VariableHelpPanel />}

          {/* Custom variables */}
          {state.sortedVariables.length === 0 && (
            <Box paddingX={2}>
              <Text dimColor>Custom: (nenhuma) — use [v] para adicionar</Text>
            </Box>
          )}
          {state.sortedVariables.map(([name, value]) => {
            const selected = state.selectedItem?.kind === 'variable' && state.selectedItem.key === name;
            return (
              <Box key={name} paddingX={2}>
                <Text color={selected ? 'cyan' : 'white'}>
                  {selected ? '\u25B6 ' : '  '}
                  ${name} = {String(value)}
                </Text>
                {selected && <Text dimColor>  [Enter] editar  [x] deletar</Text>}
              </Box>
            );
          })}
        </Box>

        {/* Pipeline steps as tree */}
        <Box marginTop={1} flexDirection="column">
          <Text bold>{'\u2500\u2500'} Pipeline Steps {'\u2500\u2500'}</Text>
          <PipelineGraph
            steps={state.orderedSteps}
            selectedStepId={state.selectedItem?.kind === 'step' ? state.selectedItem.key : null}
          />
        </Box>

        {/* Keybindings footer */}
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
          <Box gap={2}>
            <Text dimColor>[j/k] navegar</Text>
            <Text dimColor>[Enter] editar</Text>
            <Text dimColor>[a] add step</Text>
            <Text dimColor>[b] branch</Text>
          </Box>
          <Box gap={2}>
            <Text dimColor>[v] add variavel</Text>
            <Text dimColor>[x] deletar</Text>
            <Text dimColor>[s] salvar perfil</Text>
            <Text dimColor>[?] ajuda vars</Text>
            <Text dimColor>[ESC] cancelar</Text>
          </Box>
        </Box>

        {/* Validation errors */}
        {state.validationErrors.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red" bold>{'\u26A0'} Erros de validacao:</Text>
            {state.validationErrors.map((error) => (
              <Text key={error} color="red" dimColor>{`  \u2022 ${error}`}</Text>
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
        return <ConfigRow key={keyName} label="Profile ID" value={state.meta.id} selected={selected} required invalid={invalid} />;
      case 'scope':
        return <SelectorRow key={keyName} label="Scope" value={state.meta.scope} selected={selected} invalid={invalid} />;
      case 'entryStepId':
        return (
          <SelectorRow
            key={keyName}
            label="Entry Step"
            value={state.entryStepId.length > 0 ? state.entryStepId : '(auto)'}
            selected={selected}
            invalid={invalid}
          />
        );
      case 'maxStepExecutions':
        return (
          <ConfigRow
            key={keyName}
            label="Max execucoes (loop guard)"
            value={String(state.meta.maxStepExecutions)}
            selected={selected}
            required
            invalid={invalid}
          />
        );
      case 'seats':
        return (
          <ConfigRow
            key={keyName}
            label="Seats (paralelismo)"
            value={String(state.meta.seats)}
            selected={selected}
            required
            invalid={invalid}
          />
        );
      case 'workerModel':
        return (
          <SelectorRow
            key={keyName}
            label="Worker Model"
            value={modelLabel(state.meta.workerModel)}
            selected={selected}
            invalid={invalid}
          />
        );
      case 'langchainModel':
        return (
          <SelectorRow
            key={keyName}
            label="LangChain Model"
            value={modelLabel(state.meta.langchainModel)}
            selected={selected}
            invalid={invalid}
          />
        );
      case 'description':
        return <ConfigRow key={keyName} label="Description" value={state.meta.description} selected={selected} invalid={invalid} />;
    }
  }
};

// ── Variable Help Panel ──────────────────────────────────────────────

/** Painel inline com documentacao completa sobre variaveis */
function VariableHelpPanel() {
  return (
    <Box flexDirection="column" marginY={1} paddingX={2} borderStyle="single" borderColor="yellow">
      <Text bold color="yellow">{'\u{1F4D6}'} Guia de Variaveis</Text>
      <Text> </Text>

      <Text bold color="cyan">Reservadas (preenchidas pelo runtime):</Text>
      <Text dimColor>  <Text color="white">$task</Text>   — Descricao da subtask. Pode ser sobrescrita por</Text>
      <Text dimColor>            langchain_prompt (outputTarget=task) ou set_variable.</Text>
      <Text dimColor>  <Text color="white">$diff</Text>   — Diff do worktree. Preenchida por git_diff. Comeca vazia.</Text>
      <Text dimColor>  <Text color="white">$error</Text>  — Ultimo erro. Preenchida automaticamente pelo runtime.</Text>
      <Text> </Text>

      <Text bold color="cyan">Custom ($custom_*):</Text>
      <Text dimColor>  Como criar: adicione em initialVariables (acima) com valor inicial.</Text>
      <Text dimColor>  Como usar: $custom_nome em qualquer template de step.</Text>
      <Text dimColor>  Prefixo obrigatorio: custom_ (ex: custom_tries, custom_pass)</Text>
      <Text> </Text>

      <Text bold color="cyan">Quem ESCREVE variaveis?</Text>
      <Text dimColor>  <Text color="blue">set_variable</Text>      — Define/atualiza qualquer variavel</Text>
      <Text dimColor>  <Text color="magenta">langchain_prompt</Text>  — Salva resposta do LLM no outputTarget</Text>
      <Text dimColor>  <Text color="white">git_diff</Text>          — Captura diff na variavel target</Text>
      <Text dimColor>  <Text color="green">pi_agent</Text>          — <Text color="red">NAO escreve variaveis</Text> (so altera arquivos)</Text>
      <Text> </Text>

      <Text dimColor>[?] para fechar este painel</Text>
    </Box>
  );
}

// ── Sub-editors ─────────────────────────────────────────────────────

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
        <Text bold color="cyan">{'\u{1F4DD}'} Adicionar variavel custom</Text>
        <Text> </Text>
        <Text dimColor>Variaveis custom permitem compartilhar dados entre steps.</Text>
        <Text dimColor>O nome DEVE comecar com <Text color="white">custom_</Text> (ex: custom_tries, custom_pass)</Text>
        <Text dimColor>O valor inicial pode ser numero (0, 42) ou texto ("pending").</Text>
        <Text> </Text>

        <Box>
          <Text color={context.focus === 'name' ? 'cyan' : 'gray'}>Nome:          </Text>
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
        {context.error && (
          <Box marginTop={1}>
            <Text color="red">{'\u26A0'} {context.error}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>Enter avanca entre campos  |  ESC cancela</Text>
        </Box>

        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
          <Text dimColor bold>Como usar depois de criar:</Text>
          <Text dimColor>  Em templates: "Tentativa $custom_tries de 3"</Text>
          <Text dimColor>  Em condicoes: $custom_tries {'>'}= 3</Text>
          <Text dimColor>  Em set_variable: valueExpression = $custom_tries + 1</Text>
        </Box>
      </Box>
    </Box>
  );
}
