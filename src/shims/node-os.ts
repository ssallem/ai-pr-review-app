/**
 * Browser stub for Node.js 'os' module.
 * @anthropic-ai/sdk may use os.homedir() for credential paths — never used in our flow.
 */
export const homedir = (): string => '/';
export const tmpdir = (): string => '/tmp';
export const platform = (): string => 'browser';
export const arch = (): string => 'x64';
export const cpus = () => [];
export const totalmem = (): number => 0;
export const freemem = (): number => 0;
export const hostname = (): string => 'browser';
export const userInfo = () => ({ username: 'browser', uid: 0, gid: 0, shell: null, homedir: '/' });

export default { homedir, tmpdir, platform, arch, cpus, totalmem, freemem, hostname, userInfo };
