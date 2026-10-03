import {budgetReady} from '../lib/ai-guard.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const abuseProtectionReady=await budgetReady();
  const ready=Boolean(process.env.GROQ_API_KEY)&&abuseProtectionReady;
  return res.status(ready?200:503).json({
    ok: ready,
    abuseProtectionReady,
    service: 'Hana AI Pro',
    brand: 'GARHY TECH',
    persona: 'feminine',
    provider: 'groq',
    models: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
    groqAuth: Boolean(process.env.GROQ_API_KEY),
    runtime: process.env.VERCEL ? 'vercel' : 'local',
  });
}
