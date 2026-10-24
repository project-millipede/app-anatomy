import {
  Websocket as WebsocketProvider,
  configure,
  type Message as ProviderMessage,
  type WebsocketError,
} from '@jsr/polymorph__websocket';
import { isComponentException } from '@jsr/polyengine__protocol';
import { ResourceAdapter } from './resource';
import type { Message } from '../../generated/interfaces/polymorph-websocket-types.js';

export type WebsocketBindings = ReturnType<typeof createWebsocketBindings>;

function errorPayload(error: WebsocketError) {
  return 'value' in error
    ? { tag: error.kind, val: error.value }
    : { tag: error.kind };
}

async function convertErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isComponentException(error)) {
      throw errorPayload(error.payload as WebsocketError);
    }
    throw error;
  }
}

/**
 * Bind Polymorph's browser WebSocket provider to jco.
 *
 * 1. Convert message and error variants between the two bindings.
 * 2. Forward connection, state, send and receive operations to Polymorph.
 * 3. Forward owned resource drops through ResourceAdapter.
 *
 * Rust owns connection reuse and filesystem semantics. Polymorph performs
 * browser networking and enforces the configured connection and buffer bounds.
 */
export function createWebsocketBindings() {
  class Websocket extends ResourceAdapter<WebsocketProvider> {
    private constructor(provider: WebsocketProvider) {
      super(provider);
    }

    static async connect(url: string, protocols: string[]): Promise<Websocket> {
      // Provider configuration is module-wide; each connection uses these bounds.
      configure({
        maxInboundBufferBytes: 128 * 1024,
        connectTimeoutMs: 5_000,
      });
      const provider = await convertErrors(() =>
        WebsocketProvider.connect(url, protocols),
      );
      return new Websocket(provider);
    }

    state() {
      return this.provider.state();
    }

    async send(message: Message): Promise<void> {
      const value: ProviderMessage =
        message.tag === 'binary'
          ? { kind: 'binary', value: message.val }
          : { kind: 'string', value: message.val };
      await convertErrors(() => this.provider.send(value));
    }

    async receive(): Promise<Message> {
      const message = await convertErrors(() => this.provider.receive());
      return message.kind === 'binary'
        ? { tag: 'binary', val: message.value }
        : { tag: 'string', val: message.value };
    }
  }

  const connections = { Websocket };

  return connections;
}
