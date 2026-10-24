import {
  createWebsocketBindings,
  type WebsocketBindings,
} from '../native/websocket';
import { instantiate, type Root } from '../../generated/apple-code.js';

export type ModuleLoader = (
  path: string,
) => WebAssembly.Module | Promise<WebAssembly.Module>;

export interface Engine {
  native: Root['native'];
}

export interface EngineOptions {
  /** Directory containing the published engine assets. */
  assetBaseUrl?: URL;
  loadModule?: ModuleLoader;
}

// jco's generated declarations use versioned import names, while its JavaScript
// consumes this unversioned name. Describe that boundary without editing bindings.
const instantiateAsync = instantiate as unknown as (
  loadModule: ModuleLoader,
  imports: {
    'polymorph:websocket/connections': WebsocketBindings;
  },
) => Engine | Promise<Engine>;

export function supportsJspi(): boolean {
  return (
    typeof Reflect.get(WebAssembly, 'Suspending') === 'function' &&
    typeof Reflect.get(WebAssembly, 'promising') === 'function'
  );
}

async function loadPublishedModule(
  path: string,
  baseUrl: URL,
): Promise<WebAssembly.Module> {
  const response = await fetch(new URL(path, baseUrl));
  if (!response.ok)
    throw new Error(`Could not load engine asset (${response.status}).`);
  return WebAssembly.compileStreaming(response);
}

/**
 * 1. Require JSPI before loading component assets.
 * 2. Create the host connection interface without opening a socket.
 * 3. Wire its WIT import name and instantiate one component.
 */
export async function prepareEngine({
  assetBaseUrl = new URL('.', import.meta.url),
  loadModule = (path) => loadPublishedModule(path, assetBaseUrl),
}: EngineOptions = {}): Promise<Engine> {
  if (!supportsJspi())
    throw new Error('This analysis engine requires WebAssembly JSPI support.');

  const connections = createWebsocketBindings();

  return instantiateAsync(loadModule, {
    'polymorph:websocket/connections': connections,
  });
}
