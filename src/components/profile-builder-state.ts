import { useMemo, useState } from 'react';
import { MODEL_CATALOG } from '../data/models.js';
import { END_STEP_ID, type ProfileScope, type WorkerProfile, type WorkerStep } from '../schemas/worker-profile.schema.js';
import {
  buildProfile,
  deriveEntryStepId,
  nextStepId,
  relinkStepsAfterDelete,
  validateBuilder,
  type BuilderMeta,
  type HeaderFieldKey,
} from './builder-helpers.js';
import {
  compareStepIds,
  createCustomVariable,
  insertAfter,
  parseVariableValue,
  primaryTarget,
} from './profile-builder-utils.js';

export type ItemKind = 'header' | 'variable' | 'step' | 'action';

export interface ItemRef {
  readonly kind: ItemKind;
  readonly key: string;
}

export type EditingContext =
  | { readonly mode: 'none' }
  | {
      readonly mode: 'field-input';
      readonly field: HeaderFieldKey | 'variable-value';
      readonly initialValue: string;
    }
  | {
      readonly mode: 'field-select';
      readonly field: 'scope' | 'workerModel' | 'langchainModel';
      readonly options: readonly { readonly label: string; readonly value: string }[];
      readonly initialValue: string;
    }
  | {
      readonly mode: 'step-editor';
      readonly action: 'create' | 'edit';
      readonly stepId: string;
      readonly existingStep?: WorkerStep;
      readonly nextTarget: string;
      readonly forcedBranch?: 'whenTrue' | 'whenFalse';
    }
  | {
      readonly mode: 'variable-add';
      readonly name: string;
      readonly value: string;
      readonly focus: 'name' | 'value';
      readonly error: string | null;
    };

export const HEADER_KEYS: readonly HeaderFieldKey[] = [
  'id',
  'scope',
  'entryStepId',
  'maxStepExecutions',
  'seats',
  'workerModel',
  'langchainModel',
  'description',
];

interface UseProfileBuilderStateParams {
  readonly existingProfile?: WorkerProfile;
  readonly onSave: (profile: WorkerProfile) => void;
  readonly onCancel: () => void;
}

/**
 * Estado e acoes do builder de perfis.
 *
 * @param params - Dependencias externas da tela
 * @returns Estado computado e acoes de mutacao
 *
 * @example
 * const state = useProfileBuilderState({ existingProfile, onSave, onCancel });
 */
