import { Websocket as WebsocketProvider } from '@jsr/polymorph__websocket';
import { afterEach, expect, test, vi } from 'vitest';
import { createWebsocketBindings } from '../packages/apple-code-browser/src/native/websocket';

afterEach(() => {
  vi.restoreAllMocks();
});

test('maps jco message variants', async () => {
  // 1. Supply a provider connection without simulating browser networking.
  const bytes = Uint8Array.of(0, 128, 255);
  const connection = {
    send: vi.fn<WebsocketProvider['send']>().mockResolvedValue(undefined),
    receive: vi
      .fn<WebsocketProvider['receive']>()
      .mockResolvedValueOnce({ kind: 'binary', value: bytes })
      .mockResolvedValueOnce({ kind: 'string', value: 'hello' }),
    [Symbol.dispose]: vi.fn(),
  };
  vi.mocked(vi.spyOn(WebsocketProvider, 'connect'), {
    partial: true,
  }).mockResolvedValueOnce(connection);

  const { Websocket } = createWebsocketBindings();
  using socket = await Websocket.connect('ws://127.0.0.1:3210', ['example']);

  // 2. Convert outgoing jco variants into the provider's message format.
  await socket.send({ tag: 'binary', val: bytes });
  await socket.send({ tag: 'string', val: 'hello' });
  expect(connection.send.mock.calls).toStrictEqual([
    [{ kind: 'binary', value: bytes }],
    [{ kind: 'string', value: 'hello' }],
  ]);

  // 3. Convert incoming provider variants into jco's message format.
  expect(await socket.receive()).toStrictEqual({ tag: 'binary', val: bytes });
  expect(await socket.receive()).toStrictEqual({ tag: 'string', val: 'hello' });
});

test('converts connect validation errors to jco variants', async () => {
  // Use real provider validation: invalid URLs fail before a socket is created.
  const { Websocket } = createWebsocketBindings();
  await expect(
    Websocket.connect('file:///tmp/example', []),
  ).rejects.toMatchObject({
    tag: 'invalid-url',
    val: expect.any(String),
  });
});
