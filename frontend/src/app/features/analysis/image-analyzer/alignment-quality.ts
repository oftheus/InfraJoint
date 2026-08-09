/**
 * Alignment **evaluation** — deliberately separate from the alignment *fit*.
 *
 * The registration search optimizes on decimated grids and a subsampled point
 * set, which is the right trade-off for finding a transform but the wrong basis
 * for reporting one: the old score divided an intersection by
 * `sampledPoints + fullThermalMask`, mixing two different populations, and read
 * 36–37% on every capture regardless of quality (its ceiling for V051 was
 * 0.371, so 37% actually meant a near-perfect fit).
 *
 * What is reported instead is a plain area-vs-area Dice of the two silhouettes
 * under the *final* transform, computed on the matrix at full resolution, then
 * divided by the highest Dice those two masks could possibly reach. That
 * ceiling exists because the modalities never segment the same region: thermal
 * bleed dilates the warm outline, while Otsu drops cold extremities (fingers
 * right after the cold stress) that the photo still reads as skin. Either
 * effect can dominate — measured on the seven reference captures, the warm mask
 * is the smaller one in four of them — so no containment can be assumed in
 * either direction. What always holds is `max(I) = min(A, B)`, which is the
 * ceiling used here. Normalizing removes that per-capture offset and gives the
 * number an absolute meaning: *how much of the attainable agreement was
 * attained*.
 *
 * Note the algebra: `normalized = dice / ceiling = I / min(A, B)`, so the
 * `(A + B)` denominator cancels and whichever mask is *larger* drops out
 * entirely. Excess area with no counterpart on the other side — warm background,
 * or a forearm the thermal sensor sees beyond the photo's frame — therefore
 * cannot depress the score, which is why no field-of-view restriction is
 * needed. Optical pixels landing outside the matrix are a separate matter: they
 * are dropped when the mask is built, so they never join A or I either. One
 * consequence worth carrying into any pooled analysis: the indicator reads as
 * "share of the optical silhouette on warm cells" when A ≤ B and as "share of
 * the warm mask covered" when B < A, so cohorts should be stratified by which
 * side bounded the ceiling (both areas are kept for exactly that).
 *
 * The matrix is the source, not the colorized IR JPEG: the two agree within
 * ~1 point (the JPEG is the same data resampled), but segmenting the JPEG would
 * couple this metric to the camera's palette.
 *
 * **Known blind spot, by design.** The smaller mask sits inside the larger one
 * with slack, so a translation shorter than that slack barely moves the
 * intersection: a 32 px shift costs 5–20 points, while a −10% scale error costs
 * 20–35. The ceiling measures the slack, so it also says how much the metric
 * can discriminate on a given capture — a low ceiling means more room to slide
 * means a more translation-blind score. This is a consistency check on
 * silhouette overlap, never a guarantee of geometric precision; on the fiducial
 * path the marker correction covers exactly this gap.
 *
 * **The caveat to keep attached to this number.** It scores *global* spatial
 * agreement between two silhouettes; on its own it is neither a per-landmark
 * localization error nor a validation of the temperatures the ROIs read. The
 * reason is structural: it is computed over *areas*, and an intersection keeps
 * no record of which point landed on which, so two regions can cover each other
 * almost entirely while being internally displaced.
 *
 * The reported figure reads as `I / min(A, B)` — the share of the *smaller*
 * silhouette that the other one covers — which is the same quantity as
 * `dice / ceiling` and the form worth explaining to anyone. The UI shows just
 * "Sobreposição das silhuetas: 95%" with a plain-language tooltip: the
 * normalization is a modelling detail, and it belongs in the method write-up
 * (`src/escrita/analisador/texto-inicial.MD`, §4.9), not in a sidebar.
 */

import { applyAffine } from './alignment';
import { isSkinRgb } from './color-tests';
import { AffineMatrix, RgbPixels, ThermalMatrix } from './image-analyzer.model';
import { binaryOpen, connectedComponents, otsuThreshold } from './image-ops';

/**
 * Bumped whenever anything feeding the numbers changes — the formula or the
 * masks — so captures collected under different definitions are never pooled by
 * accident once these values are exported.
 *
 * - 1: area Dice over the ceiling, matrix at full resolution, no FOV restriction.
 * - 2: the optical mask is denoised like the thermal one (it previously went in
 *   raw). Raises the indicator by up to ~1.2 points, but only on captures where
 *   the optical mask is the smaller of the two — elsewhere it cancels out of
 *   `I/min(A,B)`. Version 1 values are not comparable with these.
 */
export const AGREEMENT_METRIC_VERSION = 2;

