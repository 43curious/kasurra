/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user: import('./lib/server-auth').AuthUser | null;
  }
}

declare module 'better-sqlite3' {
  export default class Database {
    constructor(filename: string);
    exec(sql: string): void;
    pragma(sql: string): unknown;
    prepare(sql: string): {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    };
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  }
}
