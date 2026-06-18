/** A one-shot AI action the AI action dialog can perform, with its inputs. */
export type AIAction =
  | { readonly kind: 'pr-description'; readonly baseRef: string }
  | { readonly kind: 'review' }
  | { readonly kind: 'summarize-changes' }
  | { readonly kind: 'summarize-commit'; readonly sha: string }
  | { readonly kind: 'conflict'; readonly filePath: string }
