import { describe, expect, it } from 'vitest';
import { parseRecommendationCliArgs } from '../../../src/recommendation/cli-args.js';

describe('parseRecommendationCliArgs', () => {
  it('parses named flags', () => {
    const parsed = parseRecommendationCliArgs([
      '--qr', 'qr-payload',
      '--amount', '30000',
      '--methods', './methods.json',
      '--today', '2026-03-31',
      '--top', '3',
      '--json',
    ]);

    expect(parsed).toEqual({
      qrPayload: 'qr-payload',
      amountArg: '30000',
      methodsPath: './methods.json',
      today: '2026-03-31',
      topArg: '3',
      asJson: true,
    });
  });

  it('falls back to positional args when npm strips flag names', () => {
    const parsed = parseRecommendationCliArgs([
      'qr-payload',
      '30000',
      './methods.json',
    ]);

    expect(parsed).toEqual({
      qrPayload: 'qr-payload',
      amountArg: '30000',
      methodsPath: './methods.json',
      today: undefined,
      topArg: undefined,
      asJson: false,
    });
  });

  it('returns null when required inputs are missing', () => {
    expect(parseRecommendationCliArgs(['only-qr'])).toBeNull();
  });
});
