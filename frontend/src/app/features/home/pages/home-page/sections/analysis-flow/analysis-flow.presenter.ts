import { ProtocolStep, StepPhase } from './analysis-flow.model';

export type StepFilter = StepPhase | 'all';
export type StepTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'purple';
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
}

export interface CapturePhaseViewModel {
  readonly icon: StepIcon;
  readonly title: string;
  readonly description: string;
}

export interface ProtocolStepViewModel extends Omit<ProtocolStep, 'keyPoints' | 'capturePhases'> {
  readonly tone: StepTone;
  readonly icon: StepIcon;
  readonly badges: readonly StepBadgeViewModel[];
  readonly image?: {
    readonly src: string;
    readonly alt: string;
  };
  readonly capturePhases?: readonly CapturePhaseViewModel[];
}

interface StepPresentationConfig {
  readonly tone: StepTone;
  readonly icon: StepIcon;
  readonly image?: ProtocolStepViewModel['image'];
  readonly capturePhaseIcons?: readonly StepIcon[];
}

const STEP_PRESENTATION: Record<number, StepPresentationConfig> = {
  1: {
    tone: 'info',
    icon: 'thermometer',
    image: {
      src: 'assets/images/lab.jpg',
      alt: 'Ambiente de laboratório para preparação do exame',
    },
  },
  2: {
    tone: 'success',
    icon: 'user-round',
  },
  3: {
    tone: 'purple',
    icon: 'settings',
  },
  4: {
    tone: 'warning',
    icon: 'camera',
  },
  5: {
    tone: 'danger',
    icon: 'wind',
    image: {
      src: 'assets/images/hands.png',
      alt: 'Captura termográfica das mãos durante o protocolo',
    },
    capturePhaseIcons: ['wind', 'flame'],
  },
  6: {
    tone: 'neutral',
    icon: 'stethoscope',
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
      badges: step.keyPoints.map((text) => ({ text })),
      image: presentation.image,
      capturePhases: step.capturePhases?.map((phase, index) => ({
        ...phase,
        icon: presentation.capturePhaseIcons?.[index] ?? 'settings',
      })),
    };
  });
}
