import { test as base, expect } from '@playwright/test';
import { io, Socket } from 'socket.io-client';

type SocketFixtures = {
  socketClient: Socket;
};

/**
 * Fixture that provides a Socket.IO client for real-time testing.
 * Only used for P2 extended tests that require backend connection.
 */
export const test = base.extend<SocketFixtures>({
  socketClient: async ({}, use) => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
    const socket = io(backendUrl, {
      transports: ['websocket'],
      autoConnect: false,
    });

    socket.connect();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 10_000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    await use(socket);

    socket.disconnect();
  },
});

export { expect };
