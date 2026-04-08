import { describe, expect, it } from 'vitest';
import {
  classifyAIServiceError,
  createAIServiceHttpError,
  getAIServiceToastMessage,
} from '../ai-service-error';

describe('ai service error utils', () => {
  const toastMessages = {
    aiServiceFailed: '通用错误',
    aiServiceAuthFailed: '401 错误',
    aiServiceForbidden: '403 错误',
    aiServiceServerError: '5xx 错误',
    aiServiceTlsFailed: 'TLS 错误',
    aiServiceCorsFailed: 'CORS 错误',
    aiServiceTimeout: '超时错误',
    aiServiceNetworkFailed: '网络错误',
  };

  it('should classify 401 response as auth failure', () => {
    const error = createAIServiceHttpError(401, '{"error":"unauthorized"}', 'https://example.com/v1/chat/completions');

    expect(error.kind).toBe('http_401');
    expect(error.status).toBe(401);
    expect(getAIServiceToastMessage(error, toastMessages)).toBe('401 错误');
  });

  it('should classify timeout errors', () => {
    const error = classifyAIServiceError(new DOMException('The operation was aborted.', 'AbortError'));

    expect(error.kind).toBe('timeout');
    expect(getAIServiceToastMessage(error, toastMessages)).toBe('超时错误');
  });

  it('should classify tls and cors errors by message', () => {
    expect(classifyAIServiceError(new Error('tls: unknown certificate')).kind).toBe('tls');
    expect(classifyAIServiceError(new Error('CORS preflight failed')).kind).toBe('cors');
  });

  it('should classify failed fetch as network error', () => {
    const error = classifyAIServiceError(new TypeError('Failed to fetch'));

    expect(error.kind).toBe('network');
    expect(getAIServiceToastMessage(error, toastMessages)).toBe('网络错误');
  });

});
