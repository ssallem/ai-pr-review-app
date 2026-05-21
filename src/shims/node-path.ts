/**
 * Browser stub for Node.js 'path' module.
 * @anthropic-ai/sdk uses path for credential file resolution — never reached in our flow.
 */
export const join = (...args: string[]): string => args.filter(Boolean).join('/');
export const resolve = (...args: string[]): string => args.filter(Boolean).join('/');
export const dirname = (p: string): string => {
  const parts = p.split(/[/\\]/);
  return parts.slice(0, -1).join('/') || '/';
};
export const basename = (p: string): string => {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || '';
};
export const extname = (p: string): string => {
  const base = basename(p);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
};
export const sep = '/';
export const delimiter = ':';
export const isAbsolute = (p: string): boolean => p.startsWith('/') || /^[A-Za-z]:[/\\]/.test(p);

export default { join, resolve, dirname, basename, extname, sep, delimiter, isAbsolute };
