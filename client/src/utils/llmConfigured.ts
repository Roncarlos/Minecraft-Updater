import type { Settings } from '../types';

export function isLlmConfigured(settings: Settings | null): boolean {
  return !!(settings?.llm?.enabled && settings.llm.endpoint && settings.llm.model);
}
