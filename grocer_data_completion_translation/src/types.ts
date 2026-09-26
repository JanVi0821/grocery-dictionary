import type { ObjectId, Collection } from 'mongodb';
import type { CompletedGrocerDetail, GrocerSource } from '../../fe/src/types/grocer-detail.ts';

/** Preserve the source/detail discriminated union from the shared frontend types. */
export type SourceDocument = CompletedGrocerDetail & {
  _id: ObjectId;
  productId: number;
  product_name?: string | null;
  brand?: string | null;
  [key: string]: unknown;
};

interface TranslationBase {
  lang: string;
  provider: string;
  version: number;
}
export type TranslationMetadata = TranslationBase &
  (
    | {
        status: 'completed';
        fieldCount: number;
        completedAt: Date;
      }
    | {
        status: 'failed';
        error: string;
        failedAt: Date;
      }
  );

export type TranslatedDocument = SourceDocument & { translation: TranslationMetadata };
export type TranslationTarget = Pick<Collection<TranslatedDocument>, 'findOne' | 'replaceOne'>;
export type TranslateText = (
  text: string,
  context: {
    lang: string;
    source: GrocerSource;
    path: string;
  },
) => Promise<string>;

/** Only paths ending at string values are accepted, including optional fields and arrays. */
export type TextPath<T, Depth extends unknown[] = []> = Depth['length'] extends 8
  ? never
  : T extends string
    ? ''
    : T extends readonly (infer Item)[]
      ? Join<'*', TextPath<NonNullable<Item>, [...Depth, unknown]>>
      : T extends object
        ? {
            [K in keyof T & string]: Join<K, TextPath<NonNullable<T[K]>, [...Depth, unknown]>>;
          }[keyof T & string]
        : never;
type Join<K extends string, P> = P extends string ? (P extends '' ? K : `${K}.${P}`) : never;