/** Silhouette agreement of one alignment, with the parts kept for analysis. */
export interface SilhouetteAgreement {
  /** Area Dice of the two masks under the evaluated transform (0–1). */
  readonly dice: number;
  /** Highest Dice these two masks could reach: 2·min(A,B)/(A+B). */
  readonly ceiling: number;
  /** `dice / ceiling` — the reported indicator. */
  readonly normalized: number;
  /** A: optical skin cells landing inside the matrix. */
  readonly opticalArea: number;
  /** B: warm cells of the thermal silhouette. */
  readonly thermalArea: number;
  readonly intersection: number;
  readonly version: number;
}

/**
 * Scores `fitted` (the final RGB px → CSV cell transform, after fiducials and
 * polish) by silhouette agreement. Null when either silhouette is degenerate,
 * which is a failure to evaluate, not a bad alignment.
 */
export function measureSilhouetteAgreement(
  pixels: RgbPixels,
  matrix: ThermalMatrix,
  fitted: AffineMatrix,
): SilhouetteAgreement | null {
  const thermal = thermalSilhouette(matrix);
  const optical = warpedSkinMask(pixels, matrix, fitted);
  if (!thermal || !optical) {
    return null;
  }

  let thermalArea = 0;
  let opticalArea = 0;
  let intersection = 0;
  for (let i = 0; i < thermal.length; i++) {
    thermalArea += thermal[i];
    opticalArea += optical[i];
    intersection += thermal[i] & optical[i];
  }
  if (thermalArea === 0 || opticalArea === 0) {
    return null;
  }

  const total = opticalArea + thermalArea;
  const dice = (2 * intersection) / total;
  const ceiling = (2 * Math.min(opticalArea, thermalArea)) / total;
  return {
    dice,
    ceiling,
    normalized: dice / ceiling,
    opticalArea,
    thermalArea,
    intersection,
    version: AGREEMENT_METRIC_VERSION,
  };
}

/**
 * Warm silhouette at full matrix resolution — same segmentation the coarse
 * registration uses (global Otsu, opened, two largest blobs = one arm+hand per
 * side), only undecimated.
 */
function thermalSilhouette(matrix: ThermalMatrix): Uint8Array | null {
  const { width, height, values } = matrix;
  const finite: number[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (Number.isFinite(v)) {
      finite.push(v);
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
    }
  }
  if (finite.length === 0 || max - min <= 0) {
    return null;
  }

  const threshold = otsuThreshold(finite, min, max);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i]) && values[i] > threshold) {
      mask[i] = 1;
    }
  }
  return denoise(mask, width, height);
}

/**
 * Drops specks and keeps the two largest blobs (one arm+hand per side) — the
 * same cleanup `segmentRgbSkin` applies before the fit, applied identically to
 * both masks here.
 *
 * Symmetry is the point. The areas enter the score asymmetrically: whichever is
 * larger cancels out of `I/min(A,B)`, so clutter left on one side would depress
 * the indicator on the captures where that side happens to be the smaller mask
 * and be invisible on the rest.
 */
function denoise(raw: Uint8Array, width: number, height: number): Uint8Array {
  const opened = binaryOpen(raw, width, height, 1);
  const blobs = connectedComponents(opened, width, height)
    .sort((a, b) => b.area - a.area)
    .slice(0, 2);
  const kept = new Uint8Array(width * height);
  for (const blob of blobs) {
    for (const i of blob.pixels) {
      kept[i] = 1;
    }
  }
  return kept;
}

/**
 * The photo's skin mask carried into CSV space by `fitted`, at full photo
 * resolution, then cleaned like the thermal one. Skin outside the thermal frame
 * simply does not land — the cameras crop differently, and those pixels are
 * absent from both areas rather than counted against the score.
 *
 * Cleanup happens after the warp so both masks are denoised in the same space
 * at the same resolution; warping at scale ≈0.5 only merges neighbors, so it
 * cannot fragment a silhouette into pieces the blob filter would then drop.
 */
function warpedSkinMask(
  pixels: RgbPixels,
  matrix: ThermalMatrix,
  fitted: AffineMatrix,
): Uint8Array | null {
  const { data, width, height } = pixels;
  const mask = new Uint8Array(matrix.width * matrix.height);
  let landed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (!isSkinRgb(data[o], data[o + 1], data[o + 2])) {
        continue;
      }
      const p = applyAffine(fitted, x, y);
      const cx = p.x | 0;
      const cy = p.y | 0;
      if (cx < 0 || cx >= matrix.width || cy < 0 || cy >= matrix.height) {
        continue;
      }
      mask[cy * matrix.width + cx] = 1;
      landed++;
    }
  }
  return landed > 0 ? denoise(mask, matrix.width, matrix.height) : null;
}
