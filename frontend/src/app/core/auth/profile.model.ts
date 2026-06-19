/** Role values mirror the `public.user_role` enum in the database. */
export type UserRole = 'user' | 'admin';

/** A row from the `public.users` profile table. */
export interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
}
