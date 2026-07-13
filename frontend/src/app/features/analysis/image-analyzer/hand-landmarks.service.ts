import { Injectable } from '@angular/core';

import { DetectedHand, Point } from './image-analyzer.model';

type HandLandmarker = import('@mediapipe/tasks-vision').HandLandmarker;

/**
 * Thin wrapper around MediaPipe's HandLandmarker (the same model used by
 * `scripts/core.py`, via `@mediapipe/tasks-vision` on the web). The wasm
 * runtime and the model are self-hosted under `public/mediapipe/` so the
 * feature works offline; both load lazily on first use (~19 MB total).
 */
@Injectable({ providedIn: 'root' })
export class HandLandmarksService {
  private landmarker: HandLandmarker | null = null;
  private loading: Promise<HandLandmarker> | null = null;

  /** Detects up to two hands; landmark coords are returned in RGB pixels. */
  async detect(image: HTMLImageElement): Promise<DetectedHand[]> {
    const landmarker = await this.ensureLandmarker();
    const result = landmarker.detect(image);
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    return result.landmarks.map((landmarks, i) => ({
      // MediaPipe labels the person's actual hand ('Left'/'Right'), the same
      // convention core.py relies on.
      side: result.handednesses[i]?.[0]?.categoryName === 'Left' ? 'Esquerda' : 'Direita',
      landmarks: landmarks.map((p): Point => ({ x: p.x * width, y: p.y * height })),
    }));
  }

  private ensureLandmarker(): Promise<HandLandmarker> {
    if (this.landmarker) {
      return Promise.resolve(this.landmarker);
    }
    this.loading ??= (async () => {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task' },
        runningMode: 'IMAGE',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
      });
      return this.landmarker;
    })();
    return this.loading;
  }
}
