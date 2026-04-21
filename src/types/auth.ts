export interface UserDefinition {
  username: string;
  password: string;
  displayName?: string;
}

export interface UsersConfig {
  users: UserDefinition[];
}

export interface AuthUser {
  username: string;
  displayName: string;
  email?: string;
}

export interface AuthState {
  user: AuthUser | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  authMode: 'demo' | 'google' | 'entra' | null;
}
