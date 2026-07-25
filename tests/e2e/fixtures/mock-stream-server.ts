/**
 * Mock SSE Stream Server — E2E 테스트용
 * 
 * 로컬 HTTP 서버로 SSE 스트리밍 응답 시뮬레이션
 */
import * as http from 'http';

export function createMockStreamServer(port = 18900) {
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
        'data: [DONE]\n\n'
      ];

      let i = 0;
      const interval = setInterval(() => {
        if (i < chunks.length) {
          res.write(chunks[i]);
          i++;
        } else {
          clearInterval(interval);
          res.end();
        }
      }, 50);

      req.on('close', () => {
        clearInterval(interval);
      });
    } else if (req.url === '/v1/models' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [
          { id: 'gemma-2-27b', object: 'model' },
          { id: 'gpt-4', object: 'model' }
        ]
      }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return {
    start: () => new Promise<void>((resolve) => server.listen(port, resolve)),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    port,
    url: `http://localhost:${port}`
  };
}
