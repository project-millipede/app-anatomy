import { type Getter } from 'jotai';

export type SelectorFunction<T, P> = (get: Getter, param: P) => T;
