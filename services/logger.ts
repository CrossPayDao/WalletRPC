const defaultEnvGetter = (): any => (import.meta as any).env;
let envGetter = defaultEnvGetter;
const getEnv = (): any => envGetter();

const isQuietMode = (): boolean => {
  const env = getEnv();
  const mode = String(env?.MODE || '');
  // 测试环境不输出噪声日志（CI 更干净，断言也更稳定）
  return mode === 'test';
};

const shouldLog = (): boolean => {
  const env = getEnv();
  return Boolean(env?.DEV) && !isQuietMode();
};

export const devWarn = (...args: unknown[]) => {
  if (!shouldLog()) return;
  console.warn(...args);
};

export const devError = (...args: unknown[]) => {
  if (!shouldLog()) return;
  console.error(...args);
};

export const __LOGGER_TEST__ = {
  setEnvGetter: (getter: () => any) => {
    envGetter = getter;
  },
  resetEnvGetter: () => {
    envGetter = defaultEnvGetter;
  }
};
