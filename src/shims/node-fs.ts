/**
 * Browser stub for Node.js 'fs' module.
 * @anthropic-ai/sdk imports fs for credential chain auto-loading,
 * but we pass API key explicitly from keychain → fs never actually called.
 * All functions return safe empty values to prevent runtime throws.
 */
export const readFileSync = (): string => '';
export const existsSync = (): boolean => false;
export const writeFileSync = (): void => {};
export const readdirSync = (): string[] => [];
export const statSync = () => ({ isFile: () => false, isDirectory: () => false });
export const mkdirSync = (): void => {};
export const unlinkSync = (): void => {};

export const promises = {
  readFile: async (): Promise<string> => '',
  writeFile: async (): Promise<void> => {},
  readdir: async (): Promise<string[]> => [],
  stat: async () => ({ isFile: () => false, isDirectory: () => false }),
  mkdir: async (): Promise<void> => {},
  unlink: async (): Promise<void> => {},
  access: async (): Promise<void> => {},
};

export default {
  readFileSync,
  existsSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  unlinkSync,
  promises,
};
