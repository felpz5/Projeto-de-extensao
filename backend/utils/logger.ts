type LogMeta = Record<string, unknown> | undefined;

const timestamp = () => new Date().toISOString();

/** Logger simples. Nunca registre senha, token ou outros dados sensíveis. */
export const logger = {
  info(message: string, meta?: LogMeta) {
    console.log(`[${timestamp()}] INFO: ${message}`, meta ?? '');
  },
  warn(message: string, meta?: LogMeta) {
    console.warn(`[${timestamp()}] WARN: ${message}`, meta ?? '');
  },
  error(message: string, meta?: LogMeta) {
    console.error(`[${timestamp()}] ERROR: ${message}`, meta ?? '');
  },
};