export function useProfileBuilderState({
  existingProfile,
  onSave,
  onCancel,
}: UseProfileBuilderStateParams) {
  const [meta, setMeta] = useState<BuilderMeta>({
    id: existingProfile?.id ?? '',
    description: existingProfile?.description ?? '',
    scope: existingProfile?.scope ?? 'project',
    maxStepExecutions: existingProfile?.maxStepExecutions ?? 20,
    seats: existingProfile?.seats ?? 1,
    workerModel: existingProfile?.workerModel ?? '',
    langchainModel: existingProfile?.langchainModel ?? '',
  });
  const [steps, setSteps] = useState<readonly WorkerStep[]>(
    existingProfile ? [...existingProfile.steps] : [],
  );
  const [initialVariables, setInitialVariables] = useState<Readonly<Record<string, string | number>>>(
    existingProfile?.initialVariables ?? {},
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState<EditingContext>({ mode: 'none' });
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  const entryStepId = deriveEntryStepId(steps);
  const sortedVariables = useMemo(
    () => Object.entries(initialVariables).sort(([left], [right]) => left.localeCompare(right)),
    [initialVariables],
  );
  const orderedSteps = useMemo(
    () => [...steps].sort((left, right) => compareStepIds(left.id, right.id)),
    [steps],
  );

  const items = useMemo(() => {
    const list: ItemRef[] = [];
    for (const key of HEADER_KEYS) {
      list.push({ kind: 'header', key });
    }
    for (const [name] of sortedVariables) {
      list.push({ kind: 'variable', key: name });
    }
    for (const step of orderedSteps) {
      list.push({ kind: 'step', key: step.id });
    }
    list.push({ kind: 'action', key: 'add-step' });
    list.push({ kind: 'action', key: 'add-variable' });
    list.push({ kind: 'action', key: 'save' });
    list.push({ kind: 'action', key: 'cancel' });
    return list;
  }, [sortedVariables, orderedSteps]);

  const selectedItem = items[selectedIndex] ?? null;

  const handleEnter = () => {
    if (!selectedItem) {
      return;
    }
    if (selectedItem.kind === 'header') {
      editHeaderField(selectedItem.key as HeaderFieldKey);
      return;
    }
    if (selectedItem.kind === 'variable') {
      const current = initialVariables[selectedItem.key];
      setEditing({
        mode: 'field-input',
        field: 'variable-value',
        initialValue: current === undefined ? '' : String(current),
      });
      return;
    }
    if (selectedItem.kind === 'step') {
      const step = steps.find((item) => item.id === selectedItem.key);
      if (!step) {
        return;
      }
      setEditing({
        mode: 'step-editor',
        action: 'edit',
        stepId: step.id,
        existingStep: step,
        nextTarget: primaryTarget(step),
      });
      return;
    }
    if (selectedItem.kind === 'action') {
      if (selectedItem.key === 'add-step') {
        openCreateStep();
      } else if (selectedItem.key === 'add-variable') {
        setEditing({ mode: 'variable-add', name: '', value: '', focus: 'name', error: null });
      } else if (selectedItem.key === 'save') {
        saveProfile();
      } else if (selectedItem.key === 'cancel') {
        onCancel();
      }
    }
  };

  const openCreateStep = () => {
    const id = nextStepId(steps);
    const selectedStep = selectedItem?.kind === 'step'
      ? steps.find((step) => step.id === selectedItem.key)
      : undefined;
    const nextTarget = selectedStep ? primaryTarget(selectedStep) : END_STEP_ID;
    setEditing({
      mode: 'step-editor',
      action: 'create',
      stepId: id,
      nextTarget,
    });
  };

  const openBranchOnCondition = () => {
    if (selectedItem?.kind !== 'step') {
      return;
    }
    const selectedStep = steps.find((step) => step.id === selectedItem.key);
    if (!selectedStep || selectedStep.type !== 'condition') {
      return;
    }
    const branch = selectedStep.whenFalse === END_STEP_ID ? 'whenFalse' : 'whenTrue';
    setEditing({
      mode: 'step-editor',
      action: 'create',
      stepId: nextStepId(steps),
      nextTarget: END_STEP_ID,
      forcedBranch: branch,
      existingStep: selectedStep,
    });
  };

  const handleDelete = () => {
    if (!selectedItem) {
      return;
    }
    if (selectedItem.kind === 'variable') {
      const rest = Object.fromEntries(
        Object.entries(initialVariables).filter(([name]) => name !== selectedItem.key),
      );
      setInitialVariables(rest);
      return;
    }
    if (selectedItem.kind === 'step') {
      setSteps((prev) => relinkStepsAfterDelete(prev, selectedItem.key));
    }
  };

  const applyTextField = (
    field: HeaderFieldKey | 'variable-value',
    raw: string,
  ) => {
    if (!selectedItem) {
      return;
    }
    if (field === 'variable-value' && selectedItem.kind === 'variable') {
      const parsed = parseVariableValue(raw);
      setInitialVariables((prev) => ({ ...prev, [selectedItem.key]: parsed }));
      return;
    }
    if (field === 'id' || field === 'description') {
      setMeta((prev) => ({ ...prev, [field]: raw }));
      return;
    }
    if (field === 'maxStepExecutions' || field === 'seats') {
      const numeric = Number.parseInt(raw, 10);
      if (Number.isFinite(numeric)) {
        setMeta((prev) => ({ ...prev, [field]: numeric }));
      }
    }
  };

  const applySelectField = (
    field: 'scope' | 'workerModel' | 'langchainModel',
    value: string,
  ) => {
    if (field === 'scope') {
      setMeta((prev) => ({ ...prev, scope: value as ProfileScope }));
      return;
    }
    if (field === 'workerModel') {
      setMeta((prev) => ({ ...prev, workerModel: value }));
      return;
    }
    if (field === 'langchainModel') {
      setMeta((prev) => ({ ...prev, langchainModel: value }));
    }
  };

  const applyStepEdit = (
    context: Extract<EditingContext, { mode: 'step-editor' }>,
    step: WorkerStep,
  ) => {
    if (context.action === 'edit') {
      setSteps((prev) => prev.map((item) => (item.id === step.id ? step : item)));
      return;
    }

    if (context.forcedBranch && context.existingStep?.type === 'condition') {
      const branchStepId = step.id;
      setSteps((prev) => {
        const withNew = [...prev, step];
        return withNew.map((item) => {
          if (item.id !== context.existingStep?.id || item.type !== 'condition') {
            return item;
          }
          return context.forcedBranch === 'whenTrue'
            ? { ...item, whenTrue: branchStepId }
            : { ...item, whenFalse: branchStepId };
        });
      });
      return;
    }

    if (selectedItem?.kind === 'step') {
      setSteps((prev) => insertAfter(prev, selectedItem.key, step));
      return;
    }

    setSteps((prev) => [...prev, step]);
  };

  const saveProfile = () => {
    const result = validateBuilder({
      meta,
      steps,
      initialVariables,
    });
    if (!result.valid) {
      setValidationErrors(result.errors);
      setFieldErrors(result.fieldErrors);
      return;
    }
    const profile = buildProfile({
      meta,
      steps,
      initialVariables,
    });
    if (!profile) {
      setValidationErrors(['Falha interna ao montar perfil']);
      return;
    }
    setValidationErrors([]);
    setFieldErrors({});
    onSave(profile);
  };

  const startAddVariable = () => {
    setEditing({ mode: 'variable-add', name: '', value: '', focus: 'name', error: null });
  };

  const confirmAddVariable = (rawName: string, rawValue: string): string | null => {
    const result = createCustomVariable(rawName, rawValue);
    if (!result.ok) {
      return result.error;
    }
    if (initialVariables[result.name] !== undefined) {
      return `Variavel "${result.name}" ja existe`;
    }
    setInitialVariables((prev) => ({ ...prev, [result.name]: result.value }));
    return null;
  };

  const editHeaderField = (keyName: HeaderFieldKey) => {
    if (keyName === 'entryStepId') {
      return;
    }
    if (keyName === 'scope') {
      setEditing({
        mode: 'field-select',
        field: 'scope',
        initialValue: meta.scope,
        options: [
          { label: 'project (local)', value: 'project' },
          { label: 'global (usuario)', value: 'global' },
        ],
      });
      return;
    }
    if (keyName === 'workerModel') {
      setEditing({
        mode: 'field-select',
        field: 'workerModel',
        initialValue: meta.workerModel,
        options: [
          { label: '(inherit from current worker config)', value: '' },
          ...MODEL_CATALOG.map((model) => ({
            label: `${model.name} (${model.id})`,
            value: model.id,
          })),
        ],
      });
      return;
    }
    if (keyName === 'langchainModel') {
      setEditing({
        mode: 'field-select',
        field: 'langchainModel',
        initialValue: meta.langchainModel,
        options: [
          { label: '(inherit from current worker config)', value: '' },
          ...MODEL_CATALOG.map((model) => ({
            label: `${model.name} (${model.id})`,
            value: model.id,
          })),
        ],
      });
      return;
    }
    const initial = String(meta[keyName]);
    setEditing({ mode: 'field-input', field: keyName, initialValue: initial });
  };

  return {
    meta,
    steps,
    initialVariables,
    selectedIndex,
    editing,
    validationErrors,
    fieldErrors,
    entryStepId,
    sortedVariables,
    orderedSteps,
    items,
    selectedItem,
    setSelectedIndex,
    setEditing,
    handleEnter,
    openCreateStep,
    openBranchOnCondition,
    handleDelete,
    applyTextField,
    applySelectField,
    applyStepEdit,
    saveProfile,
    startAddVariable,
    confirmAddVariable,
  };
}
