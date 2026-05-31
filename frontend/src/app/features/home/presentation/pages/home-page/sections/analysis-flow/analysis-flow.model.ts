export type StepPhase = 'prep' | 'cap' | 'cli';
export type StepColor = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'purple';

export interface StepDetail {
  label: string;
  value: string;
}

export interface StepTag {
  text: string;
  variant: 'default' | 'warning' | 'info' | 'success' | 'purple';
}

export interface CapturePhase {
  icon: string;
  title: string;
  description: string;
}

export interface PatientGroup {
  letter: 'A' | 'B' | 'C';
  description: string;
  variant: 'danger' | 'warning' | 'success' | 'purple';
}

export interface CameraParam {
  key: string;
  value: string;
}

export interface ProgressBar {
  label: string;
  phases: { label: string; value: number }[];
}

export interface ProtocolStep {
  id: number;
  phase: StepPhase;
  color: StepColor;
  icon: string;
  title: string;
  subtitle: string;
  details: StepDetail[];
  tags: StepTag[];
  note: string;
  image?: {
    src: string;
    alt: string;
  };
  groups?: PatientGroup[];
  cameraParams?: CameraParam[];
  capturePhases?: CapturePhase[];
  progress?: ProgressBar;
}
