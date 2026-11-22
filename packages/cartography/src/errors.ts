/**
 * The error of this package. Each refusal has a code, so a caller can test the reason without the text of the message.
 *
 * @packageDocumentation
 */

/**
 * The reason of a refusal.
 *
 * - `frame`: the scale or the size of a frame is not a finite number more than 0.
 * - `id`: an identifier is not lower case letters, digits and hyphens, or two layers have the same identifier.
 * - `filter`: a filter is not one of the forms of `Filter`.
 * - `style`: a style draws nothing, or a size, a gray level or a dash is not correct.
 * - `source`: a layer has no source, or its source has no title or no license.
 * - `label`: a label rule, a label font or an edge text is not correct.
 * - `atlas`: the radius or the overlap of an atlas is not correct.
 */
export type MapErrorCode = "frame" | "id" | "filter" | "style" | "source" | "label" | "atlas";

/** The error that each function of this package throws for an incorrect map. */
export class MapError extends Error {
  /** The reason of the refusal. */
  readonly code: MapErrorCode;

  /**
   * @param code - The reason of the refusal.
   * @param message - The text for a person.
   */
  constructor(code: MapErrorCode, message: string) {
    super(message);
    this.name = "MapError";
    this.code = code;
  }
}
