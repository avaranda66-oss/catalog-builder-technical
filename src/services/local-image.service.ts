/**
 * Converts an image selected by the user into a local data URL.
 *
 * Story 004 deliberately keeps editor media local until Story 005 introduces
 * authenticated, transactional storage. Do not replace this with a direct
 * Supabase upload without the corresponding server-side authorization work.
 */
export const readImageAsLocalDataUrl = (file: File): Promise<string | null> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
