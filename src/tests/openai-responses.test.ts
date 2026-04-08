import { describe, expect, it } from 'vitest';
import { extractOpenAIResponseText } from '../ai';

describe('OpenAI Responses API 响应解析', () => {
  it('应优先读取 output_text', () => {
    expect(extractOpenAIResponseText({
      output_text: '{"startTime": 12.3, "endTime": 18.8}',
    })).toBe('{"startTime": 12.3, "endTime": 18.8}');
  });

  it('应从 output.message.content.text 读取结构化内容', () => {
    expect(extractOpenAIResponseText({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: '{"startTime":1437.94,"endTime":1475.42}',
            },
          ],
        },
      ],
    })).toBe('{"startTime":1437.94,"endTime":1475.42}');
  });

  it('在没有正文时返回 null', () => {
    expect(extractOpenAIResponseText({
      id: 'resp_xxx',
      output: [],
    })).toBeNull();
  });
});
