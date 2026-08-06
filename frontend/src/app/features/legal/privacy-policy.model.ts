/** A bullet inside a policy list, optionally prefixed by a highlighted label. */
export interface PolicyListItem {
  label?: string;
  text: string;
}

/** The content primitives a policy section is built from. */
export type PolicyBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: PolicyListItem[] }
  | { kind: 'note'; title: string; text: string }
  | { kind: 'contact'; label: string; email: string };

/** A numbered section of the policy, addressable by its anchor `id`. */
export interface PolicySection {
  /** Anchor used by the table of contents and by deep links. */
  id: string;
  title: string;
  blocks: PolicyBlock[];
}
