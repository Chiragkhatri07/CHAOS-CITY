import { randomUUID } from 'node:crypto';

const ROOM_TTL_SECONDS = 30 * 60;
const ROOM_SET = 'chaos:rooms';
const LOCK_TTL_MS = 10000;

export class RoomStore {
  constructor(redis = null) {
    this.redis = redis;
    this.rooms = new Map();
  }

  async get(code) {
    if (!this.redis) return this.rooms.get(code) ?? null;
    const value = await this.redis.get(`chaos:room:${code}`);
    if (!value) await this.redis.sRem(ROOM_SET, code);
    return value ? JSON.parse(value) : null;
  }

  async create(room) {
    if (!this.redis) {
      if (this.rooms.has(room.code)) return false;
      this.rooms.set(room.code, room);
      return true;
    }
    const created = await this.redis.set(`chaos:room:${room.code}`, JSON.stringify(room), { EX: ROOM_TTL_SECONDS, NX: true });
    if (created !== 'OK') return false;
    await this.redis.sAdd(ROOM_SET, room.code);
    return true;
  }

  async mutate(code, callback) {
    if (!this.redis) {
      const room = this.rooms.get(code);
      if (!room) throw new Error('Room not found. Check the code and try again.');
      return callback(room);
    }

    const lockKey = `chaos:lock:${code}`;
    const token = randomUUID();
    const expiresAt = Date.now() + 5000;
    while (Date.now() < expiresAt) {
      const acquired = await this.redis.set(lockKey, token, { PX: LOCK_TTL_MS, NX: true });
      if (acquired === 'OK') break;
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 40));
    }
    if (await this.redis.get(lockKey) !== token) throw new Error('The city is busy. Please try that move again.');

    try {
      const room = await this.get(code);
      if (!room) throw new Error('Room not found. Check the code and try again.');
      const result = await callback(room);
      await this.redis.set(`chaos:room:${code}`, JSON.stringify(room), { EX: ROOM_TTL_SECONDS });
      return result;
    } finally {
      await this.redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        { keys: [lockKey], arguments: [token] }
      );
    }
  }

  async codes() {
    if (!this.redis) return [...this.rooms.keys()];
    return this.redis.sMembers(ROOM_SET);
  }

  async remove(code) {
    if (!this.redis) return this.rooms.delete(code);
    await Promise.all([this.redis.del(`chaos:room:${code}`), this.redis.sRem(ROOM_SET, code)]);
  }

  async count() {
    if (!this.redis) return this.rooms.size;
    return this.redis.sCard(ROOM_SET);
  }
}
