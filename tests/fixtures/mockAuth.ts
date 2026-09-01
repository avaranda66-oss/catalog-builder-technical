export const mockAdminSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'user-admin', email: 'admin@example.test' }
} as any;

export const mockEditorSession = {
  ...mockAdminSession,
  user: { id: 'user-editor', email: 'editor@example.test' }
} as any;

export const mockProfiles = {
  admin: { id: 'user-admin', role: 'admin', is_active: true },
  editor: { id: 'user-editor', role: 'editor', is_active: true },
  viewer: { id: 'user-viewer', role: 'viewer', is_active: true },
  inactive: { id: 'user-inactive', role: 'editor', is_active: false }
};
