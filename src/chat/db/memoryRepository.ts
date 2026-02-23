import { Pool } from 'pg';

/**
 * MemoryRepository - CRUD for chat_memory table.
 * Implementation deferred to PRD 004: Memory Manager CRUD.
 */
export class MemoryRepository {
  constructor(private readonly pool: Pool) {}
}
