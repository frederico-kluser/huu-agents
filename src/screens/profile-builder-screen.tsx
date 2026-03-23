/**
 * Builder visual para criar/editar perfis de worker pipeline.
 * Baseado em dWvt6 — wizard multi-fase com TextInput e SelectInput do Ink.
 *
 * Fases: metadata -> add steps -> review -> save.
 * Suporta edição de perfil existente.
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import type { WorkerProfile, WorkerStep, StepType, ProfileScope } from '../schemas/worker-profile.schema.js';

type BuilderPhase = 'meta' | 'steps' | 'add-step' | 'review';
type MetaField = 'id' | 'name' | 'description' | 'scope' | 'maxStepExecutions';

interface ProfileBuilderScreenProps {
  readonly existingProfile?: WorkerProfile;
  readonly onSave: (profile: WorkerProfile) => void;
  readonly onCancel: () => void;
}

const STEP_TYPE_OPTIONS: Array<{ label: string; value: StepType }> = [
  { label: 'Pi Agent - executa agente IA no worktree', value: 'pi_agent' },
  { label: 'LangChain Prompt - gera/refina texto via LLM', value: 'langchain_prompt' },
  { label: 'Condition - avalia expressao e bifurca', value: 'condition' },
  { label: 'Goto - pula para outro step', value: 'goto' },
  { label: 'Set Variable - define variavel', value: 'set_variable' },
  { label: 'Git Diff - captura diff atual', value: 'git_diff' },
  { label: 'Fail - encerra com erro explicito', value: 'fail' },
];

const SCOPE_OPTIONS: Array<{ label: string; value: ProfileScope }> = [
  { label: 'Projeto (local)', value: 'project' },
  { label: 'Global (usuario)', value: 'global' },
];

/**
 * Builder visual de perfis. Guia o usuario por fases: metadata -> steps -> review.
 *
 * @param props.existingProfile - Perfil para editar (undefined = novo)
 * @param props.onSave - Callback com perfil completo
 * @param props.onCancel - Callback de cancelamento (ESC)
 */
export const ProfileBuilderScreen = ({
  existingProfile,
  onSave,
  onCancel,
}: ProfileBuilderScreenProps) => {
  const [phase, setPhase] = useState<BuilderPhase>(existingProfile ? 'review' : 'meta');
  const [meta, setMeta] = useState({
    id: existingProfile?.id ?? '',
    name: existingProfile?.name ?? '',
    description: existingProfile?.description ?? '',
    scope: existingProfile?.scope ?? 'project' as ProfileScope,
    maxStepExecutions: existingProfile?.maxStepExecutions ?? 20,
  });
  const [metaField, setMetaField] = useState<MetaField>('id');
  const [steps, setSteps] = useState<WorkerStep[]>(
    existingProfile ? [...existingProfile.steps] : [],
  );
  const [newStepType, setNewStepType] = useState<StepType | null>(null);
  const [newStepFields, setNewStepFields] = useState<Record<string, string>>({});
  const [newStepFieldIndex, setNewStepFieldIndex] = useState(0);

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  // --- Meta phase ---
  if (phase === 'meta') {
    return (
      <MetaEditor
        meta={meta}
        field={metaField}
        onFieldChange={(field, value) => setMeta((prev) => ({ ...prev, [field]: value }))}
        onNextField={(nextField) => {
          if (nextField === null) {
            setPhase('steps');
          } else {
            setMetaField(nextField);
          }
        }}
      />
    );
  }

  // --- Steps phase ---
  if (phase === 'steps') {
    return (
      <StepListEditor
        steps={steps}
        onAddStep={() => {
          setNewStepType(null);
          setNewStepFields({});
          setNewStepFieldIndex(0);
          setPhase('add-step');
        }}
        onRemoveStep={(index) => setSteps((prev) => prev.filter((_, i) => i !== index))}
        onDone={() => setPhase('review')}
      />
    );
  }

  // --- Add step phase ---
  if (phase === 'add-step') {
    if (!newStepType) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="cyan">Tipo do step:</Text>
          <SelectInput
            items={STEP_TYPE_OPTIONS}
            onSelect={(item) => {
              setNewStepType(item.value as StepType);
              setNewStepFields({ id: '' });
              setNewStepFieldIndex(0);
            }}
          />
        </Box>
      );
    }

    const fields = getFieldsForStepType(newStepType);
    const currentField = fields[newStepFieldIndex];

    if (!currentField) {
      const step = buildStep(newStepType, newStepFields);
      if (step) setSteps((prev) => [...prev, step]);
      setPhase('steps');
      return null;
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Novo step ({newStepType}) - {currentField.label}:</Text>
        <Text dimColor>{currentField.hint}</Text>
        <Box marginTop={1}>
          <Text color="cyan">{'> '}</Text>
          <TextInput
            value={newStepFields[currentField.key] ?? ''}
            onChange={(val) => setNewStepFields((prev) => ({ ...prev, [currentField.key]: val }))}
            onSubmit={() => setNewStepFieldIndex((i) => i + 1)}
            placeholder={currentField.placeholder}
          />
        </Box>
      </Box>
    );
  }

  // --- Review phase ---
  const entryStepId = steps[0]?.id ?? '';
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="green">Revisar Perfil</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text><Text dimColor>ID:    </Text><Text bold>{meta.id}</Text></Text>
          <Text><Text dimColor>Nome:  </Text>{meta.name}</Text>
          <Text><Text dimColor>Scope: </Text>{meta.scope}</Text>
          <Text><Text dimColor>Entry: </Text>{entryStepId || '(nenhum)'}</Text>
          <Text><Text dimColor>Limit: </Text>{meta.maxStepExecutions}</Text>
          <Text><Text dimColor>Steps: </Text>{steps.length}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {steps.map((s, i) => (
            <Text key={s.id}>
              <Text dimColor>{`  ${i + 1}. `}</Text>
              <Text>{s.id}</Text>
              <Text dimColor>{` (${s.type})`}</Text>
            </Text>
          ))}
        </Box>
      </Box>
      <Box marginTop={1}>
        <SelectInput
          items={[
            { label: 'Salvar', value: 'save' },
            { label: 'Editar steps', value: 'steps' },
            { label: 'Editar metadados', value: 'meta' },
            { label: 'Cancelar', value: 'cancel' },
          ]}
          onSelect={(item) => {
            if (item.value === 'save') {
              const profile: WorkerProfile = {
                ...meta,
                entryStepId,
                steps,
              };
              onSave(profile);
            } else if (item.value === 'steps') {
              setPhase('steps');
            } else if (item.value === 'meta') {
              setMetaField('id');
              setPhase('meta');
            } else {
              onCancel();
            }
          }}
        />
      </Box>
    </Box>
  );
};

