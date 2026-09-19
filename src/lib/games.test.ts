import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getAllPublishers,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('returns all categories and publishers in name order', async () => {
        await db.insert(categories).values([
            { name: 'Strategy', description: 'cat' },
            { name: 'Puzzle', description: 'cat' },
        ]);
        await db.insert(publishers).values([
            { name: 'Pub Two', description: 'pub' },
            { name: 'Pub One', description: 'pub' },
        ]);

        expect(await getAllCategories(db)).toEqual([
            { id: expect.any(Number), name: 'Puzzle' },
            { id: expect.any(Number), name: 'Strategy' },
        ]);
        expect(await getAllPublishers(db)).toEqual([
            { id: expect.any(Number), name: 'Pub One' },
            { id: expect.any(Number), name: 'Pub Two' },
        ]);
    });

    it('filters games by category and publisher combination', async () => {
        const [strategy, puzzle] = await db
            .insert(categories)
            .values([{ name: 'Strategy', description: 'cat' }, { name: 'Puzzle', description: 'cat' }])
            .returning({ id: categories.id });
        const [publisherOne, publisherTwo] = await db
            .insert(publishers)
            .values([{ name: 'Pub One', description: 'pub' }, { name: 'Pub Two', description: 'pub' }])
            .returning({ id: publishers.id });

        await db.insert(games).values([
            { title: 'Alpha', description: 'alpha', starRating: 4.0, categoryId: strategy.id, publisherId: publisherOne.id },
            { title: 'Bravo', description: 'bravo', starRating: 3.8, categoryId: strategy.id, publisherId: publisherOne.id },
            { title: 'Charlie', description: 'charlie', starRating: 4.2, categoryId: puzzle.id, publisherId: publisherTwo.id },
        ]);

        const matched = await getAllGames(db, {
            categoryNames: ['Strategy'],
            publisherNames: ['Pub One'],
        });

        expect(matched.map((game) => game.title)).toEqual(['Alpha', 'Bravo']);
    });

    it('returns an empty list when filters match nothing', async () => {
        await seedGames(db, 2);

        const matched = await getAllGames(db, {
            categoryNames: ['Missing Category'],
            publisherNames: ['Missing Publisher'],
        });

        expect(matched).toEqual([]);
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
