export interface RuntimeEnv {
  readonly dev: boolean;
}

export function getRuntimeEnv(): RuntimeEnv {
  return {
    dev: Boolean(import.meta.env.DEV),
  };
}
