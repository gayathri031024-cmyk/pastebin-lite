export const PORTS = {
  redis: 6390,
  proxy: 8790,
  app: 3100,
  appNoEnv: 3101,
};
export const APP_URL = `http://127.0.0.1:${PORTS.app}`;
export const APP_NOENV_URL = `http://127.0.0.1:${PORTS.appNoEnv}`;
export const PROXY_URL = `http://127.0.0.1:${PORTS.proxy}`;
export const TOKEN = "test-token";