// --- Sub-components ---

const META_FIELDS: Array<{ key: MetaField; label: string; next: MetaField | null; isSelect?: boolean }> = [
  { key: 'id', label: 'ID do perfil (kebab-case)', next: 'name' },
  { key: 'name', label: 'Nome do perfil', next: 'description' },
  { key: 'description', label: 'Descricao (opcional)', next: 'scope' },
  { key: 'scope', label: 'Escopo', next: 'maxStepExecutions', isSelect: true },
  { key: 'maxStepExecutions', label: 'Limite de execucoes (padrao: 20)', next: null },
];

function MetaEditor({
  meta, field, onFieldChange, onNextField,
}: {
  readonly meta: Record<string, string | number>;
  readonly field: MetaField;
  readonly onFieldChange: (field: MetaField, value: string | number) => void;
  readonly onNextField: (next: MetaField | null) => void;
}) {
  const fieldDef = META_FIELDS.find((f) => f.key === field);
  if (!fieldDef) return null;

  if (fieldDef.isSelect && field === 'scope') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">{fieldDef.label}:</Text>
        <SelectInput
          items={SCOPE_OPTIONS}
          onSelect={(item) => {
            onFieldChange('scope', item.value as string);
            onNextField(fieldDef.next);
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">{fieldDef.label}:</Text>
      <Box marginTop={1}>
        <Text color="cyan">{'> '}</Text>
        <TextInput
          value={String(meta[field] ?? '')}
          onChange={(val) => onFieldChange(field, val)}
          onSubmit={(val) => {
            if (field === 'maxStepExecutions') {
              const parsed = parseInt(val, 10);
              onFieldChange(field, isNaN(parsed) ? 20 : Math.min(100, Math.max(1, parsed)));
            }
            onNextField(fieldDef.next);
          }}
        />
      </Box>
    </Box>
  );
}

function StepListEditor({
  steps, onAddStep, onRemoveStep, onDone,
}: {
  readonly steps: readonly WorkerStep[];
  readonly onAddStep: () => void;
  readonly onRemoveStep: (index: number) => void;
  readonly onDone: () => void;
}) {
  const items = [
    { label: '+ Adicionar step', value: 'add' },
    ...steps.map((s, i) => ({ label: `  ${s.id} (${s.type})`, value: `remove-${i}` })),
    { label: 'Concluir steps', value: 'done' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Steps do perfil ({steps.length}):</Text>
      <Text dimColor>Selecione um step para remover, ou adicione novo.</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === 'add') onAddStep();
            else if (item.value === 'done') onDone();
            else if (item.value.startsWith('remove-')) {
              onRemoveStep(parseInt(item.value.slice(7), 10));
            }
          }}
        />
      </Box>
    </Box>
  );
}

