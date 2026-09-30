export const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
]);

export const ALLOWED_REASONING = new Set(['low', 'medium', 'high']);
export const PROFESSIONAL_MODES = Object.freeze({
  engineering: 'Analyze the engineering problem precisely and provide practical, structured steps.',
  debugging: 'Separate symptoms from causes. Ask for missing evidence and propose verifiable debugging steps.',
  review: 'Review code for correctness, security, maintainability and test coverage. Prioritize evidenced findings.',
  architecture: 'Explain architecture, contracts, tradeoffs and operational constraints without inventing requirements.',
  report: 'Structure the report around evidence, severity, root cause, remediation and verification.',
});
const ALLOWED_ROLES = new Set(['user', 'assistant']);

export function validateChatInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid JSON body.' };
  const model = body.model ?? 'openai/gpt-oss-20b';
  if (!ALLOWED_MODELS.has(model)) return { ok: false, error: 'Unsupported model.' };
  const reasoning = body.reasoning ?? 'medium';
  if (!ALLOWED_REASONING.has(reasoning)) return { ok: false, error: 'Unsupported reasoning level.' };
  const mode = body.mode ?? 'engineering';
  if (typeof mode !== 'string' || !Object.hasOwn(PROFESSIONAL_MODES, mode)) return { ok: false, error: 'Unsupported professional mode.' };
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) return { ok: false, error: 'messages must contain between 1 and 20 items.' };
  let totalChars = 0;
  const messages = [];
  for (const message of body.messages) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return { ok: false, error: 'Invalid message object.' };
    const { role, content } = message;
    if (!ALLOWED_ROLES.has(role)) return { ok: false, error: 'Invalid message role.' };
    if (typeof content !== 'string' || content.trim().length === 0 || content.length > 8000) return { ok: false, error: 'Each message must contain 1-8000 characters.' };
    totalChars += content.length;
    if (totalChars > 16000) return { ok: false, error: 'Conversation is too large.' };
    messages.push({ role, content });
  }
  if (messages.at(-1)?.role !== 'user') return { ok:false, error:'The final message must be from the user.' };
  return { ok: true, value: { model, reasoning, messages, mode } };
}
