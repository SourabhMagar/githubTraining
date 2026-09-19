import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Category, Game, Publisher } from '../types/game';

export interface GameFilters {
    categoryNames?: string[];
    publisherNames?: string[];
}

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function normalizeFilterNames(names: string[] | undefined): string[] {
    return Array.from(
        new Set((names ?? []).map((name) => name.trim()).filter((name) => name.length > 0)),
    );
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

function baseGameIdQuery(db: Database) {
    return db
        .select({ id: games.id })
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

type QueryWithWhere<T> = T & {
    where: (condition: ReturnType<typeof and>) => T;
};

function applyFilters<T>(query: T, filters: GameFilters): T {
    const categoryNames = normalizeFilterNames(filters.categoryNames);
    const publisherNames = normalizeFilterNames(filters.publisherNames);
    const conditions: Array<ReturnType<typeof inArray>> = [];

    if (categoryNames.length > 0) {
        conditions.push(inArray(categories.name, categoryNames));
    }

    if (publisherNames.length > 0) {
        conditions.push(inArray(publishers.name, publisherNames));
    }

    if (conditions.length === 0) {
        return query;
    }

    return (query as QueryWithWhere<T>).where(and(...conditions));
}

/** All categories ordered by name. */
export async function getAllCategories(db: Database): Promise<Category[]> {
    const rows = await db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name));
    return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** All publishers ordered by name. */
export async function getAllPublishers(db: Database): Promise<Publisher[]> {
    const rows = await db.select({ id: publishers.id, name: publishers.name }).from(publishers).orderBy(asc(publishers.name));
    return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** All games ordered by title, optionally filtered by category and publisher names. */
export async function getAllGames(db: Database, filters: GameFilters = {}): Promise<Game[]> {
    const rows = await applyFilters(baseGamesQuery(db), filters).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/** All game ids ordered by title, optionally filtered by category and publisher names. */
export async function getAllGameIds(db: Database, filters: GameFilters = {}): Promise<number[]> {
    const rows = await applyFilters(baseGameIdQuery(db), filters).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/** A single game by id, or null when it does not exist. */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
