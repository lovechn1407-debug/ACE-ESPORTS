import * as realDb from '@firebase/database';

export * from '@firebase/database';

export function getCurrentOrg(): string | null {
  const path = window.location.pathname;
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const firstSegment = segments[0];
  if (firstSegment === 'master' || firstSegment === 'index.html' || firstSegment === 'admin') return null;
  return firstSegment;
}

// Intercept ref to automatically prefix paths for multi-tenancy
export const ref: typeof realDb.ref = (db: any, path?: string) => {
  const org = getCurrentOrg();
  if (org) {
    if (path) {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      if (
        cleanPath.startsWith('organisations') ||
        cleanPath.startsWith('globalUserOrgs') ||
        cleanPath.startsWith('uploads') ||
        cleanPath.startsWith('orgs/') ||
        cleanPath.startsWith('supportChats')
      ) {
        return realDb.ref(db, path);
      }
    }
    const prefixedPath = path ? `orgs/${org}/${path}` : `orgs/${org}`;
    return realDb.ref(db, prefixedPath);
  }
  return realDb.ref(db, path);
};

export const rawRef = realDb.ref;
