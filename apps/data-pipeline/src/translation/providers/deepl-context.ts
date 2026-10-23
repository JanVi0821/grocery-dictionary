import type { TranslateText } from '../types/translation.ts';
import { parseDocument, DomUtils } from 'htmlparser2';

type Context = Parameters<TranslateText>[1];

/** Background is descriptive; translation rules belong in custom_instructions. */
export function buildDeeplGuidance(context: Context, targetLanguage: string) {
  const product = context.product;
  const detail = product && typeof product.detail === 'object' ? product.detail : undefined;
  const background = ['This text is from a supermarket product listing in New Zealand.'];
  const add = (label: string, value: unknown, maxChars: number) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const text = DomUtils.textContent(parseDocument(value)).replace(/\s+/g, ' ').trim();
    if (!text) return;
    background.push(`${label}: ${Array.from(text).slice(0, maxChars).join('')}`);
  };
  add('Product name', detail?.name?.trim() || product?.product_name, 240);
  add('Brand', detail?.brand?.trim() || product?.brand, 120);
  add('Product description', detail?.description, 1000);

  // DeepL currently supports custom instructions only for these target languages.
  if (!['DE', 'EN', 'ES', 'FR', 'IT', 'JA', 'KO', 'ZH'].includes(targetLanguage.split('-')[0])) {
    return { context: background.join('\n') };
  }
  const instructions = [
    'Use natural, concise language suitable for supermarket product listings.',
    'Keep brand names in product names exactly as written. Use the Brand supplied in the context to identify them; do not translate or transliterate them. Translate the descriptive words normally.',
    'Translate only the supplied text without adding information from the context. Preserve numbers, units and HTML formatting. Return only the translation.',
  ];
  if (targetLanguage === 'ZH-HANS') {
    instructions.push('Use natural Simplified Chinese supermarket terminology.');
  } else if (targetLanguage === 'ZH-HANT') {
    instructions.push('Use natural Traditional Chinese supermarket terminology.');
  }
  return { context: background.join('\n'), custom_instructions: instructions };
}
