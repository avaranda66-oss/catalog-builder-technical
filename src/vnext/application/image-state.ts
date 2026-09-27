import { DEFAULT_IMAGE_FOCAL_POINT, type ImageObject } from '../domain/editorial-model';
import type { ImageExpectedState } from './contracts';

export function projectImageExpectedState(image: ImageObject): ImageExpectedState {
  const focalPoint = image.focalPoint ?? DEFAULT_IMAGE_FOCAL_POINT;
  return {
    assetId: image.assetId,
    fit: image.fit,
    focalPoint: { x: focalPoint.x, y: focalPoint.y },
  };
}

export function imageExpectedStateEquals(
  image: ImageObject,
  expected: ImageExpectedState
): boolean {
  const current = projectImageExpectedState(image);
  return current.assetId === expected.assetId
    && current.fit === expected.fit
    && current.focalPoint.x === expected.focalPoint.x
    && current.focalPoint.y === expected.focalPoint.y;
}