// --- Step field definitions ---

interface StepFieldDef {
  key: string;
  label: string;
  hint: string;
  placeholder: string;
}

function getFieldsForStepType(type: StepType): StepFieldDef[] {
  const id: StepFieldDef = { key: 'id', label: 'ID do step', hint: 'Identificador unico', placeholder: 'my-step' };
  switch (type) {
    case 'pi_agent':
      return [id,
        { key: 'taskTemplate', label: 'Task template', hint: 'Use $task, $diff, $custom_* para variaveis', placeholder: 'Use $task para...' },
        { key: 'next', label: 'Proximo step ID', hint: 'ID do step seguinte ou __end__', placeholder: 'next-step' },
      ];
    case 'langchain_prompt':
      return [id,
        { key: 'inputTemplate', label: 'Input template', hint: 'Template com $variaveis para o LLM', placeholder: 'A task original foi: $task...' },
        { key: 'outputTarget', label: 'Variavel de saida', hint: 'Onde armazenar o resultado (task, custom_*)', placeholder: 'task' },
        { key: 'next', label: 'Proximo step ID', hint: '', placeholder: 'next-step' },
      ];
    case 'condition':
      return [id,
        { key: 'expression', label: 'Expressao', hint: 'Ex: $custom_pass == true', placeholder: '$custom_var == value' },
        { key: 'whenTrue', label: 'Step se verdadeiro', hint: '', placeholder: 'step-true' },
        { key: 'whenFalse', label: 'Step se falso', hint: '', placeholder: 'step-false' },
      ];
    case 'goto':
      return [id,
        { key: 'target', label: 'Step destino', hint: 'Use __end__ para encerrar com sucesso', placeholder: '__end__' },
      ];
    case 'set_variable':
      return [id,
        { key: 'target', label: 'Variavel alvo', hint: 'Ex: custom_tries', placeholder: 'custom_tries' },
        { key: 'value', label: 'Valor (literal)', hint: 'Numero, string ou booleano', placeholder: '0' },
        { key: 'next', label: 'Proximo step ID', hint: '', placeholder: 'next-step' },
      ];
    case 'git_diff':
      return [id,
        { key: 'target', label: 'Variavel alvo', hint: 'Normalmente "diff"', placeholder: 'diff' },
        { key: 'next', label: 'Proximo step ID', hint: '', placeholder: 'next-step' },
      ];
    case 'fail':
      return [id,
        { key: 'messageTemplate', label: 'Mensagem de erro', hint: 'Use $variaveis', placeholder: 'Erro: $error' },
      ];
  }
}

/** Constrói WorkerStep a partir dos campos coletados. Retorna null se ID ausente. */
function buildStep(type: StepType, fields: Record<string, string>): WorkerStep | null {
  const id = fields['id'];
  if (!id) return null;

  switch (type) {
    case 'pi_agent':
      return { id, type, taskTemplate: fields['taskTemplate'] ?? '', next: fields['next'] ?? '' };
    case 'langchain_prompt':
      return { id, type, inputTemplate: fields['inputTemplate'] ?? '', outputTarget: fields['outputTarget'] ?? 'task', next: fields['next'] ?? '' };
    case 'condition':
      return { id, type, expression: fields['expression'] ?? '', whenTrue: fields['whenTrue'] ?? '', whenFalse: fields['whenFalse'] ?? '' };
    case 'goto':
      return { id, type, target: fields['target'] ?? '__end__' };
    case 'set_variable': {
      const raw = fields['value'] ?? '';
      const numVal = Number(raw);
      const value = raw === 'true' ? true : raw === 'false' ? false : !isNaN(numVal) && raw !== '' ? numVal : raw;
      return { id, type, target: fields['target'] ?? '', value, next: fields['next'] ?? '' };
    }
    case 'git_diff':
      return { id, type, target: fields['target'] ?? 'diff', next: fields['next'] ?? '' };
    case 'fail':
      return { id, type, messageTemplate: fields['messageTemplate'] ?? '' };
  }
}
