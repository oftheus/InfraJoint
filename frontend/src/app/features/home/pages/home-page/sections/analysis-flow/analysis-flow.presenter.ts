import {
  PatientGroup,
  ProtocolStep,
  StepPhase,
} from './analysis-flow.model';

export type StepFilter = StepPhase | 'all';
export type StepTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'purple';
export type StepBadgeVariant = 'default' | 'warning' | 'info' | 'success' | 'purple';
export type StepIcon =
  | 'camera'
  | 'flame'
  | 'settings'
  | 'stethoscope'
  | 'thermometer'
  | 'user-round'
  | 'wind';

export interface StepBadgeViewModel {
  readonly text: string;
  readonly variant: StepBadgeVariant;
}

export interface CapturePhaseViewModel {
  readonly icon: StepIcon;
  readonly title: string;
  readonly description: string;
}

export interface PatientGroupViewModel extends PatientGroup {
  readonly variant: 'danger' | 'warning' | 'success' | 'purple';
}

export interface ProtocolStepViewModel extends Omit<ProtocolStep, 'keyPoints' | 'groups' | 'capturePhases'> {
  readonly tone: StepTone;
  readonly icon: StepIcon;
  readonly badges: readonly StepBadgeViewModel[];
  readonly image?: {
    readonly src: string;
    readonly alt: string;
  };
  readonly groups?: readonly PatientGroupViewModel[];
  readonly capturePhases?: readonly CapturePhaseViewModel[];
}

interface StepPresentationConfig {
  readonly tone: StepTone;
  readonly icon: StepIcon;
  readonly badgeVariants?: readonly StepBadgeVariant[];
  readonly image?: ProtocolStepViewModel['image'];
  readonly groupVariants?: Partial<Record<PatientGroup['letter'], PatientGroupViewModel['variant']>>;
  readonly capturePhaseIcons?: readonly StepIcon[];
}

const STEP_PRESENTATION: Record<number, StepPresentationConfig> = {
  1: {
    tone: 'info',
    icon: 'thermometer',
    badgeVariants: ['default', 'warning', 'default'],
    image: {
      src: 'assets/images/lab.jpg',
      alt: 'Ambiente de laboratório para preparação do exame',
    },
  },
  2: {
    tone: 'success',
    icon: 'user-round',
    badgeVariants: ['warning', 'warning', 'warning'],
    groupVariants: {
      A: 'danger',
      B: 'warning',
      C: 'success',
    },
  },
  3: {
    tone: 'purple',
    icon: 'settings',
    badgeVariants: ['info', 'info', 'info'],
  },
  4: {
    tone: 'warning',
    icon: 'camera',
    badgeVariants: ['success', 'default', 'default'],
  },
  5: {
    tone: 'danger',
    icon: 'wind',
    badgeVariants: ['warning', 'default', 'info'],
    image: {
      src: 'assets/images/hands.png',
      alt: 'Captura termográfica das mãos durante o protocolo',
    },
    capturePhaseIcons: ['wind', 'flame'],
  },
  6: {
    tone: 'neutral',
    icon: 'stethoscope',
    badgeVariants: ['info', 'info', 'default'],
  },
};

export function toProtocolStepViewModels(steps: readonly ProtocolStep[]): readonly ProtocolStepViewModel[] {
  return steps.map((step) => {
    const presentation = STEP_PRESENTATION[step.id] ?? {
      tone: 'neutral',
      icon: 'settings',
    };

    return {
      ...step,
      tone: presentation.tone,
      icon: presentation.icon,
      badges: step.keyPoints.map((text, index) => ({
        text,
        variant: presentation.badgeVariants?.[index] ?? 'default',
      })),
      image: presentation.image,
      groups: step.groups?.map((group) => ({
        ...group,
        variant: presentation.groupVariants?.[group.letter] ?? 'purple',
      })),
      capturePhases: step.capturePhases?.map((phase, index) => ({
        ...phase,
        icon: presentation.capturePhaseIcons?.[index] ?? 'settings',
      })),
    };
  });
}
