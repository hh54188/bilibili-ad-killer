import { describe, expect, it } from 'vitest';
import {
  buildOpenAIResponsesUrl,
  DEFAULT_CONFIG,
  getDefaultAiModelForProvider,
  getEffectiveApiBaseUrl,
  isMixedContentApiBaseUrl,
  isOpenAIFullEndpointUrl,
  isValidApiBaseUrl,
  normalizeApiBaseUrl,
  normalizeUserConfig
} from '../config';

describe('config utils', () => {
  it('should normalize custom api base url by trimming spaces and trailing slashes', () => {
    expect(normalizeApiBaseUrl(' https://example.com/custom/// ')).toBe('https://example.com/custom');
    expect(normalizeApiBaseUrl(' https://proxy.example.com/v1/ ')).toBe('https://proxy.example.com/v1');
  });

  it('should accept empty api base url and http/https urls only', () => {
    expect(isValidApiBaseUrl('')).toBe(true);
    expect(isValidApiBaseUrl('https://example.com')).toBe(true);
    expect(isValidApiBaseUrl('http://localhost:3000/v1')).toBe(true);
    expect(isValidApiBaseUrl('ftp://example.com')).toBe(false);
    expect(isValidApiBaseUrl('example.com')).toBe(false);
  });

  it('should reject full endpoint path for openai base url', () => {
    expect(isOpenAIFullEndpointUrl('https://example.com/v1/chat/completions')).toBe(true);
    expect(isOpenAIFullEndpointUrl('https://example.com/v1/responses')).toBe(true);
    expect(isValidApiBaseUrl('https://example.com/v1/chat/completions', 'openai')).toBe(false);
    expect(isValidApiBaseUrl('https://example.com/v1/responses', 'openai')).toBe(false);
    expect(isValidApiBaseUrl('https://example.com/v1/chat/completions', 'gemini')).toBe(true);
  });

  it('should detect mixed content api base urls on https pages', () => {
    expect(isMixedContentApiBaseUrl('http://10.20.20.101:40001/v1', 'https:')).toBe(true);
    expect(isMixedContentApiBaseUrl('https://10.20.20.101:40001/v1', 'https:')).toBe(false);
    expect(isMixedContentApiBaseUrl('http://10.20.20.101:40001/v1', 'http:')).toBe(false);
  });

  it('should merge partial config with defaults and normalize fields', () => {
    const normalizedConfig = normalizeUserConfig({
      aiProvider: 'openai',
      apiKey: ' test-key ',
      apiBaseUrl: ' https://example.com/gemini/ ',
      aiModel: ' custom-model ',
    });

    expect(normalizedConfig).toEqual({
      ...DEFAULT_CONFIG,
      aiProvider: 'openai',
      apiKey: 'test-key',
      apiBaseUrl: 'https://example.com/gemini',
      aiModel: 'custom-model',
    });
  });

  it('should fallback to provider default model when ai model is empty', () => {
    const normalizedConfig = normalizeUserConfig({
      aiProvider: 'openai',
      aiModel: '   ',
    });

    expect(normalizedConfig.aiModel).toBe(getDefaultAiModelForProvider('openai'));
  });

  it('should use official openai endpoint when api base url is empty', () => {
    expect(getEffectiveApiBaseUrl('openai', '')).toBe('https://api.openai.com/v1');
    expect(getEffectiveApiBaseUrl('gemini', '')).toBe('');
  });

  it('should build responses url from openai base urls', () => {
    expect(buildOpenAIResponsesUrl('http://127.0.0.1:8000/v1')).toBe('http://127.0.0.1:8000/v1/responses');
    expect(buildOpenAIResponsesUrl('https://example.com/v1')).toBe('https://example.com/v1/responses');
    expect(buildOpenAIResponsesUrl('https://your-proxy.example.com/v1')).not.toBe('https://api.openai.com/v1/responses');
  });
});
